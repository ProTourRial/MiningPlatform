/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller';

@Module({ controllers: [LedgerController] })
export class LedgerModule {}
