import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { InsuranceClaimStage } from '@lawfirm/shared';

export class CreateInsuranceClaimDto {
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

export class UpdateInsuranceClaimDto {
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
