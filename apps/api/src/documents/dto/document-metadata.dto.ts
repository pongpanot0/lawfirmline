import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DocumentCategory } from '@lawfirm/shared';

/** ติ๊ก/ยกเลิกติ๊กเอกสารที่ต้องมีด้วยมือ — category อาจเป็น DocumentCategory หรือข้อความอิสระที่พิมพ์เองในหน้า Playbook */
export class SetDocumentConfirmedDto {
  @IsString()
  @MaxLength(100)
  category!: string;

  @IsBoolean()
  confirmed!: boolean;
}

/** หมวด/วันที่/tag ของเอกสาร — ส่งมาพร้อมตอนอัปโหลด หรือแก้ทีหลังก็ได้ */
export class DocumentMetadataDto {
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @IsOptional()
  @IsDateString()
  documentDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : String(value ?? '').split(','))
      .map((tag: unknown) => String(tag).trim())
      .filter(Boolean),
  )
  tags?: string[];
}

export class DocumentQueryDto {
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @IsOptional()
  @IsString()
  tag?: string;

  /** ค้นจากชื่อไฟล์ */
  @IsOptional()
  @IsString()
  search?: string;
}
