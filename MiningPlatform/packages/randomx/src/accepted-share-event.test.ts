/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { MiningEvents, RandomXEventProducers } from '@mining/shared';
import { createRandomXAcceptedShareEvent } from './accepted-share-event.js';
import type { RandomXAccountingProjectionInput } from './accounting-projection.js';
import { randomXShareFingerprint } from './validator.js';

function acceptedInput(): RandomXAccountingProjectionInput {
  const result = `${'00'.repeat(24)}0100000000000000`;
  const job = {
    id: 'randomx-event-job-1',
    clientId: 'randomx-event-client-1',
    algorithm: 'rx/0' as const,
    blob: '00'.repeat(76),
    target: '0200000000000000',
    seedHash: '11'.repeat(32),
    height: 3_500_000n,
    receivedAt: new Date('2026-08-26T04:00:00.000Z'),
    expiresAt: new Date('2026-08-26T04:02:00.000Z'),
  };
  const submission = {
    workerName: 'randomx_account.cpu-1',
    jobId: job.id,
    nonce: '78563412',
    result,
    submittedAt: new Date('2026-08-26T04:01:00.000Z'),
  };
  return {
    miningAccountId: 'randomx-event-account',
    assetId: 'randomx-event-asset',
    correlationId: 'randomx-event-correlation',
    acceptedDifficulty: '1000.500000000000',
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
      upstreamPoolId: 'randomx-event-pool',
      upstreamSessionId: 'randomx-event-session',
      decidedAt: new Date('2026-08-26T04:01:01.000Z'),
      sourceDigest: '33'.repeat(32),
    },
  };
}

test('creates the canonical immutable RandomX accepted-share event', () => {
  const accounting = acceptedInput();
  const event = createRandomXAcceptedShareEvent({
    eventId: 'randomx-event-1',
    causationId: 'randomx-upstream-decision-1',
    accounting,
  });

  assert.equal(event.eventName, MiningEvents.randomXShareAccepted);
  assert.equal(event.producer, RandomXEventProducers.acceptedShare);
  assert.equal(event.aggregateId, accounting.miningAccountId);
  assert.equal(event.occurredAt, accounting.upstream.decidedAt.toISOString());
  assert.equal(event.idempotencyKey, `randomx-share:${accounting.validation.fingerprint}`);
  assert.equal(event.payload.jobHeight, '3500000');
  assert.equal(event.payload.acceptedDifficulty, '1000.5');
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.payload), true);
});

test('rejects incomplete or mutated work before producing an event', () => {
  const accounting = acceptedInput();
  assert.throws(
    () =>
      createRandomXAcceptedShareEvent({
        eventId: 'randomx-event-missing-height',
        accounting: { ...accounting, job: { ...accounting.job, height: undefined } },
      }),
    /requires a uint64 job height/,
  );
  assert.throws(
    () =>
      createRandomXAcceptedShareEvent({
        eventId: 'randomx-event-mutated-blob',
        accounting: {
          ...accounting,
          job: { ...accounting.job, blob: `01${accounting.job.blob.slice(2)}` },
        },
      }),
    /fingerprint does not match/,
  );
  assert.throws(
    () =>
      createRandomXAcceptedShareEvent({
        eventId: 'randomx-event-upstream-rejected',
        accounting: { ...accounting, upstream: { ...accounting.upstream, accepted: false } },
      }),
    /requires upstream acceptance/,
  );
  assert.throws(
    () =>
      createRandomXAcceptedShareEvent({
        eventId: 'randomx-event-empty-causation',
        causationId: '',
        accounting,
      }),
    /causation id is invalid/,
  );
});
