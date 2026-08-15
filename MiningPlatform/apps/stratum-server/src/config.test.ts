/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStratumConfig } from './config.js';

const productionEnvironment = {
  NODE_ENV: 'production',
  STRATUM_DEV_MODE: 'false',
  EVENT_BUS_DRIVER: 'redis',
  EVENT_STORE_DRIVER: 'postgres',
  STRATUM_IP_HASH_KEY: 'production-test-hash-key',
  STRATUM_AUTH_DRIVER: 'postgres',
  UPSTREAM_DRIVER: 'tcp',
  UPSTREAM_HOST: 'pool.example.test',
  UPSTREAM_USERNAME: 'account.worker',
  UPSTREAM_PASSWORD: 'secret',
};

test('production upstream connectivity requires Redis health coordination', () => {
  withEnvironment({ ...productionEnvironment, UPSTREAM_HEALTH_DRIVER: 'memory' }, () =>
    assert.throws(loadStratumConfig, /UPSTREAM_HEALTH_DRIVER=redis/),
  );
});

test('production config exposes bounded distributed health settings', () => {
  withEnvironment(
    {
      ...productionEnvironment,
      UPSTREAM_HEALTH_DRIVER: 'redis',
      UPSTREAM_HEALTH_TTL_MS: '120000',
      UPSTREAM_HEALTH_PROBE_LEASE_MS: '4000',
    },
    () => {
      const config = loadStratumConfig();
      assert.equal(config.upstreamHealthDriver, 'redis');
      assert.equal(config.upstreamHealthTtlMs, 120_000);
      assert.equal(config.upstreamHealthProbeLeaseMs, 4_000);
    },
  );
});

function withEnvironment(values: Record<string, string>, run: () => void): void {
  const keys = Object.keys(values);
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    run();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
