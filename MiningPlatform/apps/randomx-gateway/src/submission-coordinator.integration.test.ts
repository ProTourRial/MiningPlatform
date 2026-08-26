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
  createRandomXAcceptedShareEvent,
  RandomXShareValidator,
  randomXShareFingerprint,
  type RandomXJob,
  type RandomXShareSubmission,
} from '@mining/randomx';
import {
  RandomXSubmissionCoordinator,
  RandomXSubmissionUncertainError,
  type RandomXGatewaySubmission,
  type RandomXGatewayUpstream,
  type RandomXUpstreamSubmissionResult,
} from './submission-coordinator.js';

const assetId = 'randomx-gateway-test-asset';
const userId = 'randomx-gateway-test-user';
const miningAccountId = 'randomx-gateway-test-account';
const upstreamPoolId = 'randomx-gateway-test-pool';
const upstreamSessionId = 'randomx-gateway-test-session';
const acceptedResult = `${'00'.repeat(24)}0100000000000000`;

async function ensureFixture(): Promise<void> {
  await prisma.asset.upsert({
    where: { symbol: 'XMR-GATEWAY-TEST' },
    update: {},
    create: {
      id: assetId,
      symbol: 'XMR-GATEWAY-TEST',
      name: 'RandomX gateway repository fixture',
      algorithm: 'RANDOMX',
      decimals: 12,
      enabled: false,
      minimumPayout: '0.01',
      requiredConfirmations: 10,
    },
  });
  await prisma.user.upsert({
    where: { email: 'randomx-gateway@local.invalid' },
    update: {},
    create: {
      id: userId,
      email: 'randomx-gateway@local.invalid',
      passwordHash: 'RANDOMX_GATEWAY_TEST_ONLY',
      displayName: 'RandomX Gateway Test',
      role: 'USER',
      status: 'ACTIVE',
      accountType: 'INDIVIDUAL',
      emailVerifiedAt: new Date('2026-08-26T00:00:00.000Z'),
    },
  });
  await prisma.miningAccount.upsert({
    where: { username: 'randomx_gateway_test' },
    update: {},
    create: {
      id: miningAccountId,
      userId,
      assetId,
      feePolicyId: 'fee-policy-platform-default-v1',
      username: 'randomx_gateway_test',
      rewardMethod: 'FOLLOW_UPSTREAM',
      platformFeePercent: '0.5',
    },
  });
  await prisma.upstreamPool.upsert({
    where: { assetId_poolKey: { assetId, poolKey: 'randomx-gateway-test' } },
    update: {},
    create: {
      id: upstreamPoolId,
      assetId,
      poolKey: 'randomx-gateway-test',
      name: 'RandomX Gateway Test Pool',
      host: '127.0.0.1',
      port: 4444,
      tls: false,
      rewardMethod: 'FOLLOW_UPSTREAM',
      status: 'SETUP',
    },
  });
}

function submissionInput(runId: string): RandomXGatewaySubmission {
  const submittedAt = new Date();
  const receivedAt = new Date(submittedAt.getTime() - 60_000);
  const job: RandomXJob = {
    id: `randomx-gateway-job-${runId}`,
    clientId: upstreamSessionId,
    algorithm: 'rx/0',
    blob: '00'.repeat(76),
    target: '0200000000000000',
    seedHash: '11'.repeat(32),
    height: 3_500_001n,
    receivedAt,
    expiresAt: new Date(submittedAt.getTime() + 120_000),
  };
  const submission: RandomXShareSubmission = {
    workerName: 'randomx_gateway_test.cpu-1',
    jobId: job.id,
    nonce: '78563412',
    result: acceptedResult,
    submittedAt,
  };
  return {
    miningAccountId,
    assetId,
    upstreamPoolId,
    correlationId: `randomx-gateway-correlation-${runId}`,
    acceptedDifficulty: '1000.5',
    job,
    submission,
  };
}

function validator(result = acceptedResult): RandomXShareValidator {
  return new RandomXShareValidator({
    async hash(): Promise<string> {
      return result;
    },
  });
}

function upstream(
  handler: (submission: RandomXShareSubmission) => Promise<RandomXUpstreamSubmissionResult>,
): RandomXGatewayUpstream {
  return { activeSessionId: upstreamSessionId, submit: handler };
}

test('records accepted upstream evidence and outbox atomically without creating money', async () => {
  await ensureFixture();
  const runId = `accepted-${process.pid}-${Date.now()}-${randomUUID()}`;
  const input = submissionInput(runId);
  let submitCalls = 0;
  const coordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    upstream: upstream(async () => {
      submitCalls += 1;
      assert.equal(
        await prisma.randomXShareSubmissionIntent.count({
          where: { shareFingerprint: randomXShareFingerprint(input.job, input.submission) },
        }),
        1,
        'the durable intent must exist before the upstream side effect',
      );
      return { accepted: true };
    }),
  });

  const result = await coordinator.submit(input);
  assert.equal(result.status, 'ACCEPTED_ENQUEUED');
  assert.equal(result.replayed, false);
  assert.equal(submitCalls, 1);
  if (result.status !== 'ACCEPTED_ENQUEUED') return;

  const decision = await prisma.randomXUpstreamShareDecision.findUniqueOrThrow({
    where: { id: result.decisionId },
    include: { submissionIntent: { include: { jobEvidence: true } }, outboxEvent: true },
  });
  assert.equal(decision.accepted, true);
  assert.equal(decision.outboxEventId, result.outboxEventId);
  assert.equal(decision.outboxEvent?.status, 'PENDING');
  assert.equal(decision.outboxEvent?.eventName, 'mining.randomx.share.accepted.v1');
  assert.equal(decision.outboxEvent?.producer, 'randomx-mining-gateway');
  assert.equal(decision.outboxEvent?.causationId, decision.id);
  assert.equal(decision.submissionIntent.jobEvidence.jobBlob, input.job.blob);

  assert.equal(
    await prisma.randomXAcceptedShareEvidence.count({
      where: { shareFingerprint: decision.submissionIntent.shareFingerprint },
    }),
    0,
    'the outbox producer must not bypass the downstream evidence consumer',
  );
  assert.equal(
    await prisma.contributionFact.count({ where: { correlationId: input.correlationId } }),
    0,
  );
  assert.equal(
    await prisma.rewardAllocation.count({ where: { miningAccountId: input.miningAccountId } }),
    0,
  );
  assert.equal(
    await prisma.journalEntry.count({ where: { correlationId: input.correlationId } }),
    0,
  );
  assert.equal(await prisma.balanceReservation.count({ where: { userId: userId, assetId } }), 0);

  const replay = await coordinator.submit(input);
  assert.equal(replay.status, 'ACCEPTED_ENQUEUED');
  assert.equal(replay.replayed, true);
  assert.equal(submitCalls, 1, 'a durable decision must suppress upstream resubmission');

  await prisma.outboxEvent.update({
    where: { id: result.outboxEventId },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });
  await assert.rejects(
    prisma.outboxEvent.update({
      where: { id: result.outboxEventId },
      data: { payload: { altered: true } },
    }),
    /RandomX accepted-share outbox envelope is immutable/,
  );
  await assert.rejects(
    prisma.randomXShareSubmissionIntent.update({
      where: { id: decision.submissionIntentId },
      data: { correlationId: `${input.correlationId}-altered` },
    }),
    /RandomX upstream job, submission intent, and decision evidence is immutable/,
  );
  await assert.rejects(
    prisma.outboxEvent.delete({ where: { id: result.outboxEventId } }),
    /foreign key constraint/i,
  );
});

test('records an upstream rejection without an accepted-share outbox event', async () => {
  await ensureFixture();
  const input = submissionInput(`rejected-${process.pid}-${Date.now()}-${randomUUID()}`);
  let submitCalls = 0;
  const coordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    upstream: upstream(async () => {
      submitCalls += 1;
      return { accepted: false, errorCode: -1, errorMessage: 'Low difficulty share' };
    }),
  });

  const result = await coordinator.submit(input);
  assert.equal(result.status, 'UPSTREAM_REJECTED');
  assert.equal(result.replayed, false);
  assert.equal(result.errorCode, -1);
  assert.equal(result.errorMessage, 'Low difficulty share');
  assert.equal(submitCalls, 1);
  assert.equal(
    await prisma.outboxEvent.count({ where: { correlationId: input.correlationId } }),
    0,
  );

  const replay = await coordinator.submit(input);
  assert.equal(replay.status, 'UPSTREAM_REJECTED');
  assert.equal(replay.replayed, true);
  assert.equal(submitCalls, 1);
});

test('leaves transport ambiguity unresolved and blocks automatic resubmission', async () => {
  await ensureFixture();
  const input = submissionInput(`uncertain-${process.pid}-${Date.now()}-${randomUUID()}`);
  let submitCalls = 0;
  const coordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    upstream: upstream(async () => {
      submitCalls += 1;
      throw new Error('simulated connection loss after dispatch');
    }),
  });

  let intentId = '';
  await assert.rejects(coordinator.submit(input), (error: unknown) => {
    assert.ok(error instanceof RandomXSubmissionUncertainError);
    intentId = error.intentId;
    return true;
  });
  assert.equal(submitCalls, 1);
  assert.ok(intentId);
  assert.equal(
    await prisma.randomXUpstreamShareDecision.count({ where: { submissionIntentId: intentId } }),
    0,
  );

  await assert.rejects(coordinator.submit(input), (error: unknown) => {
    assert.ok(error instanceof RandomXSubmissionUncertainError);
    assert.equal(error.intentId, intentId);
    return true;
  });
  assert.equal(submitCalls, 1, 'an unresolved intent must block a second upstream call');

  const intent = await prisma.randomXShareSubmissionIntent.findUniqueOrThrow({
    where: { id: intentId },
  });
  const badEventId = `randomx-bad-event-${randomUUID()}`;
  const badDecisionId = `randomx-bad-decision-${runIdFor(input)}`;
  const decidedAt = new Date(input.submission.submittedAt.getTime() + 1_000);
  const decisionDigest = '33'.repeat(32);
  const canonicalEvent = createRandomXAcceptedShareEvent({
    eventId: badEventId,
    causationId: badDecisionId,
    accounting: {
      miningAccountId,
      assetId,
      correlationId: input.correlationId,
      acceptedDifficulty: input.acceptedDifficulty,
      job: input.job,
      submission: input.submission,
      validation: {
        accepted: true,
        reason: 'ACCEPTED',
        fingerprint: intent.shareFingerprint,
        hash: acceptedResult,
        target: 2n,
      },
      upstream: {
        accepted: true,
        upstreamPoolId,
        upstreamSessionId,
        decidedAt,
        sourceDigest: decisionDigest,
      },
    },
  });
  await assert.rejects(
    prisma.$transaction(async (transaction) => {
      const badOutbox = await transaction.outboxEvent.create({
        data: {
          eventId: canonicalEvent.eventId,
          eventName: canonicalEvent.eventName,
          eventVersion: canonicalEvent.eventVersion,
          producer: canonicalEvent.producer,
          aggregateType: canonicalEvent.aggregateType,
          aggregateId: canonicalEvent.aggregateId,
          correlationId: canonicalEvent.correlationId,
          causationId: canonicalEvent.causationId,
          idempotencyKey: canonicalEvent.idempotencyKey,
          payload: {
            ...canonicalEvent.payload,
            jobBlob: `01${canonicalEvent.payload.jobBlob.slice(2)}`,
          },
          occurredAt: new Date(canonicalEvent.occurredAt),
        },
      });
      await transaction.randomXUpstreamShareDecision.create({
        data: {
          id: badDecisionId,
          idempotencyKey: `randomx-bad-decision:${intent.shareFingerprint}`,
          submissionIntentId: intent.id,
          accepted: true,
          sourceDigest: decisionDigest,
          decidedAt,
          outboxEventId: badOutbox.id,
        },
      });
    }),
    /exact correlated outbox evidence/,
  );
  assert.equal(await prisma.outboxEvent.count({ where: { eventId: badEventId } }), 0);
});

function runIdFor(input: RandomXGatewaySubmission): string {
  return input.job.id.slice(-64);
}

test('rejects local invalid work before durable intent or upstream RPC', async () => {
  await ensureFixture();
  const input = submissionInput(`local-reject-${process.pid}-${Date.now()}-${randomUUID()}`);
  let submitCalls = 0;
  const coordinatorUpstream = upstream(async () => {
    submitCalls += 1;
    return { accepted: true };
  });
  const coordinator = new RandomXSubmissionCoordinator({
    validator: validator('44'.repeat(32)),
    upstream: coordinatorUpstream,
  });

  const result = await coordinator.submit(input);
  assert.equal(result.status, 'LOCAL_REJECTED');
  assert.equal(result.validation.reason, 'HASH_MISMATCH');
  assert.equal(submitCalls, 0);
  assert.equal(
    await prisma.randomXShareSubmissionIntent.count({
      where: { shareFingerprint: randomXShareFingerprint(input.job, input.submission) },
    }),
    0,
  );

  const staleInput = submissionInput(`stale-${process.pid}-${Date.now()}-${randomUUID()}`);
  const staleExpiry = new Date(Date.now() - 30_000);
  staleInput.job.receivedAt = new Date(staleExpiry.getTime() - 60_000);
  staleInput.job.expiresAt = staleExpiry;
  staleInput.submission.submittedAt = new Date(staleExpiry.getTime() - 1_000);
  const staleCoordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    upstream: coordinatorUpstream,
  });
  const stale = await staleCoordinator.submit(staleInput);
  assert.equal(stale.status, 'LOCAL_REJECTED');
  assert.equal(stale.validation.reason, 'STALE_JOB');

  const futureInput = submissionInput(`future-${process.pid}-${Date.now()}-${randomUUID()}`);
  futureInput.submission.submittedAt = new Date(Date.now() + 60_000);
  futureInput.job.expiresAt = new Date(Date.now() + 120_000);
  const futureCoordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    upstream: coordinatorUpstream,
  });
  await assert.rejects(
    futureCoordinator.submit(futureInput),
    /ahead of authoritative database time/,
  );
  assert.equal(submitCalls, 0);
});

test('serializes concurrent duplicate work so only one upstream call is possible', async () => {
  await ensureFixture();
  const input = submissionInput(`concurrent-${process.pid}-${Date.now()}-${randomUUID()}`);
  let submitCalls = 0;
  let release!: () => void;
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const coordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    upstream: upstream(async () => {
      submitCalls += 1;
      signalStarted();
      await hold;
      return { accepted: true };
    }),
  });

  const first = coordinator.submit(input);
  await started;
  await assert.rejects(coordinator.submit(input), (error: unknown) => {
    assert.ok(error instanceof RandomXSubmissionUncertainError);
    return true;
  });
  assert.equal(submitCalls, 1);
  release();
  const accepted = await first;
  assert.equal(accepted.status, 'ACCEPTED_ENQUEUED');
  assert.equal(submitCalls, 1);

  const replay = await coordinator.submit(input);
  assert.equal(replay.status, 'ACCEPTED_ENQUEUED');
  assert.equal(replay.replayed, true);
  assert.equal(submitCalls, 1);
});
