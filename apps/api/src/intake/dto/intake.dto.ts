import { DocRequestStatus, IntakeStage } from '@lawfirm/shared';
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum IntakeStatus {
  RECEIVED = 'RECEIVED',
  ASSESSING = 'ASSESSING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CONVERTED = 'CONVERTED',
  CONSULTED = 'CONSULTED',
  /** ติดต่อไปแล้วไม่ตอบ — lead ที่เงียบต้องมีที่ลง ไม่ใช่ค้างเป็น RECEIVED ตลอดไป */
  NO_RESPONSE = 'NO_RESPONSE',
}

export enum IntakeDecision {
  FILE_SUIT = 'FILE_SUIT',
  DO_NOT_FILE = 'DO_NOT_FILE',
  NEGOTIATE_FIRST = 'NEGOTIATE_FIRST',
  SEND_NOTICE = 'SEND_NOTICE',
  COMPLAIN_TO_AUTHORITY = 'COMPLAIN_TO_AUTHORITY',
  CONSULTATION_ONLY = 'CONSULTATION_ONLY',
  PENDING = 'PENDING',
}

export enum PreLitigationType {
  GENERAL = 'GENERAL',
  MEDICAL_CLAIM = 'MEDICAL_CLAIM',
  TRANSPORT = 'TRANSPORT',
}

export enum PreLitigationStatus {
  NOT_STARTED = 'NOT_STARTED',
  NOTICE_TO_SEND = 'NOTICE_TO_SEND',
  NOTICE_SENT = 'NOTICE_SENT',
  UNDER_REVIEW = 'UNDER_REVIEW',
  REPORT_PREPARED = 'REPORT_PREPARED',
  OFFER_RECEIVED = 'OFFER_RECEIVED',
  NEGOTIATING = 'NEGOTIATING',
  APPEAL_REVIEW = 'APPEAL_REVIEW',
  READY_TO_FILE = 'READY_TO_FILE',
  CLOSED_SETTLED = 'CLOSED_SETTLED',
  CLOSED_NO_FILE = 'CLOSED_NO_FILE',
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

/** ลูกค้า (ผู้ว่าจ้าง/ผู้จ่ายเงิน) — ต่างจากลูกความ (clientId) ที่เราว่าความให้ */
export class CustomerShareDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sharePercent?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  note?: string;
}

/** ลูกความเพิ่มเติม (เกินคนที่ 1) — ลูกความหลักยังคงเป็น clientId */
export class AdditionalClientDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @Trim()
  @IsString()
  note?: string;
}

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerShareDto)
  customers?: CustomerShareDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalClientDto)
  clients?: AdditionalClientDto[];

  @IsOptional()
  @Trim()
  @IsString()
  clientName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  matterType?: string;

  @IsOptional()
  @IsUUID()
  caseTypeId?: string;

  @IsOptional()
  @Trim()
  @IsString()
  opposingParty?: string;

  @IsOptional()
  @Trim()
  @IsString()
  customerRef?: string;

  @IsOptional()
  @Trim()
  @IsString()
  insurerName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  policyNumber?: string;

  @IsOptional()
  @Trim()
  @IsString()
  claimNumber?: string;

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

  @IsOptional()
  @IsUUID()
  relatedCaseId?: string;

  @IsOptional()
  @IsBoolean()
  isOngoingElsewhere?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  externalCaseNumber?: string;

  @IsOptional()
  @IsString()
  currentStageNote?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @IsOptional()
  @IsUUID()
  followUpOwnerId?: string;

  @IsOptional()
  @IsEnum(PreLitigationType)
  preLitigationType?: PreLitigationType;

  @IsOptional()
  @IsEnum(PreLitigationStatus)
  preLitigationStatus?: PreLitigationStatus;

  @IsOptional()
  @IsString()
  preLitigationNotes?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  settlementOfferAmount?: number;
}

export class UpdateIntakeDto {
  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assignedUserIds?: string[];

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerShareDto)
  customers?: CustomerShareDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalClientDto)
  clients?: AdditionalClientDto[];

  @IsOptional()
  @Trim()
  @IsString()
  clientName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  matterType?: string;

  @IsOptional()
  @IsUUID()
  caseTypeId?: string;

  @IsOptional()
  @Trim()
  @IsString()
  opposingParty?: string;

  @IsOptional()
  @Trim()
  @IsString()
  customerRef?: string;

  @IsOptional()
  @Trim()
  @IsString()
  insurerName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  policyNumber?: string;

  @IsOptional()
  @Trim()
  @IsString()
  claimNumber?: string;

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
  @Trim()
  @IsString()
  contactName?: string;

  /** Date the client asked for a reply by — NOT a legal deadline. */
  @IsOptional()
  @IsDateString()
  requestedResponseDate?: string;

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

  @IsOptional()
  @ValidateIf((o) => o.relatedCaseId !== null)
  @IsUUID()
  relatedCaseId?: string | null;

  @IsOptional()
  @IsBoolean()
  isOngoingElsewhere?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  externalCaseNumber?: string;

  @IsOptional()
  @IsString()
  currentStageNote?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @IsOptional()
  @IsUUID()
  followUpOwnerId?: string;

  @IsOptional()
  @IsEnum(PreLitigationType)
  preLitigationType?: PreLitigationType;

  @IsOptional()
  @IsEnum(PreLitigationStatus)
  preLitigationStatus?: PreLitigationStatus;

  @IsOptional()
  @IsString()
  preLitigationNotes?: string;

  @ValidateIf((o) => o.settlementOfferAmount !== null)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  settlementOfferAmount?: number | null;
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

  /** รับทราบว่าเอกสารที่ขอไว้ยังไม่ครบ แล้วยืนยันจะออกหนังสือ */
  @IsOptional()
  @IsBoolean()
  acknowledgeMissingDocuments?: boolean;
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

  @IsOptional()
  @IsUUID()
  caseTypeId?: string;

  /**
   * What is being claimed in the suit. The intake's estimated damage is a
   * different figure and is never copied here on its own: a lawyer confirms
   * the amount, or the case opens without one.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  claimedAmount?: number;

  /**
   * เหตุผลที่ข้ามผลตรวจ conflict — จำเป็นเมื่อยังไม่ได้ตรวจ หรือผลตรวจล่าสุด
   * ไม่ใช่ CLEAR. เก็บลง activity ของคดีเพื่อให้ย้อนดูได้ว่าใครอนุมัติให้ข้าม
   */
  @IsOptional()
  @IsString()
  conflictOverrideReason?: string;
}

export class UpdateIntakeStageDto {
  @IsEnum(IntakeStage)
  stage!: IntakeStage;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateDocumentRequestDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class BulkCreateDocumentRequestsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentRequestDto)
  items!: CreateDocumentRequestDto[];
}

export class UpdateDocumentRequestDto {
  @IsOptional()
  @IsEnum(DocRequestStatus)
  status?: DocRequestStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsUUID()
  documentId?: string;
}

export class CreateFollowUpDto {
  @IsString()
  note!: string;

  /** ติดต่อได้จริงหรือไม่ — ไม่ได้ติดต่อก็ยังนับเป็นการติดตามหนึ่งครั้ง */
  @IsOptional()
  @IsBoolean()
  contacted?: boolean;

  @IsOptional()
  @IsDateString()
  nextDueAt?: string;

  @IsOptional()
  @IsUUID()
  nextOwnerId?: string;
}

export class NoResponseDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class IntakeQueryDto {
  @IsOptional()
  @IsEnum(IntakeStatus)
  status?: IntakeStatus;

  /** เฉพาะเรื่องที่คนนี้เป็นเจ้าของการติดตาม */
  @IsOptional()
  @IsUUID()
  followUpOwnerId?: string;

  /** เฉพาะเรื่องที่นัดติดตามแล้วเลยกำหนด (หรือยังไม่ได้นัดเลย) */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  followUpOverdue?: boolean;

  /** เฉพาะเรื่องที่ค้างในสถานะเดิมนานกว่า N วัน */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  stalledDays?: number;

  @IsOptional()
  @IsEnum(IntakeStage)
  stage?: IntakeStage;

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
