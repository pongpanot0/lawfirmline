import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

export class PublishDocumentDto {
  @IsOptional()
  @IsString()
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
