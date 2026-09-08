/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { prisma } from '@mining/database';
import { createLogger } from '@mining/logger';
import { RandomXServiceClient, RandomXShareValidator } from '@mining/randomx';
import type { EnabledRandomXGatewayConfig } from './config.js';
import {
  DedicatedRandomXUpstreamSessions,
  createRandomXPoolAdapterSessionFactory,
} from './dedicated-upstream-sessions.js';
import { RandomXConnectionRegistry, RandomXMinerServer } from './miner-server.js';
import { RandomXProductionWorkerAuthenticator } from './production-worker-authenticator.js';
import { createRandomXSubmissionCoordinatorGatewayFactory } from './submission-coordinator.js';
import { RedisRandomXWorkLeaseStore, UniqueRandomXMinerWorkProvider } from './work-isolation.js';

const logger = createLogger('randomx-gateway');

export class RandomXGatewayRuntime {
  private timer?: NodeJS.Timeout;
  private publishTail: Promise<void> = Promise.resolve();
  private started = false;
  private closing?: Promise<void>;

  constructor(
    private readonly server: RandomXMinerServer,
    private readonly refreshIntervalMs: number,
    private readonly disconnectDatabase: () => Promise<unknown> = () => prisma.$disconnect(),
  ) {}

  get listeningPort(): number {
    return this.server.listeningPort;
  }

  async listen(): Promise<void> {
    if (this.closing) throw new Error('RandomX gateway runtime is closing');
    if (this.started) throw new Error('RandomX gateway runtime is already listening');
    await this.server.listen();
    this.started = true;
    this.timer = setInterval(() => this.scheduleJobPublication(), this.refreshIntervalMs);
    this.timer.unref();
  }

  scheduleJobPublication(): void {
    if (!this.started || this.closing) return;
    this.publishTail = this.publishTail
      .then(async () => {
        await this.server.publishNextJobs();
      })
      .catch((error: unknown) => {
        logger.error({ error }, 'RandomX job publication failed');
      });
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = this.closeOnce();
    return this.closing;
  }

  private async closeOnce(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.publishTail;

    const failures: unknown[] = [];
    try {
      await this.server.close();
    } catch (error) {
      failures.push(error);
    }
    try {
      await this.disconnectDatabase();
    } catch (error) {
      failures.push(error);
    }
    this.started = false;
    if (failures.length > 0) {
      throw new AggregateError(failures, 'RandomX gateway runtime did not close cleanly');
    }
  }
}

export async function createRandomXGatewayRuntime(
  config: EnabledRandomXGatewayConfig,
): Promise<RandomXGatewayRuntime> {
  if (config.mode !== 'lab') throw new Error('RandomX public runtime activation remains gated');

  const registry = new RandomXConnectionRegistry();
  let authenticator: RandomXProductionWorkerAuthenticator | undefined;
  let leaseStore: RedisRandomXWorkLeaseStore | undefined;
  let sessions: DedicatedRandomXUpstreamSessions | undefined;
  let isolatedWorkProvider: UniqueRandomXMinerWorkProvider | undefined;
  let runtime: RandomXGatewayRuntime | undefined;

  try {
    authenticator = await RandomXProductionWorkerAuthenticator.create({
      redisUrl: config.redisUrl,
      ipHashKey: config.miner.ipHashKey,
      workerAuthMaximumFailures: config.workerAuthMaximumFailures,
      workerAuthWindowMs: config.workerAuthWindowMs,
      workerAuthLockMs: config.workerAuthLockMs,
    });
    leaseStore = await RedisRandomXWorkLeaseStore.connect(
      config.redisUrl,
      config.workLeaseKeyPrefix,
    );
    const validator = new RandomXShareValidator(
      new RandomXServiceClient({
        url: config.randomXServiceUrl,
        timeoutMilliseconds: config.randomXServiceTimeoutMs,
      }),
    );
    sessions = new DedicatedRandomXUpstreamSessions(
      createRandomXPoolAdapterSessionFactory({
        upstreamPoolId: config.upstreamPoolId,
        endpointFor: () => ({ ...config.upstream }),
        adapterOptions: {
          jobTtlMilliseconds: config.upstreamJobTtlMs,
          maximumRetainedJobs: config.upstreamMaximumRetainedJobs,
        },
      }),
      createRandomXSubmissionCoordinatorGatewayFactory({
        validator,
        identityResolver: registry,
      }),
      {
        maximumRetainedJobsPerConnection: config.upstreamMaximumRetainedJobs,
        onWorkAvailable: () => runtime?.scheduleJobPublication(),
        onError: (error, connectionId) =>
          logger.error({ error, connectionId }, 'RandomX dedicated upstream session failed'),
      },
    );
    isolatedWorkProvider = new UniqueRandomXMinerWorkProvider(sessions, leaseStore);
    const server = new RandomXMinerServer(config.miner, {
      authenticator,
      workProvider: isolatedWorkProvider,
      submissionGateway: sessions,
      registry,
      onError: (error, connectionId) =>
        logger.error({ error, connectionId }, 'RandomX miner session failed'),
    });
    runtime = new RandomXGatewayRuntime(server, config.jobRefreshIntervalMs);
    return runtime;
  } catch (error) {
    const cleanup = isolatedWorkProvider
      ? [isolatedWorkProvider.close()]
      : [sessions?.close(), leaseStore?.close()].filter(
          (operation): operation is Promise<void> => operation !== undefined,
        );
    if (authenticator) cleanup.push(authenticator.close());
    cleanup.push(prisma.$disconnect());
    await Promise.allSettled(cleanup);
    throw error;
  }
}
