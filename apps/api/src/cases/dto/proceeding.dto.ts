import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from 'class-validator';
import { CASE_NUMBER_HINT, CASE_NUMBER_REGEX, CourtLevel, JudgmentOutcome, ServiceMethod } from '@lawfirm/shared';

const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class UpdateProceedingDto {
  @IsOptional() @Trim() @IsString() @MaxLength(200)
  courtName?: string;

  @IsOptional() @Trim() @IsString() @ValidateIf((_, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีดำ: ${CASE_NUMBER_HINT}` })
  blackCaseNumber?: string;

  @IsOptional() @Trim() @IsString() @ValidateIf((_, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีแดง: ${CASE_NUMBER_HINT}` })
  redCaseNumber?: string;
}

export class RecordFilingDto {
  @IsDateString()
  filedAt!: string;

  @IsOptional() @Trim() @IsString() @ValidateIf((_, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีดำ: ${CASE_NUMBER_HINT}` })
  blackCaseNumber?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(200)
  courtName?: string;

  /** Defaults to the case's current level (TRIAL when unset). */
  @IsOptional() @IsEnum(CourtLevel)
  courtLevel?: CourtLevel;
}

export class RecordServiceDto {
  @IsDateString()
  servedAt!: string;

  @IsEnum(ServiceMethod)
  method!: ServiceMethod;
}

export class RecordJudgmentDto {
  @IsEnum(CourtLevel)
  courtLevel!: CourtLevel;

  @IsDateString()
  judgmentAt!: string;

  @IsEnum(JudgmentOutcome)
  outcome!: JudgmentOutcome;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  amount?: number;

  @IsOptional() @Trim() @IsString() @ValidateIf((_, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีแดง: ${CASE_NUMBER_HINT}` })
  redCaseNumber?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  note?: string;
}

export class RecordAppealServedDto {
  @IsDateString()
  servedAt!: string;
}
