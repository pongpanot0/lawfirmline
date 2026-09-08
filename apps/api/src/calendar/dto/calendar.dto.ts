import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsArray,
  IsInt,
} from 'class-validator';
import { EventType } from '@lawfirm/shared';

export class CreateEventDto {
  @IsUUID()
  caseId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  courtName?: string;

  @IsDateString()
  startAt!: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderMinutes?: number[];

  /** Who is attending. Reminders go to them; omit to fall back to the lead lawyer. */
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  courtName?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderMinutes?: number[];

  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
