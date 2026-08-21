/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export interface WorkerAuthenticationContext {
  sessionId: string;
  remoteIpHash: string;
  userAgent?: string;
  userAgentHash?: string;
}

export interface AuthenticatedWorker {
  workerId: string;
  workerName: string;
  userId?: string;
  miningAccountId?: string;
}

export type WorkerAuthenticationFailureCode =
  | 'INVALID_FORMAT'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'ACCOUNT_DISABLED'
  | 'CREDENTIAL_LOCKED'
  | 'CREDENTIAL_EXPIRED'
  | 'CREDENTIAL_REVOKED'
  | 'INVALID_REFERRAL_CODE'
  | 'SELF_REFERRAL'
  | 'REFERRAL_CONFLICT';

export type WorkerAuthenticationResult =
  | { authenticated: true; worker: AuthenticatedWorker }
  | { authenticated: false; code: WorkerAuthenticationFailureCode };

export interface WorkerAuthenticator {
  authenticate(
    workerName: string,
    password: string,
    context: WorkerAuthenticationContext,
  ): Promise<WorkerAuthenticationResult>;
  close?(): Promise<void>;
}
