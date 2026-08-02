/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { CurrentPrincipal } from '../../common/auth/current-principal.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CreateWorkerDto, UpdateWorkerDto } from './dto/workers.dto';
import { WorkersService } from './workers.service';

@ApiTags('workers')
@ApiBearerAuth()
@Controller({ path: 'workers', version: '1' })
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  @Get()
  @RequirePermissions('workers.read')
  list(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.workers.list(principal);
  }

  @Get(':workerId')
  @RequirePermissions('workers.read')
  get(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string) {
    return this.workers.get(principal, workerId);
  }

  @Get(':workerId/statistics')
  @RequirePermissions('workers.read')
  statistics(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string) {
    return this.workers.statistics(principal, workerId);
  }

  @Post()
  @RequirePermissions('workers.write')
  create(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateWorkerDto) {
    return this.workers.create(principal, input);
  }

  @Patch(':workerId')
  @RequirePermissions('workers.write')
  update(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string, @Body() input: UpdateWorkerDto) {
    return this.workers.update(principal, workerId, input);
  }

  @Delete(':workerId')
  @RequirePermissions('workers.delete')
  remove(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string) {
    return this.workers.remove(principal, workerId);
  }
}
