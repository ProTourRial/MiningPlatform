/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { UpdateAutoWithdrawalDto } from './payouts.dto.js';
import { PayoutsService } from './payouts.service.js';

@ApiTags('payouts')
@Controller({ path: 'payouts', version: '1' })
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('status')
  getStatus() {
    return {
      module: 'payouts',
      status: 'disabled',
      enabled: false,
      reason: 'P0.3 reconciliation resolution and every P0.4 controlled-funds gate are pending',
    };
  }

  @Get('preferences')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  preferences(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.payoutsService.preferences(principal.userId);
  }

  @Patch('preferences/:miningAccountId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updatePreference(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('miningAccountId') miningAccountId: string,
    @Body() dto: UpdateAutoWithdrawalDto,
  ) {
    return this.payoutsService.updatePreference(principal.userId, miningAccountId, dto.enabled);
  }
}
