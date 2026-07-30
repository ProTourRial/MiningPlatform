/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  @Get('status')
  getStatus() {
    return { module: 'users', status: 'scaffolded' };
  }
}
