import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AskCaseDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  question!: string;

  /** Restrict the answer to these documents; omitted = whole case file. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  documentIds?: string[];
}
