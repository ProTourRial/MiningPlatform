import { randomBytes, randomUUID } from 'node:crypto';
import net, { type Socket } from 'node:net';
import { InMemoryEventBus, RedisStreamEventBus, type DomainEvent, type EventBus } from '@mining/event-bus';
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
import { createLogger } from '@mining/logger';
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
import { DevelopmentWorkerAuthenticator, type WorkerAuthenticator } from './development-authenticator.js';
import {
  DevelopmentJsonlEventStore,
  PostgresOutboxEventStore,
  type MiningEventStore,
} from './development-event-store.js';
import { RedisDuplicateShareStore } from './redis-duplicate-share-store.js';
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
    const duplicateStore = config.eventBusDriver === 'redis'
      ? await RedisDuplicateShareStore.connect(config.redisUrl)
      : new InMemoryDuplicateShareStore();
    if (duplicateStore instanceof RedisDuplicateShareStore) closers.push(() => duplicateStore.close());

    let eventBus: EventBus | undefined;
    let eventStore: MiningEventStore;
    if (config.eventStoreDriver === 'postgres') {
      eventStore = new PostgresOutboxEventStore();
    } else {
      eventStore = new DevelopmentJsonlEventStore(config.developmentDataDirectory);
      eventBus = config.eventBusDriver === 'redis'
        ? await RedisStreamEventBus.connect({ url: config.redisUrl, stream: config.eventStream })
        : new InMemoryEventBus();
      if (eventBus instanceof RedisStreamEventBus) closers.push(() => eventBus.close());
    }

    eventBus?.subscribe(MiningEvents.shareLocalAccepted, async (event) => {
      logger.info({ eventId: event.eventId, aggregateId: event.aggregateId }, 'local share accepted');
    });
    eventBus?.subscribe(MiningEvents.shareLocalRejected, async (event) => {
      logger.warn({ eventId: event.eventId, aggregateId: event.aggregateId }, 'local share rejected');
    });

    return new StratumServer(config, {
      authenticator: new DevelopmentWorkerAuthenticator(config),
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
        : 'stratum listening with mining authorization disabled until production adapters are configured',
    );
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) session.socket.destroy();
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
    const worker = await this.dependencies.authenticator.authenticate(credentials.workerName, credentials.password);
    if (!worker) {
      this.write(session, errorResponse(request.id, StratumErrorCode.unauthorizedWorker, 'Worker authorization failed'));
      return;
    }

    session.workerId = worker.workerId;
    session.workerName = worker.workerName;
    session.state = 'AUTHORIZED';
    await this.publishSessionEvent<MinerSessionAuthorizedPayload>(MiningEvents.sessionAuthorized, session, {
      sessionId: session.id,
      workerId: worker.workerId,
      workerName: worker.workerName,
      assignedDifficulty: session.assignedDifficulty,
      authorizedAt: new Date().toISOString(),
    });
    this.write(session, successResponse(request.id, true));
    this.writeNotification(session, 'mining.set_difficulty', [session.assignedDifficulty]);

    const job = createDevelopmentJob(new Date(), session.assignedDifficulty, session.extranonce1);
    session.currentJob = {
      ...job,
      id: `${job.id}-${session.id.slice(0, 8)}`,
      versionRollingMask: session.versionRollingMask,
    };
    session.state = 'ACTIVE';
    await this.publishSessionEvent<MiningJobReceivedPayload>(MiningEvents.jobReceived, session, {
      sessionId: session.id,
      jobId: session.currentJob.id,
      asset: 'BTC',
      algorithm: 'SHA256',
      previousBlockHash: session.currentJob.previousBlockHash,
      coinbase1: session.currentJob.coinbase1,
      coinbase2: session.currentJob.coinbase2,
      merkleBranches: session.currentJob.merkleBranches,
      version: session.currentJob.version,
      networkBits: session.currentJob.networkBits,
      networkTime: session.currentJob.networkTime,
      cleanJobs: session.currentJob.cleanJobs,
      assignedDifficulty: session.currentJob.assignedDifficulty,
      receivedAt: session.currentJob.receivedAt.toISOString(),
      expiresAt: session.currentJob.expiresAt.toISOString(),
    });
    this.writeNotification(session, 'mining.notify', this.toNotifyParams(session.currentJob));
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
    const result = await this.validator.validate({
      sessionId: session.id,
      workerId: session.workerId,
      authorizedWorkerName: session.workerName,
      job: session.currentJob,
      submission,
    });
    try {
      await this.recordValidationResult(session, submission, result);
    } catch (error) {
      const ownsReservation = result.accepted || (result.fingerprint && result.code !== 'DUPLICATE');
      if (ownsReservation && result.fingerprint) await this.validator.releaseReservation(result.fingerprint);
      throw error;
    }

    if (result.accepted) {
      const bucketStart = Math.floor(submission.submittedAt.getTime() / 60_000) * 60_000;
      const bucket = session.acceptedDifficultyBuckets.get(bucketStart) ?? {
        accumulatedDifficulty: '0',
        shareCount: 0,
      };
      bucket.accumulatedDifficulty = addDecimalStrings(
        [bucket.accumulatedDifficulty, result.assignedDifficulty],
        12,
      );
      bucket.shareCount += 1;
      session.acceptedDifficultyBuckets.set(bucketStart, bucket);
      const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
      for (const key of session.acceptedDifficultyBuckets.keys()) {
        if (key < cutoff) session.acceptedDifficultyBuckets.delete(key);
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
          hashrate5m: hashrate.hashesPerSecond,
        },
        'share validation completed',
      );
      this.write(session, successResponse(request.id, true));
      return;
    }

    this.write(session, errorResponse(request.id, this.mapRejectionCode(result.code), result.safeReason));
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
