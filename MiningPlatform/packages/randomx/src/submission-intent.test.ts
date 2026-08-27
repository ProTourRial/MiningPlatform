/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { projectRandomXAcceptedContribution } from './accounting-projection.js';
import { projectRandomXSubmissionIntent } from './submission-intent.js';
import type { RandomXAccountingProjectionInput } from './accounting-projection.js';
import { randomXShareFingerprint } from './validator.js';

function accountingInput(): RandomXAccountingProjectionInput {
  const result = `${'00'.repeat(24)}0100000000000000`;
  const job = {
    id: 'randomx-intent-job',
    clientId: 'randomx-intent-session',
    algorithm: 'rx/0' as const,
    blob: '00'.repeat(76),
    target: '0200000000000000',
    seedHash: '11'.repeat(32),
    height: 3_500_001n,
    receivedAt: new Date('2026-08-26T06:00:00.000Z'),
    expiresAt: new Date('2026-08-26T06:02:00.000Z'),
  };
  const submission = {
    workerName: 'randomx_intent.cpu-1',
    jobId: job.id,
    nonce: '78563412',
    result,
    submittedAt: new Date('2026-08-26T06:01:00.000Z'),
  };
  return {
    miningAccountId: 'randomx-intent-account',
    assetId: 'randomx-intent-asset',
    correlationId: 'randomx-intent-correlation',
    acceptedDifficulty: '500.250000000000',
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
      upstreamPoolId: 'randomx-intent-pool',
      upstreamSessionId: 'randomx-intent-session',
      decidedAt: new Date('2026-08-26T06:01:01.000Z'),
      sourceDigest: '33'.repeat(32),
    },
  };
}

test('projects deterministic pre-RPC job and local submission intent evidence', () => {
  const accounting = accountingInput();
  const intent = projectRandomXSubmissionIntent({
    miningAccountId: accounting.miningAccountId,
    assetId: accounting.assetId,
    upstreamPoolId: accounting.upstream.upstreamPoolId,
    upstreamSessionId: accounting.upstream.upstreamSessionId,
    correlationId: accounting.correlationId,
    acceptedDifficulty: accounting.acceptedDifficulty,
    job: accounting.job,
    submission: accounting.submission,
    validation: accounting.validation,
  });
  const accepted = projectRandomXAcceptedContribution(accounting);

  assert.equal(intent.idempotencyKey, `randomx-intent:${intent.upstreamDispatchFingerprint}`);
  assert.match(intent.upstreamDispatchFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(intent.acceptedDifficulty, '500.25');
  assert.equal(intent.job.height, '3500001');
  assert.equal(intent.validationDigest, accepted.validationDigest);
  assert.match(intent.job.sourceDigest, /^[0-9a-f]{64}$/);
  assert.match(intent.sourceDigest, /^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(intent), true);
  assert.deepEqual(
    projectRandomXSubmissionIntent({
      miningAccountId: accounting.miningAccountId,
      assetId: accounting.assetId,
      upstreamPoolId: accounting.upstream.upstreamPoolId,
      upstreamSessionId: accounting.upstream.upstreamSessionId,
      correlationId: accounting.correlationId,
      acceptedDifficulty: accounting.acceptedDifficulty,
      job: accounting.job,
      submission: accounting.submission,
      validation: accounting.validation,
    }),
    intent,
  );
});

test('fails closed before intent projection when local evidence is incomplete or stale', () => {
  const accounting = accountingInput();
  assert.throws(
    () =>
      projectRandomXSubmissionIntent({
        miningAccountId: accounting.miningAccountId,
        assetId: accounting.assetId,
        upstreamPoolId: accounting.upstream.upstreamPoolId,
        upstreamSessionId: accounting.upstream.upstreamSessionId,
        correlationId: accounting.correlationId,
        acceptedDifficulty: accounting.acceptedDifficulty,
        job: { ...accounting.job, height: undefined },
        submission: accounting.submission,
        validation: accounting.validation,
      }),
    /requires a uint64 job height/,
  );
  assert.throws(
    () =>
      projectRandomXSubmissionIntent({
        miningAccountId: accounting.miningAccountId,
        assetId: accounting.assetId,
        upstreamPoolId: accounting.upstream.upstreamPoolId,
        upstreamSessionId: accounting.upstream.upstreamSessionId,
        correlationId: accounting.correlationId,
        acceptedDifficulty: accounting.acceptedDifficulty,
        job: accounting.job,
        submission: accounting.submission,
        validation: { ...accounting.validation, accepted: false },
      }),
    /requires accepted local validation/,
  );
});
