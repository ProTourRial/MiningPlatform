/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('system')
@Controller({ path: 'system', version: '1' })
export class SystemController {
  @Get('configuration')
  getPublicConfiguration() {
    return {
      asset: process.env.MINING_ASSET ?? 'BTC',
      algorithm: process.env.MINING_ALGORITHM ?? 'SHA256',
      rewardMethod: process.env.REWARD_METHOD ?? 'FOLLOW_UPSTREAM',
      platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT ?? 2),
      payoutsEnabled: process.env.PAYOUTS_ENABLED === 'true',
    };
  }
}
