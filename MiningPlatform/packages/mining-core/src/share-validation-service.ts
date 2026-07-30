/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { calculateHeaderHash, resolveVersion } from './bitcoin-header.js';
import { transitionShareState } from './share-state-machine.js';
import { formatDifficultyForHash, targetFromCompactBits, targetFromDifficulty } from './difficulty.js';
import { createShareFingerprint } from './fingerprint.js';
import { assertHex } from './hex.js';
import type {
  DuplicateShareStore,
  RejectedShare,
  ShareRejectionCode,
  ShareValidationContext,
  ShareValidationResult,
} from './types.js';

function reject(code: ShareRejectionCode, safeReason: string, fingerprint?: string): RejectedShare {
  return { accepted: false, state: 'LOCAL_REJECTED', code, safeReason, fingerprint };
}

export class BitcoinShareValidationService {
  constructor(
    private readonly duplicates: DuplicateShareStore,
    private readonly now: () => Date = () => new Date(),
    private readonly maximumFutureTimeSeconds = 7_200,
  ) {}

  async validate(context: ShareValidationContext): Promise<ShareValidationResult> {
    let state = transitionShareState('RECEIVED', 'VALIDATING');
    const rejectCurrent = (code: ShareRejectionCode, reason: string, fingerprint?: string): RejectedShare => {
      state = transitionShareState(state, 'LOCAL_REJECTED');
      return reject(code, reason, fingerprint);
    };
    const { submission, job } = context;
    if (submission.workerName !== context.authorizedWorkerName) {
      return rejectCurrent('UNAUTHORIZED', 'Submitted worker does not match the authorized session');
    }
    if (!job || submission.jobId !== job.id) return rejectCurrent('UNKNOWN_JOB', 'Mining job is unknown');
    if (submission.submittedAt.getTime() > job.expiresAt.getTime() || this.now().getTime() > job.expiresAt.getTime()) {
      return rejectCurrent('STALE', 'Mining job has expired');
    }

    try {
      assertHex(submission.extranonce2, job.extranonce2Size, 'extranonce2');
      assertHex(submission.networkTime, 4, 'network time');
      assertHex(submission.nonce, 4, 'nonce');
      resolveVersion(job, submission.versionBits);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Malformed share fields';
      const code = message.toLowerCase().includes('version') ? 'INVALID_VERSION' : 'MALFORMED';
      return rejectCurrent(code, message);
    }

    const submittedNetworkTime = Number.parseInt(submission.networkTime, 16);
    const jobNetworkTime = Number.parseInt(job.networkTime, 16);
    const maximumNetworkTime = Math.floor(this.now().getTime() / 1_000) + this.maximumFutureTimeSeconds;
    if (submittedNetworkTime < jobNetworkTime || submittedNetworkTime > maximumNetworkTime) {
      return rejectCurrent('INVALID_TIME', 'Submitted network time is outside the accepted range');
    }

    const fingerprint = createShareFingerprint(context.workerId, submission);
    const reserved = await this.duplicates.reserve(fingerprint, job.expiresAt);
    if (!reserved) return rejectCurrent('DUPLICATE', 'Share was already submitted', fingerprint);

    try {
      const headerHash = calculateHeaderHash(job, submission);
      const assignedTarget = targetFromDifficulty(job.assignedDifficulty);
      if (headerHash.numericValue > assignedTarget) {
        return rejectCurrent('LOW_DIFFICULTY', 'Share does not meet the assigned difficulty', fingerprint);
      }

      const networkTarget = targetFromCompactBits(job.networkBits);
      state = transitionShareState(state, 'LOCAL_ACCEPTED');
      return {
        accepted: true,
        state: 'LOCAL_ACCEPTED',
        fingerprint,
        headerHash: headerHash.displayHash,
        assignedDifficulty: job.assignedDifficulty,
        achievedDifficulty: formatDifficultyForHash(headerHash.numericValue),
        blockCandidate: headerHash.numericValue <= networkTarget,
      };
    } catch (error) {
      await this.duplicates.release(fingerprint);
      const message = error instanceof Error ? error.message : 'Share validation failed';
      const code = message.toLowerCase().includes('version') ? 'INVALID_VERSION' : 'MALFORMED';
      return rejectCurrent(code, message, fingerprint);
    }
  }

  async releaseReservation(fingerprint: string): Promise<void> {
    await this.duplicates.release(fingerprint);
  }
}
