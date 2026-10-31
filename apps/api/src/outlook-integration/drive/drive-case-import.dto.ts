import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CASE_NUMBER_HINT, CASE_NUMBER_REGEX, CaseOutcome, CourtLevel } from '@lawfirm/shared';

const GRAPH_ID = /^[A-Za-z0-9!_-]+$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Closed rows need a real result; IN_PROGRESS is what an open case has. */
export const IMPORT_CLOSED_OUTCOMES = [
  CaseOutcome.WON,
  CaseOutcome.LOST,
  CaseOutcome.SETTLED,
  CaseOutcome.MEDIATED,
  CaseOutcome.WITHDRAWN,
] as const;

export class ImportDriveCaseRowDto {
  @IsString()
  @Matches(GRAPH_ID)
  itemId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @Transform(trim)
  @IsOptional()
  @ValidateIf((_o, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีดำ: ${CASE_NUMBER_HINT}` })
  blackCaseNumber?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  courtName?: string;

  @IsEnum(CourtLevel)
  courtLevel!: CourtLevel;

  @IsUUID()
  leadLawyerId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  buddyIds?: string[];

  @IsBoolean()
  closed!: boolean;

  @ValidateIf((o: ImportDriveCaseRowDto) => o.closed)
  @IsIn(IMPORT_CLOSED_OUTCOMES, { message: 'เลือกผลคดีของคดีที่ปิดแล้ว' })
  outcome?: CaseOutcome;

  @ValidateIf((o: ImportDriveCaseRowDto) => o.closed)
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'สรุปตอนปิดต้องยาวอย่างน้อย 10 ตัวอักษร' })
  @MaxLength(2000)
  closingSummary?: string;
}

export class ImportDriveCasesDto {
  @IsString()
  @Matches(GRAPH_ID)
  driveId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((row: ImportDriveCaseRowDto) => row.itemId, { message: 'เลือก folder ซ้ำกัน' })
  @ValidateNested({ each: true })
  @Type(() => ImportDriveCaseRowDto)
  rows!: ImportDriveCaseRowDto[];
}
