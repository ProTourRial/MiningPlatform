/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';

@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
