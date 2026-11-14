import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional,
  IsString, Length, Matches, MaxLength, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { CustomFieldEntity, CustomFieldType, CustomFieldVisibility } from '@lawfirm/shared';

export class CreateCustomFieldOptionDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  label!: string;
}

export class UpdateCustomFieldOptionDto extends CreateCustomFieldOptionDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  id?: string;
}

class CustomFieldMetadataDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  required?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  caseTypeIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  section?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpText?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isSensitive?: boolean;
}

export class CreateCustomFieldDto extends CustomFieldMetadataDto {
  @IsIn(['CASE', 'CLIENT'])
  entityKind!: CustomFieldEntity;

  @IsIn(['FIRM', 'PERSONAL'])
  visibility!: CustomFieldVisibility;

  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  label!: string;

  @IsIn(['TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN'])
  type!: CustomFieldType;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateCustomFieldOptionDto)
  options?: CreateCustomFieldOptionDto[];
}

export class UpdateCustomFieldDto extends CustomFieldMetadataDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(1, 80)
  @Matches(/\S/)
  label?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => UpdateCustomFieldOptionDto)
  options?: UpdateCustomFieldOptionDto[];
}

export class CustomFieldQueryDto {
  @IsIn(['CASE', 'CLIENT'])
  entityKind!: CustomFieldEntity;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['true', 'false'])
  includeArchived?: string;
}

export class OrderCustomFieldsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  ids!: string[];
}
