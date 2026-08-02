/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PLATFORM_DEFAULTS } from '@mining/shared';
import { CurrentPrincipal, Scopes, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateWorkerDto, UpdateWorkerDto } from './workers.dto.js';
import { WorkersService } from './workers.service.js';

@ApiTags('workers')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller({ path: 'workers', version: '1' })
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get('status')
  status() {
    return {
      module: 'workers',
      status: 'control-plane-alpha',
      currentAlgorithm: PLATFORM_DEFAULTS.algorithm,
      hardwareSupport: PLATFORM_DEFAULTS.supportedHardwareTypes,
      productionAuthentication: 'WorkerCredential/scrypt-v1',
    };
  }

  @Get()
  @Scopes('workers:read')
  list(@CurrentPrincipal() principal: AuthPrincipal) { return this.workersService.list(principal.userId); }

  @Post()
  @Scopes('workers:write')
  create(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreateWorkerDto) {
    return this.workersService.create(principal.userId, dto);
  }

  @Get(':workerId')
  @Scopes('workers:read')
  get(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string) {
    return this.workersService.get(principal.userId, workerId);
  }

  @Patch(':workerId')
  @Scopes('workers:write')
  update(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string, @Body() dto: UpdateWorkerDto) {
    return this.workersService.update(principal.userId, workerId, dto);
  }

  @Delete(':workerId')
  @Scopes('workers:write')
  remove(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string) {
    return this.workersService.remove(principal.userId, workerId);
  }

  @Get(':workerId/credentials')
  @Scopes('workers:read')
  credentials(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string) {
    return this.workersService.credentials(principal.userId, workerId);
  }

  @Post(':workerId/credentials/rotate')
  @Scopes('workers:write')
  rotateCredential(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string) {
    return this.workersService.rotateCredential(principal.userId, workerId);
  }

  @Delete(':workerId/credentials/:credentialId')
  @Scopes('workers:write')
  revokeCredential(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('workerId') workerId: string,
    @Param('credentialId') credentialId: string,
  ) {
    return this.workersService.revokeCredential(principal.userId, workerId, credentialId);
  }
}
