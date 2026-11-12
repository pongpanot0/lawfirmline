import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';
import { McpConsentParams } from '@lawfirm/shared';

export class McpConsentDto implements McpConsentParams {
  @IsString() @MinLength(1) @MaxLength(200)
  client_id!: string;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048)
  redirect_uri!: string;

  @Matches(/^[A-Za-z0-9_-]{43}$/)
  code_challenge!: string;

  @IsIn(['S256'])
  code_challenge_method!: 'S256';

  @IsOptional() @IsString() @MaxLength(2048)
  state?: string;

  @IsOptional() @IsString() @MaxLength(200)
  scope?: string;

  @IsOptional() @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048)
  resource?: string;
}

export class McpSettingsDto {
  @IsBoolean()
  enabled!: boolean;
}
