/** MiningPlatform — Author: Abia Nugrahanto */
import { ArrayMaxSize, IsArray, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  scopes!: string[];

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
