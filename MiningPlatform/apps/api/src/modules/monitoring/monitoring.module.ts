/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringGateway } from './monitoring.gateway.js';
import { MonitoringRuntimeState } from './monitoring-runtime-state.js';
import { MonitoringService } from './monitoring.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringGateway, MonitoringRuntimeState],
})
export class MonitoringModule {}
