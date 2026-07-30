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
  hashrateUpdated: 'mining.hashrate.updated.v1',
  workerStateChanged: 'mining.worker.state-changed.v1',
  telemetryReceived: 'monitoring.telemetry.received.v1',
  telemetryAggregated: 'monitoring.telemetry.aggregated.v1',
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
