import { IsDateString, IsOptional } from 'class-validator';

export class ConvertPortalSubmissionDto {
  @IsOptional()
  @IsDateString()
  officePlannedDate?: string;
}
