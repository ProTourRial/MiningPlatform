/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { WorkersController } from './workers.controller';

@Module({ controllers: [WorkersController] })
export class WorkersModule {}
