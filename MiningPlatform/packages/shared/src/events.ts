export const MiningEvents = {
  shareReceived: 'mining.share.received.v1',
  shareValidated: 'mining.share.validated.v1',
  shareAggregated: 'mining.share.aggregated.v1',
  rewardPeriodClosed: 'reward.period.closed.v1',
  rewardAllocated: 'reward.allocated.v1',
  payoutRequested: 'payout.requested.v1',
  payoutBroadcast: 'payout.broadcast.v1',
  telemetryReceived: 'monitoring.telemetry.received.v1',
} as const;

export interface ShareValidatedEvent {
  eventId: string;
  occurredAt: string;
  workerId: string;
  userId: string;
  asset: string;
  difficulty: string;
  status: 'ACCEPTED' | 'REJECTED' | 'INVALID' | 'STALE';
  upstreamAccepted?: boolean;
}
