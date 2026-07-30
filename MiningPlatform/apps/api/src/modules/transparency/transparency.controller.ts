/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('transparency')
@Controller({ path: 'transparency', version: '1' })
export class TransparencyController {
  @Get('status')
  getStatus() {
    return { module: 'transparency', status: 'scaffolded' };
  }
}
