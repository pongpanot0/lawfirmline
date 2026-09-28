import { IsDateString, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class DailyTaskUpdateDto {
  @IsString() @Length(1, 1500)
  completed!: string;

  @IsString() @Length(1, 1500)
  remaining!: string;

  @IsOptional() @IsString() @MaxLength(1500)
  blocker?: string;
}

export class ConfirmTaskPlanDto {
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}
