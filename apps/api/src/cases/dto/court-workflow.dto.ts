import { AnswerExtensionStatus } from '@lawfirm/shared';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

// Accept calendar dates or timestamps with a known offset, so the server timezone can't change the day.
const CALENDAR_DATE_OR_TIMESTAMP = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

export class RecordCourtFollowUpDto {
  @IsString()
  @Length(1, 2000)
  result!: string;

  @IsBoolean()
  done!: boolean;

  @ValidateIf((_dto, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(60)
  retryInDays?: number;
}

export class SetAnswerDeadlineDto {
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(CALENDAR_DATE_OR_TIMESTAMP)
  answerDueAt!: string;
}

export class CreateAnswerExtensionDto {
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(CALENDAR_DATE_OR_TIMESTAMP)
  filedAt!: string;

  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(CALENDAR_DATE_OR_TIMESTAMP)
  requestedUntil!: string;
}

export class UpdateAnswerExtensionDto {
  @IsEnum(AnswerExtensionStatus)
  status!: AnswerExtensionStatus;

  @IsOptional()
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(CALENDAR_DATE_OR_TIMESTAMP)
  grantedUntil?: string;
}
