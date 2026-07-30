/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';

@Module({ controllers: [UsersController] })
export class UsersModule {}
