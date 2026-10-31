import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ErrorLogQueryDto {
  @IsOptional()
  @IsIn(['api', 'server', 'web'])
  source?: 'api' | 'server' | 'web';

  @IsOptional()
  @IsIn(['open', 'resolved'])
  status?: 'open' | 'resolved';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsUUID()
  firmId?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ResolveErrorsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids!: string[];

  @IsBoolean()
  resolved!: boolean;
}

export class ClientErrorDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  /** window.onerror, unhandledrejection or a React error boundary */
  @IsOptional()
  @IsIn(['error', 'unhandledrejection', 'boundary'])
  kind?: string;
}
