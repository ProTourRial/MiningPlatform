/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { UpstreamEndpoint } from '@mining/upstream-stratum';
import type { RandomXMinerServerConfig } from './miner-server.js';

const LAB_ACKNOWLEDGEMENT = 'I_ACCEPT_RANDOMX_LAB_ONLY';

export type DisabledRandomXGatewayConfig = { enabled: false };

export type EnabledRandomXGatewayConfig = {
  enabled: true;
  mode: 'lab';
  miner: RandomXMinerServerConfig;
  redisUrl: string;
  workLeaseKeyPrefix: string;
  workerAuthMaximumFailures: number;
  workerAuthWindowMs: number;
  workerAuthLockMs: number;
  upstreamPoolId: string;
  upstream: UpstreamEndpoint;
  upstreamJobTtlMs: number;
  upstreamMaximumRetainedJobs: number;
  jobRefreshIntervalMs: number;
  randomXServiceUrl: string;
  randomXServiceTimeoutMs: number;
};

export type RandomXGatewayConfig = DisabledRandomXGatewayConfig | EnabledRandomXGatewayConfig;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required when the RandomX gateway is enabled`);
  return value;
}

function positiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be a positive integer no greater than ${maximum}`);
  }
  return value;
}

function port(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  return positiveInteger(environment, name, fallback, 65_535);
}

function loopbackHost(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!['127.0.0.1', '::1', 'localhost'].includes(normalized)) {
    throw new Error('This release permits the RandomX miner listener on loopback only');
  }
  return normalized;
}

function validateServiceUrl(value: string): string {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('RANDOMX_SERVICE_URL must use HTTP or HTTPS');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('RANDOMX_SERVICE_URL must not contain credentials, query, or fragment');
  }
  if (
    parsed.protocol === 'http:' &&
    !['127.0.0.1', '::1', 'localhost'].includes(parsed.hostname.toLowerCase())
  ) {
    throw new Error('RANDOMX_SERVICE_URL requires HTTPS outside loopback');
  }
  return parsed.toString();
}

export function loadRandomXGatewayConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RandomXGatewayConfig {
  if (environment.RANDOMX_GATEWAY_ENABLED !== 'true') return { enabled: false };
  if (environment.NODE_ENV === 'production') {
    throw new Error('Public RandomX runtime activation is not permitted by this release');
  }
  if (environment.RANDOMX_GATEWAY_MODE !== 'lab') {
    throw new Error('RANDOMX_GATEWAY_MODE must be lab while production activation is gated');
  }
  if (environment.RANDOMX_GATEWAY_LAB_ACK !== LAB_ACKNOWLEDGEMENT) {
    throw new Error(`RANDOMX_GATEWAY_LAB_ACK must equal ${LAB_ACKNOWLEDGEMENT}`);
  }
  const ipHashKey = required(environment, 'RANDOMX_IP_HASH_KEY');
  if (Buffer.byteLength(ipHashKey, 'utf8') < 32) {
    throw new Error('RANDOMX_IP_HASH_KEY must contain at least 32 bytes');
  }
  const maximumRetainedJobs = positiveInteger(
    environment,
    'RANDOMX_UPSTREAM_MAX_RETAINED_JOBS',
    16,
    256,
  );
  const upstreamTls = environment.RANDOMX_UPSTREAM_TLS === 'true';
  const upstreamServerName = environment.RANDOMX_UPSTREAM_SERVER_NAME?.trim();
  const serviceUrl = validateServiceUrl(required(environment, 'RANDOMX_SERVICE_URL'));
  const upstreamJobTtlMs = positiveInteger(
    environment,
    'RANDOMX_UPSTREAM_JOB_TTL_MS',
    120_000,
    300_000,
  );
  const jobRefreshIntervalMs = positiveInteger(
    environment,
    'RANDOMX_JOB_REFRESH_INTERVAL_MS',
    10_000,
    300_000,
  );
  if (jobRefreshIntervalMs >= upstreamJobTtlMs) {
    throw new Error('RANDOMX_JOB_REFRESH_INTERVAL_MS must be less than the upstream job TTL');
  }

  return {
    enabled: true,
    mode: 'lab',
    miner: {
      host: loopbackHost(environment.RANDOMX_MINER_HOST ?? '127.0.0.1'),
      port: port(environment, 'RANDOMX_MINER_PORT', 4444),
      ipHashKey,
      maximumConnections: positiveInteger(environment, 'RANDOMX_MINER_MAX_CONNECTIONS', 32, 10_000),
      maximumLineBytes: positiveInteger(
        environment,
        'RANDOMX_MINER_MAX_LINE_BYTES',
        4_096,
        1_048_576,
      ),
      maximumPendingMessages: positiveInteger(
        environment,
        'RANDOMX_MINER_MAX_PENDING_MESSAGES',
        16,
        1_024,
      ),
      maximumSubmissionsPerMinute: positiveInteger(
        environment,
        'RANDOMX_MINER_MAX_SUBMISSIONS_PER_MINUTE',
        240,
        60_000,
      ),
      socketTimeoutMs: positiveInteger(
        environment,
        'RANDOMX_MINER_SOCKET_TIMEOUT_MS',
        120_000,
        3_600_000,
      ),
    },
    redisUrl: required(environment, 'REDIS_URL'),
    workLeaseKeyPrefix: environment.RANDOMX_WORK_LEASE_KEY_PREFIX?.trim() || 'mining:randomx:v1:',
    workerAuthMaximumFailures: positiveInteger(environment, 'RANDOMX_AUTH_MAX_FAILURES', 5, 1_000),
    workerAuthWindowMs: positiveInteger(environment, 'RANDOMX_AUTH_WINDOW_MS', 60_000, 86_400_000),
    workerAuthLockMs: positiveInteger(environment, 'RANDOMX_AUTH_LOCK_MS', 900_000, 604_800_000),
    upstreamPoolId: required(environment, 'RANDOMX_UPSTREAM_POOL_ID'),
    upstream: {
      host: required(environment, 'RANDOMX_UPSTREAM_HOST'),
      port: port(environment, 'RANDOMX_UPSTREAM_PORT', 3333),
      tls: upstreamTls,
      ...(upstreamServerName ? { serverName: upstreamServerName } : {}),
      userAgent: environment.RANDOMX_UPSTREAM_USER_AGENT?.trim() || 'MiningPlatform/0.3.0-alpha.7',
      username: required(environment, 'RANDOMX_UPSTREAM_USERNAME'),
      password: required(environment, 'RANDOMX_UPSTREAM_PASSWORD'),
      connectTimeoutMs: positiveInteger(
        environment,
        'RANDOMX_UPSTREAM_CONNECT_TIMEOUT_MS',
        5_000,
        120_000,
      ),
      responseTimeoutMs: positiveInteger(
        environment,
        'RANDOMX_UPSTREAM_RESPONSE_TIMEOUT_MS',
        10_000,
        120_000,
      ),
      maximumLineBytes: positiveInteger(
        environment,
        'RANDOMX_UPSTREAM_MAX_LINE_BYTES',
        16_384,
        1_048_576,
      ),
    },
    upstreamJobTtlMs,
    upstreamMaximumRetainedJobs: maximumRetainedJobs,
    jobRefreshIntervalMs,
    randomXServiceUrl: serviceUrl,
    randomXServiceTimeoutMs: positiveInteger(
      environment,
      'RANDOMX_SERVICE_TIMEOUT_MS',
      5_000,
      120_000,
    ),
  };
}
