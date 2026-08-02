/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditController } from './audit.controller';
import { AuditCoreModule } from './audit-core.module';

@Module({ imports: [AuthModule, AuditCoreModule], controllers: [AuditController] })
export class AuditModule {}
