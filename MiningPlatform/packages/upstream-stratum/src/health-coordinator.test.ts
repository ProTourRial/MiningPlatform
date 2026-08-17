/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryDistributedPoolHealthCoordinator } from './health-coordinator.js';
import type { UpstreamPoolDefinition } from './types.js';

const pool: UpstreamPoolDefinition = {
  id: 'primary',
  name: 'Primary',
  priority: 10,
  weight: 100,
  enabled: true,
  failureThreshold: 2,
  recoveryTimeoutMs: 30_000,
  endpoint: {
    host: '127.0.0.1',
    port: 3333,
    userAgent: 'MiningPlatform-health-test',
    username: 'worker',
    password: 'secret',
    connectTimeoutMs: 1_000,
    responseTimeoutMs: 1_000,
    maximumLineBytes: 16_384,
  },
};

test('shares circuit state and grants only one half-open probe', async () => {
  const coordinator = new InMemoryDistributedPoolHealthCoordinator(5_000);
  const firstFailureAt = new Date('2026-08-15T00:00:00.000Z');
  await coordinator.recordConnectionFailure({
    pool,
    observedAt: firstFailureAt,
    error: new Error('timeout one'),
  });
  const opened = await coordinator.recordConnectionFailure({
    pool,
    observedAt: new Date(firstFailureAt.getTime() + 1_000),
    error: new Error('timeout two'),
  });
  assert.equal(opened.state, 'CIRCUIT_OPEN');
  assert.equal(opened.consecutiveFailures, 2);

  const blocked = await coordinator.reserveConnectionAttempt({
    pool,
    observedAt: new Date(firstFailureAt.getTime() + 2_000),
  });
  assert.equal(blocked.allowed, false);

  const recoveryAt = new Date(firstFailureAt.getTime() + 31_001);
  const probe = await coordinator.reserveConnectionAttempt({ pool, observedAt: recoveryAt });
  assert.equal(probe.allowed, true);
  assert.ok(probe.probeToken);

  const competingProbe = await coordinator.reserveConnectionAttempt({
    pool,
    observedAt: new Date(recoveryAt.getTime() + 1),
  });
  assert.equal(competingProbe.allowed, false);
  assert.equal(competingProbe.snapshot?.state, 'CIRCUIT_OPEN');

  const healthy = await coordinator.recordConnectionSuccess({
    pool,
    observedAt: new Date(recoveryAt.getTime() + 500),
    probeToken: probe.probeToken,
  });
  assert.equal(healthy.state, 'HEALTHY');
  assert.equal(healthy.consecutiveFailures, 0);

  const allowedAgain = await coordinator.reserveConnectionAttempt({
    pool,
    observedAt: new Date(recoveryAt.getTime() + 501),
  });
  assert.equal(allowedAgain.allowed, true);
  assert.equal(allowedAgain.probeToken, undefined);
});

test('never includes endpoint credentials in shared health snapshots', async () => {
  const coordinator = new InMemoryDistributedPoolHealthCoordinator();
  const snapshot = await coordinator.recordConnectionFailure({
    pool,
    observedAt: new Date('2026-08-15T00:00:00.000Z'),
    error: new Error('connection refused'),
  });
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes(pool.endpoint.username), false);
  assert.equal(serialized.includes(pool.endpoint.password), false);
});
