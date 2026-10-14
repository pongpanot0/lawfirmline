import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePreferencesDto {
  /** Receive the evening "what do I have tomorrow" digest. */
  @IsOptional()
  @IsBoolean()
  dailyDigestEnabled?: boolean;

  /** Plain-text personal email signature; empty clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  emailSignature?: string;
}
