import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCaseMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body!: string;
}
