/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import type {
  DistributedPoolHealthCoordinator,
  PoolConnectionAttempt,
  PoolConnectionFailure,
  PoolConnectionReservation,
  PoolConnectionResult,
  PoolHealthSnapshot,
} from '@mining/upstream-stratum';

const RESERVE_ATTEMPT_SCRIPT = `
local failures = tonumber(redis.call('HGET', KEYS[1], 'failures') or '0')
local successes = tonumber(redis.call('HGET', KEYS[1], 'successes') or '0')
local lastConnected = redis.call('HGET', KEYS[1], 'lastConnected') or ''
local lastFailure = redis.call('HGET', KEYS[1], 'lastFailure') or ''
local circuitUntil = tonumber(redis.call('HGET', KEYS[1], 'circuitUntil') or '0')
local lastError = redis.call('HGET', KEYS[1], 'lastError') or ''
local serverTime = redis.call('TIME')
local now = tonumber(serverTime[1]) * 1000 + math.floor(tonumber(serverTime[2]) / 1000)
local threshold = tonumber(ARGV[1])
local probeToken = ARGV[2]
local probeLeaseMs = tonumber(ARGV[3])
local ttlMs = tonumber(ARGV[4])

if circuitUntil > now then
  redis.call('PEXPIRE', KEYS[1], ttlMs)
  return {0, '', failures, successes, lastConnected, lastFailure, circuitUntil, lastError}
end

if circuitUntil > 0 then redis.call('HDEL', KEYS[1], 'circuitUntil') end

if failures >= threshold then
  local existingProbeUntil = tonumber(redis.call('HGET', KEYS[1], 'probeUntil') or '0')
  if existingProbeUntil > now then
    redis.call('PEXPIRE', KEYS[1], ttlMs)
    return {0, '', failures, successes, lastConnected, lastFailure, existingProbeUntil, lastError}
  end
  local probeUntil = now + probeLeaseMs
  redis.call('HSET', KEYS[1], 'probeToken', probeToken, 'probeUntil', probeUntil)
  redis.call('PEXPIRE', KEYS[1], ttlMs)
  return {1, probeToken, failures, successes, lastConnected, lastFailure, 0, lastError}
end

if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('PEXPIRE', KEYS[1], ttlMs) end
return {1, '', failures, successes, lastConnected, lastFailure, 0, lastError}
`;

const RECORD_SUCCESS_SCRIPT = `
local serverTime = redis.call('TIME')
local now = tonumber(serverTime[1]) * 1000 + math.floor(tonumber(serverTime[2]) / 1000)
local successes = redis.call('HINCRBY', KEYS[1], 'successes', 1)
redis.call('HSET', KEYS[1], 'failures', 0, 'lastConnected', now)
redis.call('HDEL', KEYS[1], 'lastFailure', 'lastError', 'circuitUntil', 'probeToken', 'probeUntil')
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return {1, '', 0, successes, now, '', 0, ''}
`;

const RECORD_FAILURE_SCRIPT = `
local serverTime = redis.call('TIME')
local now = tonumber(serverTime[1]) * 1000 + math.floor(tonumber(serverTime[2]) / 1000)
local failures = redis.call('HINCRBY', KEYS[1], 'failures', 1)
local successes = tonumber(redis.call('HGET', KEYS[1], 'successes') or '0')
local lastConnected = redis.call('HGET', KEYS[1], 'lastConnected') or ''
local circuitUntil = 0
if failures >= tonumber(ARGV[1]) then
  circuitUntil = now + tonumber(ARGV[2])
  redis.call('HSET', KEYS[1], 'circuitUntil', circuitUntil)
end
redis.call('HSET', KEYS[1], 'lastFailure', now, 'lastError', ARGV[3])
local currentProbe = redis.call('HGET', KEYS[1], 'probeToken') or ''
if currentProbe == '' or currentProbe == ARGV[4] then
  redis.call('HDEL', KEYS[1], 'probeToken', 'probeUntil')
end
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return {1, '', failures, successes, lastConnected, now, circuitUntil, ARGV[3]}
`;

type RedisHealthTuple = [
  number | string,
  string,
  number | string,
  number | string,
  number | string,
  number | string,
  number | string,
  string,
];

interface RedisHealthClient {
  isOpen: boolean;
  connect(): Promise<unknown>;
  ping(): Promise<string>;
  eval(
    script: string,
    options: { keys: readonly string[]; arguments: readonly string[] },
  ): Promise<unknown>;
  quit(): Promise<unknown>;
}

export class RedisDistributedPoolHealthCoordinator implements DistributedPoolHealthCoordinator {
  private constructor(
    private readonly client: RedisHealthClient,
    private readonly keyPrefix: string,
    private readonly healthTtlMs: number,
    private readonly probeLeaseMs: number,
  ) {}

  static async connect(input: {
    redisUrl: string;
    keyPrefix?: string;
    healthTtlMs?: number;
    probeLeaseMs?: number;
  }): Promise<RedisDistributedPoolHealthCoordinator> {
    const healthTtlMs = positiveInteger(input.healthTtlMs ?? 86_400_000, 'healthTtlMs');
    const probeLeaseMs = positiveInteger(input.probeLeaseMs ?? 5_000, 'probeLeaseMs');
    if (healthTtlMs <= probeLeaseMs) throw new Error('healthTtlMs must exceed probeLeaseMs');
    const keyPrefix = input.keyPrefix?.trim() || 'mining:upstream-health:v1:';
    const client = createClient({ url: input.redisUrl }) as unknown as RedisHealthClient;
    await client.connect();
    await client.ping();
    return new RedisDistributedPoolHealthCoordinator(client, keyPrefix, healthTtlMs, probeLeaseMs);
  }

  async reserveConnectionAttempt(
    attempt: PoolConnectionAttempt,
  ): Promise<PoolConnectionReservation> {
    if (!attempt.pool.enabled) {
      return {
        allowed: false,
        snapshot: emptySnapshot(attempt.pool.id, 'DISABLED'),
      };
    }
    const probeToken = randomUUID();
    const tuple = await this.evaluate(RESERVE_ATTEMPT_SCRIPT, attempt.pool.id, [
      attempt.pool.failureThreshold,
      probeToken,
      this.probeLeaseMs,
      this.ttlFor(attempt.pool.recoveryTimeoutMs),
    ]);
    const token = tuple[1] || undefined;
    return {
      allowed: Number(tuple[0]) === 1,
      probeToken: token,
      snapshot: this.snapshot(attempt.pool.id, tuple, new Date()),
    };
  }

  async recordConnectionSuccess(result: PoolConnectionResult): Promise<PoolHealthSnapshot> {
    const tuple = await this.evaluate(RECORD_SUCCESS_SCRIPT, result.pool.id, [
      this.ttlFor(result.pool.recoveryTimeoutMs),
    ]);
    return this.snapshot(result.pool.id, tuple, new Date());
  }

  async recordConnectionFailure(result: PoolConnectionFailure): Promise<PoolHealthSnapshot> {
    const tuple = await this.evaluate(RECORD_FAILURE_SCRIPT, result.pool.id, [
      result.pool.failureThreshold,
      result.pool.recoveryTimeoutMs,
      result.error.message.slice(0, 1_024),
      result.probeToken ?? '',
      this.ttlFor(result.pool.recoveryTimeoutMs),
    ]);
    return this.snapshot(result.pool.id, tuple, new Date());
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }

  private async evaluate(
    script: string,
    poolId: string,
    args: readonly (string | number)[],
  ): Promise<RedisHealthTuple> {
    const result = await this.client.eval(script, {
      keys: [`${this.keyPrefix}${encodeURIComponent(poolId)}`],
      arguments: args.map(String),
    });
    if (!Array.isArray(result) || result.length !== 8) {
      throw new Error('Redis upstream health script returned an invalid result');
    }
    return result as RedisHealthTuple;
  }

  private ttlFor(recoveryTimeoutMs: number): number {
    return Math.max(this.healthTtlMs, recoveryTimeoutMs * 2, this.probeLeaseMs * 2);
  }

  private snapshot(poolId: string, tuple: RedisHealthTuple, observedAt: Date): PoolHealthSnapshot {
    const failures = Number(tuple[2]);
    const circuitUntil = optionalEpoch(tuple[6]);
    return {
      poolId,
      state:
        circuitUntil && circuitUntil > observedAt
          ? 'CIRCUIT_OPEN'
          : failures > 0
          ? 'DEGRADED'
          : 'HEALTHY',
      consecutiveFailures: failures,
      successfulConnections: Number(tuple[3]),
      lastConnectedAt: optionalEpoch(tuple[4])?.toISOString(),
      lastFailureAt: optionalEpoch(tuple[5])?.toISOString(),
      circuitOpenedUntil: circuitUntil?.toISOString(),
      lastError: tuple[7] || undefined,
    };
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function optionalEpoch(value: number | string): Date | undefined {
  const epoch = Number(value);
  if (!Number.isFinite(epoch) || epoch <= 0) return undefined;
  return new Date(epoch);
}

function emptySnapshot(poolId: string, state: PoolHealthSnapshot['state']): PoolHealthSnapshot {
  return {
    poolId,
    state,
    consecutiveFailures: 0,
    successfulConnections: 0,
  };
}
