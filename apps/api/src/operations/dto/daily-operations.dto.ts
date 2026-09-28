import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { TaskSize, TaskWorkType } from '@lawfirm/shared';
import { CreateTaskDto } from '../../tasks/dto/task.dto';

export class DailyWorkQueryDto {
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

export class PersonWorkloadQueryDto {
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
}

export class CreateDailyTaskDto extends CreateTaskDto {
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsBoolean() placeFirst?: boolean;
}

export class AssignDailyTaskDto {
  @IsUUID() assigneeId!: string;
  @IsOptional() @IsBoolean() placeFirst?: boolean;
  @IsOptional() @IsEnum(TaskSize) size?: TaskSize;
}

export class TaskSizeDto {
  @IsEnum(TaskSize) size!: TaskSize;
}

export class MoveDailyTaskDto {
  @IsEnum({ UP: 'UP', DOWN: 'DOWN' }) direction!: 'UP' | 'DOWN';
}

export class WorkTypesDto {
  @IsArray() @ArrayUnique() @IsEnum(TaskWorkType, { each: true }) workTypes!: TaskWorkType[];
}
