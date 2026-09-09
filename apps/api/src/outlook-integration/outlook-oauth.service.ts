import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { GraphTokens } from './outlook-graph.client';

const SCOPES = ['offline_access', 'Mail.Read', 'Mail.ReadWrite', 'Mail.ReadWrite.Shared', 'User.Read'].join(' ');

interface OAuthState {
  firmId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
}

/**
 * Delegated OAuth against Microsoft identity platform — no admin consent
 * required for the scopes above, so any firm member can connect their own
 * (or a shared) mailbox from Settings without an IT ticket. Uses signed
 * `state` (HMAC, not a session) since the callback is a plain browser
 * redirect with no auth header.
 */
@Injectable()
export class OutlookOAuthService {
  constructor(private config: ConfigService) {}

  private get clientId() {
    return this.required('MS_CLIENT_ID');
  }

  private get clientSecret() {
    return this.required('MS_CLIENT_SECRET');
  }

  private get tenant() {
    return this.config.get<string>('MS_TENANT_ID') ?? 'common';
  }

  private get redirectUri() {
    // This must be the API's own public URL (where /outlook/callback is
    // routed), NOT APP_URL — that env var is the web frontend's URL used
    // elsewhere for portal/invite links. They are different origins.
    const apiUrl = this.required('API_PUBLIC_URL');
    return `${apiUrl.replace(/\/$/, '')}/outlook/callback`;
  }

  private required(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new BadRequestException(
        `ยังไม่ได้ตั้งค่า ${key} — ผู้ดูแลระบบต้องลงทะเบียนแอปกับ Microsoft ก่อนจึงจะเชื่อม Outlook ได้`,
      );
    }
    return value;
  }

  private stateSecret(): string {
    // Reuses JWT_SECRET rather than adding a second secret to configure —
    // this is only signing a short-lived redirect param, not issuing a session.
    return this.config.get<string>('JWT_SECRET') ?? 'dev-jwt-secret-change-in-production';
  }

  signState(firmId: string, userId: string): string {
    const payload: OAuthState = { firmId, userId, nonce: crypto.randomBytes(8).toString('hex'), issuedAt: Date.now() };
    const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', this.stateSecret()).update(json).digest('base64url');
    return `${json}.${sig}`;
  }

  verifyState(state: string): OAuthState {
    const [json, sig] = state.split('.');
    if (!json || !sig) throw new BadRequestException('state ไม่ถูกต้อง');
    const expectedSig = crypto.createHmac('sha256', this.stateSecret()).update(json).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    // timingSafeEqual throws on mismatched lengths rather than returning
    // false, so a forged state of the "wrong" length must be rejected
    // before reaching it — not fall through as an unhandled 500.
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      throw new BadRequestException('state ไม่ถูกต้อง');
    }
    const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as OAuthState;
    if (Date.now() - payload.issuedAt > 10 * 60_000) {
      throw new BadRequestException('ลิงก์เชื่อมต่อหมดอายุ กรุณาลองใหม่');
    }
    return payload;
  }

  buildAuthorizationUrl(state: string): string {
    const url = new URL(`https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  async exchangeCodeForTokens(code: string): Promise<GraphTokens> {
    return this.requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
  }

  async refreshTokens(refreshToken: string): Promise<GraphTokens> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  private async requestToken(extra: Record<string, string>): Promise<GraphTokens> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: SCOPES,
      ...extra,
    });
    const res = await fetch(`https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      throw new BadRequestException(`เชื่อมต่อ Microsoft ไม่สำเร็จ: ${json.error_description ?? json.error ?? res.statusText}`);
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? '',
      expiresIn: json.expires_in ?? 3600,
    };
  }
}
