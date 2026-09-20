import { IsIn, IsOptional, IsString, MaxLength, MinLength, IsUUID } from 'class-validator';
import { SelectedAttachmentsDto } from './selected-attachments.dto';

export class ResearchDto extends SelectedAttachmentsDto {
  @IsOptional() @IsString() @MaxLength(12000)
  text?: string;

  @IsOptional() @IsUUID('4')
  intakeId?: string;

  @IsOptional() @IsUUID('4')
  caseId?: string;
}

export class ReviewResearchFactDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  statement!: string;

  @IsIn(['PENDING', 'REVIEWED', 'CONFLICT', 'MISSING'])
  status!: 'PENDING' | 'REVIEWED' | 'CONFLICT' | 'MISSING';

  @IsString() @MaxLength(2000)
  expectedStatement!: string;

  @IsIn(['PENDING', 'REVIEWED', 'CONFLICT', 'MISSING'])
  expectedStatus!: string;
}
