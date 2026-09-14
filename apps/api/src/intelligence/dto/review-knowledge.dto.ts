import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewKnowledgeDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  summary?: string;
}
