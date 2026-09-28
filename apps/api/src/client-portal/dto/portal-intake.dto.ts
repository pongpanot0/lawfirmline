import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitPortalIntakeDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  detail!: string;

  @IsOptional()
  @IsDateString()
  clientRequestedDate?: string;

  // multipart/form-data always sends field values as strings, so "true"/"false"
  // must be coerced before @IsBoolean() validates the actual boolean value.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  urgencyFlag?: boolean;

  /** วันสำคัญที่ลูกความแจ้ง — กลายเป็นวันที่รอทนายยืนยันในคดี */
  @IsOptional()
  @IsDateString({}, { message: 'วันที่ไม่ถูกต้อง' })
  keyDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'ชื่อวันสำคัญต้องไม่เกิน 100 ตัวอักษร' })
  keyDateLabel?: string;
}
