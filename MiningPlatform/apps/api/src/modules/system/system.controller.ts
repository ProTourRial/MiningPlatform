/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { feePercentFromBasisPoints, requireActiveDefaultFeePolicy } from '../fees/fee-policy.js';

@ApiTags('system')
@Controller({ path: 'system', version: '1' })
export class SystemController {
  @Get('configuration')
  async getPublicConfiguration() {
    const feePolicy = await requireActiveDefaultFeePolicy();
    return {
      asset: process.env.MINING_ASSET ?? 'BTC',
      algorithm: process.env.MINING_ALGORITHM ?? 'SHA256',
      rewardMethod: process.env.REWARD_METHOD ?? 'FOLLOW_UPSTREAM',
      platformFeePercent: Number(feePercentFromBasisPoints(feePolicy.feeBasisPoints)),
      feePolicy: {
        key: feePolicy.policyKey,
        version: feePolicy.version,
        basisPoints: feePolicy.feeBasisPoints,
        effectiveFrom: feePolicy.effectiveFrom.toISOString(),
      },
      payoutsEnabled: process.env.PAYOUTS_ENABLED === 'true',
    };
  }
}
