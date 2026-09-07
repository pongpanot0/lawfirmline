import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { DeadlineDayBasis, DeadlineTrigger } from '@lawfirm/shared';

export class CreateDeadlineRuleDto {
  /** Omit to apply the rule to every case type in the firm. */
  @IsOptional()
  @IsUUID()
  caseTypeId?: string;

  @IsEnum(DeadlineTrigger)
  trigger!: DeadlineTrigger;

  @IsString()
  label!: string;

  @IsInt()
  @Min(0)
  @Max(3650)
  offsetDays!: number;

  @IsOptional()
  @IsEnum(DeadlineDayBasis)
  dayBasis?: DeadlineDayBasis;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDeadlineRuleDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  offsetDays?: number;

  @IsOptional()
  @IsEnum(DeadlineDayBasis)
  dayBasis?: DeadlineDayBasis;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
