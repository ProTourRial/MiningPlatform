/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  prisma,
  type Prisma,
  type RandomXAcceptedShareEvidence as StoredRandomXAcceptedShareEvidence,
} from '@mining/database';
import {
  projectRandomXAcceptedContribution,
  type RandomXAcceptedContributionEvidence,
  type RandomXAccountingProjectionInput,
} from '@mining/randomx';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function sameDate(stored: Date, projected: string): boolean {
  return stored.toISOString() === projected;
}

function assertEquivalent(
  stored: StoredRandomXAcceptedShareEvidence,
  projected: RandomXAcceptedContributionEvidence,
): void {
  if (
    stored.evidenceVersion !== projected.evidenceVersion ||
    stored.algorithm !== projected.algorithm ||
    stored.sourceDigest !== projected.sourceDigest ||
    stored.shareFingerprint !== projected.shareFingerprint ||
    stored.miningAccountId !== projected.miningAccountId ||
    stored.assetId !== projected.assetId ||
    stored.upstreamPoolId !== projected.upstreamPoolId ||
    stored.upstreamSessionId !== projected.upstreamSessionId ||
    stored.upstreamJobId !== projected.upstreamJobId ||
    stored.upstreamClientId !== projected.upstreamClientId ||
    stored.workerName !== projected.workerName ||
    stored.seedHash !== projected.seedHash ||
    stored.targetHex !== projected.targetHex ||
    stored.target.toFixed(0) !== projected.target ||
    stored.nonce !== projected.nonce ||
    stored.submittedResult !== projected.submittedResult ||
    stored.computedResult !== projected.computedResult ||
    stored.acceptedDifficulty.toString() !== projected.acceptedDifficulty ||
    !sameDate(stored.jobReceivedAt, projected.jobReceivedAt) ||
    !sameDate(stored.jobExpiresAt, projected.jobExpiresAt) ||
    !sameDate(stored.submittedAt, projected.submittedAt) ||
    !sameDate(stored.acceptedAt, projected.acceptedAt) ||
    stored.correlationId !== projected.correlationId ||
    stored.validationDigest !== projected.validationDigest ||
    stored.upstreamDecisionDigest !== projected.upstreamDecisionDigest
  ) {
    throw new Error('RandomX accounting evidence idempotency conflict');
  }
}

function persistenceData(projected: RandomXAcceptedContributionEvidence) {
  return {
    evidenceVersion: projected.evidenceVersion,
    sourceDigest: projected.sourceDigest,
    shareFingerprint: projected.shareFingerprint,
    algorithm: projected.algorithm,
    miningAccountId: projected.miningAccountId,
    assetId: projected.assetId,
    upstreamPoolId: projected.upstreamPoolId,
    upstreamSessionId: projected.upstreamSessionId,
    upstreamJobId: projected.upstreamJobId,
    upstreamClientId: projected.upstreamClientId,
    workerName: projected.workerName,
    seedHash: projected.seedHash,
    targetHex: projected.targetHex,
    target: projected.target,
    nonce: projected.nonce,
    submittedResult: projected.submittedResult,
    computedResult: projected.computedResult,
    acceptedDifficulty: projected.acceptedDifficulty,
    jobReceivedAt: new Date(projected.jobReceivedAt),
    jobExpiresAt: new Date(projected.jobExpiresAt),
    submittedAt: new Date(projected.submittedAt),
    acceptedAt: new Date(projected.acceptedAt),
    correlationId: projected.correlationId,
    validationDigest: projected.validationDigest,
    upstreamDecisionDigest: projected.upstreamDecisionDigest,
  } as const;
}

export class RandomXAccountingEvidenceRepository {
  async recordAcceptedShare(
    input: RandomXAccountingProjectionInput,
    database: Pick<Prisma.TransactionClient, 'randomXAcceptedShareEvidence'> = prisma,
  ): Promise<StoredRandomXAcceptedShareEvidence> {
    const projected = projectRandomXAcceptedContribution(input);
    const existing = await database.randomXAcceptedShareEvidence.findUnique({
      where: { sourceDigest: projected.sourceDigest },
    });
    if (existing) {
      assertEquivalent(existing, projected);
      return existing;
    }

    try {
      return await database.randomXAcceptedShareEvidence.create({
        data: persistenceData(projected),
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await database.randomXAcceptedShareEvidence.findUnique({
        where: { sourceDigest: projected.sourceDigest },
      });
      if (raced) {
        assertEquivalent(raced, projected);
        return raced;
      }
      const fingerprintConflict = await database.randomXAcceptedShareEvidence.findUnique({
        where: { shareFingerprint: projected.shareFingerprint },
      });
      if (fingerprintConflict) {
        throw new Error('RandomX share fingerprint is already bound to different evidence');
      }
      throw new Error('RandomX accounting evidence uniqueness conflict');
    }
  }
}
