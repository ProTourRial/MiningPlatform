/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWorkerCredentialDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CredentialActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
