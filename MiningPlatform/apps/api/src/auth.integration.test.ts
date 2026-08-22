/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '@mining/database';
import { hashOpaqueToken, totpCode } from '@mining/security';
import type { AuthPrincipal } from './modules/auth/auth.decorators.js';
import { AuthService } from './modules/auth/auth.service.js';
import { StepUpService } from './modules/auth/step-up.service.js';
import { PayoutsService } from './modules/payouts/payouts.service.js';

process.env.AUTH_JWT_SECRET = 'integration-test-only-jwt-secret-at-least-32-bytes';
process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');
process.env.AUTH_EXPOSE_TEST_TOKENS = 'true';

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
      id: true,
      autoWithdrawalEnabled: true,
      platformFeePercent: true,
      feePolicy: {
        select: {
          policyKey: true,
          version: true,
          feeBasisPoints: true,
          feePartsPerMillion: true,
        },
      },
    },
  });
  assert.equal(miningAccount.platformFeePercent.toString(), '0.5');
  assert.equal(miningAccount.autoWithdrawalEnabled, false);
  assert.equal(miningAccount.feePolicy.policyKey, 'platform-default');
  assert.equal(miningAccount.feePolicy.version, 1);
  assert.equal(miningAccount.feePolicy.feeBasisPoints.toString(), '50');
  assert.equal(miningAccount.feePolicy.feePartsPerMillion, 5000);
  const personalReferralCode = await prisma.referralCode.findFirstOrThrow({
    where: { ownerUserId: registration.user.id, active: true },
    include: { program: true },
  });
  assert.match(personalReferralCode.code, /^MP[A-F0-9]{16}$/);
  assert.equal(personalReferralCode.program.minerFeePartsPerMillion, 3750);
  assert.equal(personalReferralCode.program.commissionPartsPerMillion, 1250);

  const payouts = new PayoutsService(new StepUpService());
  const preferencePrincipal: AuthPrincipal = {
    userId: registration.user.id,
    email,
    role: 'USER',
    sessionId: `preference-${suffix}`,
    authenticationType: 'access-token',
    scopes: ['*'],
  };
  const enabledPreference = await payouts.updatePreference(
    preferencePrincipal,
    miningAccount.id,
    true,
  );
  assert.equal(enabledPreference.autoWithdrawalEnabled, true);
  assert.equal(enabledPreference.effective, false);
  assert.ok(enabledPreference.blockers.includes('GLOBAL_PAYOUT_GATE_DISABLED'));
  assert.ok(enabledPreference.blockers.includes('NO_ACTIVE_VERIFIED_PAYOUT_ADDRESS'));
  const disabledPreference = await payouts.updatePreference(
    preferencePrincipal,
    miningAccount.id,
    false,
  );
  assert.equal(disabledPreference.autoWithdrawalEnabled, false);
  await assert.rejects(
    payouts.updatePreference(
      { ...preferencePrincipal, authenticationType: 'api-key', scopes: ['profile:read'] },
      miningAccount.id,
      true,
    ),
    /interactive user session/,
  );

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

  const enrollmentSession = await service.login({ email, password }, fingerprint);
  const enrollmentSessionRecord = await prisma.authSession.findFirstOrThrow({
    where: {
      userId: registration.user.id,
      refreshTokenHash: hashOpaqueToken(enrollmentSession.refreshToken),
    },
  });
  const enrollmentPrincipal: AuthPrincipal = {
    userId: registration.user.id,
    email,
    role: 'USER',
    sessionId: enrollmentSessionRecord.id,
    authenticationType: 'access-token',
    scopes: ['*'],
  };
  const enrollmentApiKeyPrincipal: AuthPrincipal = {
    ...enrollmentPrincipal,
    authenticationType: 'api-key',
    scopes: ['profile:read'],
  };
  await assert.rejects(
    service.beginTotpSetup(enrollmentApiKeyPrincipal),
    /interactive user session/,
  );
  const setup = await service.beginTotpSetup(enrollmentPrincipal);
  await assert.rejects(
    service.enableTotp(enrollmentApiKeyPrincipal, totpCode(setup.secret)),
    /interactive user session/,
  );
  await service.enableTotp(enrollmentPrincipal, totpCode(setup.secret));
  await assert.rejects(
    service.disableTotp(enrollmentApiKeyPrincipal, { password, code: '000000' }),
    /interactive user session/,
  );
  await assert.rejects(
    service.beginTotpSetup(enrollmentPrincipal),
    /already enabled; disable it before re-enrollment/,
  );
  const protectedFactor = await prisma.userSecurity.findUniqueOrThrow({
    where: { userId: registration.user.id },
  });
  assert.equal(protectedFactor.totpPendingSecretEncrypted, null);

  await prisma.userSecurity.update({
    where: { userId: registration.user.id },
    data: { lastTotpCounter: null },
  });
  const loginCode = totpCode(setup.secret);
  const totpSession = await service.login({ email, password, totpCode: loginCode }, fingerprint);
  const totpSessionRecord = await prisma.authSession.findFirstOrThrow({
    where: {
      userId: registration.user.id,
      refreshTokenHash: hashOpaqueToken(totpSession.refreshToken),
    },
  });
  await assert.rejects(
    new StepUpService().issue(
      { ...enrollmentPrincipal, sessionId: totpSessionRecord.id },
      { scope: 'PAYOUT_ADDRESS_WRITE', password, code: loginCode },
    ),
    /already used for authentication/,
  );
});
