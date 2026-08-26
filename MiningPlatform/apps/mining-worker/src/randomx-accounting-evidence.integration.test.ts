/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@mining/database';
import type { DomainEvent } from '@mining/event-bus';
import { randomXShareFingerprint, type RandomXAccountingProjectionInput } from '@mining/randomx';
import { MiningEvents, type RandomXAcceptedSharePayload } from '@mining/shared';
import {
  RANDOMX_ACCOUNTING_EVENT_PRODUCER,
  RandomXAccountingEventConsumer,
} from './randomx-accounting-event.js';
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

function acceptedEvent(
  input: RandomXAccountingProjectionInput,
  eventId: string,
): DomainEvent<RandomXAcceptedSharePayload> {
  if (
    !input.validation.accepted ||
    input.validation.reason !== 'ACCEPTED' ||
    !input.validation.hash ||
    input.validation.target === undefined
  ) {
    throw new Error('Test fixture requires accepted local validation');
  }
  const payload: RandomXAcceptedSharePayload = {
    miningAccountId: input.miningAccountId,
    assetId: input.assetId,
    algorithm: 'rx/0',
    upstreamPoolId: input.upstream.upstreamPoolId,
    upstreamSessionId: input.upstream.upstreamSessionId,
    upstreamJobId: input.job.id,
    upstreamClientId: input.job.clientId,
    workerName: input.submission.workerName,
    jobBlob: input.job.blob,
    seedHash: input.job.seedHash,
    targetHex: input.job.target,
    jobHeight: (input.job.height ?? 0n).toString(),
    jobReceivedAt: input.job.receivedAt.toISOString(),
    jobExpiresAt: input.job.expiresAt.toISOString(),
    nonce: input.submission.nonce,
    submittedResult: input.submission.result,
    submittedAt: input.submission.submittedAt.toISOString(),
    localAccepted: true,
    localReason: 'ACCEPTED',
    localFingerprint: input.validation.fingerprint,
    computedResult: input.validation.hash,
    localTarget: input.validation.target.toString(),
    acceptedDifficulty: input.acceptedDifficulty,
    upstreamAccepted: true,
    upstreamDecidedAt: input.upstream.decidedAt.toISOString(),
    upstreamDecisionDigest: input.upstream.sourceDigest,
  };
  return {
    eventId,
    eventName: MiningEvents.randomXShareAccepted,
    eventVersion: 1,
    occurredAt: payload.upstreamDecidedAt,
    producer: RANDOMX_ACCOUNTING_EVENT_PRODUCER,
    aggregateType: 'MiningAccount',
    aggregateId: payload.miningAccountId,
    correlationId: input.correlationId,
    idempotencyKey: `randomx-share:${payload.localFingerprint}`,
    payload,
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

test('consumes RandomX evidence events atomically across retries, conflicts, and rollback', async () => {
  await ensureFixture();
  const consumer = new RandomXAccountingEventConsumer();
  const runId = `event-${process.pid}-${Date.now()}`;
  const input = acceptedInput(runId);
  const event = acceptedEvent(input, `randomx-runtime-event-${runId}`);
  const results = await Promise.all(Array.from({ length: 4 }, () => consumer.handle(event)));

  assert.equal(results.filter((result) => result.processed).length, 1);
  assert.equal(new Set(results.map((result) => result.evidenceId)).size, 1);
  const evidenceId = results[0]?.evidenceId;
  assert.ok(evidenceId);
  assert.equal(
    await prisma.randomXAcceptedShareEvidence.count({
      where: { shareFingerprint: input.validation.fingerprint },
    }),
    1,
  );
  const recordKey = `randomx-accounting-evidence-v1:${event.idempotencyKey}`;
  const idempotency = await prisma.idempotencyRecord.findUnique({ where: { key: recordKey } });
  assert.equal(idempotency?.status, 'COMPLETED');
  assert.equal(idempotency?.resultReference, evidenceId);

  const alteredEvent = {
    ...event,
    eventId: `${event.eventId}-altered`,
    payload: { ...event.payload, acceptedDifficulty: '1001' },
  };
  await assert.rejects(consumer.handle(alteredEvent), /idempotency conflict/);
  assert.equal(
    await prisma.randomXAcceptedShareEvidence.count({
      where: { shareFingerprint: input.validation.fingerprint },
    }),
    1,
  );

  await assert.rejects(
    consumer.handle({ ...event, producer: 'untrusted-randomx-producer' }),
    /producer is unsupported/,
  );
  await assert.rejects(
    consumer.handle({
      ...event,
      payload: { ...event.payload, unexpectedField: 'rejected' } as RandomXAcceptedSharePayload,
    }),
    /payload shape is invalid/,
  );

  const rollbackInput = acceptedInput(`${runId}-rollback`);
  const rollbackEvent = acceptedEvent(
    { ...rollbackInput, assetId: 'missing-randomx-runtime-asset' },
    `${event.eventId}-rollback`,
  );
  const rollbackKey = `randomx-accounting-evidence-v1:${rollbackEvent.idempotencyKey}`;
  await assert.rejects(consumer.handle(rollbackEvent));
  assert.equal(await prisma.idempotencyRecord.findUnique({ where: { key: rollbackKey } }), null);
  assert.equal(
    await prisma.randomXAcceptedShareEvidence.count({
      where: { shareFingerprint: rollbackInput.validation.fingerprint },
    }),
    0,
  );
});
