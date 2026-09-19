import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { CaseOutcome } from '@lawfirm/shared';

export class CloseCaseDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'สรุปคดีต้องมีอย่างน้อย 10 ตัวอักษร' })
  closingSummary!: string;

  /** ผลของคดี — บันทึกตอนปิด ไม่ใช่ปล่อยให้ค้างเป็น IN_PROGRESS ตลอดไป */
  @IsOptional()
  @IsEnum(CaseOutcome)
  outcome?: CaseOutcome;

  /**
   * รับทราบว่ายังมีงาน/วันนัด/เอกสารค้างอยู่ แล้วยืนยันจะปิด
   * ระบบไม่ตัดสินใจแทน แต่ต้องให้เห็นก่อนกดปิด
   */
  @IsOptional()
  @IsBoolean()
  acknowledgeOutstanding?: boolean;
}
