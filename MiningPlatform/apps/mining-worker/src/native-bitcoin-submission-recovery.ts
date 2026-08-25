/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash } from 'node:crypto';
import type { BitcoinSubmittedBlockObservation } from '@mining/blockchain-adapters';
import type { NativeBitcoinEvidenceRepository } from './native-bitcoin-evidence.js';

type NativeBitcoinRecoveryRpc = {
  observeSubmittedBlock(blockHash: string): Promise<BitcoinSubmittedBlockObservation>;
};

type NativeBitcoinRecoveryEvidenceStore = Pick<
  NativeBitcoinEvidenceRepository,
  | 'getSubmissionIntentRecoveryState'
  | 'findRecoveryObservationByIdempotencyKey'
  | 'recordSubmissionRecoveryObservation'
>;

export type NativeBitcoinSubmissionRecoveryResult =
  | {
      status: 'SUBMISSION_OUTCOME_RECORDED';
      submissionIntentId: string;
      submissionEvidenceId: string;
      replayed: true;
    }
  | {
      status: 'BLOCK_OBSERVED';
      submissionIntentId: string;
      observationEvidenceId: string;
      chainStatus: 'ACTIVE_CHAIN' | 'STALE_CHAIN';
      confirmations: number;
      replayed: boolean;
    }
  | {
      status: 'STILL_UNRESOLVED';
      submissionIntentId: string;
      observationEvidenceId: string;
      chainStatus: 'NOT_FOUND';
      chainTipHash: string;
      chainHeight: number;
      replayed: boolean;
    };

function recoveryIdempotencyKey(submissionIntentId: string, sourceDigest: string): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify(['native-bitcoin-submission-recovery-v1', submissionIntentId, sourceDigest]),
    )
    .digest('hex');
  return `native-recovery:${digest}`;
}

export class NativeBitcoinSubmissionRecoveryCoordinator {
  constructor(
    private readonly rpc: NativeBitcoinRecoveryRpc,
    private readonly evidence: NativeBitcoinRecoveryEvidenceStore,
  ) {}

  async observe(submissionIntentId: string): Promise<NativeBitcoinSubmissionRecoveryResult> {
    const state = await this.evidence.getSubmissionIntentRecoveryState(submissionIntentId);
    if (!state) throw new Error('Native Bitcoin submission intent does not exist');
    if (state.submission) {
      return {
        status: 'SUBMISSION_OUTCOME_RECORDED',
        submissionIntentId: state.intent.id,
        submissionEvidenceId: state.submission.id,
        replayed: true,
      };
    }
    if (state.terminalObservation && state.terminalObservation.status !== 'NOT_FOUND') {
      return {
        status: 'BLOCK_OBSERVED',
        submissionIntentId: state.intent.id,
        observationEvidenceId: state.terminalObservation.id,
        chainStatus: state.terminalObservation.status,
        confirmations: state.terminalObservation.confirmations,
        replayed: true,
      };
    }

    const observation = await this.rpc.observeSubmittedBlock(state.candidate.blockHash);
    const idempotencyKey = recoveryIdempotencyKey(state.intent.id, observation.sourceDigest);
    const existing = await this.evidence.findRecoveryObservationByIdempotencyKey(idempotencyKey);
    const stored = await this.evidence.recordSubmissionRecoveryObservation({
      idempotencyKey,
      submissionIntentId: state.intent.id,
      observation,
    });
    if (stored.status === 'NOT_FOUND') {
      return {
        status: 'STILL_UNRESOLVED',
        submissionIntentId: state.intent.id,
        observationEvidenceId: stored.id,
        chainStatus: stored.status,
        chainTipHash: stored.chainTipHash,
        chainHeight: stored.chainHeight,
        replayed: existing !== null,
      };
    }
    return {
      status: 'BLOCK_OBSERVED',
      submissionIntentId: state.intent.id,
      observationEvidenceId: stored.id,
      chainStatus: stored.status,
      confirmations: stored.confirmations,
      replayed: existing !== null,
    };
  }
}
