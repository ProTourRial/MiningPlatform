/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthRateLimitGuard } from './auth-rate-limit.guard.js';
import { AuthService } from './auth.service.js';
import { StepUpService } from './step-up.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AuthRateLimitGuard, StepUpService],
  exports: [AuthGuard, AuthService, StepUpService],
})
export class AuthModule {}
