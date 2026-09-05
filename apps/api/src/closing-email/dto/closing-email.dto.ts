import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClosingEmailDraftDto {
  @IsArray()
  @IsString({ each: true })
  selectedActivityIds!: string[];
}

export class UpdateClosingEmailDraftDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  subject?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bodyText?: string;
}
