/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type RandomXAlgorithm = 'rx/0';

export type RandomXJob = {
  id: string;
  clientId: string;
  algorithm: RandomXAlgorithm;
  blob: string;
  target: string;
  seedHash: string;
  height?: bigint;
  receivedAt: Date;
  expiresAt: Date;
};

export type RandomXShareSubmission = {
  workerName: string;
  jobId: string;
  nonce: string;
  result: string;
  submittedAt: Date;
};

export type RandomXValidationReason =
  | 'ACCEPTED'
  | 'INVALID_JOB'
  | 'INVALID_SUBMISSION'
  | 'STALE_JOB'
  | 'HASH_MISMATCH'
  | 'LOW_DIFFICULTY'
  | 'VALIDATION_UNAVAILABLE';

export type RandomXValidationResult = {
  accepted: boolean;
  reason: RandomXValidationReason;
  fingerprint: string;
  hash?: string;
  target?: bigint;
};

export interface RandomXHasher {
  hash(blobHex: string, seedHash: string): Promise<string>;
}
