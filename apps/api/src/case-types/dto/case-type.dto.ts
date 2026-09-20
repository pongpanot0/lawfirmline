import { IsArray, IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

export class CreateCaseTypeDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** รายชื่อประเภทเอกสารที่คดีประเภทนี้ต้องมี — ใช้เช็ค missing documents */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  requiredDocuments?: string[];
}

export class UpdateCaseTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  requiredDocuments?: string[];
}
