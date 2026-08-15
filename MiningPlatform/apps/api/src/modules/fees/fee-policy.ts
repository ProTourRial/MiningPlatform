/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { ServiceUnavailableException } from '@nestjs/common';
import { prisma, type Prisma } from '@mining/database';

export const DEFAULT_MINING_FEE_POLICY_KEY = 'platform-default';

type FeePolicyDatabase = typeof prisma | Prisma.TransactionClient;

export function feePercentFromBasisPoints(feeBasisPoints: number): string {
  if (!Number.isInteger(feeBasisPoints) || feeBasisPoints < 0 || feeBasisPoints > 10_000) {
    throw new Error('Fee basis points must be an integer between 0 and 10000');
  }
  const whole = Math.trunc(feeBasisPoints / 100);
  const fractional = feeBasisPoints % 100;
  if (fractional === 0) return String(whole);
  return `${whole}.${String(fractional).padStart(2, '0').replace(/0+$/, '')}`;
}

export async function requireActiveDefaultFeePolicy(
  database: FeePolicyDatabase = prisma,
  effectiveAt = new Date(),
) {
  const policy = await database.miningFeePolicy.findFirst({
    where: {
      policyKey: DEFAULT_MINING_FEE_POLICY_KEY,
      status: 'ACTIVE',
      scope: 'PLATFORM_DEFAULT',
      effectiveFrom: { lte: effectiveAt },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: effectiveAt } }],
    },
    orderBy: [{ version: 'desc' }, { effectiveFrom: 'desc' }],
  });
  if (!policy) {
    throw new ServiceUnavailableException('No active default mining fee policy is configured');
  }
  return policy;
}
