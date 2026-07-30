/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('wallets')
@Controller({ path: 'wallets', version: '1' })
export class WalletsController {
  @Get('status')
  getStatus() {
    return { module: 'wallets', status: 'scaffolded' };
  }
}
