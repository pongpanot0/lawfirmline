import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsObject,
  Matches,
  Max,
  MaxLength,
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
  PartyRole,
  CaseStage,
} from '@lawfirm/shared';
import { CustomerShareDto, AdditionalClientDto } from '../../intake/dto/intake.dto';
import { UpsertCargoClaimDto } from '../../cargo-claims/dto/cargo-claim.dto';

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

export class OpponentDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  /** Default: the role opposite ours (โจทก์ ⇄ จำเลย, ผู้ร้อง ⇄ ผู้คัดค้าน). */
  @IsOptional()
  @IsEnum(ParticipantRole)
  role?: ParticipantRole;

  /** 'บุคคลธรรมดา' | 'นิติบุคคล' — same free text the participants form uses. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  personType?: string;
}

export class CreateCaseDto {
  @IsOptional()
  @IsString()
  ownRef?: string;

  /** The number the form pre-filled; sending it back unchanged means "auto" (regenerate on a race). */
  @IsOptional()
  @IsString()
  ownRefSuggested?: string;

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
  @IsEnum(PartyRole)
  partyRole?: PartyRole;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerShareDto)
  customers?: CustomerShareDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalClientDto)
  clients?: AdditionalClientDto[];

  /** คู่ความฝ่ายตรงข้าม — กลายเป็น CaseParticipant ฝั่ง OPPONENT */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OpponentDto)
  opponents?: OpponentDto[];

  @IsOptional()
  @IsString()
  courtName?: string;

  @IsEnum(CourtLevel)
  courtLevel!: CourtLevel;

  // A case is often opened before the court has issued its numbers. Both may
  // be left out (or sent empty) and added later; a value that is present
  // must fit the court format.
  @IsOptional()
  @Trim()
  @IsString()
  @ValidateIf((_, value) => value !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีดำ: ${CASE_NUMBER_HINT}` })
  blackCaseNumber?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @ValidateIf((_, value) => value !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีแดง: ${CASE_NUMBER_HINT}` })
  redCaseNumber?: string;

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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(FEE_MAX)
  claimedAmount?: number;

  /** วันครบอายุความ — ระบบตั้งเตือน "ครบอายุความ" ให้ 90/30/7/1 วันก่อน */
  @IsOptional()
  @IsDateString()
  limitationDeadline?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialActivityDto)
  initialActivity?: InitialActivityDto;

  @IsOptional()
  @IsBoolean()
  cargoClaimEnabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertCargoClaimDto)
  cargoClaim?: UpsertCargoClaimDto;
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
  clientId?: string | null;

  @IsOptional()
  @IsString()
  clientName?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerShareDto)
  customers?: CustomerShareDto[];

  @IsOptional()
  @IsEnum(PartyRole)
  partyRole?: PartyRole | null;

  /** ลูกความเพิ่มเติม — ส่งมาคือแทนที่ทั้งรายการ */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalClientDto)
  clients?: AdditionalClientDto[];

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
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีดำ: ${CASE_NUMBER_HINT}` })
  blackCaseNumber?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @ValidateIf((_, value) => value !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีแดง: ${CASE_NUMBER_HINT}` })
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
  @IsEnum(CaseStage)
  stage?: CaseStage;

  /** เหตุผลเมื่อย้ายขั้นตอนย้อนกลับ — บังคับในกรณีนั้น เก็บใน CaseStatusLog.note */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  stageNote?: string;

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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(FEE_MAX)
  claimedAmount?: number | null;

  /** null ล้างวันครบอายุความ (และลบการเตือน) */
  @IsOptional()
  @IsDateString()
  limitationDeadline?: string | null;

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

  /** ลูกความในทะเบียนที่เป็นคนเดียวกับคู่ความรายนี้ */
  @IsOptional()
  @IsUUID()
  clientId?: string;

  /** สำหรับทนาย/ผู้แทนฝ่ายตรงข้าม: คู่ความที่เขาเป็นตัวแทน */
  @IsOptional()
  @IsUUID()
  representedByParticipantId?: string;
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

  /** ลูกความในทะเบียนที่เป็นคนเดียวกับคู่ความรายนี้ — null ปลดการเชื่อม */
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  /** สำหรับทนาย/ผู้แทนฝ่ายตรงข้าม: คู่ความที่เขาเป็นตัวแทน — null ปลดการเชื่อม */
  @IsOptional()
  @IsUUID()
  representedByParticipantId?: string | null;
}

export class CaseQueryDto {
  /** ขั้นตอนในกระบวนพิจารณา — กรองแยกจาก status ได้ */
  @IsOptional()
  @IsEnum(CaseStage)
  stage?: CaseStage;

  /** ค้นจากชื่อคู่กรณี/ผู้เกี่ยวข้องในคดี ไม่ใช่แค่ชื่อลูกความ */
  @IsOptional()
  @IsString()
  party?: string;

  /** Show only cases this member works on (lead or buddy). */
  @IsOptional()
  @IsUUID()
  userId?: string;

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
