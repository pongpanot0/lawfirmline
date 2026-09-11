import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { TaskPriority } from '@lawfirm/shared';

export class CreateSubtaskDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}

export class CreateTaskCommentDto {
  @IsString()
  @Length(1, 4000)
  body!: string;
}
