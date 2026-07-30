import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { MetricsController } from './metrics.controller.js';

@Module({ controllers: [HealthController, MetricsController], providers: [HealthService] })
export class HealthModule {}
