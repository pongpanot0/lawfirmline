import { ConfigService } from '@nestjs/config';
import { DEFAULT_ROOT_DOMAIN } from '@lawfirm/shared';
import { createHash, randomBytes } from 'node:crypto';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export const ACCESS_SECONDS = 60 * 60;
export const REFRESH_SECONDS = 90 * 24 * 60 * 60;

export function publicApiUrl(config: ConfigService): string {
  const explicit = config.get<string>('API_PUBLIC_URL')?.trim();
  if (explicit) return new URL(explicit).origin;
  const domain = config.get<string>('ROOT_DOMAIN') ?? config.get<string>('DOMAIN');
  return config.get<string>('NODE_ENV') === 'production'
    ? `https://api.${domain || DEFAULT_ROOT_DOMAIN}`
    : 'http://localhost:3001';
}
