/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Scopes, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { LedgerService } from './ledger.service.js';

@ApiTags('ledger')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller({ path: 'ledger', version: '1' })
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('status')
  getStatus() {
    return {
      module: 'ledger',
      status: 'posted-journal-source-of-truth',
      balanceProjection: 'POSTED_AND_REVERSED_JOURNAL_LINES',
      payoutsEnabled: false,
    };
  }

  @Get('balances')
  @Scopes('ledger:read')
  balances(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.ledgerService.balances(principal.userId);
  }

  @Get('entries')
  @Scopes('ledger:read')
  entries(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.ledgerService.entries(principal.userId);
  }
}
