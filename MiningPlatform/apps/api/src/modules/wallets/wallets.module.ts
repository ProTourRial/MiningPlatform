/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';

@Module({ controllers: [WalletsController] })
export class WalletsModule {}
