import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ConflictResult } from '@lawfirm/shared';

/** คำค้นแบบสั้นเกินไปจะ match ทุกคนในสำนักงาน ซึ่งเท่ากับไม่ได้ตรวจ */
export const CONFLICT_TERM_MIN_LENGTH = 3;

export class ConflictSearchDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(CONFLICT_TERM_MIN_LENGTH, { each: true, message: `คำค้นต้องยาวอย่างน้อย ${CONFLICT_TERM_MIN_LENGTH} ตัวอักษร` })
  @MaxLength(200, { each: true })
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : String(value ?? '').split(','))
      .map((term: unknown) => String(term).trim())
      .filter(Boolean),
  )
  terms!: string[];
}

export class RecordConflictCheckDto extends ConflictSearchDto {
  @IsOptional()
  @IsUUID()
  intakeId?: string;

  /** คำตัดสินของทนาย — ระบบเสนอได้ แต่ไม่ตัดสินแทน */
  @IsEnum(ConflictResult)
  result!: ConflictResult;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
