import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsObject,
} from 'class-validator';
import { CaseStatus } from '@lawfirm/shared';

export class CreateCaseDto {
  @IsString()
  caseNumber!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  courtName?: string;

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
}

export class UpdateCaseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  courtName?: string;

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
