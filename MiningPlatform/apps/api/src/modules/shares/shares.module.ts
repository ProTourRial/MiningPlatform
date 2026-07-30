/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { SharesController } from './shares.controller';

@Module({ controllers: [SharesController] })
export class SharesModule {}
