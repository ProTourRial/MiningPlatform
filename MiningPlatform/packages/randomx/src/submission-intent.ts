/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import type { RandomXJob, RandomXShareSubmission, RandomXValidationResult } from './types.js';
import {
  applyRandomXNonce,
  parseRandomXTarget,
  randomXShareFingerprint,
  randomXUpstreamDispatchFingerprint,
} from './validator.js';

const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const MAXIMUM_IDENTIFIER_LENGTH = 256;
const MAX_UINT64 = 0xffff_ffff_ffff_ffffn;
const DIFFICULTY_SCALE = 12;

export type RandomXSubmissionIntentProjectionInput = {
  miningAccountId: string;
  assetId: string;
  upstreamPoolId: string;
  upstreamSessionId: string;
  correlationId: string;
  acceptedDifficulty: string;
  job: RandomXJob;
  submission: RandomXShareSubmission;
  validation: RandomXValidationResult;
};

export type RandomXUpstreamJobEvidenceProjection = Readonly<{
  algorithm: 'rx/0';
  assetId: string;
  upstreamPoolId: string;
  upstreamSessionId: string;
  upstreamJobId: string;
  upstreamClientId: string;
  jobBlob: string;
  seedHash: string;
  targetHex: string;
  height: string;
  receivedAt: string;
  expiresAt: string;
  sourceDigest: string;
}>;

export type RandomXShareSubmissionIntentProjection = Readonly<{
  idempotencyKey: string;
  sourceDigest: string;
  shareFingerprint: string;
  upstreamDispatchFingerprint: string;
  miningAccountId: string;
  assetId: string;
  upstreamPoolId: string;
  workerName: string;
  nonce: string;
  submittedResult: string;
  computedResult: string;
  localTarget: string;
  acceptedDifficulty: string;
  submittedAt: string;
  correlationId: string;
  validationDigest: string;
  job: RandomXUpstreamJobEvidenceProjection;
}>;

function boundedIdentifier(value: string, label: string): string {
  if (
    value.length === 0 ||
    value.length > MAXIMUM_IDENTIFIER_LENGTH ||
    value !== value.trim() ||
    [...value].some((character) => character.charCodeAt(0) < 0x20)
  ) {
    throw new Error(`RandomX submission intent ${label} is invalid`);
  }
  return value;
}

function exactDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`RandomX submission intent ${label} is invalid`);
  }
  return value;
}

function normalizeDifficulty(value: string): string {
  if (value.length > 128) throw new Error('RandomX submission intent difficulty is invalid');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  const fraction = match?.[2] ?? '';
  if (!match || fraction.length > DIFFICULTY_SCALE) {
    throw new Error('RandomX submission intent difficulty is invalid');
  }
  const whole = (match[1] ?? '').replace(/^0+(?=\d)/, '');
  const trimmedFraction = fraction.replace(/0+$/, '');
  const normalized = trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  const scaled = BigInt(`${whole}${fraction.padEnd(DIFFICULTY_SCALE, '0')}`);
  if (scaled <= 0n) throw new Error('RandomX submission intent difficulty must be positive');
  return normalized;
}

function digestParts(parts: readonly string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(String(Buffer.byteLength(part, 'utf8')));
    hash.update(':');
    hash.update(part);
    hash.update(';');
  }
  return hash.digest('hex');
}

export function projectRandomXSubmissionIntent(
  input: RandomXSubmissionIntentProjectionInput,
): RandomXShareSubmissionIntentProjection {
  const miningAccountId = boundedIdentifier(input.miningAccountId, 'mining account');
  const assetId = boundedIdentifier(input.assetId, 'asset');
  const upstreamPoolId = boundedIdentifier(input.upstreamPoolId, 'upstream pool');
  const upstreamSessionId = boundedIdentifier(input.upstreamSessionId, 'upstream session');
  const correlationId = boundedIdentifier(input.correlationId, 'correlation id');
  const upstreamJobId = boundedIdentifier(input.job.id, 'upstream job');
  const upstreamClientId = boundedIdentifier(input.job.clientId, 'upstream client');
  const workerName = boundedIdentifier(input.submission.workerName, 'worker name');
  const acceptedDifficulty = normalizeDifficulty(input.acceptedDifficulty);

  if (input.job.algorithm !== 'rx/0') {
    throw new Error('RandomX submission intent algorithm is unsupported');
  }
  const height = input.job.height;
  if (height === undefined || height < 0n || height > MAX_UINT64) {
    throw new Error('RandomX submission intent requires a uint64 job height');
  }
  if (input.submission.jobId !== input.job.id) {
    throw new Error('RandomX submission intent is bound to another job');
  }
  if (input.job.clientId !== upstreamSessionId) {
    throw new Error('RandomX submission intent is bound to another upstream session');
  }
  if (!input.validation.accepted || input.validation.reason !== 'ACCEPTED') {
    throw new Error('RandomX submission intent requires accepted local validation');
  }

  applyRandomXNonce(input.job.blob, '00000000');
  const jobBlob = input.job.blob.toLowerCase();
  const seedHash = input.job.seedHash.toLowerCase();
  const targetHex = input.job.target.toLowerCase();
  const shareFingerprint = input.validation.fingerprint.toLowerCase();
  const nonce = input.submission.nonce.toLowerCase();
  const submittedResult = input.submission.result.toLowerCase();
  const computedResult = input.validation.hash?.toLowerCase() ?? '';
  if (
    !HASH_PATTERN.test(seedHash) ||
    !HASH_PATTERN.test(shareFingerprint) ||
    !HASH_PATTERN.test(submittedResult) ||
    !HASH_PATTERN.test(computedResult) ||
    !/^[0-9a-f]{8}$/.test(nonce)
  ) {
    throw new Error('RandomX submission intent cryptographic evidence is invalid');
  }
  if (shareFingerprint !== randomXShareFingerprint(input.job, input.submission)) {
    throw new Error('RandomX submission intent fingerprint does not match the work');
  }
  if (computedResult !== submittedResult) {
    throw new Error('RandomX submission intent computed result does not match submission');
  }
  const localTarget = parseRandomXTarget(targetHex);
  if (input.validation.target !== localTarget) {
    throw new Error('RandomX submission intent local target does not match validation');
  }

  const receivedAt = exactDate(input.job.receivedAt, 'job received time');
  const expiresAt = exactDate(input.job.expiresAt, 'job expiry time');
  const submittedAt = exactDate(input.submission.submittedAt, 'submission time');
  if (receivedAt.getTime() > submittedAt.getTime() || submittedAt.getTime() > expiresAt.getTime()) {
    throw new Error('RandomX submission intent timestamp order is invalid');
  }
  const upstreamDispatchFingerprint = randomXUpstreamDispatchFingerprint(
    upstreamPoolId,
    input.job,
    input.submission,
  );

  const jobWithoutDigest = {
    algorithm: 'rx/0' as const,
    assetId,
    upstreamPoolId,
    upstreamSessionId,
    upstreamJobId,
    upstreamClientId,
    jobBlob,
    seedHash,
    targetHex,
    height: height.toString(),
    receivedAt: receivedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const job = Object.freeze({
    ...jobWithoutDigest,
    sourceDigest: digestParts([
      'randomx-upstream-job-evidence-v1',
      ...Object.values(jobWithoutDigest).map(String),
    ]),
  });
  const validationDigest = digestParts([
    'randomx-local-validation-v1',
    shareFingerprint,
    seedHash,
    targetHex,
    nonce,
    submittedResult,
    computedResult,
    localTarget.toString(),
  ]);
  const intentWithoutDigest = {
    shareFingerprint,
    upstreamDispatchFingerprint,
    miningAccountId,
    assetId,
    upstreamPoolId,
    workerName,
    nonce,
    submittedResult,
    computedResult,
    localTarget: localTarget.toString(),
    acceptedDifficulty,
    submittedAt: submittedAt.toISOString(),
    correlationId,
    validationDigest,
    jobSourceDigest: job.sourceDigest,
  };
  return Object.freeze({
    idempotencyKey: `randomx-intent:${upstreamDispatchFingerprint}`,
    sourceDigest: digestParts([
      'randomx-share-submission-intent-v1',
      ...Object.values(intentWithoutDigest).map(String),
    ]),
    shareFingerprint,
    upstreamDispatchFingerprint,
    miningAccountId,
    assetId,
    upstreamPoolId,
    workerName,
    nonce,
    submittedResult,
    computedResult,
    localTarget: localTarget.toString(),
    acceptedDifficulty,
    submittedAt: submittedAt.toISOString(),
    correlationId,
    validationDigest,
    job,
  });
}
