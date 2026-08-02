/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';

@Module({ controllers: [SystemController] })
export class SystemModule {}
