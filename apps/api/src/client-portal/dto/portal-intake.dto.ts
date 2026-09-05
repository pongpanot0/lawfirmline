import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitPortalIntakeDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  detail!: string;

  @IsOptional()
  @IsDateString()
  clientRequestedDate?: string;

  @IsOptional()
  @IsBoolean()
  urgencyFlag?: boolean;
}
