import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  ValidateIf,
  IsInt,
  IsIn,
  IsOptional,
  IsNotEmpty,
  IsDefined,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EXPENSE_CATEGORIES } from '@lawfirm/shared';
const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
export class CourtChecklistDto {
  @IsUUID() id!: string;
  @IsString() @Trim() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsBoolean() done!: boolean;
}
export class CourtDocumentDto {
  @IsUUID() id!: string;
  @IsInt() @Min(1) version!: number;
}
export class CourtDayStateDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CourtChecklistDto)
  checklist!: CourtChecklistDto[];
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  taskIds!: string[];
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CourtDocumentDto)
  documents!: CourtDocumentDto[];
  @IsString() @MaxLength(10000) notes!: string;
  @IsString() @MaxLength(10000) outcome!: string;
  @IsBoolean() nextHearing!: boolean;
  @IsString() @MaxLength(200) nextTitle!: string;
  @ValidateIf((o) => o.nextAt !== '')
  @IsDateString()
  @MaxLength(35)
  nextAt!: string;
  @IsBoolean() followUp!: boolean;
  @IsString() @MaxLength(200) taskTitle!: string;
  @ValidateIf((o) => o.taskDue !== '')
  @IsDateString()
  @MaxLength(35)
  taskDue!: string;
  @IsBoolean() expense!: boolean;
  @IsOptional() @IsIn(EXPENSE_CATEGORIES) expenseCategory?: string;
  @IsString() @MaxLength(25) amount!: string;
  @IsBoolean() clientDraft!: boolean;
  @IsOptional() @IsIn(['CLIENT', 'CUSTOMER']) draftRecipientKind?: 'CLIENT' | 'CUSTOMER';
  @ValidateIf((_object, value) => value !== undefined && value !== '') @IsUUID() draftCustomerId?: string;
}
export class SaveCourtDayDto {
  @IsInt() @Min(0) version!: number;
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CourtDayStateDto)
  state!: CourtDayStateDto;
}
export class CompleteCourtDayDto {
  @IsInt() @Min(0) version!: number;
  /** Detect a calendar edit made while the lawyer was preparing this page. */
  @IsString() @IsNotEmpty() eventUpdatedAt!: string;
}
