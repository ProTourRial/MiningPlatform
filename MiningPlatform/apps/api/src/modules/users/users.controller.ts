/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { CurrentPrincipal } from '../../common/auth/current-principal.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UpdateProfileDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @RequirePermissions('profile.read')
  me(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.users.me(principal);
  }

  @Patch('me')
  @RequirePermissions('profile.write')
  update(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: UpdateProfileDto) {
    return this.users.update(principal, input);
  }
}
