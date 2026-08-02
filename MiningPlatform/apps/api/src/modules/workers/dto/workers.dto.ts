/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

const hardware = ['CPU', 'GPU', 'FPGA', 'ASIC', 'HYBRID', 'OTHER', 'UNKNOWN'] as const;

export class CreateWorkerDto {
  @IsString()
  @Length(1, 80)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  name!: string;

  @IsOptional()
  @IsString()
  miningAccountId?: string;

  @IsOptional()
  @IsIn(hardware)
  declaredType?: (typeof hardware)[number];
}

export class UpdateWorkerDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  name?: string;

  @IsOptional()
  @IsIn(['PENDING', 'DISABLED'])
  status?: 'PENDING' | 'DISABLED';

  @IsOptional()
  @IsIn(hardware)
  declaredType?: (typeof hardware)[number];
}
