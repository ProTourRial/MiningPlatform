/** MiningPlatform — Author: Abia Nugrahanto */
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export const reconciliationCategories = [
  'AMOUNT_VARIANCE',
  'FEE_VARIANCE',
  'MISSING_SETTLEMENT',
  'DUPLICATE_SETTLEMENT',
  'PROVIDER_REFERENCE',
  'WRONG_ASSET',
  'OTHER',
] as const;
export const reconciliationSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const reconciliationResolutionCodes = [
  'PROVIDER_CORRECTED',
  'INTERNAL_EXPECTATION_CORRECTED',
  'ACCEPTED_VARIANCE',
  'LEDGER_ADJUSTMENT',
] as const;

export class OpenReconciliationExceptionDto {
  @IsIn(reconciliationCategories)
  category!: (typeof reconciliationCategories)[number];

  @IsIn(reconciliationSeverities)
  severity!: (typeof reconciliationSeverities)[number];

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  summary!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(2_000)
  proposedResolution!: string;
}

export class VersionedCommentDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  comment?: string;
}

export class RejectReconciliationExceptionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(2_000)
  comment!: string;
}

export class SubmitReconciliationExceptionDto extends VersionedCommentDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(2_000)
  proposedResolution?: string;
}

export class ResolveReconciliationExceptionDto extends VersionedCommentDto {
  @IsIn(reconciliationResolutionCodes)
  resolutionCode!: (typeof reconciliationResolutionCodes)[number];

  @IsString()
  @MinLength(8)
  @MaxLength(4_000)
  resolutionNotes!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  resolutionJournalEntryId?: string;
}
