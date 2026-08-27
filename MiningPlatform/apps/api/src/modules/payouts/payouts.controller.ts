/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Roles, Scopes, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import {
  CancelPayoutDto,
  PayoutDecisionDto,
  RegisterPayoutAddressDto,
  RequestPayoutDto,
  SelectPayoutDestinationDto,
  UpdateAutoWithdrawalDto,
} from './payouts.dto.js';
import { PayoutsService } from './payouts.service.js';

@ApiTags('payouts')
@Controller({ path: 'payouts', version: '1' })
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('status')
  getStatus() {
    return {
      module: 'payouts',
      status: 'controlled-execution-installed',
      enabled: process.env.PAYOUTS_ENABLED === 'true',
      gates: {
        requests: process.env.PAYOUT_REQUESTS_ENABLED === 'true',
        signing: process.env.PAYOUT_SIGNING_ENABLED === 'true',
        broadcast: process.env.PAYOUT_BROADCAST_ENABLED === 'true',
      },
      reason:
        'Every real-funds action additionally requires database control, wallet health, and approval evidence',
    };
  }

  @Get()
  @ApiBearerAuth()
  @Scopes('dashboard:read')
  @UseGuards(AuthGuard)
  list(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.payoutsService.list(principal.userId);
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

  @Post('destinations/:miningAccountId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  selectDestination(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('miningAccountId') miningAccountId: string,
    @Headers('x-step-up-token') stepUpToken: string | undefined,
    @Body() dto: SelectPayoutDestinationDto,
  ) {
    return this.payoutsService.selectDestination(
      principal,
      miningAccountId,
      dto.payoutAddressId,
      stepUpToken,
    );
  }

  @Post('requests')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  request(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: RequestPayoutDto,
  ) {
    return this.payoutsService.request(principal, {
      ...dto,
      idempotencyKey: idempotencyKey ?? '',
    });
  }

  @Post(':payoutId/cancel')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  cancel(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('payoutId') payoutId: string,
    @Body() dto: CancelPayoutDto,
  ) {
    return this.payoutsService.cancel(principal, payoutId, dto.reason);
  }

  @Post('operations/:payoutId/decision')
  @ApiBearerAuth()
  @Roles('ADMIN')
  @UseGuards(AuthGuard)
  decide(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('payoutId') payoutId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: PayoutDecisionDto,
  ) {
    return this.payoutsService.decide(principal, {
      payoutId,
      decision: dto.decision,
      reason: dto.reason,
      idempotencyKey: idempotencyKey ?? '',
    });
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
