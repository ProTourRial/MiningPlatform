/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { UpdateProfileDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.usersService.me(principal.userId);
  }

  @Patch('me')
  update(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: UpdateProfileDto) {
    return this.usersService.update(principal.userId, dto);
  }

  @Get('me/sessions')
  sessions(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.usersService.sessions(principal.userId);
  }

  @Delete('me/sessions/:sessionId')
  revokeSession(@CurrentPrincipal() principal: AuthPrincipal, @Param('sessionId') sessionId: string) {
    return this.usersService.revokeSession(principal.userId, sessionId);
  }
}
