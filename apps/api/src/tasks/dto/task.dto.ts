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
} from 'class-validator';
import { TaskPriority, TaskStatus } from '@lawfirm/shared';

export class CreateTaskDto {
  @IsString()
  title!: string;

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

  /** ผู้ติดตาม — ได้รับแจ้งเตือน แต่ไม่เป็นผู้รับผิดชอบ */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  observerIds?: string[];
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

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

  /** ผู้ติดตาม — ได้รับแจ้งเตือน แต่ไม่เป็นผู้รับผิดชอบ */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  observerIds?: string[];
}
