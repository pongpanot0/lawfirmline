import { IsNotEmpty, IsString } from 'class-validator';

export class AddinSuggestDto {
  @IsString()
  @IsNotEmpty()
  graphMessageId: string;
}

export class AddinFileDto extends AddinSuggestDto {
  @IsString()
  @IsNotEmpty()
  caseId: string;
}
