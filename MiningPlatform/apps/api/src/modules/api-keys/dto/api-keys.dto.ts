/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  permissions!: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
