/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { CurrentPrincipal } from '../../common/auth/current-principal.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/api-keys.dto';

@ApiTags('api-keys')
@ApiBearerAuth()
@Controller({ path: 'api-keys', version: '1' })
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequirePermissions('api-keys.read')
  list(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.apiKeys.list(principal);
  }

  @Post()
  @RequirePermissions('api-keys.write')
  create(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: CreateApiKeyDto) {
    return this.apiKeys.create(principal, input);
  }

  @Delete(':id')
  @RequirePermissions('api-keys.revoke')
  revoke(@CurrentPrincipal() principal: AuthPrincipal, @Param('id') id: string) {
    return this.apiKeys.revoke(principal, id);
  }
}
