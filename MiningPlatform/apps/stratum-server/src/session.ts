/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { Socket } from 'node:net';
import type { BitcoinMiningJob } from '@mining/mining-core';
import type { UpstreamStratumClient } from '@mining/upstream-stratum';

export type MinerSessionState = 'CONNECTED' | 'SUBSCRIBED' | 'AUTHORIZED' | 'ACTIVE' | 'DISCONNECTED';

export interface DifficultyBucket {
  accumulatedDifficulty: string;
  shareCount: number;
}

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
  upstream?: UpstreamStratumClient;
  acceptedDifficultyBuckets: Map<number, DifficultyBucket>;
  submissionWindowStartedAt: number;
  submissionsInWindow: number;
  connectedAt: Date;
  lastActivityAt: Date;
  processing: Promise<void>;
}
