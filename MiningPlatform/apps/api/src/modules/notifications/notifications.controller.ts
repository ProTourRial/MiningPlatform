/** MiningPlatform — Author: Abia Nugrahanto */
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, Scopes, type AuthPrincipal } from '../auth/auth.decorators.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CreateNotificationChannelDto } from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get('status')
  getStatus() {
    return { module: 'notifications', status: 'control-plane-alpha', deliveryAdapters: 'pending-worker-integration' };
  }

  @Get()
  list(@CurrentPrincipal() principal: AuthPrincipal) { return this.service.list(principal.userId); }

  @Patch(':notificationId/read')
  markRead(@CurrentPrincipal() principal: AuthPrincipal, @Param('notificationId') notificationId: string) {
    return this.service.markRead(principal.userId, notificationId);
  }

  @Get('channels')
  channels(@CurrentPrincipal() principal: AuthPrincipal) { return this.service.channels(principal.userId); }

  @Post('channels')
  @Scopes('notifications:write')
  createChannel(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: CreateNotificationChannelDto) {
    return this.service.createChannel(principal.userId, dto);
  }

  @Delete('channels/:channelId')
  @Scopes('notifications:write')
  disableChannel(@CurrentPrincipal() principal: AuthPrincipal, @Param('channelId') channelId: string) {
    return this.service.disableChannel(principal.userId, channelId);
  }
}
