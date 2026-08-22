/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Scopes, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { RegisterPayoutAddressDto, UpdateAutoWithdrawalDto } from './payouts.dto.js';
import { PayoutsService } from './payouts.service.js';

@ApiTags('payouts')
@Controller({ path: 'payouts', version: '1' })
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('status')
  getStatus() {
    return {
      module: 'payouts',
      status: 'address-control-foundation',
      enabled: false,
      reason:
        'Address registration is available; signing, broadcast, and real payouts remain disabled',
    };
  }

  @Get('routes')
  @ApiBearerAuth()
  @Scopes('dashboard:read')
  @UseGuards(AuthGuard)
  routes() {
    return this.payoutsService.routes();
  }

  @Get('addresses')
  @ApiBearerAuth()
  @Scopes('profile:read')
  @UseGuards(AuthGuard)
  addresses(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.payoutsService.addresses(principal.userId);
  }

  @Post('addresses')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  registerAddress(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Headers('x-step-up-token') stepUpToken: string | undefined,
    @Body() dto: RegisterPayoutAddressDto,
  ) {
    return this.payoutsService.registerAddress(principal, dto, stepUpToken);
  }

  @Post('addresses/:payoutAddressId/activate')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  activateAddress(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('payoutAddressId') payoutAddressId: string,
    @Headers('x-step-up-token') stepUpToken: string | undefined,
  ) {
    return this.payoutsService.activateAddress(principal, payoutAddressId, stepUpToken);
  }

  @Post('addresses/:payoutAddressId/disable')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  disableAddress(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('payoutAddressId') payoutAddressId: string,
    @Headers('x-step-up-token') stepUpToken: string | undefined,
  ) {
    return this.payoutsService.disableAddress(principal, payoutAddressId, stepUpToken);
  }

  @Get('preferences')
  @ApiBearerAuth()
  @Scopes('profile:read')
  @UseGuards(AuthGuard)
  preferences(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.payoutsService.preferences(principal.userId);
  }

  @Patch('preferences/:miningAccountId')
  @ApiBearerAuth()
  @Scopes('profile:read')
  @UseGuards(AuthGuard)
  updatePreference(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('miningAccountId') miningAccountId: string,
    @Body() dto: UpdateAutoWithdrawalDto,
  ) {
    return this.payoutsService.updatePreference(principal, miningAccountId, dto.enabled);
  }
}
