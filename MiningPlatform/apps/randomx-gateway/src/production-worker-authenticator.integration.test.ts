/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '@mining/database';
import { generateWorkerCredential } from '@mining/security';
import { RandomXProductionWorkerAuthenticator } from './production-worker-authenticator.js';

test('authenticates a real PostgreSQL worker credential through the distributed Redis limiter', async () => {
  const redisUrl = process.env.REDIS_INTEGRATION_URL;
  assert.ok(redisUrl, 'REDIS_INTEGRATION_URL is required');
  const suffix = randomUUID();
  const assetId = `randomx-auth-asset-${suffix}`;
  const userId = `randomx-auth-user-${suffix}`;
  const miningAccountId = `randomx-auth-account-${suffix}`;
  const workerId = `randomx-auth-worker-${suffix}`;
  const username = `randomx_auth_${suffix.replaceAll('-', '')}`;
  const credential = await generateWorkerCredential();
  const feePolicy = await prisma.miningFeePolicy.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  assert.ok(feePolicy, 'an active fee policy is required by the migration baseline');

  await prisma.asset.create({
    data: {
      id: assetId,
      symbol: `RXAUTH${suffix.slice(0, 8).toUpperCase()}`,
      name: 'RandomX production authentication integration fixture',
      algorithm: 'rx/0',
      decimals: 12,
      enabled: true,
      minimumPayout: '0.01',
      requiredConfirmations: 10,
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      email: `randomx-auth-${suffix}@local.invalid`,
      passwordHash: 'RANDOMX_AUTHENTICATION_TEST_ONLY',
      displayName: 'RandomX Authentication Test',
      role: 'USER',
      status: 'ACTIVE',
      accountType: 'INDIVIDUAL',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.miningAccount.create({
    data: {
      id: miningAccountId,
      userId,
      assetId,
      feePolicyId: feePolicy.id,
      username,
      rewardMethod: 'FOLLOW_UPSTREAM',
      platformFeePercent: '0.5',
    },
  });
  await prisma.worker.create({
    data: {
      id: workerId,
      userId,
      miningAccountId,
      name: 'cpu-1',
      passwordHash: 'WORKER_CREDENTIAL_V1',
      status: 'OFFLINE',
      credentials: {
        create: {
          credentialId: credential.credentialId,
          secretHash: credential.secretHash,
        },
      },
    },
  });

  const authenticator = await RandomXProductionWorkerAuthenticator.create({
    redisUrl,
    ipHashKey: 'randomx-auth-integration-hash-key-at-least-32-bytes',
    workerAuthMaximumFailures: 5,
    workerAuthWindowMs: 60_000,
    workerAuthLockMs: 900_000,
  });
  const connectionId = `randomx-auth-connection-${suffix}`;
  const remoteIpHash = 'remote-ip-hash-integration';
  try {
    const rejected = await authenticator.authenticate(`${username}.cpu-1`, 'wrong-secret', {
      connectionId,
      remoteIpHash,
      agent: 'xmrig/integration-test',
    });
    assert.deepEqual(rejected, { authenticated: false, code: 'INVALID_CREDENTIALS' });

    const accepted = await authenticator.authenticate(`${username}.cpu-1`, credential.secret, {
      connectionId,
      remoteIpHash,
      agent: 'xmrig/integration-test',
    });
    assert.deepEqual(accepted, {
      authenticated: true,
      worker: {
        workerId,
        workerName: `${username}.cpu-1`,
        miningAccountId,
      },
    });

    const persistedCredential = await prisma.workerCredential.findUniqueOrThrow({
      where: { credentialId: credential.credentialId },
      select: { failedAttempts: true, lockedUntil: true, lastUsedAt: true, lastIpHash: true },
    });
    assert.equal(persistedCredential.failedAttempts, 0);
    assert.equal(persistedCredential.lockedUntil, null);
    assert.ok(persistedCredential.lastUsedAt);
    assert.equal(persistedCredential.lastIpHash, remoteIpHash);

    const audits = await prisma.auditLog.findMany({
      where: { resourceId: workerId },
      orderBy: { occurredAt: 'asc' },
      select: { action: true, userAgentHash: true, metadata: true },
    });
    assert.deepEqual(
      audits.map((audit) => audit.action),
      ['WORKER_AUTHENTICATION_FAILED', 'WORKER_AUTHENTICATION_SUCCEEDED'],
    );
    assert.match(audits[1]?.userAgentHash ?? '', /^[0-9a-f]{64}$/);
    assert.notEqual(audits[1]?.userAgentHash, 'xmrig/integration-test');
    assert.equal((audits[1]?.metadata as { sessionId?: string } | null)?.sessionId, connectionId);
  } finally {
    await authenticator.close();
  }
});
