import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { InsuranceClaimStage, POLICY_TYPES } from '@lawfirm/shared';

class InsuranceClaimDetailsDto {
  @IsOptional()
  @IsString()
  assuredName?: string | null;

  @IsOptional()
  @IsIn(POLICY_TYPES)
  policyType?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9_999_999_999_999.99)
  claimAmount?: number | null;

  @ValidateIf((_dto, value) => value !== undefined)
  @IsIn(['THB', 'USD', 'EUR'])
  claimCurrency?: string;
}

export class CreateInsuranceClaimDto extends InsuranceClaimDetailsDto {
  @IsString()
  insurerName!: string;

  @IsOptional()
  @IsString()
  policyNumber?: string;

  @IsOptional()
  @IsString()
  claimNumber?: string;

  @IsDateString()
  incidentDate!: string;

  @IsOptional()
  @IsDateString()
  claimedDate?: string;
}

export class UpdateInsuranceClaimDto extends InsuranceClaimDetailsDto {
  @IsOptional()
  @IsString()
  insurerName?: string;

  @IsOptional()
  @IsString()
  policyNumber?: string;

  @IsOptional()
  @IsString()
  claimNumber?: string;

  @IsOptional()
  @IsDateString()
  incidentDate?: string;

  @IsOptional()
  @IsDateString()
  claimedDate?: string;

  @IsOptional()
  @IsString()
  denialReason?: string;

  @IsOptional()
  @IsDateString()
  demandLetterSentAt?: string;

  @IsOptional()
  @IsDateString()
  demandLetterDeadline?: string;

  @IsOptional()
  @IsString()
  oicComplaintNumber?: string;

  @IsOptional()
  @IsDateString()
  oicComplaintDate?: string;

  @IsOptional()
  @IsString()
  oicOutcome?: string;
}

export class AdvanceStageDto {
  @IsEnum(InsuranceClaimStage)
  stage!: InsuranceClaimStage;
}
