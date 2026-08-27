/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import type {
  BitcoinBlockProposalResult,
  BitcoinBlockSubmissionResult,
  BitcoinCoreChain,
} from '@mining/blockchain-adapters';
import type { NativeBitcoinBlockCandidate } from '@mining/bitcoin-template';
import type { NativeBitcoinEvidenceRepository } from './native-bitcoin-evidence.js';

type NativeBitcoinSubmissionRpc = {
  validateBlockProposal(rawBlock: string): Promise<BitcoinBlockProposalResult>;
  submitBlock(
    rawBlock: string,
    proposal: BitcoinBlockProposalResult,
    workId?: string,
  ): Promise<BitcoinBlockSubmissionResult>;
};

type NativeBitcoinEvidenceStore = Pick<
  NativeBitcoinEvidenceRepository,
  | 'recordCandidate'
  | 'recordProposal'
  | 'recordSubmissionIntent'
  | 'recordSubmission'
  | 'findProposalByIdempotencyKey'
  | 'findSubmissionIntentByIdempotencyKey'
  | 'findSubmissionByIdempotencyKey'
>;

export type NativeBitcoinSubmissionExecutionResult =
  | {
      status: 'PROPOSAL_REJECTED';
      candidateEvidenceId: string;
      proposalEvidenceId: string;
      reason: string;
      replayed: boolean;
    }
  | {
      status: 'SUBMISSION_RECORDED';
      candidateEvidenceId: string;
      proposalEvidenceId: string;
      submissionIntentId: string;
      submissionEvidenceId: string;
      outcome: BitcoinBlockSubmissionResult['status'];
      reason: string | null;
      replayed: boolean;
    };

export class NativeBitcoinSubmissionUncertainError extends Error {
  override readonly cause: unknown;

  constructor(
    readonly submissionIntentId: string,
    cause: unknown,
  ) {
    super(
      `Native Bitcoin submission intent ${submissionIntentId} has no durable outcome and requires recovery`,
    );
    this.name = 'NativeBitcoinSubmissionUncertainError';
    this.cause = cause;
  }
}

function operationKeys(operationId: string): {
  candidate: string;
  proposal: string;
  intent: string;
  submission: string;
} {
  const normalized = operationId.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new Error('Native Bitcoin submission operation id is invalid');
  }
  const digest = createHash('sha256').update(normalized).digest('hex');
  return {
    candidate: `native-submit:${digest}:candidate`,
    proposal: `native-submit:${digest}:proposal`,
    intent: `native-submit:${digest}:intent`,
    submission: `native-submit:${digest}:submission`,
  };
}

function intentSourceDigest(input: {
  candidateId: string;
  proposalEvidenceId: string;
  rawBlockDigest: string;
  workId: string | null;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'native-bitcoin-submission-intent-v1',
        input.candidateId,
        input.proposalEvidenceId,
        input.rawBlockDigest,
        input.workId,
      ]),
    )
    .digest('hex');
}

function normalizedWorkId(value: string | undefined): string | null {
  if (value !== undefined && (value.length === 0 || value.length > 1024)) {
    throw new Error('Native Bitcoin submission work id is invalid');
  }
  return value ?? null;
}

export class NativeBitcoinSubmissionCoordinator {
  constructor(
    private readonly rpc: NativeBitcoinSubmissionRpc,
    private readonly evidence: NativeBitcoinEvidenceStore,
  ) {}

  async execute(input: {
    operationId: string;
    chain: BitcoinCoreChain;
    candidate: NativeBitcoinBlockCandidate;
    workId?: string;
  }): Promise<NativeBitcoinSubmissionExecutionResult> {
    const keys = operationKeys(input.operationId);
    const workId = normalizedWorkId(input.workId);
    const candidateEvidence = await this.evidence.recordCandidate({
      idempotencyKey: keys.candidate,
      chain: input.chain,
      candidate: input.candidate,
    });

    const recordedSubmission = await this.evidence.findSubmissionByIdempotencyKey(keys.submission);
    if (recordedSubmission) {
      return {
        status: 'SUBMISSION_RECORDED',
        candidateEvidenceId: recordedSubmission.candidateId,
        proposalEvidenceId: recordedSubmission.proposalEvidenceId,
        submissionIntentId: recordedSubmission.submissionIntentId,
        submissionEvidenceId: recordedSubmission.id,
        outcome: recordedSubmission.status,
        reason: recordedSubmission.reason,
        replayed: true,
      };
    }

    const unresolvedIntent = await this.evidence.findSubmissionIntentByIdempotencyKey(keys.intent);
    if (unresolvedIntent) {
      throw new NativeBitcoinSubmissionUncertainError(
        unresolvedIntent.id,
        new Error('A prior execution stopped after durable intent and before durable outcome'),
      );
    }

    let proposalEvidence = await this.evidence.findProposalByIdempotencyKey(keys.proposal);
    let proposal: BitcoinBlockProposalResult;
    let replayedProposal = true;
    if (proposalEvidence) {
      proposal = {
        status: proposalEvidence.status,
        reason: proposalEvidence.reason,
        rawBlockDigest: proposalEvidence.rawBlockDigest,
        sourceDigest: proposalEvidence.sourceDigest,
        observedAt: proposalEvidence.observedAt,
      };
    } else {
      replayedProposal = false;
      proposal = await this.rpc.validateBlockProposal(input.candidate.rawBlock);
      proposalEvidence = await this.evidence.recordProposal({
        idempotencyKey: keys.proposal,
        candidateId: candidateEvidence.id,
        proposal,
      });
    }

    if (proposal.status === 'REJECTED') {
      if (!proposal.reason) throw new Error('Rejected native Bitcoin proposal has no reason');
      return {
        status: 'PROPOSAL_REJECTED',
        candidateEvidenceId: candidateEvidence.id,
        proposalEvidenceId: proposalEvidence.id,
        reason: proposal.reason,
        replayed: replayedProposal,
      };
    }

    const intent = await this.evidence.recordSubmissionIntent({
      idempotencyKey: keys.intent,
      candidateId: candidateEvidence.id,
      proposalEvidenceId: proposalEvidence.id,
      rawBlockDigest: input.candidate.rawBlockDigest,
      workId,
      sourceDigest: intentSourceDigest({
        candidateId: candidateEvidence.id,
        proposalEvidenceId: proposalEvidence.id,
        rawBlockDigest: input.candidate.rawBlockDigest,
        workId,
      }),
    });

    try {
      const submission = await this.rpc.submitBlock(
        input.candidate.rawBlock,
        proposal,
        workId ?? undefined,
      );
      const stored = await this.evidence.recordSubmission({
        idempotencyKey: keys.submission,
        candidateId: candidateEvidence.id,
        proposalEvidenceId: proposalEvidence.id,
        submissionIntentId: intent.id,
        submission,
      });
      return {
        status: 'SUBMISSION_RECORDED',
        candidateEvidenceId: candidateEvidence.id,
        proposalEvidenceId: proposalEvidence.id,
        submissionIntentId: intent.id,
        submissionEvidenceId: stored.id,
        outcome: stored.status,
        reason: stored.reason,
        replayed: false,
      };
    } catch (error) {
      throw new NativeBitcoinSubmissionUncertainError(intent.id, error);
    }
  }
}
