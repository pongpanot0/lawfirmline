import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class AskLegalDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  question!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  citationIds!: string[];
}
