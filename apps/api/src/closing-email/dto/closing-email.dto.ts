import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

export class ApproveClosingEmailDraftDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  contactIds!: string[];
}
