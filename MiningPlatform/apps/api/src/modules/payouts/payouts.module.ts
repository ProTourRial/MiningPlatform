/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service.js';

@Module({ imports: [AuthModule], controllers: [PayoutsController], providers: [PayoutsService] })
export class PayoutsModule {}
