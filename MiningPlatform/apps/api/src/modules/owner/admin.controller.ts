/** MiningPlatform — Author: Abia Nugrahanto */
import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Roles, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AdminService } from './admin.service.js';
import { UpdateUserStatusDto } from './admin.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Roles('ADMIN')
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('overview')
  overview(@CurrentPrincipal() principal: AuthPrincipal) { return this.service.overview(principal.userId); }

  @Get('users')
  users(@CurrentPrincipal() principal: AuthPrincipal) { return this.service.users(principal.userId); }

  @Patch('users/:userId/status')
  updateUserStatus(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.service.updateUserStatus(principal.userId, userId, dto.status);
  }
}
