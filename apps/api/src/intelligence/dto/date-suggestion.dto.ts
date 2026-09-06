import { IsOptional, IsString, IsDateString, IsEnum, IsArray, IsInt } from 'class-validator';
import { EventType } from '@lawfirm/shared';

export class ConfirmDateSuggestionDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderMinutes?: number[];
}
