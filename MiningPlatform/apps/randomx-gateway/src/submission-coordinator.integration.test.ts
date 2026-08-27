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
  parseRandomXTarget,
  randomXJobFingerprint,
  RandomXShareValidator,
  randomXShareFingerprint,
  randomXTargetDifficulty,
  type RandomXJob,
  type RandomXShareSubmission,
} from '@mining/randomx';
import {
  RandomXSubmissionCoordinator,
  RandomXSubmissionUncertainError,
  type RandomXGatewayIdentityResolver,
  type RandomXGatewaySubmission,
  type RandomXGatewayUpstream,
  type RandomXUpstreamSubmissionResult,
} from './submission-coordinator.js';
import { RandomXSubmissionRepository } from './submission-repository.js';

const assetId = 'randomx-gateway-test-asset';
const userId = 'randomx-gateway-test-user';
const miningAccountId = 'randomx-gateway-test-account';
const workerId = 'randomx-gateway-test-worker';
const alternateWorkerId = 'randomx-gateway-alternate-worker';
const upstreamPoolId = 'randomx-gateway-test-pool';
const foreignAssetId = 'randomx-gateway-foreign-asset';
const foreignUpstreamPoolId = 'randomx-gateway-foreign-pool';
const connectionId = 'randomx-gateway-test-connection';
const alternateConnectionId = 'randomx-gateway-alternate-connection';
const upstreamSessionId = 'randomx-gateway-test-session';
const acceptedResult = `${'00'.repeat(24)}0100000000000000`;

type RandomXGatewayTestSubmission = RandomXGatewaySubmission & { job: RandomXJob };

async function ensureFixture(): Promise<void> {
  await prisma.asset.upsert({
    where: { symbol: 'XMR-GATEWAY-TEST' },
    update: { enabled: true, algorithm: 'rx/0' },
    create: {
      id: assetId,
      symbol: 'XMR-GATEWAY-TEST',
      name: 'RandomX gateway repository fixture',
      algorithm: 'rx/0',
      decimals: 12,
      enabled: true,
      minimumPayout: '0.01',
      requiredConfirmations: 10,
    },
  });
  await prisma.user.upsert({
    where: { email: 'randomx-gateway@local.invalid' },
    update: { status: 'ACTIVE' },
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
    update: { enabled: true, deletedAt: null },
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
  await prisma.worker.upsert({
    where: { miningAccountId_name: { miningAccountId, name: 'cpu-1' } },
    update: { status: 'OFFLINE', deletedAt: null },
    create: {
      id: workerId,
      userId,
      miningAccountId,
      name: 'cpu-1',
      passwordHash: 'RANDOMX_GATEWAY_TEST_ONLY',
      status: 'OFFLINE',
    },
  });
  await prisma.worker.upsert({
    where: { miningAccountId_name: { miningAccountId, name: 'cpu-2' } },
    update: { status: 'OFFLINE', deletedAt: null },
    create: {
      id: alternateWorkerId,
      userId,
      miningAccountId,
      name: 'cpu-2',
      passwordHash: 'RANDOMX_GATEWAY_TEST_ONLY',
      status: 'OFFLINE',
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
  await prisma.asset.upsert({
    where: { symbol: 'XMR-GATEWAY-FOREIGN' },
    update: { enabled: true },
    create: {
      id: foreignAssetId,
      symbol: 'XMR-GATEWAY-FOREIGN',
      name: 'RandomX gateway foreign fixture',
      algorithm: 'RANDOMX',
      decimals: 12,
      enabled: true,
      minimumPayout: '0.01',
      requiredConfirmations: 10,
    },
  });
  await prisma.upstreamPool.upsert({
    where: {
      assetId_poolKey: { assetId: foreignAssetId, poolKey: 'randomx-gateway-foreign' },
    },
    update: {},
    create: {
      id: foreignUpstreamPoolId,
      assetId: foreignAssetId,
      poolKey: 'randomx-gateway-foreign',
      name: 'RandomX Gateway Foreign Pool',
      host: '127.0.0.1',
      port: 4445,
      tls: false,
      rewardMethod: 'FOLLOW_UPSTREAM',
      status: 'SETUP',
    },
  });
}

function submissionInput(runId: string): RandomXGatewayTestSubmission {
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
    connectionId,
    correlationId: `randomx-gateway-correlation-${runId}`,
    job,
    submission,
  };
}

const identityResolver: RandomXGatewayIdentityResolver = {
  async resolveAuthenticatedWorker(resolvedConnectionId: string) {
    if (resolvedConnectionId !== connectionId) throw new Error('RandomX connection is not active');
    return {
      workerId,
      workerName: 'randomx_gateway_test.cpu-1',
      miningAccountId,
    };
  },
};

const alternateIdentityResolver: RandomXGatewayIdentityResolver = {
  async resolveAuthenticatedWorker(resolvedConnectionId: string) {
    if (resolvedConnectionId !== alternateConnectionId) {
      throw new Error('RandomX alternate connection is not active');
    }
    return {
      workerId: alternateWorkerId,
      workerName: 'randomx_gateway_test.cpu-2',
      miningAccountId,
    };
  },
};

function validator(result = acceptedResult): RandomXShareValidator {
  return new RandomXShareValidator({
    async hash(): Promise<string> {
      return result;
    },
  });
}

function upstream(
  job: RandomXJob,
  handler: (submission: RandomXShareSubmission) => Promise<RandomXUpstreamSubmissionResult>,
): RandomXGatewayUpstream {
  const authoritativeJob = {
    ...job,
    receivedAt: new Date(job.receivedAt),
    expiresAt: new Date(job.expiresAt),
  };
  return {
    id: upstreamPoolId,
    activeSessionId: upstreamSessionId,
    getJob(jobId: string, at = new Date()): RandomXJob | undefined {
      if (jobId !== authoritativeJob.id || at.getTime() > authoritativeJob.expiresAt.getTime()) {
        return undefined;
      }
      return authoritativeJob;
    },
    async submit(
      submission: RandomXShareSubmission,
      expectedSessionId: string,
      expectedJobFingerprint: string,
    ): Promise<RandomXUpstreamSubmissionResult> {
      assert.equal(expectedSessionId, upstreamSessionId);
      assert.equal(expectedJobFingerprint, randomXJobFingerprint(authoritativeJob));
      return handler(submission);
    },
  };
}

test('records accepted upstream evidence and outbox atomically without creating money', async () => {
  await ensureFixture();
  const runId = `accepted-${process.pid}-${Date.now()}-${randomUUID()}`;
  const input = submissionInput(runId);
  let submitCalls = 0;
  const coordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver,
    upstream: upstream(input.job, async () => {
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
  assert.equal(decision.submissionIntent.upstreamPoolId, upstreamPoolId);
  assert.equal(
    decision.submissionIntent.acceptedDifficulty.toString(),
    randomXTargetDifficulty(parseRandomXTarget(input.job.target)),
  );

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
  assert.equal(await prisma.rewardAllocation.count({ where: { miningAccountId } }), 0);
  assert.equal(
    await prisma.journalEntry.count({ where: { correlationId: input.correlationId } }),
    0,
  );
  assert.equal(await prisma.balanceReservation.count({ where: { userId: userId, assetId } }), 0);

  const replay = await coordinator.submit(input);
  assert.equal(replay.status, 'ACCEPTED_ENQUEUED');
  assert.equal(replay.replayed, true);
  assert.equal(submitCalls, 1, 'a durable decision must suppress upstream resubmission');

  let evictedSubmitCalls = 0;
  const evictedCoordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver,
    upstream: {
      id: upstreamPoolId,
      activeSessionId: undefined,
      getJob: () => undefined,
      async submit(): Promise<RandomXUpstreamSubmissionResult> {
        evictedSubmitCalls += 1;
        throw new Error('evicted upstream must not be called');
      },
    },
  });
  const networkRetry = {
    connectionId: input.connectionId,
    correlationId: `${input.correlationId}-network-retry`,
    submission: {
      ...input.submission,
      submittedAt: new Date(input.submission.submittedAt.getTime() + 1_000),
    },
  };
  const evictedReplay = await evictedCoordinator.submit(networkRetry);
  assert.equal(evictedReplay.status, 'ACCEPTED_ENQUEUED');
  assert.equal(evictedReplay.replayed, true);
  assert.equal(evictedSubmitCalls, 0, 'durable replay must not depend on a live job or session');

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
    identityResolver,
    upstream: upstream(input.job, async () => {
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
    identityResolver,
    upstream: upstream(input.job, async () => {
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

  let alternateSubmitCalls = 0;
  const alternateInput: RandomXGatewaySubmission = {
    connectionId: alternateConnectionId,
    correlationId: `${input.correlationId}-alternate-worker`,
    submission: {
      ...input.submission,
      workerName: 'randomx_gateway_test.cpu-2',
      submittedAt: new Date(input.submission.submittedAt.getTime() + 1_000),
    },
  };
  const alternateCoordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver: alternateIdentityResolver,
    upstream: upstream(input.job, async () => {
      alternateSubmitCalls += 1;
      return { accepted: true };
    }),
  });
  await assert.rejects(alternateCoordinator.submit(alternateInput), (error: unknown) => {
    assert.ok(error instanceof RandomXSubmissionUncertainError);
    assert.equal(error.intentId, intentId);
    return true;
  });
  assert.equal(
    alternateSubmitCalls,
    0,
    'the same upstream wire proof must not be redispatched under another local worker',
  );

  const evictedCoordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver,
    upstream: {
      id: upstreamPoolId,
      activeSessionId: undefined,
      getJob: () => undefined,
      async submit(): Promise<RandomXUpstreamSubmissionResult> {
        throw new Error('unresolved durable replay must not reach the upstream');
      },
    },
  });
  const uncertainNetworkRetry: RandomXGatewaySubmission = {
    connectionId: input.connectionId,
    correlationId: `${input.correlationId}-network-retry`,
    submission: {
      ...input.submission,
      submittedAt: new Date(input.submission.submittedAt.getTime() + 2_000),
    },
  };
  await assert.rejects(evictedCoordinator.submit(uncertainNetworkRetry), (error: unknown) => {
    assert.ok(error instanceof RandomXSubmissionUncertainError);
    assert.equal(error.intentId, intentId);
    return true;
  });

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
      acceptedDifficulty: randomXTargetDifficulty(parseRandomXTarget(input.job.target)),
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

test('uses only the authoritative upstream job for validation and durable evidence', async () => {
  await ensureFixture();
  const input = submissionInput(`authoritative-${process.pid}-${Date.now()}-${randomUUID()}`);
  const originalJobId = input.submission.jobId;
  const originalSubmittedAt = input.submission.submittedAt.toISOString();
  let releaseIdentity!: () => void;
  let signalIdentityStarted!: () => void;
  const identityStarted = new Promise<void>((resolve) => {
    signalIdentityStarted = resolve;
  });
  const identityHold = new Promise<void>((resolve) => {
    releaseIdentity = resolve;
  });
  const delayedIdentityResolver: RandomXGatewayIdentityResolver = {
    async resolveAuthenticatedWorker(resolvedConnectionId: string) {
      assert.equal(resolvedConnectionId, connectionId);
      signalIdentityStarted();
      await identityHold;
      return {
        workerId,
        workerName: 'randomx_gateway_test.cpu-1',
        miningAccountId,
      };
    },
  };
  const coordinatorUpstream = upstream(input.job, async (submission) => {
    assert.equal(submission.jobId, originalJobId);
    assert.equal(submission.result, acceptedResult);
    assert.equal(submission.submittedAt.toISOString(), originalSubmittedAt);
    return { accepted: true };
  });
  input.job.seedHash = '22'.repeat(32);
  input.job.blob = '33'.repeat(76);

  const coordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver: delayedIdentityResolver,
    upstream: coordinatorUpstream,
  });
  const pending = coordinator.submit(input);
  await identityStarted;
  input.submission.workerName = 'attacker.cpu-1';
  input.submission.jobId = `${originalJobId}-attacker`;
  input.submission.result = '44'.repeat(32);
  input.submission.submittedAt.setTime(0);
  releaseIdentity();
  const result = await pending;
  assert.equal(result.status, 'ACCEPTED_ENQUEUED');

  const intent = await prisma.randomXShareSubmissionIntent.findFirstOrThrow({
    where: { correlationId: input.correlationId },
    include: { jobEvidence: true },
  });
  assert.equal(intent.jobEvidence.seedHash, '11'.repeat(32));
  assert.equal(intent.jobEvidence.jobBlob, '00'.repeat(76));
  assert.equal(intent.jobEvidence.upstreamJobId, originalJobId);
  assert.equal(intent.workerName, 'randomx_gateway_test.cpu-1');
  assert.equal(intent.submittedResult, acceptedResult);
  assert.equal(intent.submittedAt.toISOString(), originalSubmittedAt);
});

test('rejects an authenticated account and adapter pool asset mismatch before job lookup', async () => {
  await ensureFixture();
  const input = submissionInput(`pool-context-${process.pid}-${Date.now()}-${randomUUID()}`);
  let jobLookups = 0;
  let submitCalls = 0;
  const validUpstream = upstream(input.job, async () => {
    submitCalls += 1;
    return { accepted: true };
  });
  const coordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver,
    upstream: {
      ...validUpstream,
      id: foreignUpstreamPoolId,
      getJob(jobId: string, at?: Date): RandomXJob | undefined {
        jobLookups += 1;
        return validUpstream.getJob(jobId, at);
      },
    },
  });

  await assert.rejects(
    coordinator.submit(input),
    /upstream adapter does not match the mining account asset/,
  );
  assert.equal(jobLookups, 0);
  assert.equal(submitCalls, 0);
  assert.equal(
    await prisma.randomXShareSubmissionIntent.count({
      where: { correlationId: input.correlationId },
    }),
    0,
  );
});

test('rejects a worker name that is not bound to the authenticated connection', async () => {
  await ensureFixture();
  const input = submissionInput(`worker-binding-${process.pid}-${Date.now()}-${randomUUID()}`);
  let jobLookups = 0;
  let submitCalls = 0;
  const validUpstream = upstream(input.job, async () => {
    submitCalls += 1;
    return { accepted: true };
  });
  const coordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver: {
      async resolveAuthenticatedWorker() {
        return {
          workerId: 'randomx-gateway-other-worker',
          workerName: 'randomx_gateway_test.other-worker',
          miningAccountId,
        };
      },
    },
    upstream: {
      ...validUpstream,
      getJob(jobId: string, at?: Date): RandomXJob | undefined {
        jobLookups += 1;
        return validUpstream.getJob(jobId, at);
      },
    },
  });

  await assert.rejects(
    coordinator.submit(input),
    /worker does not match the authenticated connection/,
  );
  assert.equal(jobLookups, 0);
  assert.equal(submitCalls, 0);
});

test('rechecks worker authorization after hashing and before durable intent or RPC', async () => {
  await ensureFixture();
  const input = submissionInput(`authorization-race-${process.pid}-${Date.now()}-${randomUUID()}`);
  let submitCalls = 0;
  const baseValidator = validator();
  const coordinator = new RandomXSubmissionCoordinator({
    validator: {
      async validate(job, submission, now) {
        const result = await baseValidator.validate(job, submission, now);
        await prisma.worker.update({ where: { id: workerId }, data: { status: 'DISABLED' } });
        return result;
      },
    },
    identityResolver,
    upstream: upstream(input.job, async () => {
      submitCalls += 1;
      return { accepted: true };
    }),
  });

  try {
    await assert.rejects(coordinator.submit(input), /authenticated worker is no longer authorized/);
  } finally {
    await prisma.worker.update({ where: { id: workerId }, data: { status: 'OFFLINE' } });
  }
  assert.equal(submitCalls, 0);
  assert.equal(
    await prisma.randomXShareSubmissionIntent.count({
      where: { correlationId: input.correlationId },
    }),
    0,
  );
});

test('binds dispatch to the validated session and leaves a pre-dispatch session race unresolved', async () => {
  await ensureFixture();
  const input = submissionInput(`session-race-${process.pid}-${Date.now()}-${randomUUID()}`);
  let activeSession = upstreamSessionId;
  let submitInvocations = 0;
  let remoteWrites = 0;
  const baseValidator = validator();
  const coordinator = new RandomXSubmissionCoordinator({
    validator: {
      async validate(job, submission, now) {
        const result = await baseValidator.validate(job, submission, now);
        activeSession = 'randomx-gateway-reconnected-session';
        return result;
      },
    },
    identityResolver,
    upstream: {
      id: upstreamPoolId,
      get activeSessionId(): string | undefined {
        return activeSession;
      },
      getJob(jobId: string): RandomXJob | undefined {
        return jobId === input.job.id ? { ...input.job } : undefined;
      },
      async submit(
        _submission: RandomXShareSubmission,
        expectedSessionId: string,
        expectedJobFingerprint: string,
      ): Promise<RandomXUpstreamSubmissionResult> {
        submitInvocations += 1;
        assert.equal(expectedSessionId, upstreamSessionId);
        assert.equal(expectedJobFingerprint, randomXJobFingerprint(input.job));
        if (activeSession !== expectedSessionId) {
          throw new Error('submission was not dispatched because the session changed');
        }
        remoteWrites += 1;
        return { accepted: true };
      },
    },
  });

  let intentId = '';
  await assert.rejects(coordinator.submit(input), (error: unknown) => {
    assert.ok(error instanceof RandomXSubmissionUncertainError);
    intentId = error.intentId;
    return true;
  });
  assert.equal(submitInvocations, 1);
  assert.equal(remoteWrites, 0);
  assert.equal(
    await prisma.randomXUpstreamShareDecision.count({ where: { submissionIntentId: intentId } }),
    0,
  );
});

function runIdFor(input: RandomXGatewaySubmission): string {
  return input.submission.jobId.slice(-64);
}

test('rejects invalid, unknown, stale, or future work before durable intent or upstream RPC', async () => {
  await ensureFixture();
  const input = submissionInput(`local-reject-${process.pid}-${Date.now()}-${randomUUID()}`);
  let submitCalls = 0;
  const coordinatorUpstream = upstream(input.job, async () => {
    submitCalls += 1;
    return { accepted: true };
  });
  const coordinator = new RandomXSubmissionCoordinator({
    validator: validator('44'.repeat(32)),
    identityResolver,
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

  const unknownInput = submissionInput(`unknown-${process.pid}-${Date.now()}-${randomUUID()}`);
  const unknownUpstream = upstream(unknownInput.job, async () => {
    submitCalls += 1;
    return { accepted: true };
  });
  unknownInput.submission.jobId = `${unknownInput.submission.jobId}-missing`;
  const unknownCoordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver,
    upstream: unknownUpstream,
  });
  const unknown = await unknownCoordinator.submit(unknownInput);
  assert.equal(unknown.status, 'JOB_UNAVAILABLE');
  assert.equal(unknown.reason, 'UNKNOWN_OR_STALE_JOB');
  assert.equal(
    await prisma.randomXShareSubmissionIntent.count({
      where: { correlationId: unknownInput.correlationId },
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
    identityResolver,
    upstream: upstream(staleInput.job, async () => {
      submitCalls += 1;
      return { accepted: true };
    }),
  });
  const stale = await staleCoordinator.submit(staleInput);
  assert.equal(stale.status, 'JOB_UNAVAILABLE');
  assert.equal(stale.reason, 'UNKNOWN_OR_STALE_JOB');

  const futureInput = submissionInput(`future-${process.pid}-${Date.now()}-${randomUUID()}`);
  futureInput.submission.submittedAt = new Date(Date.now() + 60_000);
  futureInput.job.expiresAt = new Date(Date.now() + 120_000);
  const futureCoordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver,
    upstream: upstream(futureInput.job, async () => {
      submitCalls += 1;
      return { accepted: true };
    }),
  });
  await assert.rejects(
    futureCoordinator.submit(futureInput),
    /ahead of authoritative database time/,
  );

  const authoritativeNow = new Date();
  const slightFutureInput = submissionInput(
    `slight-future-${process.pid}-${Date.now()}-${randomUUID()}`,
  );
  slightFutureInput.submission.submittedAt = new Date(authoritativeNow.getTime() + 1_000);
  slightFutureInput.job.expiresAt = new Date(authoritativeNow.getTime() + 120_000);
  const fixedTimeRepository = new (class extends RandomXSubmissionRepository {
    override async currentDatabaseTime(): Promise<Date> {
      return new Date(authoritativeNow);
    }
  })();
  const slightFutureCoordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver,
    repository: fixedTimeRepository,
    upstream: upstream(slightFutureInput.job, async () => {
      submitCalls += 1;
      return { accepted: true };
    }),
  });
  await assert.rejects(
    slightFutureCoordinator.submit(slightFutureInput),
    /ahead of authoritative database time/,
  );

  const futureJobInput = submissionInput(`future-job-${process.pid}-${Date.now()}-${randomUUID()}`);
  futureJobInput.job.receivedAt = new Date(Date.now() + 60_000);
  futureJobInput.job.expiresAt = new Date(Date.now() + 180_000);
  const futureJobCoordinator = new RandomXSubmissionCoordinator({
    validator: validator(),
    identityResolver,
    upstream: upstream(futureJobInput.job, async () => {
      submitCalls += 1;
      return { accepted: true };
    }),
  });
  const futureJob = await futureJobCoordinator.submit(futureJobInput);
  assert.equal(futureJob.status, 'JOB_UNAVAILABLE');
  assert.equal(futureJob.reason, 'UNKNOWN_OR_STALE_JOB');
  assert.equal(
    await prisma.randomXShareSubmissionIntent.count({
      where: { correlationId: futureJobInput.correlationId },
    }),
    0,
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
    identityResolver,
    upstream: upstream(input.job, async () => {
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
