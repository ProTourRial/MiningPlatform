/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRandomXNonce,
  parseRandomXTarget,
  RandomXServiceClient,
  RandomXShareValidator,
  randomXHashMeetsTarget,
  randomXJobFingerprint,
  randomXTargetDifficulty,
  randomXUpstreamDispatchFingerprint,
  type RandomXJob,
} from './index.js';

const baseJob: RandomXJob = {
  id: 'job-1',
  clientId: 'pool-session-1',
  algorithm: 'rx/0',
  blob: '00'.repeat(80),
  target: 'ffffffffffffffff',
  seedHash: '11'.repeat(32),
  receivedAt: new Date('2026-08-22T10:00:00.000Z'),
  expiresAt: new Date('2026-08-22T10:01:00.000Z'),
};

test('parses XMRig little-endian 64-bit and expanded 32-bit targets', () => {
  assert.equal(parseRandomXTarget('0100000000000000'), 1n);
  assert.equal(parseRandomXTarget('ffffffffffffffff'), 0xffff_ffff_ffff_ffffn);
  assert.equal(parseRandomXTarget('ffffff7f'), 0x7fff_ffff_ffff_ffffn);
  assert.throws(() => parseRandomXTarget('00000000'), /non-zero/);
});

test('derives deterministic conservative difficulty from the authoritative target', () => {
  assert.equal(randomXTargetDifficulty(0xffff_ffff_ffff_ffffn), '1');
  assert.equal(randomXTargetDifficulty(2n), '9223372036854775807.5');
  assert.equal(randomXTargetDifficulty(3n), '6148914691236517205');
  assert.throws(() => randomXTargetDifficulty(0n), /outside uint64/);
});

test('fingerprints the complete immutable RandomX job lease', () => {
  const fingerprint = randomXJobFingerprint(baseJob);
  assert.equal(
    randomXJobFingerprint({
      ...baseJob,
      receivedAt: new Date(baseJob.receivedAt),
      expiresAt: new Date(baseJob.expiresAt),
    }),
    fingerprint,
  );
  assert.notEqual(randomXJobFingerprint({ ...baseJob, target: '0300000000000000' }), fingerprint);
  assert.notEqual(
    randomXJobFingerprint({
      ...baseJob,
      expiresAt: new Date(baseJob.expiresAt.getTime() + 1),
    }),
    fingerprint,
  );
  assert.throws(
    () => randomXJobFingerprint({ ...baseJob, receivedAt: new Date(Number.NaN) }),
    /time is invalid/,
  );
});

test('fingerprints the upstream wire proof independently from local attribution metadata', () => {
  const submission = {
    workerName: 'account.cpu-1',
    jobId: baseJob.id,
    nonce: '78563412',
    result: '22'.repeat(32),
    submittedAt: new Date('2026-08-22T10:00:30.000Z'),
  };
  const fingerprint = randomXUpstreamDispatchFingerprint('pool-1', baseJob, submission);
  assert.equal(
    randomXUpstreamDispatchFingerprint('pool-1', baseJob, {
      ...submission,
      workerName: 'another-account.cpu-9#MP05',
      submittedAt: new Date('2026-08-22T10:00:45.000Z'),
    }),
    fingerprint,
  );
  assert.notEqual(randomXUpstreamDispatchFingerprint('pool-2', baseJob, submission), fingerprint);
  assert.notEqual(
    randomXUpstreamDispatchFingerprint('pool-1', baseJob, {
      ...submission,
      nonce: '00000000',
    }),
    fingerprint,
  );
});

test('applies a four-byte nonce at the XMRig CryptoNote offset', () => {
  const updated = applyRandomXNonce(baseJob.blob, '78563412');
  assert.equal(updated.slice(39 * 2, 43 * 2), '78563412');
  assert.equal(updated.length, baseJob.blob.length);
  assert.throws(() => applyRandomXNonce('00'.repeat(42), '00000000'), /bounds/);
});

test('compares the final hash word as little-endian with a strict target', () => {
  assert.equal(randomXHashMeetsTarget(`${'00'.repeat(24)}0100000000000000`, 2n), true);
  assert.equal(randomXHashMeetsTarget(`${'00'.repeat(24)}0200000000000000`, 2n), false);
});

test('accepts only a sidecar-recomputed result that meets the pool target', async () => {
  const result = `${'00'.repeat(24)}0100000000000000`;
  const validator = new RandomXShareValidator({ hash: async () => result });
  const accepted = await validator.validate(
    { ...baseJob, target: '0200000000000000' },
    {
      workerName: 'account.worker',
      jobId: baseJob.id,
      nonce: '01000000',
      result,
      submittedAt: new Date('2026-08-22T10:00:30.000Z'),
    },
    new Date('2026-08-22T10:00:30.000Z'),
  );
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.reason, 'ACCEPTED');

  const mismatched = await validator.validate(
    baseJob,
    {
      workerName: 'account.worker',
      jobId: baseJob.id,
      nonce: '01000000',
      result: '22'.repeat(32),
      submittedAt: new Date('2026-08-22T10:00:30.000Z'),
    },
    new Date('2026-08-22T10:00:30.000Z'),
  );
  assert.equal(mismatched.reason, 'HASH_MISMATCH');
});

test('fails closed when the RandomX sidecar is unavailable or the job is stale', async () => {
  const validator = new RandomXShareValidator({
    hash: async () => {
      throw new Error('offline');
    },
  });
  const submission = {
    workerName: 'account.worker',
    jobId: baseJob.id,
    nonce: '00000000',
    result: '00'.repeat(32),
    submittedAt: new Date('2026-08-22T10:00:30.000Z'),
  };
  assert.equal(
    (await validator.validate(baseJob, submission, new Date('2026-08-22T10:00:30.000Z'))).reason,
    'VALIDATION_UNAVAILABLE',
  );
  assert.equal(
    (await validator.validate(baseJob, submission, new Date('2026-08-22T10:02:00.000Z'))).reason,
    'STALE_JOB',
  );
});

test('RandomX service client binds the seed and rejects oversized or invalid responses', async () => {
  let request: Request | undefined;
  const client = new RandomXServiceClient({
    url: 'http://127.0.0.1:18081',
    fetchImplementation: async (input, init) => {
      request = new Request(input, init);
      return new Response('aa'.repeat(32), { status: 200 });
    },
  });
  assert.equal(await client.hash('00'.repeat(80), '11'.repeat(32)), 'aa'.repeat(32));
  assert.equal(request?.headers.get('randomx-seed'), '11'.repeat(32));
  assert.equal(request?.headers.get('content-type'), 'application/x.randomx+hex');
  assert.equal(await request?.text(), '00'.repeat(80));

  const invalid = new RandomXServiceClient({
    url: 'https://randomx.invalid',
    fetchImplementation: async () => new Response('not-a-hash', { status: 200 }),
  });
  await assert.rejects(invalid.hash('00', '11'.repeat(32)), /invalid hash/);
  assert.throws(
    () => new RandomXServiceClient({ url: 'http://randomx.invalid' }),
    /requires HTTPS/,
  );
});
