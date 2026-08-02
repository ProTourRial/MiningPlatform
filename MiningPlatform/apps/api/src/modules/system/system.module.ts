/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HealthModule } from '../health/health.module';
import { SystemController } from './system.controller';

@Module({ imports: [AuthModule, HealthModule], controllers: [SystemController] })
export class SystemModule {}
