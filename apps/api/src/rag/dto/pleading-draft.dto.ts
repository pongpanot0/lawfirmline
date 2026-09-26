import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PLEADING_KINDS, PleadingKind } from '../pleading-draft.service';

export class CreatePleadingDraftDto {
  @IsIn(PLEADING_KINDS, { message: 'ประเภทร่างไม่ถูกต้อง' })
  kind!: PleadingKind;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'คำสั่งเพิ่มเติมยาวเกิน 2000 ตัวอักษร' })
  instructions?: string;

  /** Restrict the sources to these documents; omitted = whole case file. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true, message: 'รหัสเอกสารไม่ถูกต้อง' })
  documentIds?: string[];
}

export class UpdatePleadingDraftDto {
  @IsString()
  @IsNotEmpty({ message: 'เนื้อหาร่างต้องไม่ว่าง' })
  bodyText!: string;
}
