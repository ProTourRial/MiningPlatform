/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@mining/database';
import { randomXShareFingerprint, type RandomXAccountingProjectionInput } from '@mining/randomx';
import { RandomXAccountingEvidenceRepository } from './randomx-accounting-evidence.js';

const assetId = 'randomx-runtime-test-asset';
const userId = 'randomx-runtime-test-user';
const miningAccountId = 'randomx-runtime-test-account';
const upstreamPoolId = 'randomx-runtime-test-pool';

async function ensureFixture(): Promise<void> {
  await prisma.asset.upsert({
    where: { symbol: 'XMR-RUNTIME-TEST' },
    update: {},
    create: {
      id: assetId,
      symbol: 'XMR-RUNTIME-TEST',
      name: 'RandomX runtime repository fixture',
      algorithm: 'RANDOMX',
      decimals: 12,
      enabled: false,
      minimumPayout: '0.01',
      requiredConfirmations: 10,
    },
  });
  await prisma.user.upsert({
    where: { email: 'randomx-runtime@local.invalid' },
    update: {},
    create: {
      id: userId,
      email: 'randomx-runtime@local.invalid',
      passwordHash: 'RANDOMX_RUNTIME_TEST_ONLY',
      displayName: 'RandomX Runtime Test',
      role: 'USER',
      status: 'ACTIVE',
      accountType: 'INDIVIDUAL',
      emailVerifiedAt: new Date('2026-08-25T00:00:00.000Z'),
    },
  });
  await prisma.miningAccount.upsert({
    where: { username: 'randomx_runtime_test' },
    update: {},
    create: {
      id: miningAccountId,
      userId,
      assetId,
      feePolicyId: 'fee-policy-platform-default-v1',
      username: 'randomx_runtime_test',
      rewardMethod: 'FOLLOW_UPSTREAM',
      platformFeePercent: '0.5',
    },
  });
  await prisma.upstreamPool.upsert({
    where: { assetId_poolKey: { assetId, poolKey: 'randomx-runtime-test' } },
    update: {},
    create: {
      id: upstreamPoolId,
      assetId,
      poolKey: 'randomx-runtime-test',
      name: 'RandomX Runtime Test Pool',
      host: '127.0.0.1',
      port: 3333,
      tls: false,
      rewardMethod: 'FOLLOW_UPSTREAM',
      status: 'SETUP',
    },
  });
}

function acceptedInput(runId: string): RandomXAccountingProjectionInput {
  const result = `${'00'.repeat(24)}0100000000000000`;
  const job = {
    id: `randomx-runtime-job-${runId}`,
    clientId: 'randomx-runtime-client',
    algorithm: 'rx/0' as const,
    blob: '00'.repeat(76),
    target: '0200000000000000',
    seedHash: '11'.repeat(32),
    height: 123n,
    receivedAt: new Date('2026-08-25T01:00:00.000Z'),
    expiresAt: new Date('2026-08-25T01:02:00.000Z'),
  };
  const submission = {
    workerName: 'randomx_runtime_test.worker',
    jobId: job.id,
    nonce: '78563412',
    result,
    submittedAt: new Date('2026-08-25T01:01:00.000Z'),
  };
  return {
    miningAccountId,
    assetId,
    correlationId: `randomx-runtime-correlation-${runId}`,
    acceptedDifficulty: '1000.5',
    job,
    submission,
    validation: {
      accepted: true,
      reason: 'ACCEPTED',
      fingerprint: randomXShareFingerprint(job, submission),
      hash: result,
      target: 2n,
    },
    upstream: {
      accepted: true,
      upstreamPoolId,
      upstreamSessionId: 'randomx-runtime-session',
      decidedAt: new Date('2026-08-25T01:01:01.000Z'),
      sourceDigest: '33'.repeat(32),
    },
  };
}

test('persists accepted RandomX evidence once and fails closed on conflicting reuse', async () => {
  await ensureFixture();
  const repository = new RandomXAccountingEvidenceRepository();
  const input = acceptedInput(`${process.pid}-${Date.now()}`);
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () => repository.recordAcceptedShare(input)),
  );
  assert.equal(new Set(concurrent.map((record) => record.id)).size, 1);
  assert.equal(
    await prisma.randomXAcceptedShareEvidence.count({
      where: { sourceDigest: concurrent[0]?.sourceDigest },
    }),
    1,
  );

  await assert.rejects(
    repository.recordAcceptedShare({ ...input, acceptedDifficulty: '1001' }),
    /share fingerprint is already bound to different evidence/,
  );
  await assert.rejects(
    repository.recordAcceptedShare({
      ...input,
      validation: { ...input.validation, accepted: false },
    }),
    /requires accepted local validation/,
  );
});
