/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { RewardsController } from './rewards.controller';

@Module({ controllers: [RewardsController] })
export class RewardsModule {}
