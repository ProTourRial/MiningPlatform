/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuditCoreModule } from '../audit/audit-core.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

@Module({ imports: [AuthModule, AuditCoreModule], controllers: [ApiKeysController], providers: [ApiKeysService] })
export class ApiKeysModule {}
