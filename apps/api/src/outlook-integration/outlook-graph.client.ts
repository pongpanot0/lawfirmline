import { Injectable, Logger } from '@nestjs/common';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface GraphTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string | null;
  bodyPreview: string | null;
  body?: { content: string; contentType: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime: string;
  hasAttachments: boolean;
  internetMessageId: string;
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
}

export interface GraphDeltaResult {
  messages: GraphMessage[];
  nextDeltaLink: string | null;
  nextSkipLink: string | null;
}

/**
 * Thin wrapper over the Microsoft Graph REST API (no SDK dependency — the
 * calls this integration needs are few enough that raw `fetch` keeps the
 * dependency surface small). Every method throws GraphApiError on a non-2xx
 * response so callers can branch on `.status` (401 → token expired/revoked).
 */
export class GraphApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class OutlookGraphClient {
  private readonly logger = new Logger(OutlookGraphClient.name);

  private async request<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path.startsWith('http') ? path : `${GRAPH_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new GraphApiError(res.status, `Graph API ${path} failed: ${res.status} ${body.slice(0, 500)}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async getMailboxAddress(accessToken: string): Promise<string> {
    const me = await this.request<{ mail?: string; userPrincipalName: string }>(accessToken, '/me?$select=mail,userPrincipalName');
    return me.mail ?? me.userPrincipalName;
  }

  /**
   * Delta query on the inbox — the correct way to sync incrementally.
   * Pass the previous `nextDeltaLink` to resume from where we left off;
   * omit it to do a full initial sync.
   */
  async getInboxDelta(accessToken: string, deltaLink?: string | null): Promise<GraphDeltaResult> {
    const url =
      deltaLink ??
      `${GRAPH_BASE}/me/mailFolders/inbox/messages/delta?$select=subject,bodyPreview,body,from,receivedDateTime,hasAttachments,conversationId,internetMessageId`;
    const page = await this.request<{
      value: GraphMessage[];
      '@odata.nextLink'?: string;
      '@odata.deltaLink'?: string;
    }>(accessToken, url);
    return {
      messages: page.value,
      nextDeltaLink: page['@odata.deltaLink'] ?? null,
      nextSkipLink: page['@odata.nextLink'] ?? null,
    };
  }

  async getAttachments(accessToken: string, messageId: string): Promise<GraphAttachment[]> {
    const res = await this.request<{ value: GraphAttachment[] }>(
      accessToken,
      `/me/messages/${encodeURIComponent(messageId)}/attachments`,
    );
    return res.value;
  }

  /**
   * Subscribes to `Created` notifications on the inbox. Graph requires the
   * notification URL to answer the validation handshake before it will
   * accept the subscription — see OutlookWebhookController.
   */
  async createSubscription(
    accessToken: string,
    notificationUrl: string,
    clientState: string,
    expirationMinutes = 60 * 24 * 2, // Graph caps mail subscriptions at ~3 days; renew well before that.
  ): Promise<{ id: string; expirationDateTime: string }> {
    return this.request(accessToken, '/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        changeType: 'created',
        notificationUrl,
        resource: '/me/mailFolders/inbox/messages',
        expirationDateTime: new Date(Date.now() + expirationMinutes * 60_000).toISOString(),
        clientState,
      }),
    });
  }

  async renewSubscription(
    accessToken: string,
    subscriptionId: string,
    expirationMinutes = 60 * 24 * 2,
  ): Promise<{ id: string; expirationDateTime: string }> {
    return this.request(accessToken, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expirationDateTime: new Date(Date.now() + expirationMinutes * 60_000).toISOString(),
      }),
    });
  }

  async deleteSubscription(accessToken: string, subscriptionId: string): Promise<void> {
    try {
      await this.request(accessToken, `/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'DELETE' });
    } catch (error) {
      // Already gone (expired, or Graph cleaned it up) — disconnecting locally still succeeds.
      this.logger.warn(`Failed to delete Graph subscription ${subscriptionId}: ${error}`);
    }
  }
}
