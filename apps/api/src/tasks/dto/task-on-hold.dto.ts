import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class StartTaskOnHoldDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsUUID()
  followerUserId?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;
}

export class UpdateTaskOnHoldDto {
  @IsOptional()
  @IsUUID()
  followerUserId?: string;

  @IsOptional()
  @IsDateString()
  lastFollowUpAt?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
