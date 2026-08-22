/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateAutoWithdrawalDto {
  @IsBoolean()
  enabled!: boolean;
}

export class RegisterPayoutAddressDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  payoutRouteId!: string;

  @IsString()
  @MinLength(14)
  @MaxLength(128)
  @Matches(/^\S+$/)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}
