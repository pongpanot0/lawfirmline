import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  Max,
  Min,
  IsBoolean,
  Length,
  Matches,
} from 'class-validator';
import { TaskPriority, TaskSize, TaskStatus, TaskWorkType } from '@lawfirm/shared';

export class CreateTaskDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional() @IsEnum(TaskWorkType)
  workType?: TaskWorkType;

  @IsOptional() @IsEnum(TaskSize)
  size?: TaskSize;

  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduledFor?: string;

  @IsOptional() @IsBoolean()
  requiresReview?: boolean;

  @IsOptional() @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  /** งานประจำ — เมื่อเสร็จ สร้างรอบถัดไปครบกำหนด +N วัน */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  recurrenceDays?: number;

  /** งานนี้รอ task อื่นเสร็จก่อน */
  @IsOptional()
  @IsUUID()
  blockedById?: string;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional() @IsEnum(TaskWorkType)
  workType?: TaskWorkType;

  @IsOptional() @IsEnum(TaskSize)
  size?: TaskSize;

  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduledFor?: string | null;

  @IsOptional() @IsBoolean()
  requiresReview?: boolean;

  @IsOptional() @IsUUID()
  reviewerId?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  /** งานประจำ — เมื่อเสร็จ สร้างรอบถัดไปครบกำหนด +N วัน */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  recurrenceDays?: number;

  /** งานนี้รอ task อื่นเสร็จก่อน */
  @IsOptional()
  @IsUUID()
  blockedById?: string;
}
