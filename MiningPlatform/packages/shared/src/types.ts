export type UserRole = 'GUEST' | 'USER' | 'OWNER';

export type WorkerState =
  | 'PENDING'
  | 'ONLINE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'DISABLED'
  | 'UNKNOWN';

export type MinerSessionState =
  | 'CONNECTING'
  | 'SUBSCRIBED'
  | 'AUTHORIZED'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'DISCONNECTED';

export type ShareState =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'LOCAL_ACCEPTED'
  | 'LOCAL_REJECTED'
  | 'UPSTREAM_PENDING'
  | 'UPSTREAM_ACCEPTED'
  | 'UPSTREAM_REJECTED'
  | 'UPSTREAM_TIMEOUT';

export type RewardMethod = 'FOLLOW_UPSTREAM' | 'PPS' | 'FPPS' | 'PPLNS' | 'PROP' | 'SOLO';

export interface PublicPoolStats {
  asset: string;
  algorithm: string;
  poolHashrate: string;
  activeWorkers: number;
  rewardToday: string;
  totalPaid: string;
  upstreamStatus: 'operational' | 'degraded' | 'offline' | 'setup';
  updatedAt: string;
}
