export type UserRole = 'GUEST' | 'USER' | 'OWNER';
export type WorkerState = 'PENDING' | 'ONLINE' | 'OFFLINE' | 'DISABLED';
export type ShareState = 'ACCEPTED' | 'REJECTED' | 'INVALID' | 'STALE';
export type RewardMethod = 'FOLLOW_UPSTREAM' | 'PPS' | 'FPPS' | 'PPLNS' | 'SOLO';

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
