/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('payouts')
@Controller({ path: 'payouts', version: '1' })
export class PayoutsController {
  @Get('status')
  getStatus() {
    return {
      module: 'payouts',
      status: 'disabled',
      enabled: false,
      reason: 'P0.3 reconciliation resolution and every P0.4 controlled-funds gate are pending',
    };
  }
}
