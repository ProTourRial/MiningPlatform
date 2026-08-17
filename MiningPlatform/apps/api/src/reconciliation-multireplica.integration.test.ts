/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '@mining/database';
import type { AuthPrincipal } from './modules/auth/auth.decorators.js';
import { ReconciliationService } from './modules/reconciliation/reconciliation.service.js';

function principal(userId: string, email: string): AuthPrincipal {
  return {
    userId,
    email,
    role: 'ADMIN',
    sessionId: randomUUID(),
    authenticationType: 'access-token',
    scopes: ['*'],
  };
}

test('multiple API replicas commit one reconciliation transition per idempotent request', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const users = await Promise.all(
    ['maker', 'checker-a', 'checker-b', 'executor'].map((name) =>
      prisma.user.create({
        data: {
          email: `${name}-${suffix}@example.test`,
          passwordHash: `integration-only-${suffix}`,
          displayName: name,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          security: { create: { totpEnabled: true, recoveryCodesHash: [] } },
        },
      }),
    ),
  );
  const principals = users.map((user) => principal(user.id, user.email));
  const maker = principals[0]!;
  const checkerA = principals[1]!;
  const checkerB = principals[2]!;
  const executor = principals[3]!;
  const asset = await prisma.asset.create({
    data: {
      symbol: `T${suffix.slice(0, 7).toUpperCase()}`,
      name: `Reconciliation Test ${suffix}`,
      algorithm: 'SHA256',
      decimals: 8,
      enabled: true,
      minimumPayout: '0.001',
      requiredConfirmations: 3,
    },
  });
  const upstreamPool = await prisma.upstreamPool.create({
    data: {
      assetId: asset.id,
      poolKey: `reconciliation-${suffix}`,
      name: `Reconciliation ${suffix}`,
      host: '127.0.0.1',
      port: 3333,
      rewardMethod: 'FOLLOW_UPSTREAM',
    },
  });
  const periodStart = new Date(Date.now() - 120_000);
  const periodEnd = new Date(Date.now() - 60_000);
  const rewardPeriod = await prisma.rewardPeriod.create({
    data: {
      assetId: asset.id,
      upstreamPoolId: upstreamPool.id,
      method: 'FOLLOW_UPSTREAM',
      periodStart,
      periodEnd,
      grossReward: '1.0',
      upstreamFee: '0.01',
      distributableReward: '0.99',
    },
  });
  const reconciliation = await prisma.upstreamReconciliation.create({
    data: {
      assetId: asset.id,
      upstreamPoolId: upstreamPool.id,
      rewardPeriodId: rewardPeriod.id,
      upstreamGrossReward: '1.0',
      upstreamFee: '0.01',
      receivedAmount: '0.98',
      internalExpectedAmount: '0.99',
      varianceAmount: '-0.01',
      status: 'PENDING',
      sourceReference: `provider-${suffix}`,
    },
  });

  const replicas = [
    new ReconciliationService(),
    new ReconciliationService(),
    new ReconciliationService(),
  ];
  const openResults = await Promise.all(
    replicas.map((service, index) =>
      service.open(
        maker,
        reconciliation.id,
        {
          category: 'AMOUNT_VARIANCE',
          severity: 'HIGH',
          summary: 'Provider settlement differs from the internal expectation',
          proposedResolution:
            'Request provider evidence and retain the ledger value until approved',
        },
        `open-${suffix}`,
        `open-${suffix}-${index}`,
      ),
    ),
  );
  assert.equal(openResults.filter((result) => !result.replayed).length, 1);
  assert.equal(openResults.filter((result) => result.replayed).length, 2);
  const exceptionId = openResults[0]!.exception.id;
  assert.ok(openResults.every((result) => result.exception.id === exceptionId));

  const submitResults = await Promise.all(
    replicas.map((service, index) =>
      service.submit(
        maker,
        exceptionId,
        { expectedVersion: 1, comment: 'Evidence package is ready for independent approval' },
        `submit-${suffix}`,
        `submit-${suffix}-${index}`,
      ),
    ),
  );
  assert.equal(submitResults.filter((result) => !result.replayed).length, 1);
  assert.equal(submitResults[0]!.exception.version, 2);
  await assert.rejects(
    () =>
      replicas[0]!.submit(
        maker,
        exceptionId,
        { expectedVersion: 1, comment: 'A different payload must not reuse the completed key' },
        `submit-${suffix}`,
        `submit-conflict-${suffix}`,
      ),
    /different request/,
  );

  const competingApprovals = await Promise.allSettled([
    replicas[0]!.approve(
      checkerA,
      exceptionId,
      { expectedVersion: 2, comment: 'Provider evidence verified by checker A' },
      `approve-a-${suffix}`,
      `approve-a-${suffix}`,
    ),
    replicas[1]!.approve(
      checkerB,
      exceptionId,
      { expectedVersion: 2, comment: 'Provider evidence verified by checker B' },
      `approve-b-${suffix}`,
      `approve-b-${suffix}`,
    ),
  ]);
  assert.equal(competingApprovals.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(competingApprovals.filter((result) => result.status === 'rejected').length, 1);

  const approved = await prisma.reconciliationException.findUniqueOrThrow({
    where: { id: exceptionId },
  });
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.version, 3);
  const resolver = executor;
  await assert.rejects(
    () =>
      replicas[2]!.resolve(
        resolver,
        exceptionId,
        {
          expectedVersion: 3,
          resolutionCode: 'LEDGER_ADJUSTMENT',
          resolutionNotes:
            'An adjustment cannot proceed without a posted and referenced journal entry',
          comment: 'Negative ledger-boundary assertion',
        },
        `resolve-without-journal-${suffix}`,
        `resolve-without-journal-${suffix}`,
      ),
    /requires a posted journal entry/,
  );
  const resolved = await replicas[2]!.resolve(
    resolver,
    exceptionId,
    {
      expectedVersion: 3,
      resolutionCode: 'PROVIDER_CORRECTED',
      resolutionNotes: 'Provider corrected the settlement report; no ledger mutation was required',
      comment: 'Correction independently confirmed against the provider report',
    },
    `resolve-${suffix}`,
    `resolve-${suffix}`,
  );
  assert.equal(resolved.exception.status, 'RESOLVED');
  assert.equal(resolved.exception.version, 4);

  const actions = await prisma.reconciliationExceptionAction.findMany({ where: { exceptionId } });
  assert.equal(actions.filter((action) => action.action === 'OPENED').length, 1);
  assert.equal(actions.filter((action) => action.action === 'SUBMITTED').length, 1);
  assert.equal(actions.filter((action) => action.action === 'APPROVED').length, 1);
  assert.equal(actions.filter((action) => action.action === 'RESOLVED').length, 1);
  assert.equal(
    await prisma.outboxEvent.count({
      where: { aggregateType: 'ReconciliationException', aggregateId: exceptionId },
    }),
    4,
  );
  assert.equal(
    await prisma.idempotencyRecord.count({
      where: { resultReference: exceptionId, status: 'COMPLETED' },
    }),
    4,
  );
  const finalizedReconciliation = await prisma.upstreamReconciliation.findUniqueOrThrow({
    where: { id: reconciliation.id },
  });
  assert.equal(finalizedReconciliation.status, 'RESOLVED');
  assert.ok(finalizedReconciliation.reconciledAt);
});
