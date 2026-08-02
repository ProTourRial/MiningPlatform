/** MiningPlatform — Author: Abia Nugrahanto */
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const HARDWARE_TYPES = ['CPU', 'GPU', 'FPGA', 'ASIC', 'HYBRID', 'OTHER', 'UNKNOWN'] as const;

export class CreateWorkerDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{1,64}$/)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  miningAccountId?: string;

  @IsOptional()
  @IsIn(HARDWARE_TYPES)
  declaredHardwareType?: (typeof HARDWARE_TYPES)[number];
}

export class UpdateWorkerDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{1,64}$/)
  name?: string;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsBoolean()
  agentEnabled?: boolean;

  @IsOptional()
  @IsIn(HARDWARE_TYPES)
  declaredHardwareType?: (typeof HARDWARE_TYPES)[number];
}
