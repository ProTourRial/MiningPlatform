/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsString()
  @Matches(/^[a-z0-9_-]{3,32}$/)
  miningUsername!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  totpCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^mprc_[A-Za-z0-9_-]{10,64}$/)
  recoveryCode?: string;
}

export class TokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  token!: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class TotpCodeDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class DisableTotpDto extends TotpCodeDto {
  @IsString()
  @MaxLength(128)
  password!: string;
}
