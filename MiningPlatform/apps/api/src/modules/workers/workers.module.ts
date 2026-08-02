/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuditCoreModule } from '../audit/audit-core.module';
import { AuthModule } from '../auth/auth.module';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

@Module({ imports: [AuthModule, AuditCoreModule], controllers: [WorkersController], providers: [WorkersService], exports: [WorkersService] })
export class WorkersModule {}
