import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentCategory } from '@lawfirm/shared';

/** หมวดที่ลูกความเลือกได้ — คำฟ้อง/คำสั่งศาล/เอกสารภายใน เป็นของสำนักงานเท่านั้น */
export const CLIENT_DOCUMENT_CATEGORIES = [
  DocumentCategory.EVIDENCE,
  DocumentCategory.CONTRACT,
  DocumentCategory.CORRESPONDENCE,
  DocumentCategory.IDENTITY,
  DocumentCategory.MEDICAL,
  DocumentCategory.FINANCIAL,
  DocumentCategory.OTHER,
] as const;

export class UploadPortalCaseDocumentDto {
  @IsOptional()
  @IsIn(CLIENT_DOCUMENT_CATEGORIES, { message: 'ประเภทเอกสารไม่ถูกต้อง' })
  docType?: (typeof CLIENT_DOCUMENT_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'หมายเหตุต้องไม่เกิน 500 ตัวอักษร' })
  note?: string;

  /** วันสำคัญที่ลูกความแจ้ง — กลายเป็นวันที่รอทนายยืนยันในคดี */
  @IsOptional()
  @IsDateString({}, { message: 'วันที่ไม่ถูกต้อง' })
  keyDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'ชื่อวันสำคัญต้องไม่เกิน 100 ตัวอักษร' })
  keyDateLabel?: string;
}
