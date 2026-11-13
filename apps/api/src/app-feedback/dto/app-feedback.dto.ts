import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { AppFeedbackKind } from '../../generated/prisma';

export class CreateAppFeedbackDto {
  @IsEnum(AppFeedbackKind)
  kind!: AppFeedbackKind;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  message?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' && /^[123]$/.test(value) ? Number(value) : value)
  @IsInt()
  @Min(1)
  @Max(3)
  rating?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  route?: string;

  @IsIn(['web', 'ios', 'android'])
  platform!: 'web' | 'ios' | 'android';

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  appVersion?: string;
}

export class FeedbackQueryDto {
  @IsOptional()
  @IsIn(['open', 'resolved', 'all'])
  status?: 'open' | 'resolved' | 'all';

  @IsOptional()
  @IsEnum(AppFeedbackKind)
  kind?: AppFeedbackKind;

  @IsOptional()
  @IsUUID()
  firmId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class FeedbackPagesQueryDto {
  @IsOptional()
  @IsIn(['web', 'ios', 'android'])
  platform?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number;
}

export class FeedbackCommentsQueryDto extends FeedbackPagesQueryDto {
  @IsString()
  @MaxLength(300)
  route!: string;
}

export class ResolveFeedbackDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids!: string[];

  @IsBoolean()
  resolved!: boolean;
}
