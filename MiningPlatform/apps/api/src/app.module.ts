/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { SystemModule } from './modules/system/system.module';
import { VersionModule } from './modules/version/version.module';
import { DomainModules } from './modules/domain-modules';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    HealthModule,
    SystemModule,
    VersionModule,
    ...DomainModules,
  ],
})
export class AppModule {}
