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
