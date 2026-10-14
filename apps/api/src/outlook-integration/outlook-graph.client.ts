import { Injectable, Logger } from '@nestjs/common';
import { GRAPH_BASE, GraphApiError, GraphHttp } from './graph/graph-http';

export { GraphApiError };

export interface GraphTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface GraphRecipient {
  emailAddress?: { name?: string; address?: string };
}

export interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string | null;
  bodyPreview: string | null;
  body?: { content: string; contentType: string };
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime: string;
  sentDateTime?: string;
  hasAttachments: boolean;
  internetMessageId: string;
  '@removed'?: { reason: string };
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
}

/** The writable subset of a Graph message that sending needs. */
export interface GraphOutgoingMessage {
  subject?: string;
  body?: { contentType: 'HTML' | 'Text'; content: string };
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
}

export interface GraphFileAttachmentInput {
  name: string;
  contentType: string;
  /** base64 — Graph accepts inline file attachments up to 3 MB. */
  contentBytes: string;
}

/**
 * Immutable ids survive the Drafts → Sent Items move, so the id stored on the
 * EmailMessage still works for a later createReply.
 */
const IMMUTABLE_ID_HEADERS = { Prefer: 'IdType="ImmutableId"' };

export interface GraphDeltaResult {
  messages: GraphMessage[];
  nextDeltaLink: string | null;
  nextSkipLink: string | null;
}

const MESSAGE_SELECT =
  'subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,conversationId,internetMessageId';

/**
 * Mail + subscription calls over Microsoft Graph (no SDK dependency). The
 * transport — auth, throttling retries, GraphApiError on non-2xx — lives in
 * GraphHttp.
 */
@Injectable()
export class OutlookGraphClient {
  private readonly logger = new Logger(OutlookGraphClient.name);

  constructor(private http: GraphHttp) {}

  async getMailboxAddress(accessToken: string): Promise<string> {
    const me = await this.http.request<{ mail?: string; userPrincipalName: string }>(accessToken, '/me?$select=mail,userPrincipalName');
    return me.mail ?? me.userPrincipalName;
  }

  /**
   * Delta query over one mail folder ('inbox', 'sentitems' or a folder id) —
   * the correct way to sync incrementally. Pass the previous delta/skip link
   * to resume; omit it to do a full initial sync.
   */
  async getFolderDelta(accessToken: string, folder: string, deltaLink?: string | null): Promise<GraphDeltaResult> {
    const url = deltaLink ?? `${GRAPH_BASE}/me/mailFolders/${encodeURIComponent(folder)}/messages/delta?$select=${MESSAGE_SELECT}`;
    const page = await this.http.request<{
      value: GraphMessage[];
      '@odata.nextLink'?: string;
      '@odata.deltaLink'?: string;
    }>(accessToken, url, { headers: { Prefer: 'outlook.body-content-type="html", IdType="ImmutableId"' } });
    return {
      messages: page.value.filter((m) => !m['@removed']),
      nextDeltaLink: page['@odata.deltaLink'] ?? null,
      nextSkipLink: page['@odata.nextLink'] ?? null,
    };
  }

  getInboxDelta(accessToken: string, deltaLink?: string | null): Promise<GraphDeltaResult> {
    return this.getFolderDelta(accessToken, 'inbox', deltaLink);
  }

  async getAttachments(accessToken: string, messageId: string): Promise<GraphAttachment[]> {
    const res = await this.http.request<{ value: GraphAttachment[] }>(
      accessToken,
      `/me/messages/${encodeURIComponent(messageId)}/attachments`,
      { headers: IMMUTABLE_ID_HEADERS },
    );
    return res.value;
  }

  /** New draft in the signed-in user's Drafts folder — the first step of every send. */
  createDraftMessage(accessToken: string, message: GraphOutgoingMessage): Promise<GraphMessage> {
    return this.http.request<GraphMessage>(accessToken, '/me/messages', {
      method: 'POST',
      headers: IMMUTABLE_ID_HEADERS,
      body: JSON.stringify(message),
    });
  }

  /** Reply draft that stays in the original Outlook conversation (quoted history included by Graph). */
  createReplyDraft(accessToken: string, messageId: string, replyAll: boolean): Promise<GraphMessage> {
    const action = replyAll ? 'createReplyAll' : 'createReply';
    return this.http.request<GraphMessage>(accessToken, `/me/messages/${encodeURIComponent(messageId)}/${action}`, {
      method: 'POST',
      headers: IMMUTABLE_ID_HEADERS,
      body: '{}',
    });
  }

  updateDraft(accessToken: string, messageId: string, patch: GraphOutgoingMessage): Promise<GraphMessage> {
    return this.http.request<GraphMessage>(accessToken, `/me/messages/${encodeURIComponent(messageId)}`, {
      method: 'PATCH',
      headers: IMMUTABLE_ID_HEADERS,
      body: JSON.stringify(patch),
    });
  }

  async addFileAttachment(accessToken: string, messageId: string, file: GraphFileAttachmentInput): Promise<void> {
    await this.http.request(accessToken, `/me/messages/${encodeURIComponent(messageId)}/attachments`, {
      method: 'POST',
      body: JSON.stringify({ '@odata.type': '#microsoft.graph.fileAttachment', ...file }),
    });
  }

  /** Graph answers 202 with no body; the message moves to Sent Items. */
  async sendDraft(accessToken: string, messageId: string): Promise<void> {
    await this.http.request(accessToken, `/me/messages/${encodeURIComponent(messageId)}/send`, { method: 'POST' });
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
    return this.http.request(accessToken, '/subscriptions', {
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
    return this.http.request(accessToken, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expirationDateTime: new Date(Date.now() + expirationMinutes * 60_000).toISOString(),
      }),
    });
  }

  async deleteSubscription(accessToken: string, subscriptionId: string): Promise<void> {
    try {
      await this.http.request(accessToken, `/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'DELETE' });
    } catch (error) {
      // Already gone (expired, or Graph cleaned it up) — disconnecting locally still succeeds.
      this.logger.warn(`Failed to delete Graph subscription ${subscriptionId}: ${error}`);
    }
  }
}
