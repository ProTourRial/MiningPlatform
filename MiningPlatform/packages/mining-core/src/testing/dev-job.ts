/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { BitcoinMiningJob } from '../types.js';

export function createDevelopmentJob(
  now = new Date(),
  difficulty = '0.000001',
  extranonce1 = '01020304',
): BitcoinMiningJob {
  const networkTime = Math.floor(now.getTime() / 1_000).toString(16).padStart(8, '0');
  return {
    id: `dev-${networkTime}`,
    previousBlockHash: '00'.repeat(32),
    coinbase1: '0100000001' + '00'.repeat(32) + 'ffffffff' + '08',
    coinbase2: 'ffffffff01' + '00'.repeat(8) + '00' + '00000000',
    extranonce1,
    extranonce2Size: 4,
    merkleBranches: [],
    version: '20000000',
    networkBits: '1d00ffff',
    networkTime,
    cleanJobs: true,
    assignedDifficulty: difficulty,
    receivedAt: now,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1_000),
  };
}
