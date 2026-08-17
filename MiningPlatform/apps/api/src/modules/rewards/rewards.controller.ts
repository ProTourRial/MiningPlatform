/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Scopes, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { RewardsService } from './rewards.service.js';

@ApiTags('rewards')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller({ path: 'rewards', version: '1' })
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get('status')
  getStatus() {
    return {
      module: 'rewards',
      status: 'financial-truth-alpha',
      strategy: 'follow-upstream-atomic-v1',
      initialPlatformFeeBasisPoints: 50,
      payoutsEnabled: false,
    };
  }

  @Get()
  @Scopes('rewards:read')
  list(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.rewardsService.list(principal.userId);
  }

  @Get('periods/:rewardPeriodId')
  @Scopes('rewards:read')
  period(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('rewardPeriodId') rewardPeriodId: string,
  ) {
    return this.rewardsService.period(principal.userId, rewardPeriodId);
  }
}
