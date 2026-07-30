/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get, Headers, NotFoundException, Param, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  developmentDashboardEnabled,
  developmentWorkerId,
  validDevelopmentToken,
} from './development-access.js';
import { MonitoringRuntimeState } from './monitoring-runtime-state.js';
import { MonitoringService } from './monitoring.service.js';

@ApiTags('monitoring')
@Controller({ path: 'monitoring', version: '1' })
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly runtimeState: MonitoringRuntimeState,
  ) {}

  @Get('status')
  getStatus() {
    return { module: 'monitoring', status: 'core-mining-alpha', realtime: this.runtimeState.snapshot() };
  }

  @Get('development/workers/:workerId/snapshot')
  getWorkerSnapshot(
    @Param('workerId') workerId: string,
    @Headers('x-development-dashboard-token') token: string | undefined,
  ) {
    if (!developmentDashboardEnabled()) throw new NotFoundException();
    if (!validDevelopmentToken(token)) throw new UnauthorizedException();
    if (workerId !== developmentWorkerId()) throw new NotFoundException();
    return this.monitoringService.getWorkerSnapshot(workerId);
  }
}
