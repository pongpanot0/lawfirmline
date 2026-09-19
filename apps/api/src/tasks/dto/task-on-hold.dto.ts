import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { OnHoldCategory } from '../../generated/prisma';

export class StartTaskOnHoldDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsEnum(OnHoldCategory)
  category?: OnHoldCategory;

  @IsOptional()
  @IsUUID()
  followerUserId?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;
}

export class UpdateTaskOnHoldDto {
  @IsOptional()
  @IsEnum(OnHoldCategory)
  category?: OnHoldCategory;

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
