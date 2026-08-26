/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  RandomXHasher,
  RandomXJob,
  RandomXShareSubmission,
  RandomXValidationResult,
} from './types.js';

const CRYPTONOTE_NONCE_OFFSET_BYTES = 39;
const CRYPTONOTE_NONCE_BYTES = 4;
const MAX_XMRIG_BLOB_BYTES = 407;
const MAX_UINT32 = 0xffff_ffffn;
const MAX_UINT64 = 0xffff_ffff_ffff_ffffn;

export function randomXShareFingerprint(
  job: RandomXJob,
  submission: RandomXShareSubmission,
): string {
  const hash = createHash('sha256');
  for (const value of [
    'randomx-share-fingerprint-v2',
    job.algorithm,
    job.clientId,
    job.id,
    job.blob,
    job.seedHash,
    job.target,
    job.height?.toString() ?? '',
    submission.workerName,
    submission.nonce,
    submission.result,
  ]) {
    const normalized = value.toLowerCase();
    hash.update(String(Buffer.byteLength(normalized, 'utf8')));
    hash.update(':');
    hash.update(normalized);
    hash.update(';');
  }
  return hash.digest('hex');
}

function readLittleEndian(hex: string): bigint {
  const bytes = Buffer.from(hex, 'hex');
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index] ?? 0);
  }
  return value;
}

export function parseRandomXTarget(targetHex: string): bigint {
  if (!/^(?:[0-9a-f]{8}|[0-9a-f]{16})$/i.test(targetHex)) {
    throw new Error('RandomX target must be exactly 4 or 8 little-endian bytes');
  }
  const rawTarget = readLittleEndian(targetHex);
  if (rawTarget === 0n) throw new Error('RandomX target must be non-zero');
  if (targetHex.length === 16) return rawTarget;

  const divisor = MAX_UINT32 / rawTarget;
  if (divisor === 0n) throw new Error('RandomX compact target is invalid');
  return MAX_UINT64 / divisor;
}

export function applyRandomXNonce(blobHex: string, nonceHex: string): string {
  const minimumBytes = CRYPTONOTE_NONCE_OFFSET_BYTES + CRYPTONOTE_NONCE_BYTES;
  if (
    !/^[0-9a-f]+$/i.test(blobHex) ||
    blobHex.length % 2 !== 0 ||
    blobHex.length / 2 < minimumBytes ||
    blobHex.length / 2 > MAX_XMRIG_BLOB_BYTES
  ) {
    throw new Error('RandomX blob is outside the supported XMRig CryptoNote bounds');
  }
  if (!/^[0-9a-f]{8}$/i.test(nonceHex)) {
    throw new Error('RandomX nonce must be exactly 4 bytes');
  }

  const offset = CRYPTONOTE_NONCE_OFFSET_BYTES * 2;
  return `${blobHex.slice(0, offset)}${nonceHex}${blobHex.slice(
    offset + CRYPTONOTE_NONCE_BYTES * 2,
  )}`.toLowerCase();
}

export function randomXHashMeetsTarget(hashHex: string, target: bigint): boolean {
  if (!/^[0-9a-f]{64}$/i.test(hashHex)) throw new Error('RandomX hash must be exactly 32 bytes');
  if (target <= 0n || target > MAX_UINT64) throw new Error('RandomX target is outside uint64');
  return readLittleEndian(hashHex.slice(48)) < target;
}

function validateJob(job: RandomXJob): void {
  if (!job.id || !job.clientId || job.algorithm !== 'rx/0') throw new Error('Invalid RandomX job');
  if (!/^[0-9a-f]{64}$/i.test(job.seedHash)) throw new Error('Invalid RandomX seed hash');
  parseRandomXTarget(job.target);
  applyRandomXNonce(job.blob, '00000000');
  if (!(job.receivedAt instanceof Date) || !(job.expiresAt instanceof Date)) {
    throw new Error('Invalid RandomX job timestamps');
  }
}

function validateSubmission(submission: RandomXShareSubmission): void {
  if (!submission.workerName || !submission.jobId || !(submission.submittedAt instanceof Date)) {
    throw new Error('Invalid RandomX submission');
  }
  if (!/^[0-9a-f]{8}$/i.test(submission.nonce) || !/^[0-9a-f]{64}$/i.test(submission.result)) {
    throw new Error('Invalid RandomX submission proof');
  }
}

export class RandomXShareValidator {
  constructor(private readonly hasher: RandomXHasher) {}

  async validate(
    job: RandomXJob,
    submission: RandomXShareSubmission,
    now = new Date(),
  ): Promise<RandomXValidationResult> {
    const shareFingerprint = randomXShareFingerprint(job, submission);
    try {
      validateJob(job);
    } catch {
      return { accepted: false, reason: 'INVALID_JOB', fingerprint: shareFingerprint };
    }
    try {
      validateSubmission(submission);
    } catch {
      return { accepted: false, reason: 'INVALID_SUBMISSION', fingerprint: shareFingerprint };
    }
    if (submission.jobId !== job.id || now.getTime() > job.expiresAt.getTime()) {
      return { accepted: false, reason: 'STALE_JOB', fingerprint: shareFingerprint };
    }

    const blob = applyRandomXNonce(job.blob, submission.nonce);
    let computedHash: string;
    try {
      computedHash = await this.hasher.hash(blob, job.seedHash);
    } catch {
      return { accepted: false, reason: 'VALIDATION_UNAVAILABLE', fingerprint: shareFingerprint };
    }

    const submittedHash = Buffer.from(submission.result, 'hex');
    const calculatedHash = Buffer.from(computedHash, 'hex');
    if (
      submittedHash.length !== calculatedHash.length ||
      !timingSafeEqual(submittedHash, calculatedHash)
    ) {
      return { accepted: false, reason: 'HASH_MISMATCH', fingerprint: shareFingerprint };
    }

    const target = parseRandomXTarget(job.target);
    if (!randomXHashMeetsTarget(computedHash, target)) {
      return {
        accepted: false,
        reason: 'LOW_DIFFICULTY',
        fingerprint: shareFingerprint,
        hash: computedHash,
        target,
      };
    }
    return {
      accepted: true,
      reason: 'ACCEPTED',
      fingerprint: shareFingerprint,
      hash: computedHash,
      target,
    };
  }
}
