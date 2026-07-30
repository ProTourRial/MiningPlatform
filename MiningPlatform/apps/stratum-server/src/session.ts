import type { Socket } from 'node:net';
import type { BitcoinMiningJob, HashrateShare } from '@mining/mining-core';

export type MinerSessionState = 'CONNECTED' | 'SUBSCRIBED' | 'AUTHORIZED' | 'ACTIVE' | 'DISCONNECTED';

export interface MinerSession {
  id: string;
  socket: Socket;
  remoteHash: string;
  state: MinerSessionState;
  userAgent?: string;
  workerName?: string;
  workerId?: string;
  extranonce1: string;
  extranonce2Size: number;
  assignedDifficulty: string;
  versionRollingMask?: string;
  currentJob?: BitcoinMiningJob;
  acceptedShares: HashrateShare[];
  submissionWindowStartedAt: number;
  submissionsInWindow: number;
  connectedAt: Date;
  lastActivityAt: Date;
  processing: Promise<void>;
}
