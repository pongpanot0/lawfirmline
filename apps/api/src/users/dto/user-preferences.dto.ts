import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePreferencesDto {
  /** Receive the evening "what do I have tomorrow" digest. */
  @IsOptional()
  @IsBoolean()
  dailyDigestEnabled?: boolean;
}
