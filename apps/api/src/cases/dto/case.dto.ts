import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsObject,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  ActivityType,
  CaseStatus,
  CASE_NUMBER_HINT,
  CASE_NUMBER_REGEX,
  CourtLevel,
  FEE_MAX,
  FEE_MIN,
  ParticipantRole,
  ParticipantSide,
} from '@lawfirm/shared';

/** Trim incoming strings so stray whitespace never breaks a format check. */
const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

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
  @IsOptional()
  @IsString()
  ownRef?: string;

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

  @Trim()
  @IsString()
  @Matches(CASE_NUMBER_REGEX, { message: `เลขดำ: ${CASE_NUMBER_HINT}` })
  blackCaseNumber!: string;

  @Trim()
  @IsString()
  @Matches(CASE_NUMBER_REGEX, { message: `เลขแดง: ${CASE_NUMBER_HINT}` })
  redCaseNumber!: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  @IsUUID()
  leadLawyerId!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  buddyIds?: string[];

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsUUID()
  caseTypeId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(FEE_MIN)
  @Max(FEE_MAX)
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

  // Legacy cases were created before the format was enforced, so clearing the
  // field (null / '') stays allowed — only a non-empty value must match.
  @IsOptional()
  @Trim()
  @IsString()
  @ValidateIf((_, value) => value !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `เลขดำ: ${CASE_NUMBER_HINT}` })
  blackCaseNumber?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @ValidateIf((_, value) => value !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `เลขแดง: ${CASE_NUMBER_HINT}` })
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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(FEE_MIN)
  @Max(FEE_MAX)
  estimatedFee?: number | null;

  @IsOptional()
  @IsString()
  closingSummary?: string | null;
}

export class CreateParticipantDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsEnum(ParticipantRole)
  role!: ParticipantRole;

  @IsEnum(ParticipantSide)
  side!: ParticipantSide;

  @IsOptional()
  @IsString()
  personType?: string;

  @IsOptional()
  @IsString()
  idNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  opposingLawyer?: string;

  @IsOptional()
  @IsString()
  opposingInsurer?: string;

  @IsOptional()
  @IsString()
  medicalLicenseNo?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateParticipantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsEnum(ParticipantRole)
  role?: ParticipantRole;

  @IsOptional()
  @IsEnum(ParticipantSide)
  side?: ParticipantSide;

  @IsOptional()
  @IsString()
  personType?: string;

  @IsOptional()
  @IsString()
  idNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  opposingLawyer?: string;

  @IsOptional()
  @IsString()
  opposingInsurer?: string;

  @IsOptional()
  @IsString()
  medicalLicenseNo?: string;

  @IsOptional()
  @IsString()
  notes?: string;
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

export class UpdateCaseAssignmentsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  buddyIds!: string[];
}
