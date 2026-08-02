/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  live() {
    return this.healthService.live();
  }

  @Get('live')
  liveExplicit() {
    return this.healthService.live();
  }

  @Get('ready')
  async ready() {
    const result = await this.healthService.ready();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }

  @Get('domain')
  @UseGuards(AuthGuard)
  @Roles('ADMIN')
  domain() {
    return this.healthService.domain();
  }
}
