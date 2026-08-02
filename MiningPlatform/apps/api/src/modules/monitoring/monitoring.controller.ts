/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get, Headers, NotFoundException, Param, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Scopes, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
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
    return { module: 'monitoring', status: 'production-dashboard-alpha', realtime: this.runtimeState.snapshot() };
  }

  @Get('dashboard/overview')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Scopes('dashboard:read')
  getDashboard(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.monitoringService.getDashboardOverview(principal.userId);
  }

  @Get('workers/:workerId/snapshot')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Scopes('dashboard:read')
  getWorkerSnapshot(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string) {
    return this.monitoringService.getWorkerSnapshot(workerId, principal.userId);
  }

  @Get('development/workers/:workerId/snapshot')
  getDevelopmentWorkerSnapshot(
    @Param('workerId') workerId: string,
    @Headers('x-development-dashboard-token') token: string | undefined,
  ) {
    if (!developmentDashboardEnabled()) throw new NotFoundException();
    if (!validDevelopmentToken(token)) throw new UnauthorizedException();
    if (workerId !== developmentWorkerId()) throw new NotFoundException();
    return this.monitoringService.getWorkerSnapshot(workerId);
  }
}
