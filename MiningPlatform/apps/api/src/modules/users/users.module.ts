/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuditCoreModule } from '../audit/audit-core.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ imports: [AuthModule, AuditCoreModule], controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
