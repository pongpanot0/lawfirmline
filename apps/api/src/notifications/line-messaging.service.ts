import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export interface QuickReplyItem {
  label: string;
  text: string;
}

export interface CarouselColumn {
  title: string;
  text: string;
  imageUrl: string;
  actionLabel: string;
  actionText: string;
}

const LINE_PUBLIC_FALLBACK = 'https://api.samnuan.com';

export function linePublicBaseUrl(apiPublicUrl?: string): string {
  const raw = (apiPublicUrl ?? '').trim().replace(/\/$/, '');
  if (/^https:\/\//i.test(raw) && !/localhost|127\.0\.0\.1/i.test(raw)) return raw;
  return LINE_PUBLIC_FALLBACK;
}

function buildMessage(text: string, quickReply?: QuickReplyItem[]) {
  return {
    type: 'text',
    text,
    ...(quickReply?.length
      ? {
          quickReply: {
            items: quickReply.slice(0, 13).map((item) => ({
              type: 'action',
              action: { type: 'message', label: item.label.slice(0, 20), text: item.text },
            })),
          },
        }
      : {}),
  };
}

export function buildHomeImagemap(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '');
  return {
    type: 'imagemap',
    baseUrl: `${base}/line-assets/home-v2`,
    altText: 'เมนู',
    baseSize: { width: 1040, height: 1040 },
    actions: [
      { type: 'message', text: 'สร้าง Case', area: { x: 0, y: 640, width: 347, height: 400 } },
      { type: 'message', text: 'เพิ่ม Task', area: { x: 347, y: 640, width: 346, height: 400 } },
      { type: 'message', text: 'สร้าง Todo', area: { x: 693, y: 640, width: 347, height: 400 } },
    ],
  };
}

export function buildCarouselMessage(altText: string, columns: CarouselColumn[]) {
  return {
    type: 'template',
    altText: altText.slice(0, 400),
    template: {
      type: 'carousel',
      columns: columns.slice(0, 10).map((col) => ({
        title: col.title.slice(0, 40),
        text: col.text.slice(0, 120),
        actions: [
          {
            type: 'message',
            label: col.actionLabel.slice(0, 20),
            text: col.actionText,
          },
        ],
      })),
    },
  };
}

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

  /** Download a message's binary content (e.g. a sent photo). Null on any failure. */
  async getMessageContent(messageId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    try {
      const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        this.logger.warn(`LINE content download failed: ${res.status}`);
        return null;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
    } catch (err) {
      this.logger.error('LINE content download error', err);
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

  async pushTo(
    targetId: string,
    text: string,
    quickReply?: QuickReplyItem[],
  ): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const token = await this.getAccessToken();
    if (!token) return false;

    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: targetId, messages: [buildMessage(text, quickReply)] }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`LINE push failed (${res.status}): ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('LINE push error', err);
      return false;
    }
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

  async replyWithQuickReply(
    replyToken: string,
    text: string,
    quickReply?: QuickReplyItem[],
  ): Promise<boolean> {
    return this.postReply(replyToken, [buildMessage(text, quickReply)], 'LINE reply with quick reply');
  }

  assetUrl(path: string): string {
    const base = linePublicBaseUrl(this.config.get<string>('API_PUBLIC_URL'));
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
  }

  homeImagemapBaseUrl(): string {
    return linePublicBaseUrl(
      this.config.get<string>('LINE_ASSET_BASE_URL') ?? this.config.get<string>('API_PUBLIC_URL'),
    );
  }

  async replyHomeMenu(replyToken: string): Promise<boolean> {
    return this.postReply(
      replyToken,
      [buildHomeImagemap(this.homeImagemapBaseUrl())],
      'LINE home imagemap reply',
    );
  }

  async pushHomeMenu(targetId: string): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const token = await this.getAccessToken();
    if (!token) return false;

    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetId,
          messages: [buildHomeImagemap(this.homeImagemapBaseUrl())],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`LINE home menu push failed (${res.status}): ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('LINE home menu push error', err);
      return false;
    }
  }

  async replyCarousel(
    replyToken: string,
    introText: string,
    columns: CarouselColumn[],
  ): Promise<boolean> {
    return this.postReply(
      replyToken,
      [{ type: 'text', text: introText }, buildCarouselMessage(introText, columns)],
      'LINE carousel reply',
    );
  }

  async pushCarousel(targetId: string, introText: string, columns: CarouselColumn[]): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const token = await this.getAccessToken();
    if (!token) return false;

    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetId,
          messages: [{ type: 'text', text: introText }, buildCarouselMessage(introText, columns)],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`LINE carousel push failed (${res.status}): ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('LINE carousel push error', err);
      return false;
    }
  }

  private async postReply(
    replyToken: string,
    messages: unknown[],
    label: string,
  ): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const token = await this.getAccessToken();
    if (!token) return false;

    try {
      const res = await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyToken, messages }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`${label} failed (${res.status}): ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`${label} error`, err);
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
