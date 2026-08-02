/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { CurrentPrincipal } from '../../common/auth/current-principal.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CredentialActionDto, CreateWorkerCredentialDto } from './dto/credentials.dto';
import { CredentialsService } from './credentials.service';

@ApiTags('credentials')
@ApiBearerAuth()
@Controller({ path: 'credentials', version: '1' })
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get('workers/:workerId')
  @RequirePermissions('credentials.read')
  list(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string) {
    return this.credentials.list(principal, workerId);
  }

  @Post('workers/:workerId')
  @RequirePermissions('credentials.write')
  create(@CurrentPrincipal() principal: AuthPrincipal, @Param('workerId') workerId: string, @Body() input: CreateWorkerCredentialDto) {
    return this.credentials.create(principal, workerId, input.expiresAt);
  }

  @Post(':credentialId/rotate')
  @RequirePermissions('credentials.write')
  rotate(@CurrentPrincipal() principal: AuthPrincipal, @Param('credentialId') credentialId: string) {
    return this.credentials.rotate(principal, credentialId);
  }

  @Post(':credentialId/revoke')
  @RequirePermissions('credentials.revoke')
  revoke(@CurrentPrincipal() principal: AuthPrincipal, @Param('credentialId') credentialId: string, @Body() input: CredentialActionDto) {
    return this.credentials.revoke(principal, credentialId, input.reason);
  }

  @Post(':credentialId/expire')
  @RequirePermissions('credentials.revoke')
  expire(@CurrentPrincipal() principal: AuthPrincipal, @Param('credentialId') credentialId: string, @Body() input: CredentialActionDto) {
    return this.credentials.expire(principal, credentialId, input.reason);
  }
}
