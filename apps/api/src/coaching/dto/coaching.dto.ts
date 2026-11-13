import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class StandupDto {
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true }) yesterdayTaskIds!: string[];
  @IsOptional() @IsString() @MaxLength(2000) yesterdayNote?: string;
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true }) todayTaskIds!: string[];
  @IsOptional() @IsString() @MaxLength(2000) todayNote?: string;
  @IsOptional() @IsString() @MaxLength(2000) blocker?: string;
}

export class StandupHistoryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(365) days: number = 6;
}

export class CoachingDraftDto {
  @IsUUID() userId!: string;
}

export class SaveCoachingDto extends CoachingDraftDto {
  @IsString() @Matches(/\S/) @MaxLength(4000) praise!: string;
  @IsString() @Matches(/\S/) @MaxLength(4000) improve!: string;
  @IsString() @Matches(/\S/) @MaxLength(4000) nextStep!: string;
  @IsArray() @ArrayMaxSize(20) @ArrayUnique() @IsUUID('all', { each: true }) linkedTaskIds!: string[];
  @IsBoolean() aiDrafted!: boolean;
}

export class CoachingQueryDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsIn(['pending', 'acknowledged']) status?: 'pending' | 'acknowledged';
}

export class AcknowledgeCoachingDto {
  @IsOptional() @IsString() @MaxLength(280) reply?: string;
}
