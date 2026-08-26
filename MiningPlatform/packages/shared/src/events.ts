/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export const MiningEvents = {
  sessionConnected: 'mining.session.connected.v1',
  sessionSubscribed: 'mining.session.subscribed.v1',
  sessionAuthorized: 'mining.session.authorized.v1',
  sessionDisconnected: 'mining.session.disconnected.v1',
  jobReceived: 'mining.job.received.v1',
  shareReceived: 'mining.share.received.v1',
  shareLocalAccepted: 'mining.share.local-accepted.v1',
  shareLocalRejected: 'mining.share.local-rejected.v1',
  shareUpstreamPending: 'mining.share.upstream-pending.v1',
  shareUpstreamAccepted: 'mining.share.upstream-accepted.v1',
  shareUpstreamRejected: 'mining.share.upstream-rejected.v1',
  randomXShareAccepted: 'mining.randomx.share.accepted.v1',
  hashrateUpdated: 'mining.hashrate.updated.v1',
  workerStateChanged: 'mining.worker.state-changed.v1',
  workerDeviceDetected: 'mining.worker.device-detected.v1',
  workerAuthenticationSucceeded: 'security.worker-authentication.succeeded.v1',
  workerAuthenticationFailed: 'security.worker-authentication.failed.v1',
  workerCredentialCreated: 'security.worker-credential.created.v1',
  workerCredentialRotated: 'security.worker-credential.rotated.v1',
  workerCredentialRevoked: 'security.worker-credential.revoked.v1',
  upstreamPoolSelected: 'mining.upstream.pool-selected.v1',
  upstreamFailoverStarted: 'mining.upstream.failover-started.v1',
  upstreamFailoverCompleted: 'mining.upstream.failover-completed.v1',
  upstreamFailoverFailed: 'mining.upstream.failover-failed.v1',
  upstreamHealthChanged: 'mining.upstream.health-changed.v1',
  workerDifficultyChanged: 'mining.worker.difficulty-changed.v1',
  telemetryReceived: 'monitoring.telemetry.received.v1',
  telemetryAggregated: 'monitoring.telemetry.aggregated.v1',
  contributionAccepted: 'reward.contribution.accepted.v1',
  settlementImported: 'reward.settlement.imported.v1',
  reconciliationResolutionRequested: 'reward.reconciliation.resolution-requested.v1',
  reconciliationResolutionApproved: 'reward.reconciliation.resolution-approved.v1',
  reconciliationResolutionRejected: 'reward.reconciliation.resolution-rejected.v1',
  rewardPeriodClosed: 'reward.period.closed.v1',
  rewardAllocated: 'reward.allocated.v1',
  journalPosted: 'ledger.journal.posted.v1',
  payoutRequested: 'payout.requested.v1',
  payoutApproved: 'payout.approved.v1',
  walletTransactionBroadcast: 'wallet.transaction.broadcast.v1',
  walletTransactionConfirmed: 'wallet.transaction.confirmed.v1',
} as const;

export type MiningEventName = (typeof MiningEvents)[keyof typeof MiningEvents];

export interface DomainEvent<TPayload> {
  eventId: string;
  eventName: MiningEventName | string;
  eventVersion: number;
  occurredAt: string;
  producer: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  causationId?: string;
  idempotencyKey: string;
  payload: TPayload;
}

export type ShareRejectionCode =
  | 'MALFORMED'
  | 'UNAUTHORIZED'
  | 'UNKNOWN_JOB'
  | 'STALE'
  | 'DUPLICATE'
  | 'LOW_DIFFICULTY'
  | 'INVALID_TIME'
  | 'INVALID_VERSION'
  | 'UPSTREAM_REJECTED';

export interface ShareAcceptedPayload {
  sessionId: string;
  workerId: string;
  asset: 'BTC';
  algorithm: 'SHA256';
  jobId: string;
  fingerprint: string;
  assignedDifficulty: string;
  achievedDifficulty: string;
  headerHash: string;
  extranonce2: string;
  networkTime: string;
  nonce: string;
  versionBits?: string;
  submittedAt: string;
  blockCandidate: boolean;
  upstreamRequired: boolean;
}

export interface ShareUpstreamPendingPayload {
  sessionId: string;
  workerId: string;
  jobId: string;
  fingerprint: string;
  submittedAt: string;
}

export interface ShareUpstreamDecisionPayload extends ShareUpstreamPendingPayload {
  decidedAt: string;
  upstreamAccepted: boolean;
  errorCode?: number;
  errorMessage?: string;
}

/**
 * Versioned hand-off from the future RandomX mining gateway into the evidence-only
 * accounting boundary. Decimal integers are strings so the contract remains JSON-safe.
 */
export interface RandomXAcceptedSharePayload {
  miningAccountId: string;
  assetId: string;
  algorithm: 'rx/0';
  upstreamPoolId: string;
  upstreamSessionId: string;
  upstreamJobId: string;
  upstreamClientId: string;
  workerName: string;
  jobBlob: string;
  seedHash: string;
  targetHex: string;
  jobHeight: string;
  jobReceivedAt: string;
  jobExpiresAt: string;
  nonce: string;
  submittedResult: string;
  submittedAt: string;
  localAccepted: true;
  localReason: 'ACCEPTED';
  localFingerprint: string;
  computedResult: string;
  localTarget: string;
  acceptedDifficulty: string;
  upstreamAccepted: true;
  upstreamDecidedAt: string;
  upstreamDecisionDigest: string;
}

export interface ContributionAcceptedPayload {
  sourceEventId: string;
  shareId: string;
  miningAccountId: string;
  assetId: string;
  upstreamPoolId: string;
  acceptedDifficulty: string;
  acceptedAt: string;
}

export interface SettlementImportedPayload {
  rewardPeriodId: string;
  reconciliationId: string;
  importIdempotencyKey: string;
  importedAt: string;
}

export interface ReconciliationResolutionRequestedPayload {
  resolutionId: string;
  reconciliationId: string;
  rewardPeriodId: string;
  correctedSourceReference: string;
  correctedSourceChecksum: string;
  requestedByUserId: string;
  requestedAt: string;
}

export interface ReconciliationResolutionDecisionPayload {
  resolutionId: string;
  reconciliationId: string;
  rewardPeriodId: string;
  decision: 'APPROVED' | 'REJECTED';
  decidedByUserId: string;
  decidedAt: string;
  replacementReconciliationId: string | null;
}

export interface ShareRejectedPayload {
  sessionId: string;
  workerId?: string;
  asset: 'BTC';
  algorithm: 'SHA256';
  jobId?: string;
  fingerprint?: string;
  extranonce2?: string;
  networkTime?: string;
  nonce?: string;
  versionBits?: string;
  submittedAt: string;
  code: ShareRejectionCode;
  safeReason: string;
}

export interface WorkerDeviceDetectedPayload {
  sessionId: string;
  workerId: string;
  workerName: string;
  detectedType: 'CPU' | 'GPU' | 'FPGA' | 'ASIC' | 'HYBRID' | 'OTHER' | 'UNKNOWN';
  possibleTypes: readonly ('CPU' | 'GPU' | 'FPGA' | 'ASIC' | 'HYBRID' | 'OTHER' | 'UNKNOWN')[];
  detectionSource:
    | 'USER_DECLARED'
    | 'STRATUM_USER_AGENT'
    | 'MONITORING_AGENT'
    | 'MINER_API'
    | 'COMBINED'
    | 'UNKNOWN';
  confidence: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CONFIRMED';
  minerSoftware?: string;
  softwareVersion?: string;
  vendor?: string;
  model?: string;
  architecture?: string;
  operatingSystem?: string;
  deviceCount: number;
  algorithmCapabilities: readonly string[];
  evidence: readonly string[];
  detectedAt: string;
}

export interface UpstreamPoolSelectedPayload {
  sessionId: string;
  workerId: string;
  poolId: string;
  previousPoolId?: string;
  selectedAt: string;
}

export interface UpstreamFailoverPayload {
  sessionId: string;
  workerId: string;
  previousPoolId?: string;
  nextPoolId?: string;
  reason: string;
  attemptedPoolIds: readonly string[];
  occurredAt: string;
  recovered: boolean;
}

export interface UpstreamHealthChangedPayload {
  sessionId: string;
  workerId: string;
  poolId: string;
  state: 'HEALTHY' | 'DEGRADED' | 'CIRCUIT_OPEN' | 'DISABLED';
  consecutiveFailures: number;
  successfulConnections: number;
  lastConnectedAt?: string;
  lastFailureAt?: string;
  circuitOpenedUntil?: string;
  lastError?: string;
  observedAt: string;
}

export interface WorkerDifficultyChangedPayload {
  sessionId: string;
  workerId: string;
  previousDifficulty: string;
  nextDifficulty: string;
  source: 'UPSTREAM_FLOOR' | 'VARDIFF';
  assignedAt: string;
  observedShareIntervalSeconds?: number;
  sampleCount?: number;
}

export interface MinerSessionConnectedPayload {
  sessionId: string;
  remoteIpHash: string;
  connectedAt: string;
}

export interface MinerSessionSubscribedPayload {
  sessionId: string;
  userAgent?: string;
  extranonce1: string;
  extranonce2Size: number;
  subscribedAt: string;
}

export interface MinerSessionAuthorizedPayload {
  sessionId: string;
  workerId: string;
  workerName: string;
  assignedDifficulty: string;
  authorizedAt: string;
}

export interface MinerSessionDisconnectedPayload {
  sessionId: string;
  workerId?: string;
  disconnectedAt: string;
  reason: string;
}

export interface MiningJobReceivedPayload {
  sessionId: string;
  jobId: string;
  upstreamPoolKey?: string;
  upstreamJobId?: string;
  gatewayGeneration?: number;
  asset: 'BTC';
  algorithm: 'SHA256';
  previousBlockHash: string;
  coinbase1: string;
  coinbase2: string;
  merkleBranches: readonly string[];
  version: string;
  networkBits: string;
  networkTime: string;
  cleanJobs: boolean;
  assignedDifficulty: string;
  receivedAt: string;
  expiresAt: string;
}

export interface HashrateUpdatedPayload {
  workerId: string;
  windowSeconds: number;
  hashesPerSecond: string;
  acceptedShares: number;
  rejectedShares: number;
  invalidShares: number;
  recordedAt: string;
}

export interface WorkerAuthenticationAuditPayload {
  sessionId: string;
  workerId?: string;
  credentialId?: string;
  remoteIpHash: string;
  workerNameHash: string;
  outcome: 'SUCCEEDED' | 'FAILED';
  reason?: string;
  occurredAt: string;
}

export interface WorkerCredentialLifecyclePayload {
  workerId: string;
  credentialId: string;
  action: 'CREATED' | 'ROTATED' | 'REVOKED';
  expiresAt?: string;
  occurredAt: string;
}
