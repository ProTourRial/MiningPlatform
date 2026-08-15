/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { UpstreamPoolDefinition } from '@mining/upstream-stratum';
import { RedisDistributedPoolHealthCoordinator } from './redis-upstream-health-coordinator.js';

const redisUrl = process.env.REDIS_INTEGRATION_URL;

test(
  'coordinates circuit and half-open probe across Redis clients',
  { skip: !redisUrl },
  async () => {
    const prefix = `test:upstream-health:${randomUUID()}:`;
    const first = await RedisDistributedPoolHealthCoordinator.connect({
      redisUrl: redisUrl!,
      keyPrefix: prefix,
      healthTtlMs: 60_000,
      probeLeaseMs: 250,
    });
    const second = await RedisDistributedPoolHealthCoordinator.connect({
      redisUrl: redisUrl!,
      keyPrefix: prefix,
      healthTtlMs: 60_000,
      probeLeaseMs: 250,
    });
    const pool: UpstreamPoolDefinition = {
      id: 'primary',
      name: 'Primary',
      priority: 10,
      weight: 100,
      enabled: true,
      failureThreshold: 2,
      recoveryTimeoutMs: 500,
      endpoint: {
        host: '127.0.0.1',
        port: 3333,
        userAgent: 'MiningPlatform-redis-health-test',
        username: 'worker',
        password: 'secret',
        connectTimeoutMs: 1_000,
        responseTimeoutMs: 1_000,
        maximumLineBytes: 16_384,
      },
    };
    const start = new Date();

    try {
      await first.recordConnectionFailure({
        pool,
        observedAt: start,
        error: new Error('timeout one'),
      });
      const open = await second.recordConnectionFailure({
        pool,
        observedAt: new Date(start.getTime() + 1),
        error: new Error('timeout two'),
      });
      assert.equal(open.state, 'CIRCUIT_OPEN');
      assert.equal(open.consecutiveFailures, 2);

      const blocked = await first.reserveConnectionAttempt({
        pool,
        observedAt: new Date(start.getTime() + 100),
      });
      assert.equal(blocked.allowed, false);

      await new Promise((resolve) => setTimeout(resolve, pool.recoveryTimeoutMs + 25));
      const recoveryAt = new Date();
      const probe = await first.reserveConnectionAttempt({ pool, observedAt: recoveryAt });
      assert.equal(probe.allowed, true);
      assert.ok(probe.probeToken);

      const competing = await second.reserveConnectionAttempt({
        pool,
        observedAt: new Date(recoveryAt.getTime() + 1),
      });
      assert.equal(competing.allowed, false);

      const healthy = await first.recordConnectionSuccess({
        pool,
        observedAt: new Date(recoveryAt.getTime() + 2),
        probeToken: probe.probeToken,
      });
      assert.equal(healthy.state, 'HEALTHY');
      assert.equal(healthy.consecutiveFailures, 0);

      const normal = await second.reserveConnectionAttempt({
        pool,
        observedAt: new Date(recoveryAt.getTime() + 3),
      });
      assert.equal(normal.allowed, true);
      assert.equal(normal.probeToken, undefined);
    } finally {
      await first.close();
      await second.close();
    }
  },
);
