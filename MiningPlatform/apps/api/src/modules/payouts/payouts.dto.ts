/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { IsBoolean } from 'class-validator';

export class UpdateAutoWithdrawalDto {
  @IsBoolean()
  enabled!: boolean;
}
