import { Transform, Type } from 'class-transformer';
import { Allow, ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { FeeComponent, FeeInputs, FeeMilestone, MONEY_MAX } from '@lawfirm/shared';
import { TaxClass } from '../../generated/prisma';
const Trim = () => Transform(({ value }) => typeof value === 'string' ? value.trim() : value);

export class FeePackageQueryDto {
  @ValidateIf((_object, value) => value !== undefined) @IsUUID() caseTypeId?: string;
}
export class CreateFeePackageDto {
  @IsUUID() caseTypeId!: string;
  @Trim() @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) @Max(2147483647) sortOrder?: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) components!: FeeComponent[];
  @IsArray() @ArrayMaxSize(12) milestones!: FeeMilestone[];
  @ValidateIf((_object, value) => value !== undefined) @IsEnum(TaxClass) feeTaxClass?: TaxClass;
}
export class UpdateFeePackageDto {
  @ValidateIf((_object, value) => value !== undefined) @IsUUID() caseTypeId?: string;
  @ValidateIf((_object, value) => value !== undefined) @Trim() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(0) @Max(2147483647) sortOrder?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) components?: FeeComponent[];
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(12) milestones?: FeeMilestone[];
  @ValidateIf((_object, value) => value !== undefined) @IsEnum(TaxClass) feeTaxClass?: TaxClass;
}
export class PreviewFeePackageDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) components!: FeeComponent[];
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(12) milestones?: FeeMilestone[];
  @IsObject() @Allow() inputs!: FeeInputs;
}
export class SetCaseFeeDto {
  @ValidateIf((_object, value) => value !== undefined) @IsUUID() packageId?: string;
  @IsObject() @Allow() inputs!: FeeInputs;
  @ValidateIf((_object, value) => value !== undefined) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MONEY_MAX) agreedAmount?: number;
  @ValidateIf((_object, value) => value !== undefined) @Trim() @IsString() @MaxLength(1000) overrideReason?: string;
}
export class CloseOutItemDto {
  @IsUUID() milestoneId!: string;
  @IsIn(['FULL', 'PARTIAL', 'WAIVE']) action!: 'FULL' | 'PARTIAL' | 'WAIVE';
  @ValidateIf((_object, value) => value !== undefined) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MONEY_MAX) amount?: number;
  @ValidateIf((_object, value) => value !== undefined) @Trim() @IsString() @MaxLength(1000) reason?: string;
}
export class CloseOutFeeDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => CloseOutItemDto) items!: CloseOutItemDto[];
}
