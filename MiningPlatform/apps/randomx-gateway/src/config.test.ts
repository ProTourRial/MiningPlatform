/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRandomXGatewayConfig } from './config.js';

const enabledEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  RANDOMX_GATEWAY_ENABLED: 'true',
  RANDOMX_GATEWAY_MODE: 'lab',
  RANDOMX_GATEWAY_LAB_ACK: 'I_ACCEPT_RANDOMX_LAB_ONLY',
  RANDOMX_IP_HASH_KEY: 'randomx-config-test-hash-key-at-least-32-bytes',
  RANDOMX_MINER_HOST: '127.0.0.1',
  RANDOMX_MINER_PORT: '4444',
  REDIS_URL: 'redis://127.0.0.1:6379',
  RANDOMX_UPSTREAM_POOL_ID: 'randomx-pool-1',
  RANDOMX_UPSTREAM_HOST: '127.0.0.1',
  RANDOMX_UPSTREAM_PORT: '3333',
  RANDOMX_UPSTREAM_USERNAME: 'wallet.worker',
  RANDOMX_UPSTREAM_PASSWORD: 'upstream-secret',
  RANDOMX_SERVICE_URL: 'http://127.0.0.1:8080',
};

test('stays disabled without reading any runtime secret', () => {
  assert.deepEqual(loadRandomXGatewayConfig({ NODE_ENV: 'production' }), { enabled: false });
});

test('loads an explicitly acknowledged loopback laboratory runtime', () => {
  const config = loadRandomXGatewayConfig(enabledEnvironment);
  assert.equal(config.enabled, true);
  if (!config.enabled) return;
  assert.equal(config.mode, 'lab');
  assert.equal(config.miner.host, '127.0.0.1');
  assert.equal(config.miner.port, 4444);
  assert.equal(config.upstream.username, 'wallet.worker');
  assert.equal(config.upstreamJobTtlMs, 120_000);
  assert.equal(config.jobRefreshIntervalMs, 10_000);
  assert.equal(config.workLeaseKeyPrefix, 'mining:randomx:v1:');
});

test('refuses any production activation in this release', () => {
  assert.throws(
    () => loadRandomXGatewayConfig({ ...enabledEnvironment, NODE_ENV: 'production' }),
    /Public RandomX runtime activation is not permitted/,
  );
});

test('requires the exact lab acknowledgement and a loopback miner listener', () => {
  assert.throws(
    () => loadRandomXGatewayConfig({ ...enabledEnvironment, RANDOMX_GATEWAY_LAB_ACK: 'yes' }),
    /I_ACCEPT_RANDOMX_LAB_ONLY/,
  );
  assert.throws(
    () => loadRandomXGatewayConfig({ ...enabledEnvironment, RANDOMX_MINER_HOST: '0.0.0.0' }),
    /loopback only/,
  );
});

test('requires HTTPS for a non-loopback RandomX sidecar and bounds the work lease lifetime', () => {
  assert.throws(
    () =>
      loadRandomXGatewayConfig({
        ...enabledEnvironment,
        RANDOMX_SERVICE_URL: 'http://randomx.internal',
      }),
    /requires HTTPS outside loopback/,
  );
  assert.throws(
    () =>
      loadRandomXGatewayConfig({
        ...enabledEnvironment,
        RANDOMX_UPSTREAM_JOB_TTL_MS: '300001',
      }),
    /RANDOMX_UPSTREAM_JOB_TTL_MS/,
  );
});

test('rejects embedded sidecar credentials and undersized hash keys', () => {
  assert.throws(
    () =>
      loadRandomXGatewayConfig({
        ...enabledEnvironment,
        RANDOMX_SERVICE_URL: 'https://user:secret@randomx.internal',
      }),
    /must not contain credentials/,
  );
  assert.throws(
    () => loadRandomXGatewayConfig({ ...enabledEnvironment, RANDOMX_IP_HASH_KEY: 'short' }),
    /at least 32 bytes/,
  );
});

test('requires job publication to run before upstream work expires', () => {
  assert.throws(
    () =>
      loadRandomXGatewayConfig({
        ...enabledEnvironment,
        RANDOMX_UPSTREAM_JOB_TTL_MS: '10000',
        RANDOMX_JOB_REFRESH_INTERVAL_MS: '10000',
      }),
    /must be less than the upstream job TTL/,
  );
});
