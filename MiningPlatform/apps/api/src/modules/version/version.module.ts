/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { VersionController } from './version.controller';

@Module({ controllers: [VersionController] })
export class VersionModule {}
