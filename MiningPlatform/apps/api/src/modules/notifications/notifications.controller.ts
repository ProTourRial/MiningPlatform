/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('notifications')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  @Get('status')
  getStatus() {
    return { module: 'notifications', status: 'scaffolded' };
  }
}
