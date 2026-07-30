import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateHeaderHash, sha256d } from './bitcoin-header.js';
import { DIFFICULTY_ONE_TARGET, targetFromCompactBits } from './difficulty.js';
import { InMemoryDuplicateShareStore } from './duplicate-store.js';
import { bytesToHex, hexToBytes, reverseBytes } from './hex.js';
import { calculateHashrateWindow } from './hashrate.js';
import { BitcoinShareValidationService } from './share-validation-service.js';
import { createDevelopmentJob } from './testing/dev-job.js';
import type { BitcoinShareSubmission } from './types.js';

function findAcceptedSubmission(job: ReturnType<typeof createDevelopmentJob>): BitcoinShareSubmission {
  for (let nonce = 0; nonce < 2_000_000; nonce += 1) {
    const submission: BitcoinShareSubmission = {
      workerName: 'demo.worker1',
      jobId: job.id,
      extranonce2: '00000001',
      networkTime: job.networkTime,
      nonce: nonce.toString(16).padStart(8, '0'),
      submittedAt: job.receivedAt,
    };
    const hash = calculateHeaderHash(job, submission);
    const target = DIFFICULTY_ONE_TARGET * 1_000_000n;
    if (hash.numericValue <= target) return submission;
  }
  throw new Error('Could not find a development share within the search limit');
}


test('matches the Bitcoin genesis block header hash', () => {
  const header = hexToBytes(
    '01000000' +
      '00'.repeat(32) +
      '3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a' +
      '29ab5f49' +
      'ffff001d' +
      '1dac2b7c',
  );
  const displayHash = bytesToHex(reverseBytes(sha256d(header)));
  assert.equal(displayHash, '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f');
});

test('decodes Bitcoin difficulty-one compact target', () => {
  assert.equal(targetFromCompactBits('1d00ffff'), DIFFICULTY_ONE_TARGET);
});

test('accepts a valid low-difficulty development share and rejects its duplicate', async () => {
  const now = new Date('2026-07-30T09:00:00.000Z');
  const job = createDevelopmentJob(now);
  const submission = findAcceptedSubmission(job);
  const validator = new BitcoinShareValidationService(new InMemoryDuplicateShareStore(() => now.getTime()), () => now);
  const context = {
    sessionId: 'session-1',
    workerId: 'worker-1',
    authorizedWorkerName: 'demo.worker1',
    job,
    submission,
  };

  const accepted = await validator.validate(context);
  assert.equal(accepted.accepted, true);
  if (accepted.accepted) assert.equal(accepted.headerHash.length, 64);

  const duplicate = await validator.validate(context);
  assert.equal(duplicate.accepted, false);
  if (!duplicate.accepted) assert.equal(duplicate.code, 'DUPLICATE');
});

test('rejects expired jobs', async () => {
  const receivedAt = new Date('2026-07-30T09:00:00.000Z');
  const job = createDevelopmentJob(receivedAt);
  const submission = findAcceptedSubmission(job);
  const validator = new BitcoinShareValidationService(
    new InMemoryDuplicateShareStore(() => job.expiresAt.getTime() + 1),
    () => new Date(job.expiresAt.getTime() + 1),
  );
  const result = await validator.validate({
    sessionId: 'session-1',
    workerId: 'worker-1',
    authorizedWorkerName: submission.workerName,
    job,
    submission,
  });
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.equal(result.code, 'STALE');
});

test('calculates hashrate from accepted difficulty', () => {
  const at = new Date('2026-07-30T09:00:00.000Z');
  const result = calculateHashrateWindow(
    [
      { difficulty: '1', acceptedAt: new Date(at.getTime() - 10_000) },
      { difficulty: '2', acceptedAt: new Date(at.getTime() - 20_000) },
    ],
    60,
    at,
  );
  assert.equal(result.shareCount, 2);
  assert.equal(result.accumulatedDifficulty, '3');
  assert.equal(result.hashesPerSecond, '214748364');
});

test('calculates hashrate from an aggregated difficulty bucket', async () => {
  const { calculateHashrateFromAccumulatedDifficulty } = await import('./hashrate.js');
  const result = calculateHashrateFromAccumulatedDifficulty('3', 2, 60);
  assert.equal(result.shareCount, 2);
  assert.equal(result.accumulatedDifficulty, '3');
  assert.equal(result.hashesPerSecond, '214748364');
});
