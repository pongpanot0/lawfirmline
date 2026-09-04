import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkloadQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nearDeadlineDays?: number = 7;
}
