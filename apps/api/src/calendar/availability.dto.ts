import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsUUID, Matches } from 'class-validator';

export class AvailabilityDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsUUID('all', { each: true }) userIds!: string[];
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsOptional() @IsUUID() excludeEventId?: string;
}
