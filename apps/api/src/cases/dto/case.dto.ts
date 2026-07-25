import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ActivityType, CaseStatus, CourtLevel } from '@lawfirm/shared';

export class InitialActivityDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  activityAt!: string;

  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;
}

export class CreateCaseDto {
  @IsString()
  ownRef!: string;

  @IsOptional()
  @IsString()
  customerRef?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  courtName?: string;

  @IsEnum(CourtLevel)
  courtLevel!: CourtLevel;

  @IsString()
  blackCaseNumber!: string;

  @IsString()
  redCaseNumber!: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @IsUUID()
  leadLawyerId!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  coCounselIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  clerkIds?: string[];

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsUUID()
  caseTypeId?: string;

  @IsOptional()
  @IsNumber()
  estimatedFee?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialActivityDto)
  initialActivity?: InitialActivityDto;
}

export class UpdateCaseDto {
  @IsOptional()
  @IsString()
  ownRef?: string;

  @IsOptional()
  @IsString()
  customerRef?: string | null;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  courtName?: string;

  @IsOptional()
  @IsEnum(CourtLevel)
  courtLevel?: CourtLevel;

  @IsOptional()
  @IsString()
  blackCaseNumber?: string | null;

  @IsOptional()
  @IsString()
  redCaseNumber?: string | null;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  leadLawyerId?: string;

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsDateString()
  closedAt?: string;

  @IsOptional()
  @IsUUID()
  caseTypeId?: string;

  @IsOptional()
  @IsNumber()
  estimatedFee?: number | null;

  @IsOptional()
  @IsString()
  closingSummary?: string | null;
}

export class CaseQueryDto {
  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  caseTypeId?: string;
}
