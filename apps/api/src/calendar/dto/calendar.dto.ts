import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsArray,
  IsInt,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { CourtEventKind, EventType } from '@lawfirm/shared';

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

  /** COURT_DATE only: นัดพร้อม / ไกล่เกลี่ย / สืบพยาน / ฟังคำพิพากษา — some deadline rules depend on it. */
  @IsOptional()
  @IsEnum(CourtEventKind)
  courtEventKind?: CourtEventKind | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderMinutes?: number[];

  /** Who is attending. Reminders go to them; omit to fall back to the lead lawyer. */
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  /** Several attendees; the first is primary. Omit to fall back to the lead lawyer. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  assigneeIds?: string[];

  /** Client meetings only: create a Teams link through the organizer's Outlook. */
  @IsOptional()
  @IsBoolean()
  onlineMeeting?: boolean;

  /** Outside guests (the client) invited to the Teams meeting. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  inviteeEmails?: string[];
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

  /** COURT_DATE only: นัดพร้อม / ไกล่เกลี่ย / สืบพยาน / ฟังคำพิพากษา — some deadline rules depend on it. */
  @IsOptional()
  @IsEnum(CourtEventKind)
  courtEventKind?: CourtEventKind | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderMinutes?: number[];

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  /** Several attendees; the first is primary. Omit to fall back to the lead lawyer. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  assigneeIds?: string[];

  /** Client meetings only: create a Teams link through the organizer's Outlook. */
  @IsOptional()
  @IsBoolean()
  onlineMeeting?: boolean;

  /** Outside guests (the client) invited to the Teams meeting. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  inviteeEmails?: string[];
}
