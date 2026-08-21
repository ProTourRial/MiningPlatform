/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { UpstreamPoolDefinition } from '@mining/upstream-stratum';
import { parseUpstreamPoolsJson } from './upstream-config.js';

export interface StratumServerConfig {
  host: string;
  port: number;
  developmentMode: boolean;
  developmentWorker: string;
  developmentPassword: string;
  developmentDifficulty: string;
  workerAuthDriver: 'development' | 'postgres';
  workerAuthMaximumFailures: number;
  workerAuthWindowMs: number;
  workerAuthLockMs: number;
  socketTimeoutMs: number;
  maximumLineBytes: number;
  maximumSubmissionsPerSecond: number;
  developmentDataDirectory: string;
  eventBusDriver: 'memory' | 'redis';
  eventStoreDriver: 'jsonl' | 'postgres';
  redisUrl: string;
  eventStream: string;
  versionRollingMask: string;
  ipHashKey: string;
  upstreamDriver: 'development' | 'tcp' | 'multi';
  upstreamHost: string;
  upstreamPort: number;
  upstreamTls: boolean;
  upstreamServerName?: string;
  upstreamUsername: string;
  upstreamPassword: string;
  upstreamUserAgent: string;
  upstreamConnectTimeoutMs: number;
  upstreamResponseTimeoutMs: number;
  upstreamMaximumAttempts: number;
  upstreamPools?: readonly UpstreamPoolDefinition[];
  upstreamMaximumRecoveryCycles?: number;
  upstreamReconnectBaseMs?: number;
  upstreamReconnectMaximumMs?: number;
  upstreamReconnectJitterRatio?: number;
  upstreamShareQueueCapacity?: number;
  upstreamShareQueueTimeoutMs?: number;
  upstreamJobCacheMaximumEntries?: number;
  upstreamHealthDriver?: 'memory' | 'redis';
  upstreamHealthKeyPrefix?: string;
  upstreamHealthTtlMs?: number;
  upstreamHealthProbeLeaseMs?: number;
  vardiffEnabled?: boolean;
  vardiffTargetShareIntervalSeconds?: number;
  vardiffRetargetIntervalSeconds?: number;
  vardiffMinimumDifficulty?: number;
  vardiffMaximumDifficulty?: number;
  vardiffMaximumAdjustmentFactor?: number;
  vardiffMinimumSamples?: number;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`Expected a positive integer, received ${value}`);
  return parsed;
}

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive number, received ${value}`);
  return parsed;
}

function ratio(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1)
    throw new Error(`${name} must be between 0 and 1`);
  return parsed;
}

export function loadStratumConfig(): StratumServerConfig {
  const developmentMode = process.env.STRATUM_DEV_MODE === 'true';
  if (process.env.NODE_ENV === 'production' && developmentMode) {
    throw new Error('STRATUM_DEV_MODE cannot be enabled in production');
  }
  const eventBusDriver = process.env.EVENT_BUS_DRIVER ?? 'memory';
  if (eventBusDriver !== 'memory' && eventBusDriver !== 'redis') {
    throw new Error('EVENT_BUS_DRIVER must be memory or redis');
  }
  const eventStoreDriver =
    process.env.EVENT_STORE_DRIVER ?? (developmentMode ? 'jsonl' : 'postgres');
  if (eventStoreDriver !== 'jsonl' && eventStoreDriver !== 'postgres') {
    throw new Error('EVENT_STORE_DRIVER must be jsonl or postgres');
  }
  if (process.env.NODE_ENV === 'production' && eventStoreDriver !== 'postgres') {
    throw new Error('Production Stratum requires EVENT_STORE_DRIVER=postgres');
  }
  const ipHashKey =
    process.env.STRATUM_IP_HASH_KEY ?? (developmentMode ? 'development-only-ip-hash-key' : '');
  if (ipHashKey.length < 16)
    throw new Error('STRATUM_IP_HASH_KEY must contain at least 16 characters');
  const workerAuthDriver =
    process.env.STRATUM_AUTH_DRIVER ?? (developmentMode ? 'development' : 'postgres');
  if (workerAuthDriver !== 'development' && workerAuthDriver !== 'postgres') {
    throw new Error('STRATUM_AUTH_DRIVER must be development or postgres');
  }
  if (process.env.NODE_ENV === 'production' && workerAuthDriver !== 'postgres') {
    throw new Error('Production Stratum requires STRATUM_AUTH_DRIVER=postgres');
  }
  if (workerAuthDriver === 'development' && !developmentMode) {
    throw new Error('Development worker authentication requires STRATUM_DEV_MODE=true');
  }

  const upstreamDriver = process.env.UPSTREAM_DRIVER ?? (developmentMode ? 'development' : 'tcp');
  if (upstreamDriver !== 'development' && upstreamDriver !== 'tcp' && upstreamDriver !== 'multi') {
    throw new Error('UPSTREAM_DRIVER must be development, tcp, or multi');
  }
  if (process.env.NODE_ENV === 'production' && upstreamDriver === 'development') {
    throw new Error('Production Stratum requires UPSTREAM_DRIVER=tcp or multi');
  }
  const upstreamHealthDriver =
    process.env.UPSTREAM_HEALTH_DRIVER ?? (eventBusDriver === 'redis' ? 'redis' : 'memory');
  if (upstreamHealthDriver !== 'memory' && upstreamHealthDriver !== 'redis') {
    throw new Error('UPSTREAM_HEALTH_DRIVER must be memory or redis');
  }
  if (
    process.env.NODE_ENV === 'production' &&
    upstreamDriver !== 'development' &&
    upstreamHealthDriver !== 'redis'
  ) {
    throw new Error('Production Stratum requires UPSTREAM_HEALTH_DRIVER=redis');
  }

  const upstreamPoolsJson = process.env.UPSTREAM_POOLS_JSON;
  if (upstreamDriver === 'multi' && !upstreamPoolsJson?.trim()) {
    throw new Error('UPSTREAM_DRIVER=multi requires a non-empty UPSTREAM_POOLS_JSON array');
  }
  if (
    upstreamDriver === 'tcp' &&
    (!process.env.UPSTREAM_HOST?.trim() ||
      !process.env.UPSTREAM_USERNAME?.trim() ||
      !process.env.UPSTREAM_PASSWORD?.trim())
  ) {
    throw new Error(
      'UPSTREAM_DRIVER=tcp requires UPSTREAM_HOST, UPSTREAM_USERNAME, and UPSTREAM_PASSWORD',
    );
  }

  const upstreamHost = process.env.UPSTREAM_HOST?.trim() || '127.0.0.1';
  const upstreamPort = positiveInteger(process.env.UPSTREAM_PORT, 3334);
  const upstreamTls = process.env.UPSTREAM_TLS === 'true';
  const upstreamServerName = process.env.UPSTREAM_SERVER_NAME;
  const upstreamUsername = process.env.UPSTREAM_USERNAME?.trim() || 'unused';
  const upstreamPassword = process.env.UPSTREAM_PASSWORD?.trim() || 'unused';
  const upstreamUserAgent = process.env.UPSTREAM_USER_AGENT ?? 'MiningPlatform/0.3.0-alpha.6';
  const upstreamConnectTimeoutMs = positiveInteger(process.env.UPSTREAM_CONNECT_TIMEOUT_MS, 5_000);
  const upstreamResponseTimeoutMs = positiveInteger(
    process.env.UPSTREAM_RESPONSE_TIMEOUT_MS,
    10_000,
  );
  const maximumLineBytes = positiveInteger(process.env.STRATUM_MAX_LINE_BYTES, 16_384);
  const upstreamPools = parseUpstreamPoolsJson(upstreamPoolsJson, {
    host: upstreamHost,
    port: upstreamPort,
    tls: upstreamTls,
    serverName: upstreamServerName,
    username: upstreamUsername,
    password: upstreamPassword,
    userAgent: upstreamUserAgent,
    connectTimeoutMs: upstreamConnectTimeoutMs,
    responseTimeoutMs: upstreamResponseTimeoutMs,
    maximumLineBytes,
  });
  const upstreamHealthTtlMs = positiveInteger(process.env.UPSTREAM_HEALTH_TTL_MS, 86_400_000);
  const upstreamHealthProbeLeaseMs = positiveInteger(
    process.env.UPSTREAM_HEALTH_PROBE_LEASE_MS,
    5_000,
  );
  if (upstreamHealthTtlMs <= upstreamHealthProbeLeaseMs) {
    throw new Error('UPSTREAM_HEALTH_TTL_MS must exceed UPSTREAM_HEALTH_PROBE_LEASE_MS');
  }

  return {
    host: process.env.STRATUM_HOST ?? '0.0.0.0',
    port: positiveInteger(process.env.STRATUM_PORT, 3333),
    developmentMode,
    developmentWorker: process.env.STRATUM_DEV_WORKER ?? 'demo.worker1',
    developmentPassword: process.env.STRATUM_DEV_PASSWORD ?? 'x',
    developmentDifficulty: process.env.STRATUM_DEV_DIFFICULTY ?? '0.000001',
    workerAuthDriver,
    workerAuthMaximumFailures: positiveInteger(process.env.STRATUM_AUTH_MAX_FAILURES, 5),
    workerAuthWindowMs: positiveInteger(process.env.STRATUM_AUTH_WINDOW_MS, 60_000),
    workerAuthLockMs: positiveInteger(process.env.STRATUM_AUTH_LOCK_MS, 15 * 60_000),
    socketTimeoutMs: positiveInteger(process.env.STRATUM_SOCKET_TIMEOUT_MS, 120_000),
    maximumLineBytes,
    maximumSubmissionsPerSecond: positiveInteger(
      process.env.STRATUM_MAX_SUBMISSIONS_PER_SECOND,
      20,
    ),
    developmentDataDirectory: process.env.STRATUM_DEV_DATA_DIR ?? './data/stratum',
    eventBusDriver,
    eventStoreDriver,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    eventStream: process.env.EVENT_STREAM ?? 'mining:domain-events',
    versionRollingMask: process.env.STRATUM_VERSION_ROLLING_MASK ?? '1fffe000',
    ipHashKey,
    upstreamDriver,
    upstreamHost,
    upstreamPort,
    upstreamTls,
    upstreamServerName,
    upstreamUsername,
    upstreamPassword,
    upstreamUserAgent,
    upstreamConnectTimeoutMs,
    upstreamResponseTimeoutMs,
    upstreamMaximumAttempts: positiveInteger(process.env.UPSTREAM_MAXIMUM_ATTEMPTS, 5),
    upstreamPools,
    upstreamMaximumRecoveryCycles: positiveInteger(process.env.UPSTREAM_MAXIMUM_RECOVERY_CYCLES, 5),
    upstreamReconnectBaseMs: positiveInteger(process.env.UPSTREAM_RECONNECT_BASE_MS, 250),
    upstreamReconnectMaximumMs: positiveInteger(process.env.UPSTREAM_RECONNECT_MAXIMUM_MS, 30_000),
    upstreamReconnectJitterRatio: ratio(
      process.env.UPSTREAM_RECONNECT_JITTER_RATIO,
      0.2,
      'UPSTREAM_RECONNECT_JITTER_RATIO',
    ),
    upstreamShareQueueCapacity: positiveInteger(process.env.UPSTREAM_SHARE_QUEUE_CAPACITY, 256),
    upstreamShareQueueTimeoutMs: positiveInteger(
      process.env.UPSTREAM_SHARE_QUEUE_TIMEOUT_MS,
      10_000,
    ),
    upstreamJobCacheMaximumEntries: positiveInteger(
      process.env.UPSTREAM_JOB_CACHE_MAXIMUM_ENTRIES,
      512,
    ),
    upstreamHealthDriver,
    upstreamHealthKeyPrefix:
      process.env.UPSTREAM_HEALTH_KEY_PREFIX?.trim() || 'mining:upstream-health:v1:',
    upstreamHealthTtlMs,
    upstreamHealthProbeLeaseMs,
    vardiffEnabled: process.env.VARDIFF_ENABLED === 'true',
    vardiffTargetShareIntervalSeconds: positiveInteger(
      process.env.VARDIFF_TARGET_SHARE_INTERVAL_SECONDS,
      15,
    ),
    vardiffRetargetIntervalSeconds: positiveInteger(
      process.env.VARDIFF_RETARGET_INTERVAL_SECONDS,
      90,
    ),
    vardiffMinimumDifficulty: positiveNumber(
      process.env.VARDIFF_MINIMUM_DIFFICULTY,
      1,
      'VARDIFF_MINIMUM_DIFFICULTY',
    ),
    vardiffMaximumDifficulty: positiveNumber(
      process.env.VARDIFF_MAXIMUM_DIFFICULTY,
      1_000_000_000,
      'VARDIFF_MAXIMUM_DIFFICULTY',
    ),
    vardiffMaximumAdjustmentFactor: positiveNumber(
      process.env.VARDIFF_MAXIMUM_ADJUSTMENT_FACTOR,
      4,
      'VARDIFF_MAXIMUM_ADJUSTMENT_FACTOR',
    ),
    vardiffMinimumSamples: positiveInteger(process.env.VARDIFF_MINIMUM_SAMPLES, 4),
  };
}
