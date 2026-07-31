/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import net, { type Socket } from 'node:net';
import { InMemoryEventBus, type DomainEvent, type EventBus } from '@mining/event-bus/core';
import {
  BitcoinShareValidationService,
  InMemoryDuplicateShareStore,
  addDecimalStrings,
  calculateHashrateFromAccumulatedDifficulty,
  createDevelopmentJob,
  type BitcoinShareSubmission,
  type DuplicateShareStore,
  type ShareValidationResult,
} from '@mining/mining-core';
import { detectMinerIdentity } from '@mining/miner-detection';
import { createLogger } from '@mining/logger';
import {
  MultiUpstreamPoolManager,
  ShareQueueFullError,
  StaleUpstreamJobError,
  UpstreamUnavailableError,
  VariableDifficultyController,
  type UpstreamShareResult,
} from '@mining/upstream-stratum';
import { hmacSensitiveValue } from '@mining/security';
import {
  MiningEvents,
  type MinerSessionAuthorizedPayload,
  type MinerSessionConnectedPayload,
  type MinerSessionDisconnectedPayload,
  type MinerSessionSubscribedPayload,
  type MiningJobReceivedPayload,
  type ShareAcceptedPayload,
  type ShareRejectedPayload,
  type ShareUpstreamDecisionPayload,
  type ShareUpstreamPendingPayload,
  type WorkerDeviceDetectedPayload,
  type UpstreamPoolSelectedPayload,
  type UpstreamFailoverPayload,
  type UpstreamHealthChangedPayload,
  type WorkerDifficultyChangedPayload,
} from '@mining/shared';
import {
  StratumErrorCode,
  errorResponse,
  parseMiningAuthorize,
  parseMiningConfigure,
  parseMiningSubmit,
  parseMiningSubscribe,
  parseStratumLine,
  serializeStratumNotification,
  serializeStratumResponse,
  successResponse,
  type StratumRequest,
} from '@mining/stratum-protocol';
import type { StratumServerConfig } from './config.js';
import { DevelopmentWorkerAuthenticator } from './development-authenticator.js';
import type { WorkerAuthenticator } from './worker-authenticator.js';
import type { MiningEventStore } from './event-store.js';
import type { MinerSession } from './session.js';

const logger = createLogger('stratum-server');

export interface StratumServerDependencies {
  authenticator: WorkerAuthenticator;
  eventBus?: EventBus;
  eventStore: MiningEventStore;
  duplicateStore: DuplicateShareStore;
  close?: () => Promise<void>;
}

export class StratumServer {
  private readonly server: net.Server;
  private readonly validator: BitcoinShareValidationService;
  private readonly sessions = new Map<string, MinerSession>();

  constructor(
    private readonly config: StratumServerConfig,
    private readonly dependencies: StratumServerDependencies,
  ) {
    this.validator = new BitcoinShareValidationService(dependencies.duplicateStore);
    this.server = net.createServer((socket) => this.acceptConnection(socket));
  }

  static async create(config: StratumServerConfig): Promise<StratumServer> {
    if (process.env.NODE_ENV === 'production' && config.eventBusDriver !== 'redis') {
      throw new Error('Production Stratum requires EVENT_BUS_DRIVER=redis for durable duplicate reservation');
    }

    const closers: Array<() => Promise<void>> = [];
    let duplicateStore: DuplicateShareStore;
    if (config.eventBusDriver === 'redis') {
      const { RedisDuplicateShareStore } = await import('./redis-duplicate-share-store.js');
      const redisDuplicateStore = await RedisDuplicateShareStore.connect(config.redisUrl);
      duplicateStore = redisDuplicateStore;
      closers.push(() => redisDuplicateStore.close());
    } else {
      duplicateStore = new InMemoryDuplicateShareStore();
    }

    let eventBus: EventBus | undefined;
    let eventStore: MiningEventStore;
    if (config.eventStoreDriver === 'postgres') {
      const { PostgresOutboxEventStore } = await import('./development-event-store.js');
      eventStore = new PostgresOutboxEventStore();
    } else {
      const { DevelopmentJsonlEventStore } = await import('./development-event-store.js');
      eventStore = new DevelopmentJsonlEventStore(config.developmentDataDirectory);
      if (config.eventBusDriver === 'redis') {
        const { RedisStreamEventBus } = await import('@mining/event-bus/redis-stream');
        const redisEventBus = await RedisStreamEventBus.connect({ url: config.redisUrl, stream: config.eventStream });
        eventBus = redisEventBus;
        closers.push(() => redisEventBus.close());
      } else {
        eventBus = new InMemoryEventBus();
      }
    }

    eventBus?.subscribe(MiningEvents.shareLocalAccepted, async (event) => {
      logger.info({ eventId: event.eventId, aggregateId: event.aggregateId }, 'local share accepted');
    });
    eventBus?.subscribe(MiningEvents.shareLocalRejected, async (event) => {
      logger.warn({ eventId: event.eventId, aggregateId: event.aggregateId }, 'local share rejected');
    });

    const authenticator = config.workerAuthDriver === 'postgres'
      ? await (await import('./production-worker-authenticator.js')).ProductionWorkerAuthenticator.create(config)
      : new DevelopmentWorkerAuthenticator(config);
    if (authenticator.close) closers.push(() => authenticator.close?.() ?? Promise.resolve());

    return new StratumServer(config, {
      authenticator,
      eventBus,
      eventStore,
      duplicateStore,
      close: async () => {
        for (const close of closers.reverse()) await close();
      },
    });
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    logger.info(
      {
        host: this.config.host,
        port: this.config.port,
        developmentMode: this.config.developmentMode,
      },
      this.config.developmentMode
        ? 'stratum development gateway listening'
        : this.config.upstreamDriver === 'tcp' || this.config.upstreamDriver === 'multi'
          ? 'stratum resilient upstream gateway listening'
          : 'stratum listening without a production upstream driver',
    );
  }

  get listeningPort(): number {
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Stratum server is not listening');
    return address.port;
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.upstream?.close();
      session.socket.destroy();
    }
    await new Promise<void>((resolve, reject) => this.server.close((error) => (error ? reject(error) : resolve())));
    await this.dependencies.close?.();
  }

  private acceptConnection(socket: Socket): void {
    const normalizedIp = (socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
    const session: MinerSession = {
      id: randomUUID(),
      socket,
      remoteHash: hmacSensitiveValue(normalizedIp, this.config.ipHashKey),
      state: 'CONNECTED',
      extranonce1: randomBytes(4).toString('hex'),
      extranonce2Size: 4,
      assignedDifficulty: this.config.developmentDifficulty,
      acceptedDifficultyBuckets: new Map(),
      submissionWindowStartedAt: Date.now(),
      submissionsInWindow: 0,
      connectedAt: new Date(),
      lastActivityAt: new Date(),
      processing: Promise.resolve(),
    };
    this.sessions.set(session.id, session);
    logger.info({ sessionId: session.id, remoteHash: session.remoteHash }, 'miner connected');
    session.processing = this.publishSessionEvent<MinerSessionConnectedPayload>(MiningEvents.sessionConnected, session, {
      sessionId: session.id,
      remoteIpHash: session.remoteHash,
      connectedAt: session.connectedAt.toISOString(),
    });

    socket.setEncoding('utf8');
    socket.setTimeout(this.config.socketTimeoutMs);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);

    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const rawLine = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (Buffer.byteLength(rawLine, 'utf8') > this.config.maximumLineBytes) {
          logger.warn({ sessionId: session.id }, 'stratum line exceeded maximum size');
          socket.destroy();
          return;
        }
        const line = rawLine.trim();
        if (line) {
          session.processing = session.processing
            .then(() => this.handleLine(session, line))
            .catch((error) => {
              logger.error({ sessionId: session.id, error }, 'stratum session processing failed');
              socket.destroy();
            });
        }
        newlineIndex = buffer.indexOf('\n');
      }
      if (Buffer.byteLength(buffer, 'utf8') > this.config.maximumLineBytes) {
        logger.warn({ sessionId: session.id }, 'unfinished stratum line exceeded maximum size');
        socket.destroy();
      }
    });

    socket.on('timeout', () => socket.destroy());
    socket.on('error', (error) => logger.warn({ sessionId: session.id, error }, 'stratum socket error'));
    socket.on('close', () => {
      session.state = 'DISCONNECTED';
      session.upstream?.close();
      session.lastActivityAt = new Date();
      this.sessions.delete(session.id);
      logger.info({ sessionId: session.id, remoteHash: session.remoteHash }, 'miner disconnected');
      session.processing = session.processing
        .then(() => this.publishSessionEvent<MinerSessionDisconnectedPayload>(MiningEvents.sessionDisconnected, session, {
          sessionId: session.id,
          workerId: session.workerId,
          disconnectedAt: session.lastActivityAt.toISOString(),
          reason: 'SOCKET_CLOSED',
        }))
        .catch((error) => logger.error({ sessionId: session.id, error }, 'disconnect event failed'));
    });
  }

  private async handleLine(session: MinerSession, line: string): Promise<void> {
    session.lastActivityAt = new Date();
    try {
      const request = parseStratumLine(line);
      switch (request.method) {
        case 'mining.configure':
          await this.handleConfigure(session, request);
          return;
        case 'mining.subscribe':
          await this.handleSubscribe(session, request);
          return;
        case 'mining.authorize':
          await this.handleAuthorize(session, request);
          return;
        case 'mining.submit':
          await this.handleSubmit(session, request);
          return;
        default:
          this.write(session, errorResponse(request.id, StratumErrorCode.other, 'Unsupported Stratum method'));
      }
    } catch (error) {
      logger.warn({ sessionId: session.id, error }, 'invalid stratum message');
      this.write(session, errorResponse(null, StratumErrorCode.other, 'Invalid Stratum request'));
    }
  }

  private async handleConfigure(session: MinerSession, request: StratumRequest): Promise<void> {
    const configuration = parseMiningConfigure(request.params);
    const result: Record<string, boolean | string> = {};
    if (configuration.extensions.includes('version-rolling')) {
      session.versionRollingMask = this.config.versionRollingMask;
      result['version-rolling'] = true;
      result['version-rolling.mask'] = session.versionRollingMask;
    }
    for (const extension of configuration.extensions) {
      if (!(extension in result)) result[extension] = false;
    }
    this.write(session, successResponse(request.id, result));
  }

  private async handleSubscribe(session: MinerSession, request: StratumRequest): Promise<void> {
    const subscription = parseMiningSubscribe(request.params);
    session.userAgent = subscription.userAgent;
    session.state = 'SUBSCRIBED';
    await this.publishSessionEvent<MinerSessionSubscribedPayload>(MiningEvents.sessionSubscribed, session, {
      sessionId: session.id,
      userAgent: session.userAgent,
      extranonce1: session.extranonce1,
      extranonce2Size: session.extranonce2Size,
      subscribedAt: new Date().toISOString(),
    });
    this.write(
      session,
      successResponse(request.id, [
        [
          ['mining.set_difficulty', session.id],
          ['mining.notify', session.id],
        ],
        session.extranonce1,
        session.extranonce2Size,
      ]),
    );
  }

  private async handleAuthorize(session: MinerSession, request: StratumRequest): Promise<void> {
    if (session.state === 'CONNECTED') {
      this.write(session, errorResponse(request.id, StratumErrorCode.notSubscribed, 'Worker must subscribe first'));
      return;
    }
    const credentials = parseMiningAuthorize(request.params);
    const authentication = await this.dependencies.authenticator.authenticate(
      credentials.workerName,
      credentials.password,
      {
        sessionId: session.id,
        remoteIpHash: session.remoteHash,
        userAgent: session.userAgent,
        userAgentHash: session.userAgent
          ? hmacSensitiveValue(session.userAgent, this.config.ipHashKey)
          : undefined,
      },
    );
    if (!authentication.authenticated) {
      logger.warn(
        { sessionId: session.id, remoteHash: session.remoteHash, reason: authentication.code },
        'worker authorization failed',
      );
      this.write(session, errorResponse(request.id, StratumErrorCode.unauthorizedWorker, 'Worker authorization failed'));
      return;
    }
    const worker = authentication.worker;

    session.workerId = worker.workerId;
    session.workerName = worker.workerName;
    session.state = 'AUTHORIZED';

    if (this.config.upstreamDriver !== 'development') {
      try {
        session.upstream = this.createUpstreamManager(session);
        const subscription = await session.upstream.start();
        session.extranonce1 = subscription.extranonce1;
        session.extranonce2Size = subscription.extranonce2Size;
        session.assignedDifficulty = session.upstream.currentDifficulty;
      } catch (error) {
        session.upstream?.close();
        session.upstream = undefined;
        logger.error({ sessionId: session.id, error }, 'upstream authorization failed');
        this.write(session, errorResponse(request.id, StratumErrorCode.other, 'Upstream pool is unavailable'));
        return;
      }
    }

    if (this.config.vardiffEnabled) {
      session.vardiff = new VariableDifficultyController(session.assignedDifficulty, {
        targetShareIntervalSeconds: this.config.vardiffTargetShareIntervalSeconds ?? 15,
        retargetIntervalSeconds: this.config.vardiffRetargetIntervalSeconds ?? 90,
        minimumDifficulty: this.config.vardiffMinimumDifficulty ?? 1,
        maximumDifficulty: this.config.vardiffMaximumDifficulty ?? 1_000_000_000,
        maximumAdjustmentFactor: this.config.vardiffMaximumAdjustmentFactor ?? 4,
        minimumSamples: this.config.vardiffMinimumSamples ?? 4,
      });
      session.assignedDifficulty = session.vardiff.setUpstreamFloor(session.assignedDifficulty);
    }

    await this.publishSessionEvent<MinerSessionAuthorizedPayload>(MiningEvents.sessionAuthorized, session, {
      sessionId: session.id,
      workerId: worker.workerId,
      workerName: worker.workerName,
      assignedDifficulty: session.assignedDifficulty,
      authorizedAt: new Date().toISOString(),
    });
    const deviceDetection = detectMinerIdentity({
      userAgent: session.userAgent,
      algorithm: 'SHA256',
    });
    await this.publishSessionEvent<WorkerDeviceDetectedPayload>(MiningEvents.workerDeviceDetected, session, {
      sessionId: session.id,
      workerId: worker.workerId,
      workerName: worker.workerName,
      ...deviceDetection,
      detectedAt: new Date().toISOString(),
    });
    this.write(session, successResponse(request.id, true));
    this.writeNotification(session, 'mining.set_extranonce', [session.extranonce1, session.extranonce2Size]);
    this.writeNotification(session, 'mining.set_difficulty', [session.assignedDifficulty]);

    if (this.config.upstreamDriver === 'development') {
      const job = createDevelopmentJob(new Date(), session.assignedDifficulty, session.extranonce1);
      session.currentJob = {
        ...job,
        id: `${job.id}-${session.id.slice(0, 8)}`,
        versionRollingMask: session.versionRollingMask,
      };
    }

    session.state = 'ACTIVE';
    if (session.currentJob) await this.publishAndNotifyJob(session, session.currentJob);
  }

  private async handleSubmit(session: MinerSession, request: StratumRequest): Promise<void> {
    if (session.state !== 'ACTIVE' || !session.workerId || !session.workerName) {
      this.write(session, errorResponse(request.id, StratumErrorCode.unauthorizedWorker, 'Worker is not authorized'));
      return;
    }
    if (!this.allowSubmission(session)) {
      this.write(session, errorResponse(request.id, StratumErrorCode.other, 'Submission rate limit exceeded'));
      return;
    }

    const parsed = parseMiningSubmit(request.params);
    const submission: BitcoinShareSubmission = { ...parsed, submittedAt: new Date() };
    const registeredJob = session.upstream?.getJob(parsed.jobId);
    const job = session.currentJob?.id === parsed.jobId
      ? session.currentJob
      : registeredJob
        ? { ...registeredJob, versionRollingMask: session.versionRollingMask }
        : undefined;
    const result = await this.validator.validate({
      sessionId: session.id,
      workerId: session.workerId,
      authorizedWorkerName: session.workerName,
      job,
      submission,
    });
    try {
      await this.recordValidationResult(session, submission, result);
    } catch (error) {
      const ownsReservation = result.accepted || (result.fingerprint && result.code !== 'DUPLICATE');
      if (ownsReservation && result.fingerprint) await this.validator.releaseReservation(result.fingerprint);
      throw error;
    }

    if (!result.accepted) {
      this.write(session, errorResponse(request.id, this.mapRejectionCode(result.code), result.safeReason));
      return;
    }

    if (session.upstream) {
      await this.publishUpstreamPending(session, submission, result.fingerprint);
      let upstreamResult: UpstreamShareResult;
      try {
        upstreamResult = await session.upstream.submit({
          jobId: submission.jobId,
          extranonce2: submission.extranonce2,
          networkTime: submission.networkTime,
          nonce: submission.nonce,
          versionBits: submission.versionBits,
        });
      } catch (error) {
        const parsedError = error instanceof Error ? error : new Error(String(error));
        const stale = parsedError instanceof StaleUpstreamJobError;
        const overloaded = parsedError instanceof ShareQueueFullError;
        const unavailable = parsedError instanceof UpstreamUnavailableError;
        upstreamResult = {
          accepted: false,
          errorCode: stale ? StratumErrorCode.staleShare : StratumErrorCode.other,
          errorMessage: stale
            ? 'Share belongs to an invalidated upstream job'
            : overloaded
              ? 'Upstream share queue is full'
              : unavailable
                ? 'Upstream pool is recovering'
                : parsedError.message,
        };
      }
      await this.publishUpstreamDecision(session, submission, result.fingerprint, upstreamResult);
      if (!upstreamResult.accepted) {
        this.write(
          session,
          errorResponse(
            request.id,
            upstreamResult.errorCode ?? StratumErrorCode.other,
            upstreamResult.errorMessage ?? 'Upstream rejected share',
          ),
        );
        return;
      }
    }

    this.recordAcceptedDifficulty(session, submission, result.assignedDifficulty);
    const retarget = session.vardiff?.recordAcceptedShare(submission.submittedAt.getTime());
    if (retarget) {
      session.assignedDifficulty = retarget.nextDifficulty;
      this.writeNotification(session, 'mining.set_difficulty', [retarget.nextDifficulty]);
      const retargetedJob = session.upstream?.retargetCurrentJob(retarget.nextDifficulty);
      if (retargetedJob) await this.publishAndNotifyJob(session, retargetedJob);
      await this.publishSessionEvent<WorkerDifficultyChangedPayload>(MiningEvents.workerDifficultyChanged, session, {
        sessionId: session.id,
        workerId: session.workerId,
        previousDifficulty: retarget.previousDifficulty,
        nextDifficulty: retarget.nextDifficulty,
        source: 'VARDIFF',
        assignedAt: submission.submittedAt.toISOString(),
        observedShareIntervalSeconds: retarget.observedShareIntervalSeconds,
        sampleCount: retarget.sampleCount,
      });
      logger.info({ sessionId: session.id, workerId: session.workerId, ...retarget }, 'worker difficulty retargeted');
    }
    const fiveMinuteCutoff = submission.submittedAt.getTime() - 5 * 60 * 1_000;
    const included = [...session.acceptedDifficultyBuckets.entries()]
      .filter(([key]) => key > fiveMinuteCutoff)
      .map(([, value]) => value);
    const hashrate = calculateHashrateFromAccumulatedDifficulty(
      included.length === 0
        ? '0'
        : addDecimalStrings(included.map((value) => value.accumulatedDifficulty), 12),
      included.reduce((sum, value) => sum + value.shareCount, 0),
      300,
    );
    logger.info(
      {
        sessionId: session.id,
        workerId: session.workerId,
        headerHash: result.headerHash,
        upstreamAccepted: Boolean(session.upstream),
        hashrate5m: hashrate.hashesPerSecond,
      },
      'share validation completed',
    );
    this.write(session, successResponse(request.id, true));
  }

  private createUpstreamManager(session: MinerSession): MultiUpstreamPoolManager {
    const pools = this.config.upstreamPools ?? [{
      id: 'primary',
      name: 'Primary upstream',
      priority: 100,
      weight: 100,
      enabled: true,
      failureThreshold: 3,
      recoveryTimeoutMs: 30_000,
      endpoint: {
        host: this.config.upstreamHost,
        port: this.config.upstreamPort,
        tls: this.config.upstreamTls,
        serverName: this.config.upstreamServerName,
        userAgent: this.config.upstreamUserAgent,
        username: this.config.upstreamUsername,
        password: this.config.upstreamPassword,
        connectTimeoutMs: this.config.upstreamConnectTimeoutMs,
        responseTimeoutMs: this.config.upstreamResponseTimeoutMs,
        maximumLineBytes: this.config.maximumLineBytes,
      },
    }];
    return new MultiUpstreamPoolManager(
      {
        pools,
        maximumRecoveryCycles: this.config.upstreamMaximumRecoveryCycles ?? 5,
        reconnectBaseMs: this.config.upstreamReconnectBaseMs ?? 250,
        reconnectMaximumMs: this.config.upstreamReconnectMaximumMs ?? 30_000,
        reconnectJitterRatio: this.config.upstreamReconnectJitterRatio ?? 0.2,
        connectionAttemptsPerPool: this.config.upstreamMaximumAttempts,
        shareQueueCapacity: this.config.upstreamShareQueueCapacity ?? 256,
        shareQueueTimeoutMs: this.config.upstreamShareQueueTimeoutMs ?? 10_000,
        jobCacheMaximumEntries: this.config.upstreamJobCacheMaximumEntries ?? 512,
      },
      {
        onState: (state) => {
          logger.info({ sessionId: session.id, upstreamManagerState: state }, 'upstream manager state changed');
          if (state === 'RECOVERING') {
            session.recoveryStartedAt = new Date();
            session.currentJob = undefined;
          }
          if (state === 'FAILED' && session.state === 'ACTIVE') session.socket.destroy();
        },
        onActivePool: (poolId, previousPoolId) => {
          session.activeUpstreamPoolId = poolId;
          session.recoveryStartedAt = undefined;
          logger.info({ sessionId: session.id, poolId, previousPoolId }, 'upstream pool selected');
          if (session.workerId) {
            void this.publishSessionEvent<UpstreamPoolSelectedPayload>(MiningEvents.upstreamPoolSelected, session, {
              sessionId: session.id,
              workerId: session.workerId,
              poolId,
              previousPoolId,
              selectedAt: new Date().toISOString(),
            }).catch((error) => logger.error({ sessionId: session.id, error }, 'pool selection event failed'));
          }
        },
        onDifficulty: (difficulty, poolId) => {
          const previousDifficulty = session.assignedDifficulty;
          const downstreamDifficulty = session.vardiff?.setUpstreamFloor(difficulty) ?? difficulty;
          session.assignedDifficulty = downstreamDifficulty;
          if (session.state === 'ACTIVE' && previousDifficulty !== downstreamDifficulty) {
            this.writeNotification(session, 'mining.set_difficulty', [downstreamDifficulty]);
          }
          if (session.workerId && previousDifficulty !== downstreamDifficulty) {
            void this.publishSessionEvent<WorkerDifficultyChangedPayload>(MiningEvents.workerDifficultyChanged, session, {
              sessionId: session.id,
              workerId: session.workerId,
              previousDifficulty,
              nextDifficulty: downstreamDifficulty,
              source: 'UPSTREAM_FLOOR',
              assignedAt: new Date().toISOString(),
            }).catch((error) => logger.error({ sessionId: session.id, error }, 'difficulty event failed'));
          }
          logger.info({ sessionId: session.id, poolId, downstreamDifficulty }, 'upstream difficulty updated');
        },
        onExtranonce: (subscription, poolId) => {
          const changed = session.extranonce1 !== subscription.extranonce1 ||
            session.extranonce2Size !== subscription.extranonce2Size;
          session.extranonce1 = subscription.extranonce1;
          session.extranonce2Size = subscription.extranonce2Size;
          if (changed) session.currentJob = undefined;
          if (session.state === 'ACTIVE' && changed) {
            this.writeNotification(session, 'mining.set_extranonce', [subscription.extranonce1, subscription.extranonce2Size]);
          }
          logger.info({ sessionId: session.id, poolId }, 'upstream extranonce updated');
        },
        onJob: (job, poolId) => {
          const activeJob = {
            ...job,
            assignedDifficulty: session.assignedDifficulty,
            versionRollingMask: session.versionRollingMask,
          };
          session.currentJob = activeJob;
          if (session.state === 'ACTIVE') {
            void this.publishAndNotifyJob(session, activeJob).catch((error) => {
              logger.error({ sessionId: session.id, poolId, jobId: job.id, error }, 'failed to relay upstream job');
              session.socket.destroy();
            });
          }
        },
        onRecoveryStarted: (previousPoolId, reason) => {
          if (!session.workerId) return;
          void this.publishSessionEvent<UpstreamFailoverPayload>(MiningEvents.upstreamFailoverStarted, session, {
            sessionId: session.id,
            workerId: session.workerId,
            previousPoolId,
            reason: reason.message,
            attemptedPoolIds: [],
            occurredAt: new Date().toISOString(),
            recovered: false,
          }).catch((error) => logger.error({ sessionId: session.id, error }, 'failover-start event failed'));
        },
        onFailover: (notice) => {
          const recovered = Boolean(notice.nextPoolId);
          logger.warn({ sessionId: session.id, ...notice, recovered }, recovered ? 'upstream failover completed' : 'upstream failover failed');
          if (session.workerId) {
            void this.publishSessionEvent<UpstreamFailoverPayload>(
              recovered ? MiningEvents.upstreamFailoverCompleted : MiningEvents.upstreamFailoverFailed,
              session,
              {
                sessionId: session.id,
                workerId: session.workerId,
                previousPoolId: notice.previousPoolId,
                nextPoolId: notice.nextPoolId,
                reason: notice.reason,
                attemptedPoolIds: notice.attemptedPoolIds,
                occurredAt: notice.occurredAt,
                recovered,
              },
            ).catch((error) => logger.error({ sessionId: session.id, error }, 'failover event failed'));
          }
        },
        onHealth: (snapshot) => {
          logger.info({ sessionId: session.id, ...snapshot }, 'upstream health updated');
          if (session.workerId) {
            void this.publishSessionEvent<UpstreamHealthChangedPayload>(MiningEvents.upstreamHealthChanged, session, {
              sessionId: session.id,
              workerId: session.workerId,
              ...snapshot,
              observedAt: new Date().toISOString(),
            }).catch((error) => logger.error({ sessionId: session.id, error }, 'upstream health event failed'));
          }
        },
        onError: (error, poolId) => logger.warn({ sessionId: session.id, poolId, error }, 'upstream pool error'),
      },
    );
  }

  private async publishAndNotifyJob(session: MinerSession, job: NonNullable<MinerSession['currentJob']>): Promise<void> {
    session.currentJob = job;
    const route = session.upstream?.getJobRoute(job.id);
    await this.publishSessionEvent<MiningJobReceivedPayload>(MiningEvents.jobReceived, session, {
      sessionId: session.id,
      jobId: job.id,
      upstreamPoolKey: route?.poolId,
      upstreamJobId: route?.upstreamJobId,
      gatewayGeneration: route?.generation,
      asset: 'BTC',
      algorithm: 'SHA256',
      previousBlockHash: job.previousBlockHash,
      coinbase1: job.coinbase1,
      coinbase2: job.coinbase2,
      merkleBranches: job.merkleBranches,
      version: job.version,
      networkBits: job.networkBits,
      networkTime: job.networkTime,
      cleanJobs: job.cleanJobs,
      assignedDifficulty: job.assignedDifficulty,
      receivedAt: job.receivedAt.toISOString(),
      expiresAt: job.expiresAt.toISOString(),
    });
    if (session.state === 'ACTIVE') this.writeNotification(session, 'mining.notify', this.toNotifyParams(job));
  }

  private async publishUpstreamPending(
    session: MinerSession,
    submission: BitcoinShareSubmission,
    fingerprint: string,
  ): Promise<void> {
    const eventId = randomUUID();
    const event: DomainEvent<ShareUpstreamPendingPayload> = {
      eventId,
      eventName: MiningEvents.shareUpstreamPending,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      producer: 'stratum-server',
      aggregateType: 'Share',
      aggregateId: fingerprint,
      correlationId: session.id,
      causationId: submission.jobId,
      idempotencyKey: `${fingerprint}:upstream-pending`,
      payload: {
        sessionId: session.id,
        workerId: session.workerId!,
        jobId: submission.jobId,
        fingerprint,
        submittedAt: submission.submittedAt.toISOString(),
      },
    };
    await this.dependencies.eventStore.append(event);
    await this.dependencies.eventBus?.publish(event);
  }

  private async publishUpstreamDecision(
    session: MinerSession,
    submission: BitcoinShareSubmission,
    fingerprint: string,
    result: UpstreamShareResult,
  ): Promise<void> {
    const eventId = randomUUID();
    const eventName = result.accepted ? MiningEvents.shareUpstreamAccepted : MiningEvents.shareUpstreamRejected;
    const event: DomainEvent<ShareUpstreamDecisionPayload> = {
      eventId,
      eventName,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      producer: 'stratum-server',
      aggregateType: 'Share',
      aggregateId: fingerprint,
      correlationId: session.id,
      causationId: submission.jobId,
      idempotencyKey: `${fingerprint}:${result.accepted ? 'upstream-accepted' : 'upstream-rejected'}`,
      payload: {
        sessionId: session.id,
        workerId: session.workerId!,
        jobId: submission.jobId,
        fingerprint,
        submittedAt: submission.submittedAt.toISOString(),
        decidedAt: new Date().toISOString(),
        upstreamAccepted: result.accepted,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
    };
    await this.dependencies.eventStore.append(event);
    await this.dependencies.eventBus?.publish(event);
  }

  private recordAcceptedDifficulty(
    session: MinerSession,
    submission: BitcoinShareSubmission,
    assignedDifficulty: string,
  ): void {
    const bucketStart = Math.floor(submission.submittedAt.getTime() / 60_000) * 60_000;
    const bucket = session.acceptedDifficultyBuckets.get(bucketStart) ?? {
      accumulatedDifficulty: '0',
      shareCount: 0,
    };
    bucket.accumulatedDifficulty = addDecimalStrings([bucket.accumulatedDifficulty, assignedDifficulty], 12);
    bucket.shareCount += 1;
    session.acceptedDifficultyBuckets.set(bucketStart, bucket);
    const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
    for (const key of session.acceptedDifficultyBuckets.keys()) {
      if (key < cutoff) session.acceptedDifficultyBuckets.delete(key);
    }
  }

  private async publishSessionEvent<TPayload>(
    eventName: string,
    session: MinerSession,
    payload: TPayload,
  ): Promise<void> {
    const eventId = randomUUID();
    const event: DomainEvent<TPayload> = {
      eventId,
      eventName,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      producer: 'stratum-server',
      aggregateType: eventName === MiningEvents.jobReceived ? 'StratumJob' : 'MinerSession',
      aggregateId: eventName === MiningEvents.jobReceived && session.currentJob ? session.currentJob.id : session.id,
      correlationId: session.id,
      idempotencyKey: eventId,
      payload,
    };
    await this.dependencies.eventStore.append(event);
    await this.dependencies.eventBus?.publish(event);
  }

  private async recordValidationResult(
    session: MinerSession,
    submission: BitcoinShareSubmission,
    result: ShareValidationResult,
  ): Promise<void> {
    const eventId = randomUUID();
    const common = {
      eventId,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      producer: 'stratum-server',
      aggregateType: 'Share',
      aggregateId: result.fingerprint ?? eventId,
      correlationId: session.id,
      causationId: submission.jobId,
      idempotencyKey: result.accepted ? result.fingerprint : eventId,
    };

    const event: DomainEvent<ShareAcceptedPayload | ShareRejectedPayload> = result.accepted
      ? {
          ...common,
          eventName: MiningEvents.shareLocalAccepted,
          payload: {
            sessionId: session.id,
            workerId: session.workerId!,
            asset: 'BTC',
            algorithm: 'SHA256',
            jobId: submission.jobId,
            fingerprint: result.fingerprint,
            assignedDifficulty: result.assignedDifficulty,
            achievedDifficulty: result.achievedDifficulty,
            headerHash: result.headerHash,
            extranonce2: submission.extranonce2,
            networkTime: submission.networkTime,
            nonce: submission.nonce,
            versionBits: submission.versionBits,
            submittedAt: submission.submittedAt.toISOString(),
            blockCandidate: result.blockCandidate,
            upstreamRequired: Boolean(session.upstream),
          },
        }
      : {
          ...common,
          eventName: MiningEvents.shareLocalRejected,
          payload: {
            sessionId: session.id,
            workerId: session.workerId,
            asset: 'BTC',
            algorithm: 'SHA256',
            jobId: submission.jobId,
            fingerprint: result.fingerprint,
            extranonce2: submission.extranonce2,
            networkTime: submission.networkTime,
            nonce: submission.nonce,
            versionBits: submission.versionBits,
            submittedAt: submission.submittedAt.toISOString(),
            code: result.code,
            safeReason: result.safeReason,
          },
        };

    await this.dependencies.eventStore.append(event);
    await this.dependencies.eventBus?.publish(event);
  }

  private allowSubmission(session: MinerSession): boolean {
    const now = Date.now();
    if (now - session.submissionWindowStartedAt >= 1_000) {
      session.submissionWindowStartedAt = now;
      session.submissionsInWindow = 0;
    }
    session.submissionsInWindow += 1;
    return session.submissionsInWindow <= this.config.maximumSubmissionsPerSecond;
  }

  private toNotifyParams(job: NonNullable<MinerSession['currentJob']>): unknown[] {
    return [
      job.id,
      job.previousBlockHash,
      job.coinbase1,
      job.coinbase2,
      [...job.merkleBranches],
      job.version,
      job.networkBits,
      job.networkTime,
      job.cleanJobs,
    ];
  }

  private mapRejectionCode(code: string): number {
    switch (code) {
      case 'STALE':
      case 'UNKNOWN_JOB':
        return StratumErrorCode.staleShare;
      case 'DUPLICATE':
        return StratumErrorCode.duplicateShare;
      case 'LOW_DIFFICULTY':
        return StratumErrorCode.lowDifficultyShare;
      case 'UNAUTHORIZED':
        return StratumErrorCode.unauthorizedWorker;
      default:
        return StratumErrorCode.other;
    }
  }

  private write(session: MinerSession, response: ReturnType<typeof successResponse> | ReturnType<typeof errorResponse>): void {
    session.socket.write(serializeStratumResponse(response));
  }

  private writeNotification(session: MinerSession, method: string, params: unknown[]): void {
    session.socket.write(serializeStratumNotification(method, params));
  }
}
