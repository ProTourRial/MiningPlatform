/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringGateway } from './monitoring.gateway.js';
import { MonitoringRuntimeState } from './monitoring-runtime-state.js';
import { MonitoringService } from './monitoring.service.js';

@Module({
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringGateway, MonitoringRuntimeState],
})
export class MonitoringModule {}
