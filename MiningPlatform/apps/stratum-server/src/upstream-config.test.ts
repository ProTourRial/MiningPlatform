/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUpstreamPoolsJson } from './upstream-config.js';

const legacy = {
  host: 'pool.example',
  port: 3333,
  tls: false,
  username: 'account.worker',
  password: 'secret',
  userAgent: 'MiningPlatform-test/0.3.0',
  connectTimeoutMs: 5_000,
  responseTimeoutMs: 10_000,
  maximumLineBytes: 16_384,
};

test('creates a compatible primary pool from legacy environment fields', () => {
  const pools = parseUpstreamPoolsJson(undefined, legacy);
  assert.equal(pools.length, 1);
  assert.equal(pools[0]?.id, 'primary');
  assert.equal(pools[0]?.endpoint.host, 'pool.example');
});

test('parses ordered multi-upstream configuration without exposing credentials', () => {
  const pools = parseUpstreamPoolsJson(JSON.stringify([
    {
      id: 'primary',
      host: 'primary.example',
      port: 443,
      tls: true,
      username: 'account.primary',
      password: 'primary-secret',
      priority: 10,
      failureThreshold: 2,
    },
    {
      id: 'backup',
      host: 'backup.example',
      port: 3333,
      username: 'account.backup',
      password: 'backup-secret',
      priority: 20,
      recoveryTimeoutMs: 60_000,
    },
  ]), legacy);
  assert.deepEqual(pools.map((pool) => pool.id), ['primary', 'backup']);
  assert.equal(pools[0]?.endpoint.tls, true);
  assert.equal(pools[1]?.recoveryTimeoutMs, 60_000);
});

test('rejects duplicate-free but malformed pool definitions early', () => {
  assert.throws(
    () => parseUpstreamPoolsJson('[{"id":"broken","host":"pool","username":"u","password":"p"}]', legacy),
    /port must be a positive integer/,
  );
});
