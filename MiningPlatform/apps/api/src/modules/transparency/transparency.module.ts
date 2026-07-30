/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { TransparencyController } from './transparency.controller';

@Module({ controllers: [TransparencyController] })
export class TransparencyModule {}
