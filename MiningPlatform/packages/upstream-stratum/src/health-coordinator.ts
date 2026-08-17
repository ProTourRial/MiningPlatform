/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { PoolHealthSnapshot, UpstreamPoolDefinition } from './types.js';

export interface PoolConnectionReservation {
  allowed: boolean;
  probeToken?: string;
  snapshot?: PoolHealthSnapshot;
}

export interface PoolConnectionAttempt {
  pool: UpstreamPoolDefinition;
  observedAt: Date;
}

export interface PoolConnectionResult extends PoolConnectionAttempt {
  probeToken?: string;
}

export interface PoolConnectionFailure extends PoolConnectionResult {
  error: Error;
}

/**
 * Coordinates provider health between Stratum replicas. Implementations must
 * make half-open probe reservation atomic. A coordinator outage is handled as
 * a fail-open observability event by MultiUpstreamPoolManager so Redis cannot
 * become a mining-plane single point of failure.
 */
export interface DistributedPoolHealthCoordinator {
  reserveConnectionAttempt(attempt: PoolConnectionAttempt): Promise<PoolConnectionReservation>;
  recordConnectionSuccess(result: PoolConnectionResult): Promise<PoolHealthSnapshot>;
  recordConnectionFailure(result: PoolConnectionFailure): Promise<PoolHealthSnapshot>;
  close?(): Promise<void>;
}

interface SharedPoolState {
  consecutiveFailures: number;
  successfulConnections: number;
  lastConnectedAt?: Date;
  lastFailureAt?: Date;
  circuitOpenedUntil?: Date;
  lastError?: string;
  probeToken?: string;
  probeExpiresAt?: Date;
}

/** Deterministic reference implementation used by protocol tests. */
export class InMemoryDistributedPoolHealthCoordinator implements DistributedPoolHealthCoordinator {
  private readonly states = new Map<string, SharedPoolState>();
  private probeSequence = 0;

  constructor(private readonly probeLeaseMs = 5_000) {
    if (!Number.isInteger(probeLeaseMs) || probeLeaseMs < 1) {
      throw new Error('probeLeaseMs must be a positive integer');
    }
  }

  async reserveConnectionAttempt(
    attempt: PoolConnectionAttempt,
  ): Promise<PoolConnectionReservation> {
    const state = this.state(attempt.pool.id);
    if (!attempt.pool.enabled) {
      return {
        allowed: false,
        snapshot: this.snapshot(attempt.pool.id, state, attempt.observedAt, true),
      };
    }

    if (state.circuitOpenedUntil && state.circuitOpenedUntil > attempt.observedAt) {
      return {
        allowed: false,
        snapshot: this.snapshot(attempt.pool.id, state, attempt.observedAt),
      };
    }

    if (state.consecutiveFailures >= attempt.pool.failureThreshold) {
      if (state.probeExpiresAt && state.probeExpiresAt > attempt.observedAt) {
        return {
          allowed: false,
          snapshot: this.snapshot(
            attempt.pool.id,
            {
              ...state,
              circuitOpenedUntil: state.probeExpiresAt,
            },
            attempt.observedAt,
          ),
        };
      }

      this.probeSequence += 1;
      state.probeToken = `probe-${this.probeSequence}`;
      state.probeExpiresAt = new Date(attempt.observedAt.getTime() + this.probeLeaseMs);
      return {
        allowed: true,
        probeToken: state.probeToken,
        snapshot: this.snapshot(attempt.pool.id, state, attempt.observedAt),
      };
    }

    return { allowed: true, snapshot: this.snapshot(attempt.pool.id, state, attempt.observedAt) };
  }

  async recordConnectionSuccess(result: PoolConnectionResult): Promise<PoolHealthSnapshot> {
    const state = this.state(result.pool.id);
    state.consecutiveFailures = 0;
    state.successfulConnections += 1;
    state.lastConnectedAt = result.observedAt;
    state.circuitOpenedUntil = undefined;
    state.lastError = undefined;
    if (!state.probeToken || state.probeToken === result.probeToken) {
      state.probeToken = undefined;
      state.probeExpiresAt = undefined;
    }
    return this.snapshot(result.pool.id, state, result.observedAt);
  }

  async recordConnectionFailure(result: PoolConnectionFailure): Promise<PoolHealthSnapshot> {
    const state = this.state(result.pool.id);
    state.consecutiveFailures += 1;
    state.lastFailureAt = result.observedAt;
    state.lastError = result.error.message;
    if (state.consecutiveFailures >= result.pool.failureThreshold) {
      state.circuitOpenedUntil = new Date(
        result.observedAt.getTime() + result.pool.recoveryTimeoutMs,
      );
    }
    if (!state.probeToken || state.probeToken === result.probeToken) {
      state.probeToken = undefined;
      state.probeExpiresAt = undefined;
    }
    return this.snapshot(result.pool.id, state, result.observedAt);
  }

  private state(poolId: string): SharedPoolState {
    const existing = this.states.get(poolId);
    if (existing) return existing;
    const created: SharedPoolState = {
      consecutiveFailures: 0,
      successfulConnections: 0,
    };
    this.states.set(poolId, created);
    return created;
  }

  private snapshot(
    poolId: string,
    state: SharedPoolState,
    observedAt: Date,
    disabled = false,
  ): PoolHealthSnapshot {
    const circuitOpen = state.circuitOpenedUntil && state.circuitOpenedUntil > observedAt;
    return {
      poolId,
      state: disabled
        ? 'DISABLED'
        : circuitOpen
        ? 'CIRCUIT_OPEN'
        : state.consecutiveFailures > 0
        ? 'DEGRADED'
        : 'HEALTHY',
      consecutiveFailures: state.consecutiveFailures,
      successfulConnections: state.successfulConnections,
      lastConnectedAt: state.lastConnectedAt?.toISOString(),
      lastFailureAt: state.lastFailureAt?.toISOString(),
      circuitOpenedUntil: state.circuitOpenedUntil?.toISOString(),
      lastError: state.lastError,
    };
  }
}
