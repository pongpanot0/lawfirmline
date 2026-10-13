import { Injectable } from '@nestjs/common';

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const GRAPH_HOST = 'https://graph.microsoft.com/';
const MAX_RETRIES = 3;

/** Non-2xx from Graph. Callers branch on `.status` (401 revoked, 404 gone). */
export class GraphApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The only place that talks HTTP to Microsoft Graph: auth header, throttling
 * retries (Graph answers 429 with Retry-After under load — a mailbox backfill
 * hits it routinely), pagination and binary bodies.
 */
@Injectable()
export class GraphHttp {
  private url(path: string) {
    return path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  }

  protected sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async send(token: string, path: string, init: RequestInit = {}): Promise<Response> {
    const url = this.url(path);
    const method = (init.method ?? 'GET').toUpperCase();
    const callerHeaders = (init.headers as Record<string, string>) ?? {};
    // The bearer token only goes to Graph itself; absolute URLs elsewhere (e.g. upload sessions) are pre-authorised.
    const headers = url.startsWith(GRAPH_HOST) ? { ...callerHeaders, Authorization: `Bearer ${token}` } : callerHeaders;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { ...init, headers });
      if (res.ok) return res;
      // 503/504 on a POST may already have executed (send mail, create event) — retrying would duplicate it.
      const retryable = res.status === 429 || ((res.status === 503 || res.status === 504) && method !== 'POST');
      if (retryable && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await this.sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt, 30) * 1000);
        continue;
      }
      const body = await res.text().catch(() => '');
      throw new GraphApiError(res.status, `Graph ${method} ${path} failed: ${res.status} ${body.slice(0, 500)}`);
    }
  }

  async request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.send(token, path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) ?? {}) },
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async requestBuffer(token: string, path: string): Promise<Buffer> {
    const res = await this.send(token, path, { redirect: 'follow' });
    return Buffer.from(await res.arrayBuffer());
  }

  async putBuffer<T>(token: string, path: string, body: Buffer, contentType: string, extraHeaders: Record<string, string> = {}): Promise<T> {
    const res = await this.send(token, path, {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: { 'Content-Type': contentType, ...extraHeaders },
    });
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async paginate<T>(token: string, path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = path;
    while (next) {
      const page: { value: T[]; '@odata.nextLink'?: string } = await this.request(token, next);
      items.push(...page.value);
      next = page['@odata.nextLink'];
    }
    return items;
  }
}
