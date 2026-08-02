/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuditCoreModule } from '../audit/audit-core.module';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { AuthorizationService } from './authorization.service';
import { IdentityDeliveryService } from './identity-delivery.service';
import { PermissionsGuard } from './permissions.guard';

@Module({
  imports: [AuditCoreModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService, AuthorizationService, IdentityDeliveryService, AccessTokenGuard, PermissionsGuard],
  exports: [AuthService, AuthRateLimitService, AuthorizationService, AccessTokenGuard, PermissionsGuard],
})
export class AuthModule {}
