import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CASE_NUMBER_HINT, CASE_NUMBER_REGEX, CaseOutcome, CaseStage, CourtLevel, PartyRole } from '@lawfirm/shared';
import { MAX_IMPORT_ROWS } from './case-import-columns';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const CLOSED_OUTCOMES = [CaseOutcome.WON, CaseOutcome.LOST, CaseOutcome.SETTLED, CaseOutcome.MEDIATED, CaseOutcome.WITHDRAWN];
const OPEN_STAGES = Object.values(CaseStage).filter((s) => s !== CaseStage.CLOSING);

/** One reviewed row. Every rule the preview applied is checked again — the browser may have edited it. */
export class CreateExcelCaseRowDto {
  @IsInt()
  @Min(2)
  rowNumber!: number;

  @Transform(trim) @IsString() @MinLength(1) @MaxLength(300)
  title!: string;

  @IsUUID()
  leadLawyerId!: string;

  @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true })
  buddyIds!: string[];

  @IsEnum(CourtLevel)
  courtLevel!: CourtLevel;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(50)
  ownRef?: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(100)
  customerRef?: string;

  @IsOptional() @IsUUID()
  clientId?: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(300)
  clientName?: string;

  @IsOptional() @IsEnum(PartyRole)
  partyRole?: PartyRole;

  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(200, { each: true })
  opponents!: string[];

  @IsOptional() @IsUUID()
  caseTypeId?: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(200)
  courtName?: string;

  @Transform(trim) @IsOptional() @ValidateIf((_o, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีดำ: ${CASE_NUMBER_HINT}` })
  blackCaseNumber?: string;

  @Transform(trim) @IsOptional() @ValidateIf((_o, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีแดง: ${CASE_NUMBER_HINT}` })
  redCaseNumber?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  claimedAmount?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  estimatedFee?: number;

  @IsOptional() @IsDateString({ strict: true })
  limitationDeadline?: string;

  @IsOptional() @IsIn(OPEN_STAGES)
  stage?: CaseStage;

  @IsOptional() @IsDateString({ strict: true })
  openedAt?: string;

  @IsBoolean()
  closed!: boolean;

  @ValidateIf((o: CreateExcelCaseRowDto) => o.closed)
  @IsIn(CLOSED_OUTCOMES, { message: 'เลือกผลคดีของคดีที่ปิดแล้ว' })
  outcome?: CaseOutcome;

  @IsOptional() @IsDateString({ strict: true })
  closedAt?: string;

  @ValidateIf((o: CreateExcelCaseRowDto) => o.closed)
  @Transform(trim) @IsString() @MinLength(10, { message: 'สรุปตอนปิดต้องยาวอย่างน้อย 10 ตัวอักษร' }) @MaxLength(2000)
  closingSummary?: string;

  @Transform(trim) @IsOptional() @IsString() @MaxLength(5000)
  description?: string;
}

export class CreateExcelCasesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @ValidateNested({ each: true })
  @Type(() => CreateExcelCaseRowDto)
  rows!: CreateExcelCaseRowDto[];
}
