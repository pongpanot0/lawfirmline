import { Transform } from 'class-transformer';
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

  // multipart/form-data always sends field values as strings, so "true"/"false"
  // must be coerced before @IsBoolean() validates the actual boolean value.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  urgencyFlag?: boolean;
}
