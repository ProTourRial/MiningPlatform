/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '@mining/database';
import type { DomainEvent } from '@mining/event-bus';
import { MiningEvents, type RandomXContributionAcceptedPayload } from '@mining/shared';
import { AccountingService } from './accounting-service.js';

const assetId = 'randomx-contribution-test-asset';
const userId = 'randomx-contribution-test-user';
const miningAccountId = 'randomx-contribution-test-account';
const upstreamPoolId = 'randomx-contribution-test-pool';

async function ensureFixture(): Promise<void> {
  await prisma.asset.upsert({
    where: { symbol: 'XMR-CONTRIBUTION-TEST' },
    update: { enabled: true, algorithm: 'rx/0' },
    create: {
      id: assetId,
      symbol: 'XMR-CONTRIBUTION-TEST',
      name: 'RandomX contribution fixture',
      algorithm: 'rx/0',
      decimals: 12,
      enabled: true,
      minimumPayout: '0.01',
      requiredConfirmations: 10,
    },
  });
  await prisma.user.upsert({
    where: { email: 'randomx-contribution@local.invalid' },
    update: { status: 'ACTIVE' },
    create: {
      id: userId,
      email: 'randomx-contribution@local.invalid',
      passwordHash: 'RANDOMX_CONTRIBUTION_TEST_ONLY',
      displayName: 'RandomX Contribution Test',
      role: 'USER',
      status: 'ACTIVE',
      accountType: 'INDIVIDUAL',
      emailVerifiedAt: new Date('2026-08-27T00:00:00.000Z'),
    },
  });
  await prisma.miningAccount.upsert({
    where: { username: 'randomx_contribution_test' },
    update: { enabled: true, deletedAt: null },
    create: {
      id: miningAccountId,
      userId,
      assetId,
      feePolicyId: 'fee-policy-platform-default-v1',
      username: 'randomx_contribution_test',
      rewardMethod: 'FOLLOW_UPSTREAM',
      platformFeePercent: '0.5',
    },
  });
  await prisma.upstreamPool.upsert({
    where: { assetId_poolKey: { assetId, poolKey: 'randomx-contribution-test' } },
    update: { status: 'OPERATIONAL' },
    create: {
      id: upstreamPoolId,
      assetId,
      poolKey: 'randomx-contribution-test',
      name: 'RandomX Contribution Test Pool',
      host: '127.0.0.1',
      port: 4444,
      tls: false,
      rewardMethod: 'FOLLOW_UPSTREAM',
      status: 'OPERATIONAL',
    },
  });
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

test('posts one immutable RandomX contribution from exact accepted-share evidence', async () => {
  await ensureFixture();
  const runId = `${process.pid}-${Date.now()}-${randomUUID()}`;
  const acceptedAt = new Date();
  const sourceEventId = `randomx-accepted-${runId}`;
  const correlationId = `randomx-contribution-${runId}`;
  const fingerprint = digest(`fingerprint:${runId}`);
  const sourceEvent = await prisma.outboxEvent.create({
    data: {
      eventId: sourceEventId,
      eventName: MiningEvents.randomXShareAccepted,
      eventVersion: 1,
      producer: 'randomx-mining-gateway',
      aggregateType: 'MiningAccount',
      aggregateId: miningAccountId,
      correlationId,
      idempotencyKey: `randomx-share:${fingerprint}`,
      payload: {
        miningAccountId,
        assetId,
        upstreamPoolId,
        localFingerprint: fingerprint,
        acceptedDifficulty: '1000.5',
        upstreamAccepted: true,
        upstreamDecidedAt: acceptedAt.toISOString(),
        upstreamDecisionDigest: digest(`decision:${runId}`),
      },
      occurredAt: acceptedAt,
    },
  });
  const evidence = await prisma.randomXAcceptedShareEvidence.create({
    data: {
      evidenceVersion: 1,
      sourceDigest: digest(`source:${runId}`),
      shareFingerprint: fingerprint,
      algorithm: 'rx/0',
      miningAccountId,
      assetId,
      upstreamPoolId,
      upstreamSessionId: `session-${runId}`,
      upstreamJobId: `job-${runId}`,
      upstreamClientId: `client-${runId}`,
      workerName: 'randomx_contribution_test.cpu-1',
      seedHash: digest(`seed:${runId}`),
      targetHex: '0200000000000000',
      target: '2',
      nonce: '78563412',
      submittedResult: digest(`result:${runId}`),
      computedResult: digest(`result:${runId}`),
      acceptedDifficulty: '1000.5',
      jobReceivedAt: new Date(acceptedAt.getTime() - 60_000),
      jobExpiresAt: new Date(acceptedAt.getTime() + 60_000),
      submittedAt: new Date(acceptedAt.getTime() - 1_000),
      acceptedAt,
      correlationId,
      validationDigest: digest(`validation:${runId}`),
      upstreamDecisionDigest: digest(`decision:${runId}`),
    },
  });
  const payload: RandomXContributionAcceptedPayload = {
    sourceEventId,
    randomXEvidenceId: evidence.id,
    miningAccountId,
    assetId,
    upstreamPoolId,
    acceptedDifficulty: '1000.5',
    acceptedAt: acceptedAt.toISOString(),
  };
  const event: DomainEvent<RandomXContributionAcceptedPayload> = {
    eventId: `randomx-contribution-event-${runId}`,
    eventName: MiningEvents.randomXContributionAccepted,
    eventVersion: 1,
    occurredAt: acceptedAt.toISOString(),
    producer: 'mining-worker',
    aggregateType: 'ContributionFact',
    aggregateId: evidence.id,
    correlationId,
    causationId: sourceEvent.eventId,
    idempotencyKey: `randomx-contribution:${evidence.id}:v1`,
    payload,
  };
  const service = new AccountingService();
  const first = await service.handle(event);
  const retry = await service.handle(event);
  assert.equal(first.processed, true);
  assert.deepEqual(retry, {
    processed: false,
    reason: 'DUPLICATE',
    resultReference: first.resultReference,
  });

  const contribution = await prisma.contributionFact.findUniqueOrThrow({
    where: { randomXEvidenceId: evidence.id },
  });
  assert.equal(contribution.sourceType, 'RANDOMX_ACCEPTED_SHARE');
  assert.equal(contribution.shareId, null);
  assert.equal(contribution.sourceEventId, sourceEventId);
  assert.equal(contribution.acceptedDifficulty.toString(), '1000.5');
  assert.equal(
    await prisma.contributionFact.count({ where: { randomXEvidenceId: evidence.id } }),
    1,
  );

  await assert.rejects(
    prisma.contributionFact.update({
      where: { id: contribution.id },
      data: { acceptedDifficulty: '1001' },
    }),
    /Contribution facts are immutable/,
  );
  await assert.rejects(
    service.handle({
      ...event,
      eventId: `${event.eventId}-tampered`,
      payload: { ...payload, upstreamPoolId: `${upstreamPoolId}-other` },
    }),
    /does not match immutable accepted-share evidence/,
  );
  assert.equal(
    await prisma.contributionFact.count({ where: { randomXEvidenceId: evidence.id } }),
    1,
  );
});
