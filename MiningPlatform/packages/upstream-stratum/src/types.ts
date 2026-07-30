/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { BitcoinMiningJob, BitcoinShareSubmission } from '@mining/mining-core';

export type UpstreamSessionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'SUBSCRIBING'
  | 'SUBSCRIBED'
  | 'AUTHORIZING'
  | 'ACTIVE'
  | 'RECONNECTING'
  | 'STOPPED';

export type UpstreamJobStatus = 'ACTIVE' | 'SUPERSEDED' | 'EXPIRED' | 'INVALIDATED';

export interface UpstreamJobRecord {
  job: BitcoinMiningJob;
  status: UpstreamJobStatus;
  generation: number;
  invalidatedAt?: Date;
}

export interface UpstreamEndpoint {
  host: string;
  port: number;
  tls?: boolean;
  serverName?: string;
  userAgent: string;
  username: string;
  password: string;
  connectTimeoutMs: number;
  responseTimeoutMs: number;
  maximumLineBytes: number;
}

export interface UpstreamSubscription {
  extranonce1: string;
  extranonce2Size: number;
}

export interface UpstreamShareResult {
  accepted: boolean;
  errorCode?: number;
  errorMessage?: string;
}

export interface UpstreamClientCallbacks {
  onState?: (state: UpstreamSessionState) => void;
  onDifficulty?: (difficulty: string) => void;
  onExtranonce?: (subscription: UpstreamSubscription) => void;
  onJob?: (job: BitcoinMiningJob) => void;
  onError?: (error: Error) => void;
}

export interface UpstreamSubmitInput extends Omit<BitcoinShareSubmission, 'workerName' | 'submittedAt'> {
  workerName?: string;
}
