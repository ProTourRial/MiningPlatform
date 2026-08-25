/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import { parseRandomXTarget, randomXShareFingerprint } from './validator.js';
import type { RandomXJob, RandomXShareSubmission, RandomXValidationResult } from './types.js';

const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const MAXIMUM_IDENTIFIER_LENGTH = 256;
const ACCOUNTING_DIFFICULTY_SCALE = 12;

export type RandomXUpstreamAcceptance = {
  accepted: boolean;
  upstreamPoolId: string;
  upstreamSessionId: string;
  decidedAt: Date;
  sourceDigest: string;
};

export type RandomXAccountingProjectionInput = {
  miningAccountId: string;
  assetId: string;
  correlationId: string;
  acceptedDifficulty: string;
  job: RandomXJob;
  submission: RandomXShareSubmission;
  validation: RandomXValidationResult;
  upstream: RandomXUpstreamAcceptance;
};

export type RandomXAcceptedContributionEvidence = Readonly<{
  evidenceVersion: 1;
  algorithm: 'rx/0';
  miningAccountId: string;
  assetId: string;
  upstreamPoolId: string;
  upstreamSessionId: string;
  upstreamJobId: string;
  upstreamClientId: string;
  workerName: string;
  shareFingerprint: string;
  seedHash: string;
  targetHex: string;
  target: string;
  nonce: string;
  submittedResult: string;
  computedResult: string;
  acceptedDifficulty: string;
  jobReceivedAt: string;
  jobExpiresAt: string;
  submittedAt: string;
  acceptedAt: string;
  correlationId: string;
  validationDigest: string;
  upstreamDecisionDigest: string;
  sourceDigest: string;
}>;

function boundedIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > MAXIMUM_IDENTIFIER_LENGTH ||
    [...normalized].some((character) => character.charCodeAt(0) < 0x20)
  ) {
    throw new Error(`RandomX accounting ${label} is invalid`);
  }
  return normalized;
}

function exactDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`RandomX accounting ${label} is invalid`);
  }
  return value;
}

function normalizeDifficulty(value: string): string {
  if (value.length > 128) throw new Error('RandomX accounting difficulty is invalid');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  const fraction = match?.[2] ?? '';
  if (!match || fraction.length > ACCOUNTING_DIFFICULTY_SCALE) {
    throw new Error('RandomX accounting difficulty is invalid');
  }
  const whole = (match[1] ?? '').replace(/^0+(?=\d)/, '');
  const trimmedFraction = fraction.replace(/0+$/, '');
  const normalized = trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  const scaled = BigInt(`${whole}${fraction.padEnd(ACCOUNTING_DIFFICULTY_SCALE, '0')}`);
  if (scaled <= 0n) throw new Error('RandomX accounting difficulty must be greater than zero');
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

export function projectRandomXAcceptedContribution(
  input: RandomXAccountingProjectionInput,
): RandomXAcceptedContributionEvidence {
  const miningAccountId = boundedIdentifier(input.miningAccountId, 'mining account');
  const assetId = boundedIdentifier(input.assetId, 'asset');
  const correlationId = boundedIdentifier(input.correlationId, 'correlation id');
  const upstreamPoolId = boundedIdentifier(input.upstream.upstreamPoolId, 'upstream pool');
  const upstreamSessionId = boundedIdentifier(input.upstream.upstreamSessionId, 'upstream session');
  const upstreamJobId = boundedIdentifier(input.job.id, 'upstream job');
  const upstreamClientId = boundedIdentifier(input.job.clientId, 'upstream client');
  const workerName = boundedIdentifier(input.submission.workerName, 'worker name');
  const acceptedDifficulty = normalizeDifficulty(input.acceptedDifficulty);

  if (input.job.algorithm !== 'rx/0')
    throw new Error('RandomX accounting algorithm is unsupported');
  if (input.submission.jobId !== input.job.id) {
    throw new Error('RandomX accounting submission is bound to another job');
  }
  if (!input.validation.accepted || input.validation.reason !== 'ACCEPTED') {
    throw new Error('RandomX accounting requires accepted local validation');
  }
  if (!input.upstream.accepted) {
    throw new Error('RandomX accounting requires upstream acceptance');
  }

  const shareFingerprint = input.validation.fingerprint.toLowerCase();
  const submittedResult = input.submission.result.toLowerCase();
  const computedResult = input.validation.hash?.toLowerCase() ?? '';
  const seedHash = input.job.seedHash.toLowerCase();
  const targetHex = input.job.target.toLowerCase();
  const nonce = input.submission.nonce.toLowerCase();
  const upstreamDecisionDigest = input.upstream.sourceDigest.toLowerCase();
  if (
    !HASH_PATTERN.test(shareFingerprint) ||
    !HASH_PATTERN.test(seedHash) ||
    !HASH_PATTERN.test(submittedResult) ||
    !HASH_PATTERN.test(computedResult) ||
    !HASH_PATTERN.test(upstreamDecisionDigest) ||
    !/^[0-9a-f]{8}$/i.test(nonce) ||
    !/^(?:[0-9a-f]{8}|[0-9a-f]{16})$/i.test(targetHex)
  ) {
    throw new Error('RandomX accounting cryptographic evidence is invalid');
  }
  if (shareFingerprint !== randomXShareFingerprint(input.job, input.submission)) {
    throw new Error('RandomX accounting fingerprint does not match the job and submission');
  }
  if (computedResult !== submittedResult) {
    throw new Error('RandomX accounting computed result does not match the submitted result');
  }
  const target = parseRandomXTarget(targetHex);
  if (input.validation.target !== target) {
    throw new Error('RandomX accounting target does not match local validation');
  }

  const jobReceivedAt = exactDate(input.job.receivedAt, 'job received time');
  const jobExpiresAt = exactDate(input.job.expiresAt, 'job expiry time');
  const submittedAt = exactDate(input.submission.submittedAt, 'submission time');
  const acceptedAt = exactDate(input.upstream.decidedAt, 'upstream decision time');
  if (
    jobReceivedAt.getTime() > submittedAt.getTime() ||
    submittedAt.getTime() > jobExpiresAt.getTime() ||
    submittedAt.getTime() > acceptedAt.getTime()
  ) {
    throw new Error('RandomX accounting timestamp order is invalid');
  }

  const validationDigest = digestParts([
    'randomx-local-validation-v1',
    shareFingerprint,
    seedHash,
    targetHex,
    nonce,
    submittedResult,
    computedResult,
    target.toString(),
  ]);
  const evidenceWithoutDigest = {
    evidenceVersion: 1 as const,
    algorithm: 'rx/0' as const,
    miningAccountId,
    assetId,
    upstreamPoolId,
    upstreamSessionId,
    upstreamJobId,
    upstreamClientId,
    workerName,
    shareFingerprint,
    seedHash,
    targetHex,
    target: target.toString(),
    nonce,
    submittedResult,
    computedResult,
    acceptedDifficulty,
    jobReceivedAt: jobReceivedAt.toISOString(),
    jobExpiresAt: jobExpiresAt.toISOString(),
    submittedAt: submittedAt.toISOString(),
    acceptedAt: acceptedAt.toISOString(),
    correlationId,
    validationDigest,
    upstreamDecisionDigest,
  };
  const sourceDigest = digestParts([
    'randomx-accepted-contribution-v1',
    ...Object.values(evidenceWithoutDigest).map(String),
  ]);
  return Object.freeze({ ...evidenceWithoutDigest, sourceDigest });
}
