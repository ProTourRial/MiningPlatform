/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export type ShareState =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'LOCAL_ACCEPTED'
  | 'LOCAL_REJECTED'
  | 'UPSTREAM_PENDING'
  | 'UPSTREAM_ACCEPTED'
  | 'UPSTREAM_REJECTED'
  | 'UPSTREAM_TIMEOUT';

export type ShareRejectionCode =
  | 'MALFORMED'
  | 'UNAUTHORIZED'
  | 'UNKNOWN_JOB'
  | 'STALE'
  | 'DUPLICATE'
  | 'LOW_DIFFICULTY'
  | 'INVALID_TIME'
  | 'INVALID_VERSION';

export interface BitcoinMiningJob {
  id: string;
  previousBlockHash: string;
  coinbase1: string;
  coinbase2: string;
  extranonce1: string;
  extranonce2Size: number;
  merkleBranches: readonly string[];
  version: string;
  networkBits: string;
  networkTime: string;
  cleanJobs: boolean;
  assignedDifficulty: string;
  receivedAt: Date;
  expiresAt: Date;
  versionRollingMask?: string;
}

export interface BitcoinShareSubmission {
  workerName: string;
  jobId: string;
  extranonce2: string;
  networkTime: string;
  nonce: string;
  versionBits?: string;
  submittedAt: Date;
}

export interface ShareValidationContext {
  sessionId: string;
  workerId: string;
  authorizedWorkerName: string;
  job?: BitcoinMiningJob;
  submission: BitcoinShareSubmission;
}

export interface AcceptedShare {
  accepted: true;
  state: 'LOCAL_ACCEPTED';
  fingerprint: string;
  headerHash: string;
  assignedDifficulty: string;
  achievedDifficulty: string;
  blockCandidate: boolean;
}

export interface RejectedShare {
  accepted: false;
  state: 'LOCAL_REJECTED';
  fingerprint?: string;
  code: ShareRejectionCode;
  safeReason: string;
}

export type ShareValidationResult = AcceptedShare | RejectedShare;

export interface DuplicateShareStore {
  reserve(fingerprint: string, expiresAt: Date): Promise<boolean>;
  release(fingerprint: string): Promise<void>;
}

export interface HashrateShare {
  difficulty: string;
  acceptedAt: Date;
}

export interface HashrateWindowResult {
  windowSeconds: number;
  shareCount: number;
  accumulatedDifficulty: string;
  hashesPerSecond: string;
}
