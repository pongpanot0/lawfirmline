import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConvertPortalSubmissionDto {
  @IsOptional()
  @IsDateString()
  officePlannedDate?: string;

  /** เหตุผลที่รับเรื่องต่อทั้งที่พบชื่อขัดกัน — ต้องมีเมื่อ API ตอบ 409 CONFLICT_FOUND */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  conflictOverrideReason?: string;
}
