/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('shares')
@Controller({ path: 'shares', version: '1' })
export class SharesController {
  @Get('status')
  getStatus() {
    return { module: 'shares', status: 'scaffolded' };
  }
}
