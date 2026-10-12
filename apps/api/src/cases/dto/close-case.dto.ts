import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { CaseOutcome } from '@lawfirm/shared';

export class CloseCaseDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'สรุปคดีต้องมีอย่างน้อย 10 ตัวอักษร' })
  closingSummary!: string;

  /** ผลของคดี — บังคับตอนปิด; IN_PROGRESS ไม่ใช่ผล */
  @IsIn(Object.values(CaseOutcome).filter((o) => o !== CaseOutcome.IN_PROGRESS), {
    message: 'เลือกผลคดีก่อนปิด',
  })
  outcome!: CaseOutcome;

  /**
   * รับทราบว่ายังมีงาน/วันนัด/เอกสารค้างอยู่ แล้วยืนยันจะปิด
   * ระบบไม่ตัดสินใจแทน แต่ต้องให้เห็นก่อนกดปิด
   */
  @IsOptional()
  @IsBoolean()
  acknowledgeOutstanding?: boolean;
}
