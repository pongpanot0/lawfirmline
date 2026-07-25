import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateCourtDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateCourtDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
