import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
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

export class CreateAiFollowUpDto {
  @IsUUID() sourceCommentId!: string;
  @IsUUID() latestCommentId!: string;
  @IsDateString() taskUpdatedAt!: string;
  @IsString() @Length(1, 2000) quote!: string;
  @IsString() @Length(1, 200) title!: string;
  @IsString() @Length(1, 2000) description!: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) followUpDate!: string;
}
