import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Matches, MaxLength, Min } from 'class-validator';
import { CourtEventKind, CourtLevel, DeadlineDayBasis, DeadlineTrigger, PartyRole, ServiceMethod } from '@lawfirm/shared';

class DeadlineRuleFilterFields {
  /** Calendar days added after the offset (e.g. −90 for "10 years − 90 days"). */
  @IsOptional() @IsInt() @Min(-3650) @Max(3650)
  adjustDays?: number;

  @IsOptional() @IsEnum(CourtEventKind)
  courtEventKind?: CourtEventKind | null;

  @IsOptional() @IsEnum(CourtLevel)
  courtLevel?: CourtLevel | null;

  @IsOptional() @IsEnum(PartyRole)
  partySide?: PartyRole | null;

  @IsOptional() @IsEnum(ServiceMethod)
  serviceMethod?: ServiceMethod | null;
}

export class CreateDeadlineRuleDto extends DeadlineRuleFilterFields {
  /** Ignored in this pass — every rule applies to all case types. */
  @IsOptional() @IsUUID()
  caseTypeId?: string;

  @IsEnum(DeadlineTrigger)
  trigger!: DeadlineTrigger;

  @IsString() @IsNotEmpty() @Matches(/\S/) @MaxLength(200)
  label!: string;

  /** Days, or months for MONTHS; negative = before the trigger. */
  @IsInt() @Min(-3650) @Max(3650)
  offsetDays!: number;

  @IsOptional() @IsEnum(DeadlineDayBasis)
  dayBasis?: DeadlineDayBasis;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  /** Platform admins only: create a default every firm runs instead of a firm rule. */
  @IsOptional() @IsBoolean()
  global?: boolean;
}

export class UpdateDeadlineRuleDto extends DeadlineRuleFilterFields {
  // No `label`: trigger + label is the key a firm override matches a global rule on,
  // so a rename would detach an override or shadow a statutory default.
  @IsOptional() @IsInt() @Min(-3650) @Max(3650)
  offsetDays?: number;

  @IsOptional() @IsEnum(DeadlineDayBasis)
  dayBasis?: DeadlineDayBasis;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
