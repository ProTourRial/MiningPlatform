/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(2, 120)
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;

  @IsOptional()
  @IsIn(['INDIVIDUAL', 'COMPANY'])
  accountType?: 'INDIVIDUAL' | 'COMPANY';
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  totpCode?: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

export class EmailActionDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword!: string;
}

export class TotpCodeDto {
  @IsString()
  @Length(6, 32)
  code!: string;
}

export class DisableTotpDto extends TotpCodeDto {
  @IsString()
  password!: string;
}

export class RevokeSessionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
