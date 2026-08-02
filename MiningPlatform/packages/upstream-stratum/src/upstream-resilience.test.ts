/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateHeaderHash,
  DIFFICULTY_ONE_TARGET,
  type BitcoinMiningJob,
  type BitcoinShareSubmission,
} from '@mining/mining-core';
import { GatewayJobRouter } from './gateway-job-router.js';
import { MultiUpstreamPoolManager } from './pool-manager.js';
import { BoundedShareQueue, ShareQueueFullError } from './share-queue.js';
import { UpstreamStratumSimulator } from './simulator.js';
import type { UpstreamPoolDefinition } from './types.js';
import { VariableDifficultyController } from './vardiff.js';

function pool(id: string, port: number, priority: number, extranonce1: string): UpstreamPoolDefinition {
  return {
    id,
    name: id,
    priority,
    weight: 100,
    enabled: true,
    failureThreshold: 1,
    recoveryTimeoutMs: 60_000,
    endpoint: {
      host: '127.0.0.1',
      port,
      userAgent: 'MiningPlatform-resilience-test/0.3.0',
      username: 'upstream.account',
      password: 'x',
      connectTimeoutMs: 500,
      responseTimeoutMs: 2_000,
      maximumLineBytes: 65_536,
    },
  };
}

function findShare(job: BitcoinMiningJob): BitcoinShareSubmission {
  for (let nonce = 0; nonce < 2_000_000; nonce += 1) {
    const submission: BitcoinShareSubmission = {
      workerName: 'upstream.account',
      jobId: job.id,
      extranonce2: '00000001',
      networkTime: job.networkTime,
      nonce: nonce.toString(16).padStart(8, '0'),
      submittedAt: new Date(),
    };
    if (calculateHeaderHash(job, submission).numericValue <= DIFFICULTY_ONE_TARGET * 1_000_000n) return submission;
  }
  throw new Error('Could not find low-difficulty share');
}

async function waitUntil(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for condition');
}

test('gateway job router produces provider-scoped ids and invalidates old clean jobs', () => {
  const now = new Date('2026-07-31T10:00:00.000Z');
  const router = new GatewayJobRouter({ now: () => now, maximumEntries: 32 });
  const base: BitcoinMiningJob = {
    id: 'same-job',
    previousBlockHash: '00'.repeat(32),
    coinbase1: '00',
    coinbase2: '00',
    merkleBranches: [],
    version: '20000000',
    networkBits: '1d00ffff',
    networkTime: '00000000',
    cleanJobs: true,
    assignedDifficulty: '1',
    extranonce1: '00000000',
    extranonce2Size: 4,
    receivedAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
  };
  const primary = router.route('primary-pool', base);
  const backup = router.route('backup-pool', { ...base, cleanJobs: false });
  assert.notEqual(primary.downstreamJob.id, backup.downstreamJob.id);
  assert.equal(primary.status, 'ACTIVE');
  const cleanReplacement = router.route('backup-pool', { ...base, id: 'next-job', cleanJobs: true });
  assert.equal(primary.status, 'SUPERSEDED');
  assert.equal(backup.status, 'SUPERSEDED');
  assert.equal(router.resolve(cleanReplacement.downstreamJob.id)?.poolId, 'backup-pool');
});

test('bounded share queue rejects work beyond capacity', async () => {
  const queue = new BoundedShareQueue(1, 1, 1_000);
  let release!: () => void;
  const first = queue.enqueue(async () => new Promise<string>((resolve) => { release = () => resolve('done'); }));
  await assert.rejects(() => queue.enqueue(async () => 'overflow'), ShareQueueFullError);
  release();
  assert.equal(await first, 'done');
  queue.close();
});

test('VarDiff never drops below the active upstream difficulty floor', () => {
  const vardiff = new VariableDifficultyController('4', {
    targetShareIntervalSeconds: 15,
    retargetIntervalSeconds: 10,
    minimumDifficulty: 1,
    maximumDifficulty: 10_000,
    maximumAdjustmentFactor: 4,
    minimumSamples: 4,
  });
  vardiff.setUpstreamFloor('8');
  assert.equal(vardiff.currentDifficulty, '8');
  const base = 1_000_000;
  vardiff.recordAcceptedShare(base);
  vardiff.recordAcceptedShare(base + 1_000);
  vardiff.recordAcceptedShare(base + 2_000);
  const retarget = vardiff.recordAcceptedShare(base + 12_000);
  assert.ok(retarget);
  assert.ok(Number(retarget.nextDifficulty) >= 8);
});

test('multi-upstream manager keeps the session alive and fails over to backup', async () => {
  const primary = new UpstreamStratumSimulator({ extranonce1: '11111111' });
  const backup = new UpstreamStratumSimulator({ extranonce1: '22222222' });
  await primary.listen();
  await backup.listen();
  const activePools: string[] = [];
  const jobs: BitcoinMiningJob[] = [];
  const manager = new MultiUpstreamPoolManager(
    {
      pools: [pool('primary', primary.port, 10, '11111111'), pool('backup', backup.port, 20, '22222222')],
      maximumRecoveryCycles: 3,
      reconnectBaseMs: 10,
      reconnectMaximumMs: 20,
      reconnectJitterRatio: 0,
      connectionAttemptsPerPool: 1,
      shareQueueCapacity: 8,
      shareQueueTimeoutMs: 2_000,
      random: () => 0.5,
    },
    {
      onActivePool: (poolId) => activePools.push(poolId),
      onJob: (job) => jobs.push(job),
    },
  );
  try {
    const subscription = await manager.start();
    assert.equal(subscription.extranonce1, '11111111');
    await waitUntil(() => jobs.length >= 1);
    assert.equal(manager.activePool, 'primary');

    await primary.close();
    await waitUntil(() => manager.activePool === 'backup' && manager.currentState === 'ACTIVE');
    await waitUntil(() => jobs.some((job) => job.extranonce1 === '22222222'));
    assert.deepEqual(activePools.slice(0, 2), ['primary', 'backup']);

    const backupJob = [...jobs].reverse().find((job) => job.extranonce1 === '22222222');
    assert.ok(backupJob);
    const result = await manager.submit(findShare(backupJob));
    assert.equal(result.accepted, true);
    assert.equal(backup.submissions.length, 1);
    assert.equal(manager.health().find((entry) => entry.poolId === 'primary')?.state, 'CIRCUIT_OPEN');
  } finally {
    manager.close();
    if (primary.port !== 0) await primary.close().catch(() => undefined);
    await backup.close();
  }
});
