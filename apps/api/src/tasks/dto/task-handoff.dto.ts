import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { TASK_HANDOFF_NOTE_MIN } from '@lawfirm/shared';

export class HandoffTaskDto {
  @IsString()
  @MinLength(TASK_HANDOFF_NOTE_MIN, { message: `เขียนหมายเหตุถึงผู้ตรวจอย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร` })
  note!: string;

  @IsOptional()
  @IsDateString()
  stageDueDate?: string;
}

export class RejectTaskDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ReassignTaskDto {
  @IsUUID()
  assigneeId!: string;

  @IsOptional()
  @IsDateString()
  stageDueDate?: string;
}

export class HandoffStandaloneTaskDto {
  @IsUUID()
  reviewerId!: string;

  @IsString()
  @MinLength(TASK_HANDOFF_NOTE_MIN, { message: `เขียนหมายเหตุถึงผู้ตรวจอย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร` })
  note!: string;

  @IsOptional()
  @IsDateString()
  stageDueDate?: string;
}
