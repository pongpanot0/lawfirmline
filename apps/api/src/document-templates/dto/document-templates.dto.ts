import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsObject, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { DocumentType } from '../../generated/prisma';
import type { TemplateLayout } from '@lawfirm/shared';

export class TemplateChoiceDto {
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  templateId?: string;
}

export class TemplateQueryDto {
  @ValidateIf((_o, v) => v !== undefined)
  @IsEnum(DocumentType)
  docType?: DocumentType;
}

export class ResolveTemplateDto {
  @IsEnum(DocumentType)
  docType!: DocumentType;

  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  customerId?: string;
}

export class CreateDocumentTemplateDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsEnum(DocumentType)
  docType!: DocumentType;

  @ValidateIf((_o, v) => v !== undefined)
  @IsObject()
  layout?: TemplateLayout;

  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  copyFromId?: string;
}

export class UpdateDocumentTemplateDto {
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ValidateIf((_o, v) => v !== undefined)
  @IsObject()
  layout?: TemplateLayout;

  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(500)
  logoKey?: string | null;

  @ValidateIf((_o, v) => v !== undefined)
  @IsBoolean()
  isDefault?: boolean;
}

export class BindDocumentTemplatesDto {
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsUUID()
  invoiceTemplateId?: string | null;

  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsUUID()
  receiptTemplateId?: string | null;
}
