import { ActivityType } from '@lawfirm/shared';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateActivityDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  activityAt!: string;

  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;
}
