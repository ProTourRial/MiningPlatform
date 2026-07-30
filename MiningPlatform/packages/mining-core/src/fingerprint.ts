import { createHash } from 'node:crypto';
import type { BitcoinShareSubmission } from './types.js';

export function createShareFingerprint(workerId: string, submission: BitcoinShareSubmission): string {
  const canonical = [
    workerId,
    submission.jobId.toLowerCase(),
    submission.extranonce2.toLowerCase(),
    submission.networkTime.toLowerCase(),
    submission.nonce.toLowerCase(),
    submission.versionBits?.toLowerCase() ?? '',
  ].join(':');
  return createHash('sha256').update(canonical).digest('hex');
}
