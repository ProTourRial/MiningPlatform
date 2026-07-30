import { calculateHeaderHash, resolveVersion } from './bitcoin-header.js';
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
    const { submission, job } = context;
    if (submission.workerName !== context.authorizedWorkerName) {
      return reject('UNAUTHORIZED', 'Submitted worker does not match the authorized session');
    }
    if (!job || submission.jobId !== job.id) return reject('UNKNOWN_JOB', 'Mining job is unknown');
    if (submission.submittedAt.getTime() > job.expiresAt.getTime() || this.now().getTime() > job.expiresAt.getTime()) {
      return reject('STALE', 'Mining job has expired');
    }

    try {
      assertHex(submission.extranonce2, job.extranonce2Size, 'extranonce2');
      assertHex(submission.networkTime, 4, 'network time');
      assertHex(submission.nonce, 4, 'nonce');
      resolveVersion(job, submission.versionBits);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Malformed share fields';
      const code = message.toLowerCase().includes('version') ? 'INVALID_VERSION' : 'MALFORMED';
      return reject(code, message);
    }

    const submittedNetworkTime = Number.parseInt(submission.networkTime, 16);
    const jobNetworkTime = Number.parseInt(job.networkTime, 16);
    const maximumNetworkTime = Math.floor(this.now().getTime() / 1_000) + this.maximumFutureTimeSeconds;
    if (submittedNetworkTime < jobNetworkTime || submittedNetworkTime > maximumNetworkTime) {
      return reject('INVALID_TIME', 'Submitted network time is outside the accepted range');
    }

    const fingerprint = createShareFingerprint(context.workerId, submission);
    const reserved = await this.duplicates.reserve(fingerprint, job.expiresAt);
    if (!reserved) return reject('DUPLICATE', 'Share was already submitted', fingerprint);

    try {
      const headerHash = calculateHeaderHash(job, submission);
      const assignedTarget = targetFromDifficulty(job.assignedDifficulty);
      if (headerHash.numericValue > assignedTarget) {
        return reject('LOW_DIFFICULTY', 'Share does not meet the assigned difficulty', fingerprint);
      }

      const networkTarget = targetFromCompactBits(job.networkBits);
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
      return reject(code, message, fingerprint);
    }
  }
}
