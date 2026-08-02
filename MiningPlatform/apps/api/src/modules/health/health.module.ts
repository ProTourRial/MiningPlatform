/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { MetricsController } from './metrics.controller.js';

@Module({ imports: [AuthModule], controllers: [HealthController, MetricsController], providers: [HealthService] })
export class HealthModule {}
