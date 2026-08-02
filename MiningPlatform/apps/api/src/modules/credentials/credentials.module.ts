/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuditCoreModule } from '../audit/audit-core.module';
import { AuthModule } from '../auth/auth.module';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';

@Module({ imports: [AuthModule, AuditCoreModule], controllers: [CredentialsController], providers: [CredentialsService] })
export class CredentialsModule {}
