/** MiningPlatform — Author: Abia Nugrahanto */
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

const CHANNEL_TYPES = ['EMAIL', 'TELEGRAM', 'DISCORD', 'WEBHOOK'] as const;
const EVENT_TYPES = ['SECURITY', 'WORKER', 'REWARD', 'PAYOUT', 'SYSTEM'] as const;

export class CreateNotificationChannelDto {
  @IsIn(CHANNEL_TYPES)
  type!: (typeof CHANNEL_TYPES)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  destination!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsIn(EVENT_TYPES, { each: true })
  events!: string[];
}
