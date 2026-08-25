/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { projectRandomXAcceptedContribution } from './accounting-projection.js';
import type { RandomXAccountingProjectionInput } from './accounting-projection.js';
import { randomXShareFingerprint } from './validator.js';

const result = `${'00'.repeat(24)}0100000000000000`;
const job = {
  id: 'randomx-job-1',
  clientId: 'randomx-session-client-1',
  algorithm: 'rx/0' as const,
  blob: '00'.repeat(76),
  target: '0200000000000000',
  seedHash: '11'.repeat(32),
  height: 123n,
  receivedAt: new Date('2026-08-25T01:00:00.000Z'),
  expiresAt: new Date('2026-08-25T01:02:00.000Z'),
};
const submission = {
  workerName: 'xmr_account.worker_1',
  jobId: 'randomx-job-1',
  nonce: '78563412',
  result,
  submittedAt: new Date('2026-08-25T01:01:00.000Z'),
};
const baseInput: RandomXAccountingProjectionInput = {
  miningAccountId: 'account-randomx-1',
  assetId: 'asset-xmr',
  correlationId: 'correlation-randomx-1',
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
    upstreamPoolId: 'xmr-primary',
    upstreamSessionId: 'xmr-upstream-session-1',
    decidedAt: new Date('2026-08-25T01:01:01.000Z'),
    sourceDigest: '33'.repeat(32),
  },
};

test('projects only locally verified and upstream-accepted RandomX evidence', () => {
  const evidence = projectRandomXAcceptedContribution(baseInput);
  assert.equal(evidence.algorithm, 'rx/0');
  assert.equal(evidence.acceptedDifficulty, '1000.5');
  assert.equal(evidence.target, '2');
  assert.equal(evidence.computedResult, result);
  assert.equal(evidence.upstreamSessionId, 'xmr-upstream-session-1');
  assert.match(evidence.validationDigest, /^[0-9a-f]{64}$/);
  assert.match(evidence.sourceDigest, /^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(evidence), true);
});

test('projection is deterministic and binds accounting-relevant identities', () => {
  const first = projectRandomXAcceptedContribution(baseInput);
  const retry = projectRandomXAcceptedContribution(baseInput);
  assert.equal(retry.sourceDigest, first.sourceDigest);
  assert.notEqual(
    projectRandomXAcceptedContribution({
      ...baseInput,
      upstream: { ...baseInput.upstream, upstreamSessionId: 'xmr-upstream-session-2' },
    }).sourceDigest,
    first.sourceDigest,
  );
  assert.notEqual(
    projectRandomXAcceptedContribution({ ...baseInput, acceptedDifficulty: '1001' }).sourceDigest,
    first.sourceDigest,
  );
});

test('fails closed for rejected, mismatched, stale, or malformed accounting evidence', () => {
  const invalidInputs: RandomXAccountingProjectionInput[] = [
    { ...baseInput, validation: { ...baseInput.validation, accepted: false } },
    { ...baseInput, upstream: { ...baseInput.upstream, accepted: false } },
    { ...baseInput, validation: { ...baseInput.validation, hash: '44'.repeat(32) } },
    { ...baseInput, validation: { ...baseInput.validation, target: 3n } },
    { ...baseInput, validation: { ...baseInput.validation, fingerprint: '22'.repeat(32) } },
    { ...baseInput, submission: { ...baseInput.submission, jobId: 'another-job' } },
    {
      ...baseInput,
      submission: {
        ...baseInput.submission,
        submittedAt: new Date('2026-08-25T01:03:00.000Z'),
      },
    },
    { ...baseInput, acceptedDifficulty: '0' },
    { ...baseInput, acceptedDifficulty: '1.0000000000001' },
    { ...baseInput, upstream: { ...baseInput.upstream, sourceDigest: 'not-a-digest' } },
  ];
  for (const input of invalidInputs) {
    assert.throws(() => projectRandomXAcceptedContribution(input), /RandomX accounting/);
  }
});
