import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum IntakeStatus {
  RECEIVED = 'RECEIVED',
  ASSESSING = 'ASSESSING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CONVERTED = 'CONVERTED',
}

export enum IntakeDecision {
  FILE_SUIT = 'FILE_SUIT',
  DO_NOT_FILE = 'DO_NOT_FILE',
  NEGOTIATE_FIRST = 'NEGOTIATE_FIRST',
  SEND_NOTICE = 'SEND_NOTICE',
  COMPLAIN_TO_AUTHORITY = 'COMPLAIN_TO_AUTHORITY',
  PENDING = 'PENDING',
}

export enum ReferralType {
  INDIVIDUAL = 'INDIVIDUAL',
  LAWYER = 'LAWYER',
  HOSPITAL = 'HOSPITAL',
  COMPANY = 'COMPANY',
  GOVERNMENT = 'GOVERNMENT',
  OTHER = 'OTHER',
}

export enum ReferralChannel {
  WALK_IN = 'WALK_IN',
  PHONE = 'PHONE',
  EMAIL = 'EMAIL',
  LINE = 'LINE',
  REFERRAL = 'REFERRAL',
  OTHER = 'OTHER',
}

const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateIntakeDto {
  @IsDateString()
  receivedDate!: string;

  @IsOptional()
  @Trim()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(ReferralType)
  referralType?: ReferralType;

  @IsOptional()
  @IsEnum(ReferralChannel)
  referralChannel?: ReferralChannel;

  @IsOptional()
  @Trim()
  @IsString()
  referralName?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @Trim()
  @IsString()
  clientName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  matterType?: string;

  @IsOptional()
  @Trim()
  @IsString()
  opposingParty?: string;

  @IsOptional()
  @IsDateString()
  incidentDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  estimatedDamage?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assignedUserIds?: string[];

  @IsOptional()
  @IsDateString()
  deadlineDate?: string;
}

export class UpdateIntakeDto {
  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @IsOptional()
  @Trim()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(ReferralType)
  referralType?: ReferralType;

  @IsOptional()
  @IsEnum(ReferralChannel)
  referralChannel?: ReferralChannel;

  @IsOptional()
  @Trim()
  @IsString()
  referralName?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @Trim()
  @IsString()
  clientName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  matterType?: string;

  @IsOptional()
  @Trim()
  @IsString()
  opposingParty?: string;

  @IsOptional()
  @IsDateString()
  incidentDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  estimatedDamage?: number;

  // Assessment fields
  @IsOptional()
  @IsString()
  assessmentNotes?: string;

  @IsOptional()
  @IsString()
  caseStrength?: string;

  // Decision fields
  @IsOptional()
  @IsEnum(IntakeDecision)
  decision?: IntakeDecision;

  @IsOptional()
  @IsString()
  decisionNotes?: string;

  @IsOptional()
  @IsString()
  clientDecision?: string;

  // Notice fields
  @IsOptional()
  @IsString()
  noticeRecipient?: string;

  @IsOptional()
  @IsDateString()
  noticeDeadline?: string;

  @IsOptional()
  @IsString()
  noticeResult?: string;
}

export class AssessIntakeDto {
  @IsOptional()
  @IsString()
  assessmentNotes?: string;

  @IsOptional()
  @IsString()
  caseStrength?: string;

  @IsOptional()
  @IsUUID()
  assessorId?: string;
}

export class DecideIntakeDto {
  @IsEnum(IntakeDecision)
  decision!: IntakeDecision;

  @IsOptional()
  @IsString()
  decisionNotes?: string;

  @IsOptional()
  @IsString()
  clientDecision?: string;
}

export class NoticeDto {
  @IsString()
  noticeRecipient!: string;

  @IsOptional()
  @IsDateString()
  noticeDeadline?: string;

  @IsOptional()
  @IsString()
  noticeResult?: string;

  @IsOptional()
  @IsString()
  noticeContent?: string;

  @IsOptional()
  @IsBoolean()
  noticeContentReviewed?: boolean;
}

export class DraftNoticeDto {
  @IsOptional()
  @IsUUID()
  analysisId?: string;
}

export class ConvertToCaseDto {
  @IsOptional()
  @IsUUID()
  leadLawyerId?: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class IntakeQueryDto {
  @IsOptional()
  @IsEnum(IntakeStatus)
  status?: IntakeStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}
