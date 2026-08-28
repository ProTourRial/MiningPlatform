/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

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

export class SelectPayoutDestinationDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  payoutAddressId!: string;
}

export class RequestPayoutDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  miningAccountId!: string;

  @IsString()
  @Matches(/^[1-9][0-9]{0,18}$/)
  amountAtomic!: string;
}

export class PayoutDecisionDto {
  @IsString()
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class CancelPayoutDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
