/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  locale?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  timezone?: string;

  @IsOptional()
  @IsIn(['INDIVIDUAL', 'COMPANY'])
  accountType?: 'INDIVIDUAL' | 'COMPANY';
}
