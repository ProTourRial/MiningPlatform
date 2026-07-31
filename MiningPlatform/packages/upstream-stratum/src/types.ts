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
  onDisconnect?: (reason: Error) => void;
}

export interface PoolAdapterCapabilities {
  protocol: 'STRATUM_V1';
  supportsTls: boolean;
  supportsVersionRolling: boolean;
  supportsSetExtranonce: boolean;
  supportsClientReconnect: boolean;
}

export interface PoolAdapterCallbacks extends UpstreamClientCallbacks {}

export interface PoolAdapter {
  readonly id: string;
  readonly endpoint: UpstreamEndpoint;
  readonly capabilities: PoolAdapterCapabilities;
  readonly state: UpstreamSessionState;
  readonly currentSubscription?: UpstreamSubscription;
  readonly currentDifficulty: string;
  start(maximumAttempts?: number, signal?: AbortSignal): Promise<UpstreamSubscription>;
  getJob(jobId: string): BitcoinMiningJob | undefined;
  submit(input: UpstreamSubmitInput): Promise<UpstreamShareResult>;
  close(): void;
}

export interface UpstreamPoolDefinition {
  id: string;
  name: string;
  priority: number;
  weight: number;
  enabled: boolean;
  failureThreshold: number;
  recoveryTimeoutMs: number;
  endpoint: UpstreamEndpoint;
}

export type PoolHealthState = 'HEALTHY' | 'DEGRADED' | 'CIRCUIT_OPEN' | 'DISABLED';

export interface PoolHealthSnapshot {
  poolId: string;
  state: PoolHealthState;
  consecutiveFailures: number;
  successfulConnections: number;
  lastConnectedAt?: string;
  lastFailureAt?: string;
  circuitOpenedUntil?: string;
  lastError?: string;
}

export type UpstreamManagerState = 'IDLE' | 'CONNECTING' | 'ACTIVE' | 'RECOVERING' | 'FAILED' | 'STOPPED';

export interface UpstreamFailoverNotice {
  previousPoolId?: string;
  nextPoolId?: string;
  reason: string;
  attemptedPoolIds: readonly string[];
  occurredAt: string;
}

export interface UpstreamSubmitInput extends Omit<BitcoinShareSubmission, 'workerName' | 'submittedAt'> {
  workerName?: string;
}
