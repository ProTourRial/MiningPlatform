/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { BitcoinMiningJob } from '@mining/mining-core';
import { exponentialBackoffMs } from './backoff.js';
import { GatewayJobRouter } from './gateway-job-router.js';
import type {
  DistributedPoolHealthCoordinator,
  PoolConnectionReservation,
} from './health-coordinator.js';
import { StratumV1PoolAdapter } from './pool-adapter.js';
import { BoundedShareQueue } from './share-queue.js';
import type {
  PoolAdapter,
  PoolAdapterCallbacks,
  PoolHealthSnapshot,
  UpstreamFailoverNotice,
  UpstreamManagerState,
  UpstreamPoolDefinition,
  UpstreamShareResult,
  UpstreamSubscription,
  UpstreamSubmitInput,
} from './types.js';

interface PoolRuntime {
  definition: UpstreamPoolDefinition;
  adapter?: PoolAdapter;
  consecutiveFailures: number;
  successfulConnections: number;
  lastConnectedAt?: Date;
  lastFailureAt?: Date;
  circuitOpenedUntil?: Date;
  lastError?: string;
  generation: number;
  pendingJob?: BitcoinMiningJob;
}

export interface MultiUpstreamManagerCallbacks {
  onState?: (state: UpstreamManagerState) => void;
  onActivePool?: (poolId: string, previousPoolId?: string) => void;
  onDifficulty?: (difficulty: string, poolId: string) => void;
  onExtranonce?: (subscription: UpstreamSubscription, poolId: string) => void;
  onJob?: (job: BitcoinMiningJob, poolId: string) => void;
  onRecoveryStarted?: (previousPoolId: string | undefined, reason: Error) => void;
  onFailover?: (notice: UpstreamFailoverNotice) => void;
  onHealth?: (snapshot: PoolHealthSnapshot) => void;
  onError?: (error: Error, poolId?: string) => void;
}

export interface MultiUpstreamManagerOptions {
  pools: readonly UpstreamPoolDefinition[];
  maximumRecoveryCycles?: number;
  reconnectBaseMs?: number;
  reconnectMaximumMs?: number;
  reconnectJitterRatio?: number;
  connectionAttemptsPerPool?: number;
  shareQueueCapacity?: number;
  shareQueueTimeoutMs?: number;
  jobCacheMaximumEntries?: number;
  random?: () => number;
  now?: () => Date;
  healthCoordinator?: DistributedPoolHealthCoordinator;
  adapterFactory?: (pool: UpstreamPoolDefinition, callbacks: PoolAdapterCallbacks) => PoolAdapter;
}

export class UpstreamUnavailableError extends Error {
  constructor(message = 'No active upstream pool is available') {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

export class StaleUpstreamJobError extends Error {
  constructor(readonly jobId: string) {
    super(`Downstream job ${jobId} is no longer valid for the active upstream pool`);
    this.name = 'StaleUpstreamJobError';
  }
}

/**
 * Selects an upstream pool, maintains a bounded submission queue, and recovers
 * an active downstream session across provider reconnects and failovers.
 */
export class MultiUpstreamPoolManager {
  readonly jobs: GatewayJobRouter;
  private readonly runtimes = new Map<string, PoolRuntime>();
  private readonly queue: BoundedShareQueue;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly adapterFactory: NonNullable<MultiUpstreamManagerOptions['adapterFactory']>;
  private state: UpstreamManagerState = 'IDLE';
  private activePoolId?: string;
  private stopped = false;
  private recovery?: Promise<void>;

  constructor(
    private readonly options: MultiUpstreamManagerOptions,
    private readonly callbacks: MultiUpstreamManagerCallbacks = {},
  ) {
    if (options.pools.length === 0)
      throw new Error('At least one upstream pool must be configured');
    const ids = new Set<string>();
    for (const definition of options.pools) {
      validatePoolDefinition(definition);
      if (ids.has(definition.id)) throw new Error(`Duplicate upstream pool id: ${definition.id}`);
      ids.add(definition.id);
      this.runtimes.set(definition.id, {
        definition,
        consecutiveFailures: 0,
        successfulConnections: 0,
        generation: 0,
      });
    }
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.adapterFactory =
      options.adapterFactory ??
      ((pool, callbacks) => new StratumV1PoolAdapter(pool.id, pool.endpoint, callbacks));
    this.jobs = new GatewayJobRouter({
      maximumEntries: options.jobCacheMaximumEntries ?? 512,
      now: this.now,
    });
    this.queue = new BoundedShareQueue(
      options.shareQueueCapacity ?? 256,
      1,
      options.shareQueueTimeoutMs ?? 10_000,
    );
  }

  get currentState(): UpstreamManagerState {
    return this.state;
  }

  get activePool(): string | undefined {
    return this.activePoolId;
  }

  get currentSubscription(): UpstreamSubscription | undefined {
    return this.activeRuntime()?.adapter?.currentSubscription;
  }

  get currentDifficulty(): string {
    return this.activeRuntime()?.adapter?.currentDifficulty ?? '1';
  }

  get queueDepth(): number {
    return this.queue.depth;
  }

  health(): PoolHealthSnapshot[] {
    return [...this.runtimes.values()].map((runtime) => this.healthSnapshot(runtime));
  }

  getJob(downstreamJobId: string): BitcoinMiningJob | undefined {
    return this.jobs.resolve(downstreamJobId)?.downstreamJob;
  }

  getJobRoute(downstreamJobId: string) {
    return this.jobs.resolve(downstreamJobId);
  }

  async start(signal?: AbortSignal): Promise<UpstreamSubscription> {
    if (this.stopped) throw new Error('Upstream manager has been stopped');
    this.setState('CONNECTING');
    const attempted: string[] = [];
    const connected = await this.connectEligiblePools(attempted, signal);
    if (!connected) {
      this.setState('FAILED');
      throw new UpstreamUnavailableError(
        `Could not connect to configured pools: ${attempted.join(', ')}`,
      );
    }
    const subscription = this.currentSubscription;
    if (!subscription)
      throw new UpstreamUnavailableError('Active pool did not provide extranonce values');
    return subscription;
  }

  retargetCurrentJob(assignedDifficulty: string): BitcoinMiningJob | undefined {
    const poolId = this.activePoolId;
    if (!poolId) return undefined;
    const active = this.jobs
      .activeRoutes()
      .filter((route) => route.poolId === poolId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
    if (!active) return undefined;
    return this.jobs.retarget(active.downstreamJob.id, assignedDifficulty).downstreamJob;
  }

  async submit(input: UpstreamSubmitInput): Promise<UpstreamShareResult> {
    return this.queue.enqueue(async () => {
      const route = this.jobs.resolve(input.jobId);
      const runtime = this.activeRuntime();
      if (!route || !runtime?.adapter || route.poolId !== runtime.definition.id) {
        throw new StaleUpstreamJobError(input.jobId);
      }
      return runtime.adapter.submit({ ...input, jobId: route.upstreamJobId });
    }, this.options.shareQueueTimeoutMs ?? 10_000);
  }

  async recover(reason: Error): Promise<void> {
    if (this.stopped) return;
    if (this.recovery) return this.recovery;
    this.recovery = this.performRecovery(reason).finally(() => {
      this.recovery = undefined;
    });
    return this.recovery;
  }

  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.queue.close();
    this.jobs.invalidateAll();
    for (const runtime of this.runtimes.values()) {
      runtime.generation += 1;
      runtime.adapter?.close();
      runtime.adapter = undefined;
    }
    this.activePoolId = undefined;
    this.setState('STOPPED');
  }

  private async performRecovery(reason: Error): Promise<void> {
    const previousPoolId = this.activePoolId;
    this.setState('RECOVERING');
    this.callbacks.onRecoveryStarted?.(previousPoolId, reason);
    this.jobs.invalidateAll();
    this.queue.rejectPending(
      new UpstreamUnavailableError('Upstream failover invalidated queued shares'),
    );
    if (previousPoolId) {
      const previous = this.runtimes.get(previousPoolId);
      if (previous) {
        await this.markFailure(previous, reason);
        previous.generation += 1;
        previous.adapter?.close();
        previous.adapter = undefined;
      }
    }
    this.activePoolId = undefined;

    const maximumCycles = this.options.maximumRecoveryCycles ?? 5;
    const attempted: string[] = [];
    for (let cycle = 0; cycle < maximumCycles && !this.stopped; cycle += 1) {
      const connected = await this.connectEligiblePools(attempted);
      if (connected) {
        const nextPoolId = this.activePoolId;
        this.callbacks.onFailover?.({
          previousPoolId,
          nextPoolId,
          reason: reason.message,
          attemptedPoolIds: [...attempted],
          occurredAt: this.now().toISOString(),
        });
        return;
      }
      if (cycle + 1 < maximumCycles) {
        const delay = exponentialBackoffMs(
          cycle,
          this.options.reconnectBaseMs ?? 250,
          this.options.reconnectMaximumMs ?? 30_000,
          this.options.reconnectJitterRatio ?? 0.2,
          this.random,
        );
        await sleep(delay);
      }
    }
    if (!this.stopped) {
      this.setState('FAILED');
      this.callbacks.onFailover?.({
        previousPoolId,
        reason: reason.message,
        attemptedPoolIds: [...attempted],
        occurredAt: this.now().toISOString(),
      });
      throw new UpstreamUnavailableError('All upstream recovery attempts failed');
    }
  }

  private async connectEligiblePools(attempted: string[], signal?: AbortSignal): Promise<boolean> {
    for (const runtime of this.selectCandidates()) {
      if (this.stopped || signal?.aborted) return false;
      attempted.push(runtime.definition.id);
      const reservation = await this.reserveConnectionAttempt(runtime);
      if (!reservation.allowed) continue;
      try {
        await this.connectRuntime(runtime, reservation.probeToken, signal);
        return true;
      } catch (error) {
        const parsed = error instanceof Error ? error : new Error(String(error));
        await this.markFailure(runtime, parsed, reservation.probeToken);
        this.callbacks.onError?.(parsed, runtime.definition.id);
      }
    }
    return false;
  }

  private async connectRuntime(
    runtime: PoolRuntime,
    probeToken?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    runtime.generation += 1;
    const generation = runtime.generation;
    runtime.adapter?.close();
    const adapter = this.adapterFactory(runtime.definition, {
      onDifficulty: (difficulty) => {
        if (!this.isCurrent(runtime, generation)) return;
        this.callbacks.onDifficulty?.(difficulty, runtime.definition.id);
      },
      onExtranonce: (subscription) => {
        if (!this.isCurrent(runtime, generation)) return;
        this.jobs.invalidateAll();
        this.callbacks.onExtranonce?.(subscription, runtime.definition.id);
      },
      onJob: (job) => {
        if (!this.isCurrent(runtime, generation)) return;
        if (this.activePoolId !== runtime.definition.id) {
          runtime.pendingJob = job;
          return;
        }
        const route = this.jobs.route(runtime.definition.id, job);
        this.callbacks.onJob?.(route.downstreamJob, runtime.definition.id);
      },
      onError: (error) => this.callbacks.onError?.(error, runtime.definition.id),
      onDisconnect: (disconnectReason) => {
        if (!this.isCurrent(runtime, generation) || this.stopped) return;
        void this.recover(disconnectReason).catch((error) => {
          this.callbacks.onError?.(
            error instanceof Error ? error : new Error(String(error)),
            runtime.definition.id,
          );
        });
      },
    });
    runtime.adapter = adapter;
    await adapter.start(this.options.connectionAttemptsPerPool ?? 1, signal);
    if (this.stopped || generation !== runtime.generation) {
      adapter.close();
      throw new Error(`Pool ${runtime.definition.id} connection became obsolete`);
    }
    const previousPoolId = this.activePoolId;
    this.activePoolId = runtime.definition.id;
    runtime.consecutiveFailures = 0;
    runtime.successfulConnections += 1;
    runtime.lastConnectedAt = this.now();
    runtime.circuitOpenedUntil = undefined;
    runtime.lastError = undefined;
    const coordinator = this.options.healthCoordinator;
    if (coordinator) {
      try {
        const snapshot = await coordinator.recordConnectionSuccess({
          pool: runtime.definition,
          observedAt: runtime.lastConnectedAt,
          probeToken,
        });
        this.mergeHealthSnapshot(runtime, snapshot);
      } catch (error) {
        this.reportCoordinatorError(error, runtime.definition.id, 'record success');
      }
    }
    this.setState('ACTIVE');
    this.callbacks.onActivePool?.(runtime.definition.id, previousPoolId);
    this.callbacks.onHealth?.(this.healthSnapshot(runtime));
    if (runtime.pendingJob) {
      const pendingJob = runtime.pendingJob;
      runtime.pendingJob = undefined;
      const route = this.jobs.route(runtime.definition.id, pendingJob);
      this.callbacks.onJob?.(route.downstreamJob, runtime.definition.id);
    }
  }

  private selectCandidates(): PoolRuntime[] {
    const at = this.now();
    return [...this.runtimes.values()]
      .filter((runtime) => runtime.definition.enabled)
      .filter(
        (runtime) =>
          !runtime.circuitOpenedUntil || runtime.circuitOpenedUntil.getTime() <= at.getTime(),
      )
      .sort(
        (left, right) =>
          left.definition.priority - right.definition.priority ||
          right.definition.weight - left.definition.weight ||
          left.definition.id.localeCompare(right.definition.id),
      );
  }

  private async reserveConnectionAttempt(runtime: PoolRuntime): Promise<PoolConnectionReservation> {
    const coordinator = this.options.healthCoordinator;
    if (!coordinator) return { allowed: true };
    try {
      const reservation = await coordinator.reserveConnectionAttempt({
        pool: runtime.definition,
        observedAt: this.now(),
      });
      if (reservation.snapshot) {
        this.mergeHealthSnapshot(runtime, reservation.snapshot);
        this.callbacks.onHealth?.(reservation.snapshot);
      }
      return reservation;
    } catch (error) {
      this.reportCoordinatorError(error, runtime.definition.id, 'reserve attempt');
      return { allowed: true };
    }
  }

  private async markFailure(
    runtime: PoolRuntime,
    error: Error,
    probeToken?: string,
  ): Promise<void> {
    runtime.consecutiveFailures += 1;
    runtime.lastFailureAt = this.now();
    runtime.lastError = error.message;
    if (runtime.consecutiveFailures >= runtime.definition.failureThreshold) {
      runtime.circuitOpenedUntil = new Date(
        this.now().getTime() + runtime.definition.recoveryTimeoutMs,
      );
    }
    const coordinator = this.options.healthCoordinator;
    if (coordinator) {
      try {
        const snapshot = await coordinator.recordConnectionFailure({
          pool: runtime.definition,
          observedAt: runtime.lastFailureAt,
          probeToken,
          error,
        });
        this.mergeHealthSnapshot(runtime, snapshot);
      } catch (coordinationError) {
        this.reportCoordinatorError(coordinationError, runtime.definition.id, 'record failure');
      }
    }
    this.callbacks.onHealth?.(this.healthSnapshot(runtime));
  }

  private mergeHealthSnapshot(runtime: PoolRuntime, snapshot: PoolHealthSnapshot): void {
    if (snapshot.poolId !== runtime.definition.id) {
      throw new Error(`Distributed health snapshot pool mismatch: ${snapshot.poolId}`);
    }
    runtime.consecutiveFailures = snapshot.consecutiveFailures;
    runtime.successfulConnections = snapshot.successfulConnections;
    runtime.lastConnectedAt = parseOptionalDate(snapshot.lastConnectedAt);
    runtime.lastFailureAt = parseOptionalDate(snapshot.lastFailureAt);
    runtime.circuitOpenedUntil = parseOptionalDate(snapshot.circuitOpenedUntil);
    runtime.lastError = snapshot.lastError;
  }

  private reportCoordinatorError(error: unknown, poolId: string, operation: string): void {
    const parsed = error instanceof Error ? error : new Error(String(error));
    this.callbacks.onError?.(
      new Error(`Distributed upstream health ${operation} failed: ${parsed.message}`),
      poolId,
    );
  }

  private healthSnapshot(runtime: PoolRuntime): PoolHealthSnapshot {
    const now = this.now();
    const state = !runtime.definition.enabled
      ? 'DISABLED'
      : runtime.circuitOpenedUntil && runtime.circuitOpenedUntil > now
      ? 'CIRCUIT_OPEN'
      : runtime.consecutiveFailures > 0
      ? 'DEGRADED'
      : 'HEALTHY';
    return {
      poolId: runtime.definition.id,
      state,
      consecutiveFailures: runtime.consecutiveFailures,
      successfulConnections: runtime.successfulConnections,
      lastConnectedAt: runtime.lastConnectedAt?.toISOString(),
      lastFailureAt: runtime.lastFailureAt?.toISOString(),
      circuitOpenedUntil: runtime.circuitOpenedUntil?.toISOString(),
      lastError: runtime.lastError,
    };
  }

  private activeRuntime(): PoolRuntime | undefined {
    return this.activePoolId ? this.runtimes.get(this.activePoolId) : undefined;
  }

  private isCurrent(runtime: PoolRuntime, generation: number): boolean {
    return runtime.generation === generation && runtime.adapter !== undefined;
  }

  private setState(next: UpstreamManagerState): void {
    if (this.state === next) return;
    this.state = next;
    this.callbacks.onState?.(next);
  }
}

function validatePoolDefinition(pool: UpstreamPoolDefinition): void {
  if (!pool.id.trim()) throw new Error('Upstream pool id is required');
  if (!pool.name.trim()) throw new Error(`Upstream pool ${pool.id} name is required`);
  if (!Number.isInteger(pool.priority) || pool.priority < 0)
    throw new Error(`Pool ${pool.id} priority must be non-negative`);
  if (!Number.isInteger(pool.weight) || pool.weight < 1)
    throw new Error(`Pool ${pool.id} weight must be positive`);
  if (!Number.isInteger(pool.failureThreshold) || pool.failureThreshold < 1) {
    throw new Error(`Pool ${pool.id} failureThreshold must be positive`);
  }
  if (!Number.isInteger(pool.recoveryTimeoutMs) || pool.recoveryTimeoutMs < 1) {
    throw new Error(`Pool ${pool.id} recoveryTimeoutMs must be positive`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`Invalid distributed health timestamp: ${value}`);
  return parsed;
}
