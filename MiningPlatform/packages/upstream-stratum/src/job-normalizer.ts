/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { BitcoinMiningJob } from '@mining/mining-core';
import type { MiningNotifyNotification } from '@mining/stratum-protocol';

export interface NormalizeJobInput {
  notification: MiningNotifyNotification;
  extranonce1: string;
  extranonce2Size: number;
  assignedDifficulty: string;
  receivedAt?: Date;
  ttlMs?: number;
  versionRollingMask?: string;
}

export function normalizeUpstreamJob(input: NormalizeJobInput): BitcoinMiningJob {
  const receivedAt = input.receivedAt ?? new Date();
  const ttlMs = input.ttlMs ?? 10 * 60 * 1_000;
  if (input.extranonce2Size <= 0 || !Number.isInteger(input.extranonce2Size)) {
    throw new Error('Upstream extranonce2 size must be a positive integer');
  }
  if (!Number.isFinite(Number(input.assignedDifficulty)) || Number(input.assignedDifficulty) <= 0) {
    throw new Error('Upstream difficulty must be positive');
  }

  return {
    id: input.notification.jobId,
    // Stratum V1 prevhash and branch values are normalized to the exact bytes
    // used in the serialized Bitcoin block header and Merkle calculation.
    previousBlockHash: input.notification.previousBlockHash,
    coinbase1: input.notification.coinbase1,
    coinbase2: input.notification.coinbase2,
    extranonce1: input.extranonce1,
    extranonce2Size: input.extranonce2Size,
    merkleBranches: [...input.notification.merkleBranches],
    version: input.notification.version,
    networkBits: input.notification.networkBits,
    networkTime: input.notification.networkTime,
    cleanJobs: input.notification.cleanJobs,
    assignedDifficulty: input.assignedDifficulty,
    receivedAt,
    expiresAt: new Date(receivedAt.getTime() + ttlMs),
    versionRollingMask: input.versionRollingMask,
  };
}
