/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type {
  BitcoinBlockProposalResult,
  BitcoinBlockSubmissionResult,
  BitcoinCoreChain,
  BitcoinSubmittedBlockObservation,
} from '@mining/blockchain-adapters';
import {
  prisma,
  type NativeBitcoinCandidate as StoredNativeBitcoinCandidate,
  type NativeBitcoinProposalEvidence as StoredNativeBitcoinProposalEvidence,
  type NativeBitcoinSubmissionRecoveryObservation as StoredNativeBitcoinSubmissionRecoveryObservation,
  type NativeBitcoinSubmissionIntent as StoredNativeBitcoinSubmissionIntent,
  type NativeBitcoinSubmissionAttempt as StoredNativeBitcoinSubmissionAttempt,
} from '@mining/database';
import type { NativeBitcoinBlockCandidate } from '@mining/bitcoin-template';

const CHAIN = {
  main: 'MAIN',
  test: 'TEST',
  testnet4: 'TESTNET4',
  signet: 'SIGNET',
  regtest: 'REGTEST',
} as const;

function boundedIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 256) {
    throw new Error('Native Bitcoin evidence idempotency key is invalid');
  }
  return normalized;
}

function hash(value: string, field: string): string {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${field} must be a SHA-256 digest`);
  }
  return normalized;
}

function date(value: Date, field: string): Date {
  if (Number.isNaN(value.getTime())) throw new Error(`${field} is invalid`);
  return new Date(value);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function sameDate(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime();
}

function workId(value: string | null): string | null {
  if (value !== null && (value.length === 0 || value.length > 1024)) {
    throw new Error('Native Bitcoin work id is invalid');
  }
  return value;
}

async function databaseNow(): Promise<Date> {
  const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`
    SELECT CURRENT_TIMESTAMP AS "now"
  `;
  if (!clock) throw new Error('Database did not return its current time');
  return clock.now;
}

export type UnresolvedNativeBitcoinSubmissionIntent = StoredNativeBitcoinSubmissionIntent & {
  candidate: StoredNativeBitcoinCandidate;
  proposalEvidence: StoredNativeBitcoinProposalEvidence;
};

export type NativeBitcoinSubmissionIntentRecoveryState = {
  intent: StoredNativeBitcoinSubmissionIntent;
  candidate: StoredNativeBitcoinCandidate;
  submission: StoredNativeBitcoinSubmissionAttempt | null;
  terminalObservation: StoredNativeBitcoinSubmissionRecoveryObservation | null;
};

export class NativeBitcoinEvidenceRepository {
  constructor(private readonly proposalFreshnessMilliseconds = 30_000) {
    if (
      !Number.isInteger(proposalFreshnessMilliseconds) ||
      proposalFreshnessMilliseconds < 1_000 ||
      proposalFreshnessMilliseconds > 300_000
    ) {
      throw new Error(
        'Native Bitcoin proposal freshness must be between one second and five minutes',
      );
    }
  }

  async recordCandidate(input: {
    idempotencyKey: string;
    chain: BitcoinCoreChain;
    candidate: NativeBitcoinBlockCandidate;
  }): Promise<StoredNativeBitcoinCandidate> {
    const idempotencyKey = boundedIdempotencyKey(input.idempotencyKey);
    const candidate = input.candidate;
    if (!/^native-[1-9]\d{0,9}-[0-9a-f]{24}$/.test(candidate.jobId)) {
      throw new Error('Native Bitcoin candidate job id is invalid');
    }
    if (!/^[0-9a-f]{160}$/i.test(candidate.headerHex)) {
      throw new Error('Native Bitcoin candidate header is invalid');
    }
    const data = {
      idempotencyKey,
      chain: CHAIN[input.chain],
      jobId: candidate.jobId,
      templateSourceDigest: hash(candidate.templateSourceDigest, 'Template source digest'),
      coinbasePolicyDigest: hash(candidate.coinbasePolicyDigest, 'Coinbase policy digest'),
      blockHash: hash(candidate.blockHash, 'Block hash'),
      headerHex: candidate.headerHex.toLowerCase(),
      rawBlockDigest: hash(candidate.rawBlockDigest, 'Raw block digest'),
      reconstructedAt: date(candidate.reconstructedAt, 'Candidate reconstruction time'),
    } as const;
    const existing = await prisma.nativeBitcoinCandidate.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (
        existing.chain !== data.chain ||
        existing.jobId !== data.jobId ||
        existing.templateSourceDigest !== data.templateSourceDigest ||
        existing.coinbasePolicyDigest !== data.coinbasePolicyDigest ||
        existing.blockHash !== data.blockHash ||
        existing.headerHex !== data.headerHex ||
        existing.rawBlockDigest !== data.rawBlockDigest ||
        !sameDate(existing.reconstructedAt, data.reconstructedAt)
      ) {
        throw new Error('Native Bitcoin candidate idempotency conflict');
      }
      return existing;
    }
    try {
      return await prisma.nativeBitcoinCandidate.create({ data });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.nativeBitcoinCandidate.findUnique({ where: { idempotencyKey } });
      if (!raced) throw new Error('Native Bitcoin candidate uniqueness conflict');
      return this.recordCandidate(input);
    }
  }

  async findProposalByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<StoredNativeBitcoinProposalEvidence | null> {
    return prisma.nativeBitcoinProposalEvidence.findUnique({
      where: { idempotencyKey: boundedIdempotencyKey(idempotencyKey) },
    });
  }

  async findSubmissionIntentByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<StoredNativeBitcoinSubmissionIntent | null> {
    return prisma.nativeBitcoinSubmissionIntent.findUnique({
      where: { idempotencyKey: boundedIdempotencyKey(idempotencyKey) },
    });
  }

  async findSubmissionByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<StoredNativeBitcoinSubmissionAttempt | null> {
    return prisma.nativeBitcoinSubmissionAttempt.findUnique({
      where: { idempotencyKey: boundedIdempotencyKey(idempotencyKey) },
    });
  }

  async findRecoveryObservationByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<StoredNativeBitcoinSubmissionRecoveryObservation | null> {
    return prisma.nativeBitcoinSubmissionRecoveryObservation.findUnique({
      where: { idempotencyKey: boundedIdempotencyKey(idempotencyKey) },
    });
  }

  async getSubmissionIntentRecoveryState(
    submissionIntentId: string,
  ): Promise<NativeBitcoinSubmissionIntentRecoveryState | null> {
    const state = await prisma.nativeBitcoinSubmissionIntent.findUnique({
      where: { id: submissionIntentId },
      include: {
        candidate: true,
        submission: true,
        recoveryObservations: {
          where: { status: { in: ['ACTIVE_CHAIN', 'STALE_CHAIN'] } },
          orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
          take: 1,
        },
      },
    });
    if (!state) return null;
    const { candidate, submission, recoveryObservations, ...intent } = state;
    return {
      intent,
      candidate,
      submission,
      terminalObservation: recoveryObservations[0] ?? null,
    };
  }

  async recordProposal(input: {
    idempotencyKey: string;
    candidateId: string;
    proposal: BitcoinBlockProposalResult;
  }): Promise<StoredNativeBitcoinProposalEvidence> {
    const idempotencyKey = boundedIdempotencyKey(input.idempotencyKey);
    const candidate = await prisma.nativeBitcoinCandidate.findUnique({
      where: { id: input.candidateId },
    });
    if (!candidate) throw new Error('Native Bitcoin candidate does not exist');
    const proposal = input.proposal;
    const observedAt = date(proposal.observedAt, 'Proposal observation time');
    const data = {
      idempotencyKey,
      candidateId: candidate.id,
      status: proposal.status,
      reason: proposal.reason,
      rawBlockDigest: hash(proposal.rawBlockDigest, 'Proposal raw block digest'),
      sourceDigest: hash(proposal.sourceDigest, 'Proposal source digest'),
      observedAt,
      validUntil: new Date(observedAt.getTime() + this.proposalFreshnessMilliseconds),
    } as const;
    if (data.rawBlockDigest !== candidate.rawBlockDigest) {
      throw new Error('Native Bitcoin proposal does not match the candidate');
    }
    if (
      (data.status === 'VALID' && data.reason !== null) ||
      (data.status === 'REJECTED' && (!data.reason || data.reason.length > 1024))
    ) {
      throw new Error('Native Bitcoin proposal status evidence is inconsistent');
    }
    const existing = await prisma.nativeBitcoinProposalEvidence.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (
        existing.candidateId !== data.candidateId ||
        existing.status !== data.status ||
        existing.reason !== data.reason ||
        existing.rawBlockDigest !== data.rawBlockDigest ||
        existing.sourceDigest !== data.sourceDigest ||
        !sameDate(existing.observedAt, data.observedAt) ||
        !sameDate(existing.validUntil, data.validUntil)
      ) {
        throw new Error('Native Bitcoin proposal idempotency conflict');
      }
      return existing;
    }
    try {
      return await prisma.nativeBitcoinProposalEvidence.create({ data });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.nativeBitcoinProposalEvidence.findUnique({
        where: { idempotencyKey },
      });
      if (!raced) throw new Error('Native Bitcoin proposal uniqueness conflict');
      return this.recordProposal(input);
    }
  }

  async recordSubmission(input: {
    idempotencyKey: string;
    candidateId: string;
    proposalEvidenceId: string;
    submissionIntentId: string;
    submission: BitcoinBlockSubmissionResult;
  }): Promise<StoredNativeBitcoinSubmissionAttempt> {
    const idempotencyKey = boundedIdempotencyKey(input.idempotencyKey);
    const [candidate, proposal, intent] = await Promise.all([
      prisma.nativeBitcoinCandidate.findUnique({ where: { id: input.candidateId } }),
      prisma.nativeBitcoinProposalEvidence.findUnique({
        where: { id: input.proposalEvidenceId },
      }),
      prisma.nativeBitcoinSubmissionIntent.findUnique({
        where: { id: input.submissionIntentId },
      }),
    ]);
    if (!candidate || !proposal || !intent) {
      throw new Error('Native Bitcoin submission correlation evidence does not exist');
    }
    const submission = input.submission;
    const data = {
      idempotencyKey,
      candidateId: candidate.id,
      proposalEvidenceId: proposal.id,
      submissionIntentId: intent.id,
      status: submission.status,
      reason: submission.reason,
      rawBlockDigest: hash(submission.rawBlockDigest, 'Submission raw block digest'),
      workId: workId(submission.workId),
      sourceDigest: hash(submission.sourceDigest, 'Submission source digest'),
      observedAt: date(submission.observedAt, 'Submission observation time'),
    } as const;
    if (
      proposal.candidateId !== candidate.id ||
      proposal.status !== 'VALID' ||
      intent.candidateId !== candidate.id ||
      intent.proposalEvidenceId !== proposal.id ||
      proposal.rawBlockDigest !== data.rawBlockDigest ||
      candidate.rawBlockDigest !== data.rawBlockDigest ||
      intent.rawBlockDigest !== data.rawBlockDigest ||
      intent.workId !== data.workId ||
      data.observedAt < proposal.observedAt ||
      data.observedAt > proposal.validUntil
    ) {
      throw new Error('Native Bitcoin submission requires fresh matching valid proposal evidence');
    }
    if (
      (data.status === 'ACCEPTED' && data.reason !== null) ||
      (data.status !== 'ACCEPTED' && (!data.reason || data.reason.length > 1024)) ||
      (data.workId !== null && (data.workId.length === 0 || data.workId.length > 1024))
    ) {
      throw new Error('Native Bitcoin submission status evidence is inconsistent');
    }
    const existing = await prisma.nativeBitcoinSubmissionAttempt.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (
        existing.candidateId !== data.candidateId ||
        existing.proposalEvidenceId !== data.proposalEvidenceId ||
        existing.submissionIntentId !== data.submissionIntentId ||
        existing.status !== data.status ||
        existing.reason !== data.reason ||
        existing.rawBlockDigest !== data.rawBlockDigest ||
        existing.workId !== data.workId ||
        existing.sourceDigest !== data.sourceDigest ||
        !sameDate(existing.observedAt, data.observedAt)
      ) {
        throw new Error('Native Bitcoin submission idempotency conflict');
      }
      return existing;
    }
    try {
      return await prisma.nativeBitcoinSubmissionAttempt.create({ data });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.nativeBitcoinSubmissionAttempt.findUnique({
        where: { idempotencyKey },
      });
      if (!raced) throw new Error('Native Bitcoin submission uniqueness conflict');
      return this.recordSubmission(input);
    }
  }

  async recordSubmissionIntent(input: {
    idempotencyKey: string;
    candidateId: string;
    proposalEvidenceId: string;
    rawBlockDigest: string;
    workId: string | null;
    sourceDigest: string;
  }): Promise<StoredNativeBitcoinSubmissionIntent> {
    const idempotencyKey = boundedIdempotencyKey(input.idempotencyKey);
    const [candidate, proposal] = await Promise.all([
      prisma.nativeBitcoinCandidate.findUnique({ where: { id: input.candidateId } }),
      prisma.nativeBitcoinProposalEvidence.findUnique({
        where: { id: input.proposalEvidenceId },
      }),
    ]);
    if (!candidate || !proposal) {
      throw new Error('Native Bitcoin intent correlation evidence does not exist');
    }
    const data = {
      idempotencyKey,
      candidateId: candidate.id,
      proposalEvidenceId: proposal.id,
      rawBlockDigest: hash(input.rawBlockDigest, 'Intent raw block digest'),
      workId: workId(input.workId),
      sourceDigest: hash(input.sourceDigest, 'Intent source digest'),
    } as const;
    if (
      proposal.candidateId !== candidate.id ||
      proposal.status !== 'VALID' ||
      proposal.rawBlockDigest !== data.rawBlockDigest ||
      candidate.rawBlockDigest !== data.rawBlockDigest
    ) {
      throw new Error('Native Bitcoin submission intent requires matching valid proposal evidence');
    }
    const existing = await prisma.nativeBitcoinSubmissionIntent.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (
        existing.candidateId !== data.candidateId ||
        existing.proposalEvidenceId !== data.proposalEvidenceId ||
        existing.rawBlockDigest !== data.rawBlockDigest ||
        existing.workId !== data.workId ||
        existing.sourceDigest !== data.sourceDigest
      ) {
        throw new Error('Native Bitcoin submission intent idempotency conflict');
      }
      return existing;
    }
    try {
      return await prisma.nativeBitcoinSubmissionIntent.create({ data });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.nativeBitcoinSubmissionIntent.findUnique({
        where: { idempotencyKey },
      });
      if (!raced) throw new Error('Native Bitcoin submission intent uniqueness conflict');
      return this.recordSubmissionIntent(input);
    }
  }

  async recordSubmissionRecoveryObservation(input: {
    idempotencyKey: string;
    submissionIntentId: string;
    observation: BitcoinSubmittedBlockObservation;
  }): Promise<StoredNativeBitcoinSubmissionRecoveryObservation> {
    const idempotencyKey = boundedIdempotencyKey(input.idempotencyKey);
    const intent = await prisma.nativeBitcoinSubmissionIntent.findUnique({
      where: { id: input.submissionIntentId },
      include: { candidate: true },
    });
    if (!intent) throw new Error('Native Bitcoin submission intent does not exist');
    const observation = input.observation;
    const data = {
      idempotencyKey,
      submissionIntentId: intent.id,
      status: observation.status,
      blockHash: hash(observation.blockHash, 'Recovery block hash'),
      confirmations: observation.confirmations,
      blockHeight: observation.blockHeight,
      transactionCount: observation.transactionCount,
      chainTipHash: hash(observation.chainTipHash, 'Recovery chain tip hash'),
      chainHeight: observation.chainHeight,
      sourceDigest: hash(observation.sourceDigest, 'Recovery source digest'),
      observedAt: date(observation.observedAt, 'Recovery observation time'),
    } as const;
    if (
      data.blockHash !== intent.candidate.blockHash ||
      !Number.isSafeInteger(data.confirmations) ||
      !Number.isSafeInteger(data.chainHeight) ||
      data.chainHeight < 0 ||
      (data.blockHeight !== null &&
        (!Number.isSafeInteger(data.blockHeight) || data.blockHeight < 0)) ||
      (data.transactionCount !== null &&
        (!Number.isSafeInteger(data.transactionCount) ||
          data.transactionCount < 1 ||
          data.transactionCount > 100_001)) ||
      (data.status === 'ACTIVE_CHAIN' &&
        (data.confirmations < 1 ||
          data.blockHeight === null ||
          data.transactionCount === null ||
          data.confirmations !== data.chainHeight - data.blockHeight + 1)) ||
      (data.status === 'STALE_CHAIN' &&
        (data.confirmations !== -1 ||
          data.blockHeight === null ||
          data.transactionCount === null)) ||
      (data.status === 'NOT_FOUND' &&
        (data.confirmations !== 0 || data.blockHeight !== null || data.transactionCount !== null))
    ) {
      throw new Error('Native Bitcoin recovery observation evidence is inconsistent');
    }
    const existing = await prisma.nativeBitcoinSubmissionRecoveryObservation.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (
        existing.submissionIntentId !== data.submissionIntentId ||
        existing.status !== data.status ||
        existing.blockHash !== data.blockHash ||
        existing.confirmations !== data.confirmations ||
        existing.blockHeight !== data.blockHeight ||
        existing.transactionCount !== data.transactionCount ||
        existing.chainTipHash !== data.chainTipHash ||
        existing.chainHeight !== data.chainHeight ||
        existing.sourceDigest !== data.sourceDigest ||
        !sameDate(existing.observedAt, data.observedAt)
      ) {
        throw new Error('Native Bitcoin recovery observation idempotency conflict');
      }
      return existing;
    }
    try {
      return await prisma.nativeBitcoinSubmissionRecoveryObservation.create({ data });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.nativeBitcoinSubmissionRecoveryObservation.findUnique({
        where: { idempotencyKey },
      });
      if (!raced) throw new Error('Native Bitcoin recovery observation uniqueness conflict');
      return this.recordSubmissionRecoveryObservation(input);
    }
  }

  async listUnresolvedSubmissionIntents(input?: {
    minimumAgeMilliseconds?: number;
    limit?: number;
  }): Promise<UnresolvedNativeBitcoinSubmissionIntent[]> {
    const minimumAgeMilliseconds = input?.minimumAgeMilliseconds ?? 0;
    const limit = input?.limit ?? 100;
    if (
      !Number.isInteger(minimumAgeMilliseconds) ||
      minimumAgeMilliseconds < 0 ||
      minimumAgeMilliseconds > 86_400_000
    ) {
      throw new Error('Native Bitcoin unresolved-intent age is invalid');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error('Native Bitcoin unresolved-intent limit is invalid');
    }
    const now = await databaseNow();
    return prisma.nativeBitcoinSubmissionIntent.findMany({
      where: {
        createdAt: { lte: new Date(now.getTime() - minimumAgeMilliseconds) },
        submission: null,
        recoveryObservations: {
          none: { status: { in: ['ACTIVE_CHAIN', 'STALE_CHAIN'] } },
        },
      },
      include: { candidate: true, proposalEvidence: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }
}
