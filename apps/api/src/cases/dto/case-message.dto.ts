import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCaseMessageDto {
  /**
   * ว่างได้เมื่อแนบไฟล์มาอย่างเดียว — ส่งเอกสารเฉย ๆ โดยไม่พิมพ์อะไรเป็นเรื่องปกติ
   * ฝั่ง service เป็นคนปฏิเสธกรณีที่ไม่มีทั้งข้อความและไฟล์
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}
