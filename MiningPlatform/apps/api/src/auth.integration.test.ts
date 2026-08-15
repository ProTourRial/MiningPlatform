/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '@mining/database';
import { hashOpaqueToken } from '@mining/security';
import { AuthService } from './modules/auth/auth.service.js';

async function ensureBitcoinAsset(): Promise<void> {
  await prisma.asset.upsert({
    where: { symbol: 'BTC' },
    update: { enabled: true },
    create: {
      symbol: 'BTC',
      name: 'Bitcoin',
      algorithm: 'SHA256',
      decimals: 8,
      enabled: true,
      minimumPayout: '0.001',
      requiredConfirmations: 3,
    },
  });
}

test('registration, verification, login, refresh rotation, and replay family revocation use PostgreSQL', async () => {
  await ensureBitcoinAsset();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  const email = `auth-${suffix}@example.test`;
  const miningUsername = `auth_${suffix}`;
  const password = `MiningPlatform-${suffix}-Password`;
  const service = new AuthService();
  const fingerprint = { ipHash: `ip-${suffix}`, userAgentHash: `ua-${suffix}` };

  const registration = (await service.register(
    {
      email,
      displayName: 'Integration Test',
      password,
      miningUsername,
    },
    fingerprint,
  )) as { verificationToken?: string; user: { id: string } };
  assert.ok(
    registration.verificationToken,
    'CI must expose the verification token only in the test environment',
  );

  const miningAccount = await prisma.miningAccount.findUniqueOrThrow({
    where: { username: miningUsername },
    select: {
      platformFeePercent: true,
      feePolicy: { select: { policyKey: true, version: true, feeBasisPoints: true } },
    },
  });
  assert.equal(miningAccount.platformFeePercent.toString(), '0.5');
  assert.deepEqual(miningAccount.feePolicy, {
    policyKey: 'platform-default',
    version: 1,
    feeBasisPoints: 50,
  });

  await service.verifyEmail(registration.verificationToken);
  const firstSession = await service.login({ email, password }, fingerprint);
  const rotated = await service.refresh(firstSession.refreshToken, fingerprint);
  assert.notEqual(rotated.refreshToken, firstSession.refreshToken);

  const oldToken = await prisma.authRefreshToken.findUniqueOrThrow({
    where: { tokenHash: hashOpaqueToken(firstSession.refreshToken) },
  });
  assert.equal(oldToken.status, 'ROTATED');

  const parallelSession = await service.login({ email, password }, fingerprint);
  const parallel = await Promise.allSettled([
    service.refresh(parallelSession.refreshToken, fingerprint),
    service.refresh(parallelSession.refreshToken, fingerprint),
  ]);
  assert.equal(parallel.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(parallel.filter((result) => result.status === 'rejected').length, 1);

  const replayed = await prisma.authRefreshToken.findUniqueOrThrow({
    where: { tokenHash: hashOpaqueToken(parallelSession.refreshToken) },
  });
  assert.equal(replayed.status, 'REUSED');
  const familySessions = await prisma.authSession.findMany({
    where: { tokenFamilyId: replayed.familyId },
  });
  assert.ok(familySessions.length > 0);
  assert.ok(familySessions.every((session) => session.revokedAt !== null));
  const familyTokens = await prisma.authRefreshToken.findMany({
    where: { familyId: replayed.familyId },
  });
  assert.ok(familyTokens.every((token) => token.status !== 'ACTIVE'));

  const successfulParallelRefresh = parallel.find(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<AuthService['refresh']>>> =>
      result.status === 'fulfilled',
  );
  assert.ok(successfulParallelRefresh);
  await assert.rejects(() =>
    service.refresh(successfulParallelRefresh.value.refreshToken, fingerprint),
  );
});
