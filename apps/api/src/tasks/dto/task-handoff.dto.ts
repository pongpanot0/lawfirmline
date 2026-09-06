import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class HandoffTaskDto {
  @IsOptional()
  @IsString()
  note?: string;

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
