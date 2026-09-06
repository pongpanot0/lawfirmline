import { IsArray, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class PublishDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipientContacts?: string[];
}
