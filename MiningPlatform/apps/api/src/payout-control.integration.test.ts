/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '@mining/database';
import {
  encryptSecret,
  generateOpaqueToken,
  generateTotpSecret,
  hashOpaqueToken,
  hashPassword,
  totpCode,
} from '@mining/security';
import type { AuthPrincipal } from './modules/auth/auth.decorators.js';
import { StepUpService } from './modules/auth/step-up.service.js';
import { PayoutsService } from './modules/payouts/payouts.service.js';

process.env.AUTH_JWT_SECRET = 'payout-control-test-jwt-secret-at-least-32-bytes';
process.env.AUTH_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64url');
process.env.PAYOUTS_ENABLED = 'false';

async function directStepUpToken(
  userId: string,
  sessionId: string,
  expiresAt = new Date(Date.now() + 300_000),
): Promise<string> {
  const token = generateOpaqueToken('mpsu', 32);
  await prisma.stepUpAuthorization.create({
    data: {
      userId,
      sessionId,
      scope: 'PAYOUT_ADDRESS_WRITE',
      tokenHash: hashOpaqueToken(token),
      expiresAt,
    },
  });
  return token;
}

test('payout address changes require replay-safe step-up, checksum validation, cooldown, and one active route address', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 20);
  const password = `MiningPlatform-${suffix}-Password`;
  const totpSecret = generateTotpSecret();
  const user = await prisma.user.create({
    data: {
      email: `payout-${suffix}@example.test`,
      passwordHash: await hashPassword(password),
      displayName: 'Payout Control Test',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.userSecurity.create({
    data: {
      userId: user.id,
      totpEnabled: true,
      totpSecretEncrypted: encryptSecret(totpSecret, process.env.AUTH_ENCRYPTION_KEY!),
      recoveryCodesHash: [],
    },
  });
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashOpaqueToken(`refresh-${suffix}`),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const principal: AuthPrincipal = {
    userId: user.id,
    email: user.email,
    role: 'USER',
    sessionId: session.id,
    authenticationType: 'access-token',
    scopes: ['*'],
  };

  const btc = await prisma.asset.findUniqueOrThrow({ where: { symbol: 'BTC' } });
  const network = await prisma.assetNetwork.create({
    data: {
      assetId: btc.id,
      networkKey: `bitcoin-mainnet-test-${suffix}`,
      displayName: 'Bitcoin Mainnet Integration Test',
      chainFamily: 'BITCOIN',
      addressValidator: 'BITCOIN',
      enabled: true,
    },
  });
  const route = await prisma.payoutRoute.create({
    data: {
      assetNetworkId: network.id,
      routeKey: `integration-${suffix}`,
      version: 1,
      status: 'ADDRESS_REGISTRATION',
      minimumPayoutAtomic: 1n,
      fixedNetworkFeeAtomic: 0n,
      addressCooldownSeconds: 0,
      requiredConfirmations: 3,
      manualApprovalRequired: true,
      effectiveFrom: new Date(Date.now() - 60_000),
      changeReason: 'Disposable payout-control integration fixture.',
    },
  });
  const feePolicy = await prisma.miningFeePolicy.findFirstOrThrow({
    where: { policyKey: 'platform-default', version: 1 },
  });
  await prisma.miningAccount.create({
    data: {
      userId: user.id,
      assetId: btc.id,
      feePolicyId: feePolicy.id,
      username: `payout_${suffix}`,
      platformFeePercent: '0.5',
      autoWithdrawalEnabled: true,
    },
  });

  const stepUpService = new StepUpService();
  const payouts = new PayoutsService(stepUpService);
  const issued = await stepUpService.issue(principal, {
    scope: 'PAYOUT_ADDRESS_WRITE',
    password,
    code: totpCode(totpSecret),
  });
  const persistedIssued = await prisma.stepUpAuthorization.findUniqueOrThrow({
    where: { id: issued.authorizationId },
  });
  assert.notEqual(persistedIssued.tokenHash, issued.token);
  assert.equal(persistedIssued.tokenHash, hashOpaqueToken(issued.token));

  const first = await payouts.registerAddress(
    principal,
    {
      payoutRouteId: route.id,
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      label: 'Primary integration address',
    },
    issued.token,
  );
  assert.equal(first.status, 'COOLDOWN');
  assert.equal(first.verified, true);
  assert.equal(first.active, false);
  assert.equal('address' in first, false);
  assert.equal(
    (await prisma.stepUpAuthorization.findUniqueOrThrow({ where: { id: issued.authorizationId } }))
      .consumedAt !== null,
    true,
  );

  await assert.rejects(
    payouts.registerAddress(
      principal,
      { payoutRouteId: route.id, address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy' },
      issued.token,
    ),
    /consumed step-up token/,
  );

  const [databaseClock] = await prisma.$queryRaw<Array<{ now: Date }>>`
    SELECT CURRENT_TIMESTAMP AS "now"
  `;
  assert.ok(databaseClock);
  const expiredToken = await directStepUpToken(
    user.id,
    session.id,
    new Date(databaseClock.now.getTime() - 60_000),
  );
  const NativeDate = Date;
  const skewedEpoch = databaseClock.now.getTime() - 3_600_000;
  globalThis.Date = new Proxy(NativeDate, {
    construct(target, argumentsList, newTarget) {
      return Reflect.construct(
        target,
        argumentsList.length === 0 ? [skewedEpoch] : argumentsList,
        newTarget,
      );
    },
  });
  try {
    await assert.rejects(
      prisma.$transaction((tx) =>
        stepUpService.consume(tx, principal, 'PAYOUT_ADDRESS_WRITE', expiredToken),
      ),
      /expired.*step-up token/,
    );
  } finally {
    globalThis.Date = NativeDate;
  }

  await assert.rejects(
    stepUpService.issue(principal, {
      scope: 'PAYOUT_ADDRESS_WRITE',
      password,
      code: totpCode(totpSecret),
    }),
    /already used for authentication/,
  );

  const concurrentTotpSecret = generateTotpSecret();
  const concurrentUser = await prisma.user.create({
    data: {
      email: `payout-concurrent-${suffix}@example.test`,
      passwordHash: await hashPassword(password),
      displayName: 'Concurrent Step-up Test',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.userSecurity.create({
    data: {
      userId: concurrentUser.id,
      totpEnabled: true,
      totpSecretEncrypted: encryptSecret(concurrentTotpSecret, process.env.AUTH_ENCRYPTION_KEY!),
      recoveryCodesHash: [],
    },
  });
  const concurrentSession = await prisma.authSession.create({
    data: {
      userId: concurrentUser.id,
      refreshTokenHash: hashOpaqueToken(`refresh-concurrent-${suffix}`),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const concurrentPrincipal: AuthPrincipal = {
    ...principal,
    userId: concurrentUser.id,
    email: concurrentUser.email,
    sessionId: concurrentSession.id,
  };
  const concurrentCode = totpCode(concurrentTotpSecret);
  const concurrentResults = await Promise.allSettled([
    stepUpService.issue(concurrentPrincipal, {
      scope: 'PAYOUT_ADDRESS_WRITE',
      password,
      code: concurrentCode,
    }),
    stepUpService.issue(concurrentPrincipal, {
      scope: 'PAYOUT_ADDRESS_WRITE',
      password,
      code: concurrentCode,
    }),
  ]);
  assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrentResults.filter((result) => result.status === 'rejected').length, 1);
  assert.match(
    String(concurrentResults.find((result) => result.status === 'rejected')?.reason),
    /already used for authentication/,
  );

  const firstActivationToken = await directStepUpToken(user.id, session.id);
  const firstActive = await payouts.activateAddress(principal, first.id, firstActivationToken);
  assert.equal(firstActive.status, 'ACTIVE');
  assert.equal(firstActive.active, true);
  assert.equal(firstActive.payoutCapable, false);

  const secondRegistrationToken = await directStepUpToken(user.id, session.id);
  const second = await payouts.registerAddress(
    principal,
    { payoutRouteId: route.id, address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy' },
    secondRegistrationToken,
  );
  const secondActivationToken = await directStepUpToken(user.id, session.id);
  const secondActive = await payouts.activateAddress(principal, second.id, secondActivationToken);
  assert.equal(secondActive.status, 'ACTIVE');
  const replacedFirst = await prisma.payoutAddress.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(replacedFirst.status, 'DISABLED');
  assert.equal(replacedFirst.active, false);
  assert.equal(
    await prisma.payoutAddress.count({
      where: { userId: user.id, payoutRouteId: route.id, status: 'ACTIVE', active: true },
    }),
    1,
  );

  const preferences = await payouts.preferences(user.id);
  assert.equal(preferences[0]?.effective, false);
  assert.ok(preferences[0]?.blockers.includes('GLOBAL_PAYOUT_GATE_DISABLED'));
  assert.ok(preferences[0]?.blockers.includes('PAYOUT_ROUTE_NOT_ACTIVE'));

  await assert.rejects(
    prisma.payoutAddress.update({
      where: { id: second.id },
      data: { address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT' },
    }),
    /identity and verification evidence are immutable/,
  );
  await assert.rejects(
    prisma.payout.create({
      data: {
        idempotencyKey: `payout-mismatch-${suffix}`,
        userId: user.id,
        assetId: btc.id,
        payoutAddressId: first.id,
        payoutRouteId: route.id,
        amount: '0.00000001',
        scheduledAt: new Date(),
      },
    }),
    /active verified address/,
  );
  await assert.rejects(
    prisma.payout.create({
      data: {
        idempotencyKey: `payout-route-gated-${suffix}`,
        userId: user.id,
        assetId: btc.id,
        payoutAddressId: second.id,
        payoutRouteId: route.id,
        amount: '0.00000001',
        scheduledAt: new Date(),
      },
    }),
    /route is not enabled for controlled funds/,
  );

  const disableToken = await directStepUpToken(user.id, session.id);
  const disabled = await payouts.disableAddress(principal, second.id, disableToken);
  assert.equal(disabled.status, 'DISABLED');
  assert.equal(disabled.active, false);
  assert.equal(await prisma.payout.count({ where: { userId: user.id } }), 0);

  await assert.rejects(
    prisma.stepUpAuthorization.update({
      where: { id: issued.authorizationId },
      data: { expiresAt: new Date(Date.now() + 600_000) },
    }),
    /identity is immutable/,
  );
  const auditActions = await prisma.auditLog.findMany({
    where: { actorUserId: user.id, resourceType: { in: ['StepUpAuthorization', 'PayoutAddress'] } },
    select: { action: true },
  });
  for (const action of [
    'STEP_UP_AUTHORIZATION_ISSUED',
    'PAYOUT_ADDRESS_REGISTERED',
    'PAYOUT_ADDRESS_ACTIVATED',
    'PAYOUT_ADDRESS_DISABLED',
  ]) {
    assert.ok(
      auditActions.some((entry) => entry.action === action),
      `missing audit action ${action}`,
    );
  }
});
