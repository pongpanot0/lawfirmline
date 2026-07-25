import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

interface LineTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getChannelId() && this.getChannelSecret());
  }

  getChannelId(): string | undefined {
    return this.config.get<string>('LINE_CHANNEL_ID');
  }

  private getChannelSecret(): string | undefined {
    return this.config.get<string>('LINE_CHANNEL_SECRET');
  }

  private getStaticAccessToken(): string | undefined {
    return this.config.get<string>('LINE_CHANNEL_ACCESS_TOKEN');
  }

  private getPushUserIds(): string[] {
    const raw = this.config.get<string>('LINE_PUSH_USER_IDS') ?? '';
    return raw.split(',').map((id) => id.trim()).filter(Boolean);
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    const secret = this.getChannelSecret();
    if (!secret || !signature) return false;

    const digest = createHmac('sha256', secret).update(rawBody).digest('base64');
    try {
      return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async getAccessToken(): Promise<string | null> {
    const staticToken = this.getStaticAccessToken();
    if (staticToken) return staticToken;

    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.cachedToken;
    }

    const channelId = this.getChannelId();
    const channelSecret = this.getChannelSecret();
    if (!channelId || !channelSecret) return null;

    try {
      const res = await fetch('https://api.line.me/v2/oauth/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: channelId,
          client_secret: channelSecret,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`LINE token request failed (${res.status}): ${body}`);
        return null;
      }

      const data = (await res.json()) as LineTokenResponse;
      this.cachedToken = data.access_token;
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
      return data.access_token;
    } catch (err) {
      this.logger.error('LINE token request error', err);
      return null;
    }
  }

  async sendText(message: string, targetUserIds?: string[]): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn(`LINE not configured. Message: ${message}`);
      return false;
    }

    const token = await this.getAccessToken();
    if (!token) {
      this.logger.error('LINE access token unavailable');
      return false;
    }

    const pushUserIds =
      targetUserIds && targetUserIds.length > 0
        ? targetUserIds
        : this.getPushUserIds();

    if (pushUserIds.length > 0) {
      let sent = false;
      for (const userId of pushUserIds) {
        const ok = await this.pushMessage(token, userId, message);
        sent = sent || ok;
      }
      return sent;
    }

    return this.broadcastMessage(token, message);
  }

  async replyText(replyToken: string, text: string): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const token = await this.getAccessToken();
    if (!token) return false;

    try {
      const res = await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          replyToken,
          messages: [{ type: 'text', text }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`LINE reply failed (${res.status}): ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('LINE reply error', err);
      return false;
    }
  }

  async sendCourtDateAlert(message: string, targetUserIds?: string[]): Promise<void> {
    await this.sendText(message, targetUserIds);
  }

  async sendTestMessage(): Promise<{ ok: boolean; mode: 'push' | 'broadcast' | 'none' }> {
    const pushUserIds = this.getPushUserIds();
    const mode = pushUserIds.length > 0 ? 'push' : 'broadcast';
    const ok = await this.sendText('✅ LexFlow — ทดสอบการเชื่อมต่อ LINE Messaging API สำเร็จ');
    return { ok, mode };
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      channelId: this.getChannelId() ?? null,
      hasStaticAccessToken: Boolean(this.getStaticAccessToken()),
      pushTargetCount: this.getPushUserIds().length,
      deliveryMode: this.getPushUserIds().length > 0 ? 'push' : 'broadcast',
    };
  }

  private async pushMessage(token: string, userId: string, text: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: userId,
          messages: [{ type: 'text', text }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`LINE push failed for ${userId} (${res.status}): ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`LINE push error for ${userId}`, err);
      return false;
    }
  }

  private async broadcastMessage(token: string, text: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ type: 'text', text }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`LINE broadcast failed (${res.status}): ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('LINE broadcast error', err);
      return false;
    }
  }
}
