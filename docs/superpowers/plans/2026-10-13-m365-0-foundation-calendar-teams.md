# Microsoft 365 — Foundation, Outlook Calendar Sync, Teams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared Microsoft 365 groundwork (per-user connections with purpose toggles, browser-bound OAuth, a retrying Graph HTTP layer, full-fidelity mail sync, tighter thread visibility), then one-way sync of our calendar events into each responsible lawyer's Outlook calendar (A) and Teams links for client meetings (E).

**Architecture:** A new `GraphHttp` owns transport (auth header, retry on 429/503, pagination, binary I/O); `OutlookGraphClient` (mail) and a new `GraphCalendarClient` sit on it. `MailboxConnection` gets an owner (`userId`) and two switches (`syncInboxToIntake`, `syncCalendar`). Calendar sync is a single idempotent mutator `OutlookCalendarSyncService.syncEvent(eventId)` that reconciles one event against its `CalendarEventOutlookCopy` rows; a 2-minute cron (`reconcileAll`) finds what changed anywhere (there are 8+ event write sites), and `CalendarService`/`EventResponsibilityService`/`CourtDayService` call `syncEventSoon` after their own writes for speed. Teams links ride on the organizer's copy (`isOnlineMeeting`), and the join URL is written back to the event.

**Tech Stack:** NestJS + Prisma (Postgres) in `apps/api`, Next.js in `apps/web`, Jest, raw `fetch` against Microsoft Graph v1.0 (no SDK).

**Spec:** `docs/superpowers/specs/2026-10-13-microsoft365-integration-design.md` (ส่วนที่ 0, A, E)

**Followed by:** `2026-10-13-m365-b-case-email.md`, `2026-10-13-m365-c-send-reply.md`, `2026-10-13-m365-d-onedrive.md` — they depend on the names produced here. Do not rename anything listed under a task's **Produces**.

## Global Constraints

- Delegated Graph permissions only; scopes already in `outlook-oauth.service.ts` (`Mail.Send`, `Calendars.ReadWrite`, `Files.ReadWrite.All`, `Sites.Read.All`, …). No application permissions.
- No AI anywhere in this plan.
- Calendar sync is one-way (our system → Outlook). Never read events back from Outlook.
- A Graph failure must never fail the user's mutation (create/update/delete event, connect, settings). Catch, log, store `lastError`.
- Migrations: hand-written SQL in `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`; this plan uses `20261013120000_m365_foundation`, `20261013130000_calendar_outlook_copies`, `20261013140000_event_teams_meeting`. Additive only (no drops/renames). Apply (from repo root): `cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/<folder>/migration.sql && pnpm exec prisma migrate resolve --applied <folder> && pnpm exec prisma generate && cd ../..`. **Never run `prisma migrate dev` or `migrate deploy`** (the shared local DB holds other branches' migrations).
- Worktree setup (once, before Task 1): `cp /Users/pongpanot_s/Documents/dev/lawfirm/apps/api/.env apps/api/.env` if `apps/api/.env` is missing; `pnpm --filter @lawfirm/shared build`.
- API tests: `pnpm --filter api exec jest --config jest.config.js <paths>`. Typecheck: `pnpm --filter api exec tsc --noEmit -p tsconfig.json` and `pnpm --filter web exec tsc --noEmit`.
- Services are unit-tested with `Test.createTestingModule` and hand-written `mockPrisma` objects (`$transaction: (cb) => cb(mockPrisma)`); Graph is tested by stubbing `global.fetch` or the client class. No real Microsoft calls.
- UI text in Thai.
- Git: call `/usr/bin/git` as a plain single command. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A lawyer connects only for the calendar** — their inbox must not appear in the intake queue, and no webhook subscription may be created, until they turn on "ดึง Inbox เข้าคิวรับเรื่อง". Test: Task 4 `syncConnection skips inbox when syncInboxToIntake is false` + Task 2 controller toggle test.
2. **An event is deleted (directly, or by cascade when its case is deleted)** — the Outlook copies must be deleted on the next run even though the event row is gone. Test: Task 8 `deletes Outlook copies of an event that no longer exists`.
3. **The user deleted the copy in Outlook themselves** (PATCH/DELETE → 404) — no crash loop; the row is dropped and recreated only if the event is still theirs. Test: Task 8 `404 on update drops the copy and recreates it`.
4. **Cron and the immediate hook run for the same event at once** — must not create two Outlook events. Test: Task 8 `concurrent syncEvent calls for the same event make one create` (in-process lock) + Graph `transactionId` asserted in Task 7.
5. **Expired/revoked token for one user** — the run continues for everyone else, the failure is stored on the copy. Test: Task 8 `token failure for one user does not stop others`.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/outlook-integration/graph/graph-http.ts` (new) | Transport: auth, retry, JSON/binary, pagination, `GraphApiError` |
| `apps/api/src/outlook-integration/outlook-graph.client.ts` | Mail Graph calls (delta per folder, attachments, subscriptions) on top of `GraphHttp` |
| `apps/api/src/outlook-integration/graph/graph-calendar.client.ts` (new) | Calendar event create/update/delete |
| `apps/api/src/outlook-integration/calendar/outlook-event-payload.ts` (new) | Pure: our event → Graph event JSON |
| `apps/api/src/outlook-integration/calendar/outlook-calendar-sync.service.ts` (new) | `syncEvent`, `syncEventSoon`, `reconcileAll` cron, `removeAllForConnection` |
| `apps/api/src/outlook-integration/mail/html-to-text.ts` (new) | Pure HTML → plain text for `EmailMessage.bodyText` |
| `apps/api/src/outlook-integration/outlook-connections.service.ts` | Owner, settings, `findActiveForUser`, list shape |
| `apps/api/src/outlook-integration/outlook-connections.controller.ts` | `PATCH /outlook/connections/:id` settings |
| `apps/api/src/outlook-integration/outlook-oauth.{service,controller}.ts` | Browser-bound OAuth (`/outlook/start` + nonce cookie) |
| `apps/api/src/outlook-integration/outlook-sync.service.ts` | Inbox (gated) + Sent Items delta, `upsertGraphMessage` |
| `apps/api/src/common/services/case-access.service.ts` | New `getEmailThreadFilterForUser` rule |
| `apps/api/src/email-intake/*` | Attachment download endpoint |
| `apps/api/src/calendar/*` | Teams fields in DTO, organizer resolution, `syncEventSoon` hooks |
| `apps/api/src/notifications/reminder.scheduler.ts` | Teams link in reminder text |
| `apps/web/src/components/settings/MicrosoftAccountsSection.tsx` (new) | Settings UI for Microsoft accounts (later plans add folder-matching entry here) |
| `apps/web/src/app/(dashboard)/settings/page.tsx` | Mount the section, delete the inline Outlook block |
| `apps/web/src/app/(dashboard)/email-intake/[threadId]/page.tsx` | Explicit accept, attachment links, hide mock reply in prod |
| `apps/web/src/components/calendar/CalendarEventDialog.tsx` | Teams checkbox, invitees, join button |
| `apps/web/src/lib/api.ts` | Types + calls |

---

### Task 1: GraphHttp transport + mail client on top of it

**Files:**
- Create: `apps/api/src/outlook-integration/graph/graph-http.ts`
- Create: `apps/api/src/outlook-integration/graph/graph-http.spec.ts`
- Modify: `apps/api/src/outlook-integration/outlook-graph.client.ts`
- Modify: `apps/api/src/outlook-integration/outlook-integration.module.ts`

**Interfaces:**
- Produces:
  - `export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'`
  - `export class GraphApiError extends Error { constructor(public status: number, message: string) }` (re-exported from `outlook-graph.client.ts` so existing imports keep working)
  - `@Injectable() class GraphHttp { request<T>(token: string, path: string, init?: RequestInit): Promise<T>; requestBuffer(token: string, path: string): Promise<Buffer>; putBuffer<T>(token: string, path: string, body: Buffer, contentType: string, extraHeaders?: Record<string,string>): Promise<T>; paginate<T>(token: string, path: string): Promise<T[]> }`
  - `OutlookGraphClient.getFolderDelta(token: string, folder: string, deltaLink?: string | null): Promise<GraphDeltaResult>` (`folder` = `'inbox' | 'sentitems' | <mailFolder id>`); `getInboxDelta(token, deltaLink)` stays as a thin alias.
  - `GraphMessage` gains `toRecipients?: GraphRecipient[]; ccRecipients?: GraphRecipient[]` where `export interface GraphRecipient { emailAddress?: { name?: string; address?: string } }`.
  - `OutlookIntegrationModule` exports `GraphHttp`, `OutlookGraphClient`, `OutlookConnectionsService`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/outlook-integration/graph/graph-http.spec.ts`:
```ts
import { GraphApiError, GraphHttp, GRAPH_BASE } from './graph-http';

function res(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    arrayBuffer: async () => new TextEncoder().encode(String(body)).buffer,
  };
}

describe('GraphHttp', () => {
  const http = new GraphHttp();
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    jest.spyOn(GraphHttp.prototype as any, 'sleep').mockResolvedValue(undefined);
  });

  it('prefixes relative paths and sends the bearer token', async () => {
    fetchMock.mockResolvedValue(res(200, { ok: 1 }));
    await expect(http.request('tok', '/me')).resolves.toEqual({ ok: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${GRAPH_BASE}/me`);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('retries 429 honoring Retry-After, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, 'slow down', { 'retry-after': '2' }))
      .mockResolvedValueOnce(res(200, { ok: 2 }));
    await expect(http.request('tok', '/me')).resolves.toEqual({ ok: 2 });
    expect((GraphHttp.prototype as any).sleep).toHaveBeenCalledWith(2000);
  });

  it('gives up after 3 retries with GraphApiError carrying the status', async () => {
    fetchMock.mockResolvedValue(res(503, 'down'));
    await expect(http.request('tok', '/me')).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry a 404', async () => {
    fetchMock.mockResolvedValue(res(404, 'nope'));
    await expect(http.request('tok', '/me/events/x')).rejects.toBeInstanceOf(GraphApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns undefined on 204', async () => {
    fetchMock.mockResolvedValue(res(204, ''));
    await expect(http.request('tok', '/me/events/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('paginate follows @odata.nextLink', async () => {
    fetchMock
      .mockResolvedValueOnce(res(200, { value: [1, 2], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' }))
      .mockResolvedValueOnce(res(200, { value: [3] }));
    await expect(http.paginate<number>('tok', '/me/mailFolders')).resolves.toEqual([1, 2, 3]);
    expect(fetchMock.mock.calls[1][0]).toBe('https://graph.microsoft.com/v1.0/next');
  });

  it('requestBuffer returns the body bytes', async () => {
    fetchMock.mockResolvedValue(res(200, 'abc'));
    const buf = await http.requestBuffer('tok', '/me/drive/items/1/content');
    expect(buf.toString()).toBe('abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration/graph/graph-http.spec.ts`
Expected: FAIL — `Cannot find module './graph-http'`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/outlook-integration/graph/graph-http.ts`:
```ts
import { Injectable } from '@nestjs/common';

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MAX_RETRIES = 3;
const RETRYABLE = new Set([429, 503, 504]);

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
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(this.url(path), {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...((init.headers as Record<string, string>) ?? {}) },
      });
      if (res.ok) return res;
      if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await this.sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt, 30) * 1000);
        continue;
      }
      const body = await res.text().catch(() => '');
      throw new GraphApiError(res.status, `Graph ${init.method ?? 'GET'} ${path} failed: ${res.status} ${body.slice(0, 500)}`);
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
      body,
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
```

Note: `request` reads `res.text()` then parses, so the spec's `res()` helper (which serves both `text` and `json`) works.

Replace the body of `apps/api/src/outlook-integration/outlook-graph.client.ts` transport so it delegates (keep every existing public method and the `GraphTokens`, `GraphMessage`, `GraphAttachment`, `GraphDeltaResult` exports):
```ts
import { Injectable, Logger } from '@nestjs/common';
import { GRAPH_BASE, GraphApiError, GraphHttp } from './graph/graph-http';

export { GraphApiError };

export interface GraphTokens { accessToken: string; refreshToken: string; expiresIn: number; }
export interface GraphRecipient { emailAddress?: { name?: string; address?: string } }
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
export interface GraphAttachment { id: string; name: string; contentType: string; size: number; contentBytes?: string; }
export interface GraphDeltaResult { messages: GraphMessage[]; nextDeltaLink: string | null; nextSkipLink: string | null; }

const MESSAGE_SELECT =
  'subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,conversationId,internetMessageId';

@Injectable()
export class OutlookGraphClient {
  private readonly logger = new Logger(OutlookGraphClient.name);

  constructor(private http: GraphHttp) {}

  async getMailboxAddress(accessToken: string): Promise<string> {
    const me = await this.http.request<{ mail?: string; userPrincipalName: string }>(accessToken, '/me?$select=mail,userPrincipalName');
    return me.mail ?? me.userPrincipalName;
  }

  /** Delta over one mail folder ('inbox', 'sentitems' or a folder id). Resume with the previous delta/skip link. */
  async getFolderDelta(accessToken: string, folder: string, deltaLink?: string | null): Promise<GraphDeltaResult> {
    const url = deltaLink ?? `${GRAPH_BASE}/me/mailFolders/${encodeURIComponent(folder)}/messages/delta?$select=${MESSAGE_SELECT}`;
    const page = await this.http.request<{ value: GraphMessage[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string }>(
      accessToken,
      url,
      { headers: { Prefer: 'outlook.body-content-type="html"' } },
    );
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
    const res = await this.http.request<{ value: GraphAttachment[] }>(accessToken, `/me/messages/${encodeURIComponent(messageId)}/attachments`);
    return res.value;
  }

  // createSubscription / renewSubscription / deleteSubscription: unchanged bodies,
  // but call `this.http.request(...)` instead of the removed private `request`.
}
```
Move the three subscription methods over verbatim, replacing `this.request(` with `this.http.request(`.

In `outlook-integration.module.ts` add `GraphHttp` to `providers` and add `exports: [GraphHttp, OutlookGraphClient, OutlookConnectionsService]`.

Update `outlook-sync.service.spec.ts` / `outlook-connections.service.spec.ts` only if they construct `OutlookGraphClient` directly (they mock it — no change expected).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration`
Expected: PASS (all suites, including the 7 new GraphHttp tests).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/api/src/outlook-integration
/usr/bin/git commit -m "refactor(outlook): GraphHttp transport with throttling retry, pagination and binary I/O

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Connection owner + purpose switches (schema, service, endpoint)

**Files:**
- Create: `apps/api/prisma/migrations/20261013120000_m365_foundation/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (models `MailboxConnection`, `EmailThread`, `EmailMessage`, `User`, `Case`)
- Modify: `apps/api/src/outlook-integration/outlook-connections.service.ts`
- Modify: `apps/api/src/outlook-integration/outlook-connections.controller.ts`
- Create: `apps/api/src/outlook-integration/dto/update-connection-settings.dto.ts`
- Test: `apps/api/src/outlook-integration/outlook-connections.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 module exports.
- Produces:
  - Prisma fields exactly as in the migration below (`MailboxConnection.userId|syncInboxToIntake|syncCalendar|sentDeltaLink`, `EmailThread.mailboxConnectionId|caseId`, `EmailMessage.graphMessageId|toAddresses|ccAddresses|bodyHtml`).
  - `OutlookConnectionsService.findActiveForUser(userId: string): Promise<MailboxConnection | null>`
  - `OutlookConnectionsService.listForFirm(user: AuthUser): Promise<ConnectionListItem[]>` with `ConnectionListItem = { id; mailboxAddress; status; lastError; lastSyncedAt; subscriptionExpiresAt; createdAt; syncInboxToIntake; syncCalendar; userId: string | null; user: { id: string; firstName: string; lastName: string } | null; isMine: boolean }`
  - `OutlookConnectionsService.updateSettings(user: AuthUser, id: string, dto: UpdateConnectionSettingsDto): Promise<{ before: MailboxConnection; after: MailboxConnection }>`
  - `PATCH /outlook/connections/:id` body `{ syncInboxToIntake?: boolean; syncCalendar?: boolean }` → `ConnectionListItem`-shaped row (side effects wired in Tasks 4 and 9).

- [ ] **Step 1: Write the migration and schema**

`apps/api/prisma/migrations/20261013120000_m365_foundation/migration.sql`:
```sql
ALTER TABLE "MailboxConnection"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "syncInboxToIntake" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "syncCalendar" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sentDeltaLink" TEXT;

-- Existing rows were connected for inbox intake — keep that behaviour for them.
UPDATE "MailboxConnection" mc SET "userId" = u."id", "syncInboxToIntake" = true
FROM "User" u WHERE u."id" = mc."connectedByUserId";

ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MailboxConnection_userId_idx" ON "MailboxConnection"("userId");

ALTER TABLE "EmailThread"
  ADD COLUMN "mailboxConnectionId" TEXT,
  ADD COLUMN "caseId" TEXT;
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_mailboxConnectionId_fkey"
  FOREIGN KEY ("mailboxConnectionId") REFERENCES "MailboxConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "EmailThread_mailboxConnectionId_idx" ON "EmailThread"("mailboxConnectionId");
CREATE INDEX "EmailThread_caseId_idx" ON "EmailThread"("caseId");

ALTER TABLE "EmailMessage"
  ADD COLUMN "graphMessageId" TEXT,
  ADD COLUMN "toAddresses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "ccAddresses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "bodyHtml" TEXT;
```

In `schema.prisma`:
- `model MailboxConnection` add:
```prisma
  userId                String?
  syncInboxToIntake     Boolean                 @default(false)
  syncCalendar          Boolean                 @default(true)
  sentDeltaLink         String?                 @db.Text
  user                  User?                   @relation("MailboxConnectionOwner", fields: [userId], references: [id], onDelete: SetNull)
  threads               EmailThread[]
  @@index([userId])
```
- `model User` add `mailboxConnections MailboxConnection[] @relation("MailboxConnectionOwner")`.
- `model EmailThread` add:
```prisma
  mailboxConnectionId String?
  caseId              String?
  mailboxConnection   MailboxConnection? @relation(fields: [mailboxConnectionId], references: [id], onDelete: SetNull)
  case                Case?              @relation("CaseEmailThreads", fields: [caseId], references: [id], onDelete: SetNull)
  @@index([mailboxConnectionId])
  @@index([caseId])
```
- `model Case` add `emailThreads EmailThread[] @relation("CaseEmailThreads")`.
- `model EmailMessage` add:
```prisma
  graphMessageId String?
  toAddresses    String[] @default([])
  ccAddresses    String[] @default([])
  bodyHtml       String?  @db.Text
```

Apply (from repo root): `cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261013120000_m365_foundation/migration.sql && pnpm exec prisma migrate resolve --applied 20261013120000_m365_foundation && pnpm exec prisma generate && cd ../..`
Expected: `ALTER TABLE` / `CREATE INDEX` lines, then `Migration 20261013120000_m365_foundation marked as applied.` and `Generated Prisma Client`.

- [ ] **Step 2: Write the failing tests**

Add to `apps/api/src/outlook-integration/outlook-connections.service.spec.ts` (extend its `mockPrisma.mailboxConnection` with `findMany`, `findFirst`, `update` jest.fn()s if missing):
```ts
describe('ownership and settings', () => {
  const owner = { id: 'u1', firmId: 'f1', firmRole: 'LAWYER' } as any;
  const other = { id: 'u2', firmId: 'f1', firmRole: 'LAWYER' } as any;
  const firmOwner = { id: 'u3', firmId: 'f1', firmRole: 'OWNER' } as any;
  const row = { id: 'c1', firmId: 'f1', userId: 'u1', connectedByUserId: 'u1', syncInboxToIntake: false, syncCalendar: true };

  it('findActiveForUser returns the newest ACTIVE connection of that user', async () => {
    mockPrisma.mailboxConnection.findFirst.mockResolvedValue(row);
    await expect(service.findActiveForUser('u1')).resolves.toBe(row);
    expect(mockPrisma.mailboxConnection.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('listForFirm flags the caller’s own rows', async () => {
    mockPrisma.mailboxConnection.findMany.mockResolvedValue([{ ...row, user: { id: 'u1', firstName: 'A', lastName: 'B' } }]);
    const [item] = await service.listForFirm(owner);
    expect(item.isMine).toBe(true);
    expect(item).not.toHaveProperty('accessTokenEnc');
  });

  it('updateSettings is allowed for the owner of the connection', async () => {
    mockPrisma.mailboxConnection.findFirst.mockResolvedValue(row);
    mockPrisma.mailboxConnection.update.mockResolvedValue({ ...row, syncInboxToIntake: true });
    const { before, after } = await service.updateSettings(owner, 'c1', { syncInboxToIntake: true });
    expect(before.syncInboxToIntake).toBe(false);
    expect(after.syncInboxToIntake).toBe(true);
    expect(mockPrisma.mailboxConnection.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { syncInboxToIntake: true } });
  });

  it('updateSettings refuses a colleague but allows the firm owner', async () => {
    mockPrisma.mailboxConnection.findFirst.mockResolvedValue(row);
    mockPrisma.mailboxConnection.update.mockResolvedValue(row);
    await expect(service.updateSettings(other, 'c1', { syncCalendar: false })).rejects.toThrow(/เฉพาะผู้เชื่อมต่อ/);
    await expect(service.updateSettings(firmOwner, 'c1', { syncCalendar: false })).resolves.toBeDefined();
  });

  it('upsertFromOAuth records the owner', async () => {
    mockPrisma.mailboxConnection.upsert.mockResolvedValue(row);
    await service.upsertFromOAuth(owner, { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 }, 'a@x.com');
    const call = mockPrisma.mailboxConnection.upsert.mock.calls[0][0];
    expect(call.create.userId).toBe('u1');
    expect(call.update.userId).toBe('u1');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration/outlook-connections.service.spec.ts`
Expected: FAIL — `service.findActiveForUser is not a function` etc.

- [ ] **Step 4: Implement**

`apps/api/src/outlook-integration/dto/update-connection-settings.dto.ts`:
```ts
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateConnectionSettingsDto {
  @IsOptional() @IsBoolean() syncInboxToIntake?: boolean;
  @IsOptional() @IsBoolean() syncCalendar?: boolean;
}
```

In `outlook-connections.service.ts`:
```ts
const SAFE_SELECT = {
  id: true, firmId: true, mailboxAddress: true, connectedByUserId: true, userId: true,
  status: true, lastError: true, lastSyncedAt: true, subscriptionExpiresAt: true, createdAt: true,
  syncInboxToIntake: true, syncCalendar: true,
  user: { select: { id: true, firstName: true, lastName: true } },
} as const;

async listForFirm(user: AuthUser) {
  const rows = await this.prisma.mailboxConnection.findMany({
    where: { firmId: user.firmId },
    select: SAFE_SELECT,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({ ...r, isMine: (r.userId ?? r.connectedByUserId) === user.id }));
}

/** The user's own Microsoft account — used for calendar, sending and files. */
findActiveForUser(userId: string) {
  return this.prisma.mailboxConnection.findFirst({
    where: { userId, status: MailboxConnectionStatus.ACTIVE },
    orderBy: { updatedAt: 'desc' },
  });
}

async updateSettings(user: AuthUser, id: string, dto: UpdateConnectionSettingsDto) {
  await this.assertCanManage(user, id);
  const before = await this.getRaw(user.firmId, id);
  const data: { syncInboxToIntake?: boolean; syncCalendar?: boolean } = {};
  if (dto.syncInboxToIntake !== undefined) data.syncInboxToIntake = dto.syncInboxToIntake;
  if (dto.syncCalendar !== undefined) data.syncCalendar = dto.syncCalendar;
  const after = await this.prisma.mailboxConnection.update({ where: { id }, data });
  return { before, after };
}
```
Change `assertCanManage` to compare `(connection.userId ?? connection.connectedByUserId) !== user.id`. In `upsertFromOAuth` add `userId: user.id` to both `create` and `update`. In `findActiveForUser` the `where` must be exactly `{ userId, status: MailboxConnectionStatus.ACTIVE }` (the enum value is the string `'ACTIVE'`, which the test compares against).

In `outlook-connections.controller.ts`:
```ts
@Get()
list(@CurrentUser() user: AuthUser) {
  return this.connections.listForFirm(user);
}

@Patch(':id')
async updateSettings(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateConnectionSettingsDto) {
  await this.connections.updateSettings(user, id, dto);
  // Side effects (webhook subscription, calendar cleanup) are wired in later tasks.
  const rows = await this.connections.listForFirm(user);
  return rows.find((r) => r.id === id);
}
```
(import `Body`, `Patch` from `@nestjs/common`).

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/api/prisma apps/api/src/outlook-integration
/usr/bin/git commit -m "feat(outlook): connection owner and purpose switches (inbox intake / calendar)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Browser-bound OAuth (audit 2026-10-03, Medium)

**Files:**
- Modify: `apps/api/src/outlook-integration/outlook-oauth.service.ts`
- Modify: `apps/api/src/outlook-integration/outlook-oauth.controller.ts`
- Test: `apps/api/src/outlook-integration/outlook-oauth.service.spec.ts`

**Interfaces:**
- Produces:
  - `OutlookOAuthService.signTicket(firmId: string, userId: string): string` (2-minute signed ticket)
  - `OutlookOAuthService.verifyTicket(ticket: string): { firmId: string; userId: string }`
  - `OutlookOAuthService.signState(firmId, userId, nonce: string): string`; `verifyState(state)` returns `{ firmId, userId, nonce, issuedAt }`
  - `GET /outlook/connect` (JWT) → `{ url: '<API_PUBLIC_URL>/outlook/start?ticket=…' }` (web keeps doing `window.location.href = url` — no web change)
  - `GET /outlook/start?ticket=` (no JWT) → sets cookie `m365_oauth_nonce` (HttpOnly, Secure in production, SameSite=Lax, Path=/outlook, Max-Age=600) and 302 to Microsoft
  - `GET /outlook/callback` rejects when the cookie is missing or differs from `state.nonce`, and clears the cookie.

- [ ] **Step 1: Write the failing tests**

Add to `outlook-oauth.service.spec.ts` (the existing `signState('firm-1','user-1')` calls become `signState('firm-1','user-1','n1')`):
```ts
it('state round-trips the nonce', () => {
  const decoded = service.verifyState(service.signState('firm-1', 'user-1', 'nonce-1'));
  expect(decoded.nonce).toBe('nonce-1');
});

it('ticket round-trips and expires after 2 minutes', () => {
  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const ticket = service.signTicket('firm-1', 'user-1');
  expect(service.verifyTicket(ticket)).toEqual({ firmId: 'firm-1', userId: 'user-1' });
  (Date.now as jest.Mock).mockReturnValue(now + 121_000);
  expect(() => service.verifyTicket(ticket)).toThrow(BadRequestException);
  (Date.now as jest.Mock).mockRestore();
});

it('a state cannot be used as a ticket', () => {
  const state = service.signState('firm-1', 'user-1', 'n');
  expect(() => service.verifyTicket(state)).toThrow(BadRequestException);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration/outlook-oauth.service.spec.ts`
Expected: FAIL — `signTicket is not a function` / nonce undefined.

- [ ] **Step 3: Implement**

In `outlook-oauth.service.ts` generalize signing with a `kind` field so a state and a ticket are not interchangeable:
```ts
interface Signed { kind: 'state' | 'ticket'; firmId: string; userId: string; nonce?: string; issuedAt: number }

private sign(payload: Signed): string {
  const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', this.stateSecret()).update(json).digest('base64url');
  return `${json}.${sig}`;
}

private verify(token: string, kind: Signed['kind'], maxAgeMs: number): Signed {
  const [json, sig] = (token ?? '').split('.');
  if (!json || !sig) throw new BadRequestException('state ไม่ถูกต้อง');
  const expected = Buffer.from(crypto.createHmac('sha256', this.stateSecret()).update(json).digest('base64url'));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new BadRequestException('state ไม่ถูกต้อง');
  }
  const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as Signed;
  if (payload.kind !== kind) throw new BadRequestException('state ไม่ถูกต้อง');
  if (Date.now() - payload.issuedAt > maxAgeMs) throw new BadRequestException('ลิงก์เชื่อมต่อหมดอายุ กรุณาลองใหม่');
  return payload;
}

signState(firmId: string, userId: string, nonce: string) {
  return this.sign({ kind: 'state', firmId, userId, nonce, issuedAt: Date.now() });
}
verifyState(state: string) {
  const p = this.verify(state, 'state', 10 * 60_000);
  return { firmId: p.firmId, userId: p.userId, nonce: p.nonce ?? '', issuedAt: p.issuedAt };
}
signTicket(firmId: string, userId: string) {
  return this.sign({ kind: 'ticket', firmId, userId, issuedAt: Date.now() });
}
verifyTicket(ticket: string) {
  const p = this.verify(ticket, 'ticket', 2 * 60_000);
  return { firmId: p.firmId, userId: p.userId };
}
```
Remove the old `OAuthState` interface and old `signState/verifyState` bodies. Add a public getter used by the controller:
```ts
get apiPublicUrl() {
  return this.required('API_PUBLIC_URL').replace(/\/$/, '');
}
```
and make `redirectUri` use it.

In `outlook-oauth.controller.ts`:
```ts
const NONCE_COOKIE = 'm365_oauth_nonce';

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Settings page calls this with its JWT; the browser then navigates to the returned /start URL. */
@Get('connect')
@UseGuards(JwtAuthGuard)
connect(@CurrentUser() user: AuthUser) {
  const ticket = this.oauth.signTicket(user.firmId, user.id);
  return { url: `${this.oauth.apiPublicUrl}/outlook/start?ticket=${encodeURIComponent(ticket)}` };
}

/**
 * Top-level navigation on the API origin, so the nonce cookie is first-party.
 * The callback only accepts a state whose nonce matches this browser's cookie —
 * a consent link forwarded to someone else cannot land their mailbox in our firm.
 */
@Get('start')
@SkipSubscription()
start(@Query('ticket') ticket: string, @Res() res: Response) {
  const { firmId, userId } = this.oauth.verifyTicket(ticket);
  const nonce = crypto.randomBytes(16).toString('hex');
  res.cookie(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: this.config.get('NODE_ENV') === 'production',
    sameSite: 'lax',
    path: '/outlook',
    maxAge: 10 * 60_000,
  });
  return res.redirect(this.oauth.buildAuthorizationUrl(this.oauth.signState(firmId, userId, nonce)));
}
```
In `callback`, add `@Req() req: Request` and, right after `verifyState`:
```ts
const { firmId, userId, nonce } = this.oauth.verifyState(state);
const cookieNonce = readCookie(req, NONCE_COOKIE);
res.clearCookie(NONCE_COOKIE, { path: '/outlook' });
if (!cookieNonce || cookieNonce !== nonce) {
  throw new BadRequestException('กรุณาเริ่มเชื่อมต่อจากหน้าตั้งค่าในเบราว์เซอร์เดียวกัน');
}
```
(the surrounding `try/catch` already turns the throw into `redirectTo('error', message)`). Import `Req`, `BadRequestException`, `Request` (from express), `crypto`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/api/src/outlook-integration
/usr/bin/git commit -m "fix(outlook): bind OAuth consent to the initiating browser with a nonce cookie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Full-fidelity mail sync — gated inbox, Sent Items, `upsertGraphMessage`

**Files:**
- Create: `apps/api/src/outlook-integration/mail/html-to-text.ts`
- Create: `apps/api/src/outlook-integration/mail/html-to-text.spec.ts`
- Modify: `apps/api/src/outlook-integration/outlook-sync.service.ts`
- Modify: `apps/api/src/outlook-integration/outlook-subscription.service.ts`
- Modify: `apps/api/src/outlook-integration/outlook-connections.controller.ts`
- Test: `apps/api/src/outlook-integration/outlook-sync.service.spec.ts`

**Interfaces:**
- Consumes: `OutlookGraphClient.getFolderDelta` (Task 1); `syncInboxToIntake`, `sentDeltaLink`, `EmailThread.mailboxConnectionId|caseId`, `EmailMessage.graphMessageId|toAddresses|ccAddresses|bodyHtml` (Task 2).
- Produces:
  - `htmlToText(html: string): string`
  - `OutlookSyncService.upsertGraphMessage(p: { firmId: string; connectionId: string; accessToken: string; message: GraphMessage; direction: 'INBOUND' | 'OUTBOUND'; caseId?: string | null; createThreadIfMissing: boolean }): Promise<{ threadId: string; messageId: string } | null>`
  - `OutlookSyncService.syncConnection(connectionId): Promise<{ messagesSynced: number }>` — inbox only when `syncInboxToIntake`; Sent Items always, attaching only to threads that already exist.
  - `OutlookSubscriptionService.ensureSubscription` is a no-op unless `syncInboxToIntake`; new `OutlookSubscriptionService.removeSubscription(connectionId: string): Promise<void>`.
  - `PATCH /outlook/connections/:id`: turning `syncInboxToIntake` on → `ensureSubscription`; off → `removeSubscription`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/outlook-integration/mail/html-to-text.spec.ts`:
```ts
import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  it('keeps paragraphs and line breaks, drops tags, styles and scripts', () => {
    const html = '<html><head><style>p{color:red}</style></head><body><p>เรียน ทนาย</p><p>บรรทัด 1<br>บรรทัด 2</p><script>x()</script></body></html>';
    expect(htmlToText(html)).toBe('เรียน ทนาย\n\nบรรทัด 1\nบรรทัด 2');
  });
  it('decodes common entities', () => {
    expect(htmlToText('A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39;&nbsp;f')).toBe(`A & B <c> "d" 'e' f`);
  });
  it('collapses runs of blank lines', () => {
    expect(htmlToText('<div>a</div><div></div><div></div><div>b</div>')).toBe('a\n\nb');
  });
});
```

Add to `outlook-sync.service.spec.ts` (extend mocks: `mockPrisma.emailThread.findUnique`, `findFirst`, `create`, `update`; `mockGraph.getFolderDelta`; keep `mockGraph.getInboxDelta` unused):
```ts
const htmlMessage = {
  id: 'g1', conversationId: 'conv-1', subject: 'ขอคำปรึกษา', bodyPreview: 'ตัด…',
  body: { contentType: 'html', content: '<p>เนื้อหาเต็ม</p>' },
  from: { emailAddress: { name: 'S', address: 's@x.com' } },
  toRecipients: [{ emailAddress: { address: 'lawyer@firm.com' } }],
  ccRecipients: [{ emailAddress: { address: 'cc@x.com' } }],
  receivedDateTime: '2026-10-13T00:00:00Z', hasAttachments: false, internetMessageId: '<m1@x>',
};

it('syncConnection skips inbox when syncInboxToIntake is false but still reads Sent Items', async () => {
  mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({ id: 'c1', firmId: 'f1', syncInboxToIntake: false, deltaLink: null, sentDeltaLink: null });
  mockConnections.getValidAccessToken.mockResolvedValue('tok');
  mockGraph.getFolderDelta.mockResolvedValue({ messages: [], nextDeltaLink: 'd2', nextSkipLink: null });
  await service.syncConnection('c1');
  expect(mockGraph.getFolderDelta).toHaveBeenCalledTimes(1);
  expect(mockGraph.getFolderDelta).toHaveBeenCalledWith('tok', 'sentitems', null);
  expect(mockPrisma.mailboxConnection.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sentDeltaLink: 'd2' }) }));
});

it('upsertGraphMessage stores the full body, recipients, graph id and connection', async () => {
  mockPrisma.emailThread.findUnique.mockResolvedValue(null);
  mockPrisma.emailThread.create.mockResolvedValue({ id: 't1', caseId: null });
  mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
  mockPrisma.emailMessage.create.mockResolvedValue({ id: 'm1' });
  const out = await service.upsertGraphMessage({
    firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
    direction: 'INBOUND', createThreadIfMissing: true,
  });
  expect(out).toEqual({ threadId: 't1', messageId: 'm1' });
  expect(mockPrisma.emailThread.create.mock.calls[0][0].data).toMatchObject({ mailboxConnectionId: 'c1', provider: 'microsoft', threadKey: 'conv-1' });
  expect(mockPrisma.emailMessage.create.mock.calls[0][0].data).toMatchObject({
    graphMessageId: 'g1', bodyHtml: '<p>เนื้อหาเต็ม</p>', bodyText: 'เนื้อหาเต็ม',
    toAddresses: ['lawyer@firm.com'], ccAddresses: ['cc@x.com'], direction: 'INBOUND',
  });
});

it('Sent Items never create a thread', async () => {
  mockPrisma.emailThread.findUnique.mockResolvedValue(null);
  const out = await service.upsertGraphMessage({
    firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
    direction: 'OUTBOUND', createThreadIfMissing: false,
  });
  expect(out).toBeNull();
  expect(mockPrisma.emailThread.create).not.toHaveBeenCalled();
});

it('a caseId links an existing unlinked thread', async () => {
  mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 't1', caseId: null });
  mockPrisma.emailThread.update.mockResolvedValue({ id: 't1', caseId: 'case-1' });
  mockPrisma.emailMessage.findFirst.mockResolvedValue({ id: 'm-existing' });
  await service.upsertGraphMessage({
    firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
    direction: 'INBOUND', caseId: 'case-1', createThreadIfMissing: true,
  });
  expect(mockPrisma.emailThread.update).toHaveBeenCalledWith({
    where: { id: 't1' },
    data: expect.objectContaining({ caseId: 'case-1', status: 'LINKED' }),
  });
});
```
Replace the old first test's `mockGraph.getInboxDelta` setup with `getFolderDelta` and give the connection `syncInboxToIntake: true` so it still exercises the inbox path.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration/mail src/outlook-integration/outlook-sync.service.spec.ts`
Expected: FAIL — module `./html-to-text` missing; `upsertGraphMessage` not a function.

- [ ] **Step 3: Implement**

`apps/api/src/outlook-integration/mail/html-to-text.ts`:
```ts
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Plain text for search/preview/field extraction. Display uses the stored HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      const key = e.toLowerCase();
      if (ENTITIES[key] !== undefined) return ENTITIES[key];
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)));
      return m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

Rewrite `outlook-sync.service.ts` core (keep `syncAttachments` as is):
```ts
type Direction = 'INBOUND' | 'OUTBOUND';
const addresses = (list?: GraphRecipient[]) =>
  (list ?? []).map((r) => r.emailAddress?.address?.toLowerCase()).filter((a): a is string => !!a);

async syncConnection(connectionId: string): Promise<{ messagesSynced: number }> {
  const connection = await this.prisma.mailboxConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const accessToken = await this.connections.getValidAccessToken(connectionId);
  let messagesSynced = 0;
  const data: { deltaLink?: string | null; sentDeltaLink?: string | null; lastSyncedAt: Date } = { lastSyncedAt: new Date() };

  if (connection.syncInboxToIntake) {
    const inbox = await this.drainFolder(accessToken, 'inbox', connection.deltaLink, (message) =>
      this.upsertGraphMessage({ firmId: connection.firmId, connectionId, accessToken, message, direction: 'INBOUND', createThreadIfMissing: true }),
    );
    messagesSynced += inbox.count;
    data.deltaLink = inbox.deltaLink;
  }

  // Sent mail only joins conversations we already hold (intake or case threads),
  // so a lawyer's unrelated outgoing mail never surfaces in the system.
  const sent = await this.drainFolder(accessToken, 'sentitems', connection.sentDeltaLink, (message) =>
    this.upsertGraphMessage({ firmId: connection.firmId, connectionId, accessToken, message, direction: 'OUTBOUND', createThreadIfMissing: false }),
  );
  messagesSynced += sent.count;
  data.sentDeltaLink = sent.deltaLink;

  await this.prisma.mailboxConnection.update({ where: { id: connectionId }, data });
  return { messagesSynced };
}

/** Pages through one folder's delta. Exposed for case-folder sync (plan B). */
async drainFolder(
  accessToken: string,
  folder: string,
  deltaLink: string | null,
  onMessage: (m: GraphMessage) => Promise<unknown>,
): Promise<{ count: number; deltaLink: string | null }> {
  let link = deltaLink;
  let count = 0;
  for (;;) {
    const page = await this.graph.getFolderDelta(accessToken, folder, link);
    for (const message of page.messages) {
      if (await onMessage(message)) count += 1;
    }
    if (page.nextSkipLink) {
      link = page.nextSkipLink;
      continue;
    }
    return { count, deltaLink: page.nextDeltaLink ?? link };
  }
}

async upsertGraphMessage(p: {
  firmId: string; connectionId: string; accessToken: string; message: GraphMessage;
  direction: Direction; caseId?: string | null; createThreadIfMissing: boolean;
}): Promise<{ threadId: string; messageId: string } | null> {
  const { message } = p;
  const key = { firmId_provider_threadKey: { firmId: p.firmId, provider: 'microsoft', threadKey: message.conversationId } };
  const at = new Date(message.receivedDateTime ?? message.sentDateTime ?? Date.now());
  const subject = message.subject ?? '(ไม่มีหัวข้อ)';

  let thread = await this.prisma.emailThread.findUnique({ where: key });
  if (!thread) {
    if (!p.createThreadIfMissing) return null;
    thread = await this.prisma.emailThread.create({
      data: {
        firmId: p.firmId, provider: 'microsoft', threadKey: message.conversationId, subject,
        fromName: message.from?.emailAddress?.name ?? null,
        fromAddress: message.from?.emailAddress?.address ?? null,
        lastMessageAt: at, mailboxConnectionId: p.connectionId,
        caseId: p.caseId ?? null,
        ...(p.caseId ? { status: EmailThreadStatus.LINKED } : {}),
      },
    });
  } else {
    thread = await this.prisma.emailThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: at > thread.lastMessageAt ? at : undefined,
        ...(p.caseId && !thread.caseId ? { caseId: p.caseId, status: EmailThreadStatus.LINKED } : {}),
      },
    });
  }

  const existing = await this.prisma.emailMessage.findFirst({ where: { threadId: thread.id, messageKey: message.internetMessageId } });
  if (existing) return { threadId: thread.id, messageId: existing.id };

  const html = message.body?.contentType?.toLowerCase() === 'html' ? message.body.content : null;
  const bodyText = html ? htmlToText(html) : (message.body?.content ?? message.bodyPreview ?? null);
  const emailMessage = await this.prisma.emailMessage.create({
    data: {
      threadId: thread.id, provider: 'microsoft', messageKey: message.internetMessageId,
      graphMessageId: message.id,
      direction: p.direction === 'OUTBOUND' ? EmailDirection.OUTBOUND : EmailDirection.INBOUND,
      fromName: message.from?.emailAddress?.name ?? null,
      fromAddress: message.from?.emailAddress?.address ?? null,
      toAddresses: addresses(message.toRecipients),
      ccAddresses: addresses(message.ccRecipients),
      bodyHtml: html, bodyText,
      receivedAt: at,
    },
  });
  if (message.hasAttachments) await this.syncAttachments(p.firmId, p.accessToken, message.id, emailMessage.id);
  return { threadId: thread.id, messageId: emailMessage.id };
}
```
Imports: `EmailDirection, EmailThreadStatus` from `../generated/prisma`; `GraphMessage, GraphRecipient` from `./outlook-graph.client`; `htmlToText` from `./mail/html-to-text`. Delete the old private `upsertMessage`. In the "a caseId links an existing thread" test the `update` mock returns `{ id: 't1', caseId: 'case-1' }` — `lastMessageAt` comparison must tolerate `thread.lastMessageAt` being undefined in mocks: use `thread.lastMessageAt && at <= thread.lastMessageAt ? undefined : at`.

`outlook-subscription.service.ts`:
```ts
async ensureSubscription(connectionId: string) {
  const connection = await this.prisma.mailboxConnection.findUniqueOrThrow({ where: { id: connectionId } });
  if (!connection.syncInboxToIntake) return; // calendar-only accounts get no mail webhook
  // …existing body from `const webhookUrl = …` onward, reusing `connection`
}

async removeSubscription(connectionId: string) {
  const connection = await this.prisma.mailboxConnection.findUniqueOrThrow({ where: { id: connectionId } });
  if (!connection.graphSubscriptionId) return;
  try {
    const token = await this.connections.getValidAccessToken(connectionId);
    await this.graph.deleteSubscription(token, connection.graphSubscriptionId);
  } finally {
    await this.prisma.mailboxConnection.update({ where: { id: connectionId }, data: { graphSubscriptionId: null, subscriptionExpiresAt: null } });
  }
}
```
Also add `syncInboxToIntake: true` to the `where` of `renewExpiringSubscriptions`' query (and its recreate branch, if it has one) so turned-off connections stop renewing.

In `outlook-connections.controller.ts` `updateSettings`, after `const { before, after } = await this.connections.updateSettings(user, id, dto);`:
```ts
try {
  if (!before.syncInboxToIntake && after.syncInboxToIntake) await this.subscriptions.ensureSubscription(id);
  if (before.syncInboxToIntake && !after.syncInboxToIntake) await this.subscriptions.removeSubscription(id);
} catch (error) {
  this.logger.warn(`Subscription change for ${id} failed: ${error}`); // setting is saved; renew cron retries
}
```
(inject `OutlookSubscriptionService`, add a `Logger`).

Add a controller test file `apps/api/src/outlook-integration/outlook-connections.controller.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { OutlookConnectionsController } from './outlook-connections.controller';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';
import { OutlookSubscriptionService } from './outlook-subscription.service';

describe('OutlookConnectionsController settings', () => {
  const connections = { updateSettings: jest.fn(), listForFirm: jest.fn().mockResolvedValue([{ id: 'c1' }]) };
  const subscriptions = { ensureSubscription: jest.fn(), removeSubscription: jest.fn() };
  let controller: OutlookConnectionsController;
  const user = { id: 'u1', firmId: 'f1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      controllers: [OutlookConnectionsController],
      providers: [
        { provide: OutlookConnectionsService, useValue: connections },
        { provide: OutlookSyncService, useValue: {} },
        { provide: OutlookSubscriptionService, useValue: subscriptions },
      ],
    }).compile();
    controller = mod.get(OutlookConnectionsController);
  });

  it('turning inbox intake on creates the webhook subscription', async () => {
    connections.updateSettings.mockResolvedValue({ before: { syncInboxToIntake: false }, after: { syncInboxToIntake: true } });
    await controller.updateSettings(user, 'c1', { syncInboxToIntake: true });
    expect(subscriptions.ensureSubscription).toHaveBeenCalledWith('c1');
  });

  it('turning it off removes the subscription; a failure still returns the saved row', async () => {
    connections.updateSettings.mockResolvedValue({ before: { syncInboxToIntake: true }, after: { syncInboxToIntake: false } });
    subscriptions.removeSubscription.mockRejectedValue(new Error('graph down'));
    await expect(controller.updateSettings(user, 'c1', { syncInboxToIntake: false })).resolves.toEqual({ id: 'c1' });
  });
});
```
(If the controller is guarded with `JwtAuthGuard`, override it: `.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })`.)

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/api/src/outlook-integration
/usr/bin/git commit -m "feat(outlook): opt-in inbox intake, Sent Items sync, full message bodies and recipients

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Thread visibility, attachment download, explicit accept

**Files:**
- Modify: `apps/api/src/common/services/case-access.service.ts` (`getEmailThreadFilterForUser`)
- Test: `apps/api/src/common/services/case-access.service.spec.ts` (create if absent; else extend)
- Modify: `apps/api/src/email-intake/email-intake.controller.ts`, `email-intake.service.ts`
- Test: `apps/api/src/email-intake/email-intake.service.spec.ts`
- Modify: `apps/web/src/app/(dashboard)/email-intake/[threadId]/page.tsx`
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: `EmailThread.caseId|mailboxConnectionId`, `MailboxConnection.userId` (Task 2).
- Produces:
  - `getEmailThreadFilterForUser(user): Promise<Prisma.EmailThreadWhereInput>` with the rule below.
  - `EmailIntakeService.getAttachmentForDownload(user: AuthUser, attachmentId: string): Promise<{ filename: string; mimeType: string; storagePath: string }>`
  - `GET /email-intake/attachments/:attachmentId/download` (JWT) streams the file.
  - web `api.downloadEmailAttachment(token, attachmentId): Promise<Blob>`

Rule: EXTERNAL → nothing. Otherwise `firmId = user.firmId AND OR[ { caseId: not null, case: caseFilter }, { intakeId: not null, intake: intakeFilter }, { caseId: null, intakeId: null, mailboxConnection: { userId: user.id } } ]`, and users with capability `viewAllCases` additionally see `{ caseId: null, intakeId: null }` (all unlinked threads). SENIOR_LAWYER no longer sees every mailbox.

- [ ] **Step 1: Write the failing tests**

In `case-access.service.spec.ts` (build the service with `{ provide: PrismaService, useValue: mockPrisma }` like other specs; stub `getCaseFilterForUser` and `getIntakeFilterForUser` with `jest.spyOn(service, …).mockResolvedValue({ marker: 'case' } as any)` / `{ marker: 'intake' }`):
```ts
describe('getEmailThreadFilterForUser', () => {
  beforeEach(() => {
    jest.spyOn(service, 'getCaseFilterForUser').mockResolvedValue({ marker: 'case' } as any);
    jest.spyOn(service, 'getIntakeFilterForUser').mockResolvedValue({ marker: 'intake' } as any);
  });

  it('a lawyer sees case/intake threads they can access and their own unlinked mail', async () => {
    const where = await service.getEmailThreadFilterForUser({ id: 'u1', firmId: 'f1', firmRole: 'LAWYER' } as any);
    expect(where).toEqual({
      firmId: 'f1',
      OR: [
        { caseId: { not: null }, case: { marker: 'case' } },
        { intakeId: { not: null }, intake: { marker: 'intake' } },
        { caseId: null, intakeId: null, mailboxConnection: { userId: 'u1' } },
      ],
    });
  });

  it('a senior lawyer no longer sees other people’s unlinked mail', async () => {
    const where: any = await service.getEmailThreadFilterForUser({ id: 'u2', firmId: 'f1', firmRole: 'SENIOR_LAWYER' } as any);
    expect(where.OR).not.toContainEqual({ caseId: null, intakeId: null });
  });

  it('owner / office manager see every unlinked thread', async () => {
    const where: any = await service.getEmailThreadFilterForUser({ id: 'u3', firmId: 'f1', firmRole: 'OWNER' } as any);
    expect(where.OR).toContainEqual({ caseId: null, intakeId: null });
  });

  it('external users see nothing', async () => {
    await expect(service.getEmailThreadFilterForUser({ id: 'x', firmId: 'f1', firmRole: 'EXTERNAL' } as any))
      .resolves.toEqual({ id: '__external_has_no_thread_access__' });
  });
});
```
In `email-intake.service.spec.ts`:
```ts
it('getAttachmentForDownload checks the parent thread against the access filter', async () => {
  mockCaseAccess.getEmailThreadFilterForUser.mockResolvedValue({ firmId: 'f1', marker: 1 });
  mockPrisma.emailAttachment.findFirst.mockResolvedValue(null);
  await expect(service.getAttachmentForDownload(user, 'a1')).rejects.toThrow(NotFoundException);
  expect(mockPrisma.emailAttachment.findFirst).toHaveBeenCalledWith({
    where: { id: 'a1', message: { thread: { firmId: 'f1', marker: 1 } } },
    select: { filename: true, mimeType: true, storagePath: true },
  });
});
```
(add `emailAttachment: { findFirst: jest.fn() }` to that spec's `mockPrisma` and `getEmailThreadFilterForUser` to its case-access mock if missing).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api exec jest --config jest.config.js src/common/services/case-access.service.spec.ts src/email-intake`
Expected: FAIL.

- [ ] **Step 3: Implement**

`case-access.service.ts`:
```ts
async getEmailThreadFilterForUser(user: AuthUser): Promise<Prisma.EmailThreadWhereInput> {
  if (user.firmRole === FirmRole.EXTERNAL) {
    return { id: '__external_has_no_thread_access__' };
  }
  const [caseFilter, intakeFilter] = await Promise.all([this.getCaseFilterForUser(user), this.getIntakeFilterForUser(user)]);
  const or: Prisma.EmailThreadWhereInput[] = [
    { caseId: { not: null }, case: caseFilter },
    { intakeId: { not: null }, intake: intakeFilter },
    // Unlinked mail is private to the mailbox owner; triage roles see the whole queue.
    { caseId: null, intakeId: null, mailboxConnection: { userId: user.id } },
  ];
  if (hasFirmCapability(user.firmRole, 'viewAllCases')) or.push({ caseId: null, intakeId: null });
  return { firmId: user.firmId, OR: or };
}
```
(Check `getCaseFilterForUser` / `getIntakeFilterForUser` are public `async` methods returning `Prisma.CaseWhereInput` / `Prisma.IntakeWhereInput`; if `getIntakeFilterForUser` is private, make it public.)

`email-intake.service.ts`:
```ts
async getAttachmentForDownload(user: AuthUser, attachmentId: string) {
  const thread = await this.caseAccess.getEmailThreadFilterForUser(user);
  const attachment = await this.prisma.emailAttachment.findFirst({
    where: { id: attachmentId, message: { thread } },
    select: { filename: true, mimeType: true, storagePath: true },
  });
  if (!attachment) throw new NotFoundException('ไม่พบไฟล์แนบ');
  return attachment;
}
```
`email-intake.controller.ts` (inject `FileStorageService`; follow how `documents.controller.ts` streams `openDownloadStream` and sets `Content-Disposition` — copy that exact header logic, including its UTF-8 filename encoding):
```ts
@Get('attachments/:attachmentId/download')
async downloadAttachment(@CurrentUser() user: AuthUser, @Param('attachmentId') attachmentId: string, @Res() res: Response) {
  const a = await this.service.getAttachmentForDownload(user, attachmentId);
  res.setHeader('Content-Type', a.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  (await this.fileStorage.openDownloadStream(a.storagePath)).pipe(res);
}
```
Also make `listThreads` include `caseId` and `mailboxConnection: { select: { mailboxAddress: true } }` in its select so the queue can show which mailbox a thread came from.

Web `apps/web/src/lib/api.ts`: add next to `getEmailThread`
```ts
downloadEmailAttachment: (token: string, attachmentId: string) =>
  requestBlob(`/email-intake/attachments/${attachmentId}/download`, { token }),
```
(use the same blob helper `api.downloadDocument` uses — grep `downloadDocument` and copy its pattern; if it uses raw `fetch`, do the same) and add `id: string` to the attachment type in the thread detail type if missing.

Web `email-intake/[threadId]/page.tsx`:
1. In `load`, delete the block that auto-calls `acceptEmailThread` (lines with `if (!detail.thread.intake) { … }`) and the `linking` state uses tied to it.
2. When `!data.thread.intake && !data.thread.caseId`, render above the messages:
```tsx
<div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
  <p className="text-sm">อีเมลนี้ยังไม่ได้รับเป็นเรื่องใหม่</p>
  <Button size="sm" disabled={linking} onClick={handleCreateIntake}>
    {linking ? 'กำลังสร้าง...' : 'รับเป็นเรื่องใหม่'}
  </Button>
</div>
```
with
```ts
const handleCreateIntake = async () => {
  if (!token) return;
  setLinking(true);
  setError('');
  try {
    await api.acceptEmailThread(token, threadId);
    setData(await api.getEmailThread(token, threadId));
  } catch (e) {
    setError(e instanceof ApiError ? e.message : 'สร้างเรื่องใหม่ไม่สำเร็จ');
  } finally {
    setLinking(false);
  }
};
```
3. Make each attachment chip a button that downloads:
```tsx
<button type="button" className="…existing chip classes… hover:underline" onClick={async () => {
  if (!token) return;
  const blob = await api.downloadEmailAttachment(token, att.id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = att.filename; a.click();
  URL.revokeObjectURL(url);
}}>{att.filename}</button>
```
4. Wrap the mock-reply box in `{process.env.NODE_ENV !== 'production' && ( … )}`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js src/common/services src/email-intake && pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter web exec tsc --noEmit`
Expected: PASS. If an existing case-access test asserted the old SENIOR_LAWYER-sees-all rule, update it to the new rule (that change is the intent).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/api/src apps/web/src
/usr/bin/git commit -m "fix(email-intake): private unlinked mail, attachment download, no intake on mere open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Settings — Microsoft accounts section

**Files:**
- Create: `apps/web/src/components/settings/MicrosoftAccountsSection.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx`
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: `GET/PATCH /outlook/connections`, `GET /outlook/connect`, `POST /outlook/connections/:id/sync`, `DELETE /outlook/connections/:id`.
- Produces:
  - `MailboxConnectionItem` gains `userId: string | null; user: { id: string; firstName: string; lastName: string } | null; isMine: boolean; syncInboxToIntake: boolean; syncCalendar: boolean`.
  - `api.updateOutlookConnection(token, id, body: { syncInboxToIntake?: boolean; syncCalendar?: boolean }): Promise<MailboxConnectionItem>`
  - `<MicrosoftAccountsSection />` — self-contained (loads its own data, reads `?outlook=` notice). Exposes a `children` slot rendered under the account list, where plans B and D mount their "จับคู่ folder กับคดี" link.

- [ ] **Step 1: Implement the API client additions**

In `apps/web/src/lib/api.ts` extend `MailboxConnectionItem` with the fields above and add:
```ts
updateOutlookConnection: (token: string, id: string, body: { syncInboxToIntake?: boolean; syncCalendar?: boolean }) =>
  request<MailboxConnectionItem>(`/outlook/connections/${id}`, { method: 'PATCH', token, body: JSON.stringify(body) }),
```
(match how other PATCH calls pass `body` in this file — some helpers take an object and stringify internally; copy the neighbour's style.)

- [ ] **Step 2: Create the component**

`apps/web/src/components/settings/MicrosoftAccountsSection.tsx`: move the whole Outlook block (state `mailboxConnections`, `outlookConnecting`, `outlookActionId`, `outlookNotice`, `loadOutlookConnections`, the `?outlook=` effect, `handleConnectOutlook`, `handleSyncOutlookNow`, `handleDisconnectOutlook`, `OUTLOOK_STATUS_LABEL`) out of `settings/page.tsx` into this component unchanged, then change the rendering to:
```tsx
const mine = connections.filter((c) => c.isMine);
const others = connections.filter((c) => !c.isMine);

<section>
  <div className="flex items-center gap-3">
    <Mail className="h-4 w-4 text-muted-foreground" />
    <div>
      <p className="text-sm font-medium">Microsoft 365 (Outlook, ปฏิทิน, OneDrive)</p>
      <p className="text-xs text-muted-foreground">
        เชื่อมบัญชี Microsoft ของคุณเอง ระบบเห็นเฉพาะสิ่งที่บัญชีนั้นเห็นอยู่แล้ว
      </p>
    </div>
  </div>
  {notice && <p className={…same as before…}>{notice.text}</p>}

  <p className="mt-3 text-xs font-medium text-muted-foreground">บัญชีของฉัน</p>
  {mine.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่ได้เชื่อม</p>}
  {mine.map((c) => <ConnectionRow key={c.id} c={c} canManage />)}

  {others.length > 0 && (
    <>
      <p className="mt-4 text-xs font-medium text-muted-foreground">บัญชีอื่นในสำนักงาน</p>
      {others.map((c) => <ConnectionRow key={c.id} c={c} canManage={isOwner} />)}
    </>
  )}

  <Button size="sm" className="mt-3" onClick={handleConnect} disabled={connecting}>
    {connecting ? 'กำลังเปิด Microsoft...' : mine.some((c) => c.status === 'ACTIVE') ? 'เชื่อมบัญชีอื่นเพิ่ม' : 'เชื่อม Microsoft 365'}
  </Button>
  {children}
</section>
```
`ConnectionRow` (in the same file) shows `mailboxAddress`, owner name (`c.user ? `${c.user.firstName} ${c.user.lastName}` : '—'`) for others, status + last sync + error (as before), and when `canManage && c.status === 'ACTIVE'` two switches plus the existing "ซิงก์ตอนนี้"/"ยกเลิกการเชื่อมต่อ" buttons:
```tsx
<label className="flex items-center gap-2 text-xs">
  <input type="checkbox" checked={c.syncCalendar} disabled={busyId === c.id}
    onChange={(e) => toggle(c, { syncCalendar: e.target.checked })} />
  ซิงก์นัดในระบบไปปฏิทิน Outlook
</label>
<label className="flex items-center gap-2 text-xs">
  <input type="checkbox" checked={c.syncInboxToIntake} disabled={busyId === c.id}
    onChange={(e) => {
      if (e.target.checked && !window.confirm('อีเมลใหม่ใน Inbox ของบัญชีนี้จะเข้าคิว "รับเรื่องทางอีเมล" และเจ้าของ/ผู้จัดการสำนักงานจะเห็นได้ ยืนยันไหม?')) return;
      toggle(c, { syncInboxToIntake: e.target.checked });
    }} />
  ดึง Inbox เข้าคิวรับเรื่องทางอีเมล
</label>
```
with
```ts
const toggle = async (c: MailboxConnectionItem, body: { syncInboxToIntake?: boolean; syncCalendar?: boolean }) => {
  if (!token) return;
  setBusyId(c.id);
  try {
    const updated = await api.updateOutlookConnection(token, c.id, body);
    setConnections((list) => list.map((x) => (x.id === c.id ? { ...x, ...updated } : x)));
  } catch (e) {
    setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ' });
  } finally {
    setBusyId(null);
  }
};
```
`isOwner` = current user's firm role is `OWNER` (read it the way `settings/page.tsx` already reads the role — reuse that hook/selector). Props: `{ children?: React.ReactNode }`.

- [ ] **Step 3: Mount it**

In `settings/page.tsx` delete the moved state/handlers/JSX and render `<MicrosoftAccountsSection />` where the Outlook block was (keep the `<Separator className="mt-4" />` after it). Remove now-unused imports.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec next lint --dir src/components/settings --dir "src/app/(dashboard)/settings"`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/web/src
/usr/bin/git commit -m "feat(web): Microsoft 365 accounts section with calendar / inbox switches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Calendar Graph client + event payload (A)

**Files:**
- Create: `apps/api/prisma/migrations/20261013130000_calendar_outlook_copies/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/outlook-integration/graph/graph-calendar.client.ts`
- Create: `apps/api/src/outlook-integration/graph/graph-calendar.client.spec.ts`
- Create: `apps/api/src/outlook-integration/calendar/outlook-event-payload.ts`
- Create: `apps/api/src/outlook-integration/calendar/outlook-event-payload.spec.ts`
- Modify: `apps/api/src/outlook-integration/outlook-integration.module.ts`

**Interfaces:**
- Consumes: `GraphHttp` (Task 1).
- Produces:
  - `model CalendarEventOutlookCopy { id, eventId (no FK), userId, connectionId, graphEventId, syncedAt, lastError }` with `@@unique([eventId, userId])`, `@@index([connectionId])`, `@@index([userId])`.
  - `interface GraphEventInput { subject: string; body: { contentType: 'HTML'; content: string }; start: { dateTime: string; timeZone: 'UTC' }; end: { dateTime: string; timeZone: 'UTC' }; location?: { displayName: string }; categories: string[]; showAs: 'busy'; isReminderOn: boolean; reminderMinutesBeforeStart: number; transactionId?: string; isOnlineMeeting?: boolean; onlineMeetingProvider?: 'teamsForBusiness'; attendees?: { emailAddress: { address: string }; type: 'required' }[] }`
  - `interface GraphEventResult { id: string; onlineMeeting?: { joinUrl?: string } | null }`
  - `GraphCalendarClient.createEvent(token: string, input: GraphEventInput): Promise<GraphEventResult>`; `updateEvent(token, graphEventId, input: Partial<GraphEventInput>): Promise<GraphEventResult>`; `deleteEvent(token, graphEventId): Promise<void>`
  - `type PayloadEvent = { id: string; title: string; description: string | null; courtName: string | null; startAt: Date; endAt: Date | null; type: string; reminderMinutes: number[]; onlineMeetingUrl?: string | null; case: { ownRef: string; title: string; blackCaseNumber: string | null; redCaseNumber: string | null } }`
  - `buildOutlookEvent(e: PayloadEvent, opts: { caseUrl: string; transactionId: string }): GraphEventInput`

- [ ] **Step 1: Migration + schema**

`apps/api/prisma/migrations/20261013130000_calendar_outlook_copies/migration.sql`:
```sql
CREATE TABLE "CalendarEventOutlookCopy" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "graphEventId" TEXT NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "lastError" TEXT,
  CONSTRAINT "CalendarEventOutlookCopy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarEventOutlookCopy_eventId_userId_key" ON "CalendarEventOutlookCopy"("eventId", "userId");
CREATE INDEX "CalendarEventOutlookCopy_connectionId_idx" ON "CalendarEventOutlookCopy"("connectionId");
CREATE INDEX "CalendarEventOutlookCopy_userId_idx" ON "CalendarEventOutlookCopy"("userId");
```
`schema.prisma`:
```prisma
/// Our event mirrored into one person's Outlook calendar. eventId has no FK on
/// purpose: after the event (or its case) is deleted we still need graphEventId
/// to remove the Outlook copy.
model CalendarEventOutlookCopy {
  id           String   @id @default(uuid())
  eventId      String
  userId       String
  connectionId String
  graphEventId String
  syncedAt     DateTime
  lastError    String?  @db.Text

  @@unique([eventId, userId])
  @@index([connectionId])
  @@index([userId])
}
```
Apply with the Global Constraints command for `20261013130000_calendar_outlook_copies`.

- [ ] **Step 2: Write the failing tests**

`outlook-event-payload.spec.ts`:
```ts
import { buildOutlookEvent } from './outlook-event-payload';

const base = {
  id: 'e1', title: 'สืบพยานโจทก์', description: 'นำพยาน 2 ปาก', courtName: 'ศาลแพ่ง',
  startAt: new Date('2026-11-01T02:00:00Z'), endAt: null, type: 'COURT_DATE', reminderMinutes: [4320, 1440, 60],
  case: { ownRef: 'TSB2569-014', title: 'บจ.สยาม v. นาย ก', blackCaseNumber: 'พ.123/2569', redCaseNumber: null },
};
const opts = { caseUrl: 'https://firm.samnuan.com/cases/c1', transactionId: 'e1:u1' };

describe('buildOutlookEvent', () => {
  it('prefixes the subject by type and uses UTC times', () => {
    const g = buildOutlookEvent(base, opts);
    expect(g.subject).toBe('[นัดศาล] สืบพยานโจทก์');
    expect(g.start).toEqual({ dateTime: '2026-11-01T02:00:00.000', timeZone: 'UTC' });
    expect(g.end).toEqual({ dateTime: '2026-11-01T03:00:00.000', timeZone: 'UTC' }); // court/client default 60 min
  });
  it('deadlines default to 30 minutes and keep an explicit endAt', () => {
    expect(buildOutlookEvent({ ...base, type: 'DEADLINE' }, opts).end.dateTime).toBe('2026-11-01T02:30:00.000');
    expect(buildOutlookEvent({ ...base, endAt: new Date('2026-11-01T05:00:00Z') }, opts).end.dateTime).toBe('2026-11-01T05:00:00.000');
  });
  it('puts case references, description and a link in an escaped HTML body', () => {
    const g = buildOutlookEvent({ ...base, description: '<b>x</b>' }, opts);
    expect(g.body.contentType).toBe('HTML');
    expect(g.body.content).toContain('TSB2569-014');
    expect(g.body.content).toContain('พ.123/2569');
    expect(g.body.content).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(g.body.content).toContain('href="https://firm.samnuan.com/cases/c1"');
  });
  it('sets location, category, reminder = smallest offset, transactionId', () => {
    const g = buildOutlookEvent(base, opts);
    expect(g.location).toEqual({ displayName: 'ศาลแพ่ง' });
    expect(g.categories).toEqual(['Samnuan']);
    expect(g.reminderMinutesBeforeStart).toBe(60);
    expect(g.transactionId).toBe('e1:u1');
  });
  it('no reminders → reminder off; no court → no location', () => {
    const g = buildOutlookEvent({ ...base, reminderMinutes: [], courtName: null, type: 'OTHER' }, opts);
    expect(g.isReminderOn).toBe(false);
    expect(g.location).toBeUndefined();
    expect(g.subject).toBe('สืบพยานโจทก์');
  });
  it('includes a Teams link in the body when the event has one', () => {
    const g = buildOutlookEvent({ ...base, type: 'CLIENT_MEETING', onlineMeetingUrl: 'https://teams.microsoft.com/l/x' }, opts);
    expect(g.subject).toBe('[นัดลูกความ] สืบพยานโจทก์');
    expect(g.body.content).toContain('https://teams.microsoft.com/l/x');
  });
});
```
`graph-calendar.client.spec.ts`:
```ts
import { GraphCalendarClient } from './graph-calendar.client';

describe('GraphCalendarClient', () => {
  const http = { request: jest.fn() };
  const client = new GraphCalendarClient(http as any);
  beforeEach(() => http.request.mockReset());

  it('createEvent POSTs to /me/events with the transactionId', async () => {
    http.request.mockResolvedValue({ id: 'g1' });
    await client.createEvent('tok', { subject: 's', transactionId: 'e1:u1' } as any);
    expect(http.request).toHaveBeenCalledWith('tok', '/me/events', { method: 'POST', body: JSON.stringify({ subject: 's', transactionId: 'e1:u1' }) });
  });
  it('updateEvent PATCHes without transactionId', async () => {
    http.request.mockResolvedValue({ id: 'g1' });
    await client.updateEvent('tok', 'g/1', { subject: 's', transactionId: 'x' } as any);
    expect(http.request).toHaveBeenCalledWith('tok', '/me/events/g%2F1', { method: 'PATCH', body: JSON.stringify({ subject: 's' }) });
  });
  it('deleteEvent DELETEs', async () => {
    http.request.mockResolvedValue(undefined);
    await client.deleteEvent('tok', 'g1');
    expect(http.request).toHaveBeenCalledWith('tok', '/me/events/g1', { method: 'DELETE' });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration/calendar src/outlook-integration/graph/graph-calendar.client.spec.ts`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement**

`graph-calendar.client.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { GraphHttp } from './graph-http';

export interface GraphEventInput {
  subject: string;
  body: { contentType: 'HTML'; content: string };
  start: { dateTime: string; timeZone: 'UTC' };
  end: { dateTime: string; timeZone: 'UTC' };
  location?: { displayName: string };
  categories: string[];
  showAs: 'busy';
  isReminderOn: boolean;
  reminderMinutesBeforeStart: number;
  transactionId?: string;
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: 'teamsForBusiness';
  attendees?: { emailAddress: { address: string }; type: 'required' }[];
}
export interface GraphEventResult { id: string; onlineMeeting?: { joinUrl?: string } | null }

@Injectable()
export class GraphCalendarClient {
  constructor(private http: GraphHttp) {}

  createEvent(token: string, input: GraphEventInput): Promise<GraphEventResult> {
    return this.http.request(token, '/me/events', { method: 'POST', body: JSON.stringify(input) });
  }

  updateEvent(token: string, graphEventId: string, input: Partial<GraphEventInput>): Promise<GraphEventResult> {
    const { transactionId: _ignored, ...patch } = input; // only valid on create
    return this.http.request(token, `/me/events/${encodeURIComponent(graphEventId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  async deleteEvent(token: string, graphEventId: string): Promise<void> {
    await this.http.request(token, `/me/events/${encodeURIComponent(graphEventId)}`, { method: 'DELETE' });
  }
}
```
`outlook-event-payload.ts`:
```ts
import { GraphEventInput } from '../graph/graph-calendar.client';

export type PayloadEvent = {
  id: string; title: string; description: string | null; courtName: string | null;
  startAt: Date; endAt: Date | null; type: string; reminderMinutes: number[];
  onlineMeetingUrl?: string | null;
  case: { ownRef: string; title: string; blackCaseNumber: string | null; redCaseNumber: string | null };
};

const PREFIX: Record<string, string> = { COURT_DATE: '[นัดศาล] ', CLIENT_MEETING: '[นัดลูกความ] ', DEADLINE: '[ครบกำหนด] ' };
const DEFAULT_MINUTES: Record<string, number> = { DEADLINE: 30 };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const utc = (d: Date) => ({ dateTime: d.toISOString().replace('Z', ''), timeZone: 'UTC' as const });

export function buildOutlookEvent(e: PayloadEvent, opts: { caseUrl: string; transactionId: string }): GraphEventInput {
  const end = e.endAt ?? new Date(e.startAt.getTime() + (DEFAULT_MINUTES[e.type] ?? 60) * 60_000);
  const refs = [e.case.ownRef, e.case.blackCaseNumber && `คดีดำ ${e.case.blackCaseNumber}`, e.case.redCaseNumber && `คดีแดง ${e.case.redCaseNumber}`]
    .filter(Boolean)
    .join(' · ');
  const lines = [
    `<p><b>${esc(e.case.title)}</b><br>${esc(refs)}</p>`,
    e.onlineMeetingUrl ? `<p>เข้าร่วม Teams: <a href="${esc(e.onlineMeetingUrl)}">${esc(e.onlineMeetingUrl)}</a></p>` : '',
    e.description ? `<p>${esc(e.description).replace(/\n/g, '<br>')}</p>` : '',
    `<p><a href="${esc(opts.caseUrl)}">เปิดคดีใน Samnuan</a></p>`,
    `<p style="color:#888">นัดนี้ซิงก์จาก Samnuan — แก้ไขในระบบ การแก้ใน Outlook จะถูกเขียนทับ</p>`,
  ];
  const reminder = e.reminderMinutes.length ? Math.min(...e.reminderMinutes) : 0;
  return {
    subject: `${PREFIX[e.type] ?? ''}${e.title}`,
    body: { contentType: 'HTML', content: lines.filter(Boolean).join('') },
    start: utc(e.startAt),
    end: utc(end),
    ...(e.courtName ? { location: { displayName: e.courtName } } : {}),
    categories: ['Samnuan'],
    showAs: 'busy',
    isReminderOn: e.reminderMinutes.length > 0,
    reminderMinutesBeforeStart: reminder,
    transactionId: opts.transactionId,
  };
}
```
Module: add `GraphCalendarClient` to `providers` and `exports`.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/api/prisma apps/api/src/outlook-integration
/usr/bin/git commit -m "feat(outlook): Graph calendar client and event payload builder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `OutlookCalendarSyncService` — reconcile per event + cron (A)

**Files:**
- Create: `apps/api/src/outlook-integration/calendar/outlook-calendar-sync.service.ts`
- Create: `apps/api/src/outlook-integration/calendar/outlook-calendar-sync.service.spec.ts`
- Modify: `apps/api/src/outlook-integration/outlook-integration.module.ts`

**Interfaces:**
- Consumes: `OutlookConnectionsService.getValidAccessToken`, `GraphCalendarClient`, `buildOutlookEvent`, `eventPeopleIds`/`eventForUserWhere` from `apps/api/src/calendar/event-people.ts`, `FirmLinkService.originForFirm(firmId)`.
- Produces:
  - `OutlookCalendarSyncService.syncEvent(eventId: string): Promise<void>` — the only mutator of copies.
  - `OutlookCalendarSyncService.syncEventSoon(eventId: string): void` — fire-and-forget wrapper (never throws).
  - `OutlookCalendarSyncService.reconcileAll(): Promise<void>` — `@Cron('*/2 * * * *')`.
  - `OutlookCalendarSyncService.removeAllForConnection(connectionId: string): Promise<void>` — deletes that connection's copies in Outlook (best effort) and their rows.
  - Exported from `OutlookIntegrationModule`.

Rules inside `syncEvent(eventId)`:
1. Load event `{ include: { case: { select: { firmId, leadLawyerId, ownRef, title, blackCaseNumber, redCaseNumber } }, assignees: { select: { userId } } } }` and copies `findMany({ where: { eventId } })`.
2. If the event is missing → delete every copy (Graph delete with that copy's connection token; 404 counts as success) and its row.
3. If `event.startAt < now - 24h` → return (leave past copies alone).
4. Desired users = `eventPeopleIds(event)` ∪ (`event.onlineMeeting && event.meetingOrganizerId` ? organizer : ∅) — Teams fields arrive in Task 10; until then read them as `(event as any).onlineMeeting`. For each desired user: `findActiveForUser(userId)`; keep only users whose connection is ACTIVE and (`syncCalendar` or user is the organizer of an online meeting).
5. For each copy whose user is not desired (or whose `connectionId` ≠ that user's current connection) → delete in Graph (ignore errors) + delete row.
6. For each desired user: payload = `buildOutlookEvent(event, { caseUrl: `${origin}/cases/${event.caseId}`, transactionId: `${event.id}:${userId}` })`; no copy → `createEvent` then `upsert` row `{ graphEventId, syncedAt: event.updatedAt, connectionId, lastError: null }`; copy with `syncedAt < event.updatedAt` → `updateEvent`; on `GraphApiError` 404 → delete row and create again; on other errors → store `lastError` on the row (or log if no row) and continue with the next user.
7. In-process lock: a `Set<string>` of event ids in flight; a second call for the same id while one runs waits for the first (store the promise in a `Map<string, Promise<void>>` and return it).

Rules inside `reconcileAll()`:
- `connections = mailboxConnection.findMany({ where: { status: 'ACTIVE', userId: { not: null } } })`.
- `ids = new Set<string>()`.
- For each connection with `syncCalendar`: events `findMany({ where: { AND: [eventForUserWhere(userId), { startAt: { gte: now - 24h } }] }, select: { id, updatedAt } })`; copies of that user `findMany({ where: { userId } })`; add event ids with no copy or `copy.syncedAt < event.updatedAt`; add copy event ids not in the event list (deleted, reassigned, or now in the past — `syncEvent` sorts them out).
- For each connection **without** `syncCalendar`: add the event ids of its existing copies (so they get removed).
- Copies whose `connectionId` is not ACTIVE any more: delete rows only (no token to call Graph).
- Then `for (const id of ids) await this.syncEvent(id)` sequentially (Graph throttling).

- [ ] **Step 1: Write the failing tests**

`outlook-calendar-sync.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { OutlookCalendarSyncService } from './outlook-calendar-sync.service';
import { PrismaService } from '../../prisma/prisma.module';
import { OutlookConnectionsService } from '../outlook-connections.service';
import { GraphCalendarClient } from '../graph/graph-calendar.client';
import { GraphApiError } from '../graph/graph-http';
import { FirmLinkService } from '../../notifications/firm-link.service';

const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1', caseId: 'c1', title: 'นัด', description: null, courtName: null, type: 'COURT_DATE',
  startAt: new Date(Date.now() + 86_400_000), endAt: null, reminderMinutes: [60],
  updatedAt: new Date('2026-10-13T10:00:00Z'), onlineMeeting: false, meetingOrganizerId: null, inviteeEmails: [],
  onlineMeetingUrl: null,
  case: { firmId: 'f1', leadLawyerId: 'lead', ownRef: 'R1', title: 'คดี', blackCaseNumber: null, redCaseNumber: null },
  assignees: [{ userId: 'u1' }],
  ...over,
});
const conn = (userId: string, over: Record<string, unknown> = {}) => ({ id: `conn-${userId}`, userId, status: 'ACTIVE', syncCalendar: true, ...over });

describe('OutlookCalendarSyncService', () => {
  let svc: OutlookCalendarSyncService;
  const prisma = {
    calendarEvent: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    calendarEventOutlookCopy: { findMany: jest.fn(), upsert: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    mailboxConnection: { findMany: jest.fn() },
  };
  const connections = { findActiveForUser: jest.fn(), getValidAccessToken: jest.fn().mockResolvedValue('tok') };
  const calendar = { createEvent: jest.fn(), updateEvent: jest.fn(), deleteEvent: jest.fn() };
  const firmLink = { originForFirm: jest.fn().mockResolvedValue('https://firm.samnuan.com') };

  beforeEach(async () => {
    jest.clearAllMocks();
    connections.getValidAccessToken.mockResolvedValue('tok');
    const mod = await Test.createTestingModule({
      providers: [
        OutlookCalendarSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutlookConnectionsService, useValue: connections },
        { provide: GraphCalendarClient, useValue: calendar },
        { provide: FirmLinkService, useValue: firmLink },
      ],
    }).compile();
    svc = mod.get(OutlookCalendarSyncService);
  });

  it('creates a copy for each responsible person with calendar sync on', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u1' }, { userId: 'u2' }] }));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    connections.findActiveForUser.mockImplementation(async (id: string) => (id === 'u1' ? conn('u1') : conn('u2', { syncCalendar: false })));
    calendar.createEvent.mockResolvedValue({ id: 'g1' });
    await svc.syncEvent('e1');
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
    expect(calendar.createEvent.mock.calls[0][1].transactionId).toBe('e1:u1');
    expect(prisma.calendarEventOutlookCopy.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId_userId: { eventId: 'e1', userId: 'u1' } },
    }));
  });

  it('falls back to the lead lawyer when the event has no assignees', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [] }));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    connections.findActiveForUser.mockResolvedValue(conn('lead'));
    calendar.createEvent.mockResolvedValue({ id: 'g1' });
    await svc.syncEvent('e1');
    expect(connections.findActiveForUser).toHaveBeenCalledWith('lead');
  });

  it('updates a stale copy and leaves a fresh one alone', async () => {
    const e = event();
    prisma.calendarEvent.findUnique.mockResolvedValue(e);
    connections.findActiveForUser.mockResolvedValue(conn('u1'));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: new Date('2026-10-01') }]);
    calendar.updateEvent.mockResolvedValue({ id: 'g1' });
    await svc.syncEvent('e1');
    expect(calendar.updateEvent).toHaveBeenCalledWith('tok', 'g1', expect.any(Object));

    jest.clearAllMocks();
    connections.getValidAccessToken.mockResolvedValue('tok');
    prisma.calendarEvent.findUnique.mockResolvedValue(e);
    connections.findActiveForUser.mockResolvedValue(conn('u1'));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: e.updatedAt }]);
    await svc.syncEvent('e1');
    expect(calendar.updateEvent).not.toHaveBeenCalled();
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('deletes Outlook copies of an event that no longer exists', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(null);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: new Date() }]);
    await svc.syncEvent('e1');
    expect(connections.getValidAccessToken).toHaveBeenCalledWith('conn-u1');
    expect(calendar.deleteEvent).toHaveBeenCalledWith('tok', 'g1');
    expect(prisma.calendarEventOutlookCopy.delete).toHaveBeenCalledWith({ where: { id: 'cp' } });
  });

  it('removes the copy of someone no longer responsible', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u2' }] }));
    connections.findActiveForUser.mockImplementation(async (id: string) => conn(id));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: new Date() }]);
    calendar.createEvent.mockResolvedValue({ id: 'g2' });
    await svc.syncEvent('e1');
    expect(calendar.deleteEvent).toHaveBeenCalledWith('tok', 'g1');
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
  });

  it('404 on update drops the copy and recreates it', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event());
    connections.findActiveForUser.mockResolvedValue(conn('u1'));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'gone', syncedAt: new Date('2026-01-01') }]);
    calendar.updateEvent.mockRejectedValue(new GraphApiError(404, 'gone'));
    calendar.createEvent.mockResolvedValue({ id: 'g-new' });
    await svc.syncEvent('e1');
    expect(calendar.createEvent).toHaveBeenCalled();
    expect(prisma.calendarEventOutlookCopy.upsert.mock.calls.at(-1)[0].update.graphEventId).toBe('g-new');
  });

  it('token failure for one user does not stop others', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u1' }, { userId: 'u2' }] }));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    connections.findActiveForUser.mockImplementation(async (id: string) => conn(id));
    connections.getValidAccessToken.mockImplementation(async (cid: string) => {
      if (cid === 'conn-u1') throw new Error('expired');
      return 'tok';
    });
    calendar.createEvent.mockResolvedValue({ id: 'g2' });
    await expect(svc.syncEvent('e1')).resolves.toBeUndefined();
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
  });

  it('does nothing for events more than a day in the past', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ startAt: new Date(Date.now() - 3 * 86_400_000) }));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    await svc.syncEvent('e1');
    expect(connections.findActiveForUser).not.toHaveBeenCalled();
  });

  it('concurrent syncEvent calls for the same event make one create', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event());
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    connections.findActiveForUser.mockResolvedValue(conn('u1'));
    calendar.createEvent.mockResolvedValue({ id: 'g1' });
    await Promise.all([svc.syncEvent('e1'), svc.syncEvent('e1')]);
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
  });

  it('syncEventSoon never throws', async () => {
    prisma.calendarEvent.findUnique.mockRejectedValue(new Error('db down'));
    expect(() => svc.syncEventSoon('e1')).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });

  it('reconcileAll queues changed, missing and orphaned copies', async () => {
    prisma.mailboxConnection.findMany.mockResolvedValue([conn('u1')]);
    prisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'new', updatedAt: new Date() },
      { id: 'same', updatedAt: new Date('2026-10-01') },
    ]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValueOnce([
      { eventId: 'same', syncedAt: new Date('2026-10-01'), connectionId: 'conn-u1' },
      { eventId: 'deleted', syncedAt: new Date('2026-10-01'), connectionId: 'conn-u1' },
    ]);
    const spy = jest.spyOn(svc, 'syncEvent').mockResolvedValue(undefined);
    await svc.reconcileAll();
    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual(['deleted', 'new']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration/calendar/outlook-calendar-sync.service.spec.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`outlook-calendar-sync.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.module';
import { OutlookConnectionsService } from '../outlook-connections.service';
import { GraphCalendarClient, GraphEventInput } from '../graph/graph-calendar.client';
import { GraphApiError } from '../graph/graph-http';
import { FirmLinkService } from '../../notifications/firm-link.service';
import { eventForUserWhere, eventPeopleIds } from '../../calendar/event-people';
import { buildOutlookEvent } from './outlook-event-payload';

const DAY = 86_400_000;
type Copy = { id: string; eventId: string; userId: string; connectionId: string; graphEventId: string; syncedAt: Date };

/**
 * Mirrors our calendar events into each responsible person's Outlook calendar
 * (one-way). syncEvent is the only writer of copies; reconcileAll finds work
 * from every event write site in the codebase, so callers never have to.
 */
@Injectable()
export class OutlookCalendarSyncService {
  private readonly logger = new Logger(OutlookCalendarSyncService.name);
  // ponytail: in-process lock — enough for the single api container; use a DB advisory lock if the api is ever scaled out.
  private inFlight = new Map<string, Promise<void>>();

  constructor(
    private prisma: PrismaService,
    private connections: OutlookConnectionsService,
    private calendar: GraphCalendarClient,
    private firmLink: FirmLinkService,
  ) {}

  syncEventSoon(eventId: string): void {
    this.syncEvent(eventId).catch((error) => this.logger.warn(`Outlook calendar sync for ${eventId} failed: ${error}`));
  }

  syncEvent(eventId: string): Promise<void> {
    const running = this.inFlight.get(eventId);
    if (running) return running;
    const job = this.doSync(eventId).finally(() => this.inFlight.delete(eventId));
    this.inFlight.set(eventId, job);
    return job;
  }

  private async doSync(eventId: string): Promise<void> {
    const [event, copies] = await Promise.all([
      this.prisma.calendarEvent.findUnique({
        where: { id: eventId },
        include: {
          case: { select: { firmId: true, leadLawyerId: true, ownRef: true, title: true, blackCaseNumber: true, redCaseNumber: true } },
          assignees: { select: { userId: true } },
        },
      }),
      this.prisma.calendarEventOutlookCopy.findMany({ where: { eventId } }) as Promise<Copy[]>,
    ]);

    if (!event) {
      for (const copy of copies) await this.deleteCopy(copy);
      return;
    }
    if (event.startAt.getTime() < Date.now() - DAY) return;

    const e = event as typeof event & { onlineMeeting?: boolean; meetingOrganizerId?: string | null };
    const organizerId = e.onlineMeeting ? e.meetingOrganizerId ?? null : null;
    const people = new Set(eventPeopleIds(event));
    if (organizerId) people.add(organizerId);

    const desired = new Map<string, { id: string }>();
    for (const userId of people) {
      const connection = await this.connections.findActiveForUser(userId);
      if (connection && (connection.syncCalendar || userId === organizerId)) desired.set(userId, connection);
    }

    for (const copy of copies) {
      if (desired.get(copy.userId)?.id !== copy.connectionId) await this.deleteCopy(copy);
    }

    const origin = await this.firmLink.originForFirm(event.case.firmId);
    for (const [userId, connection] of desired) {
      const copy = copies.find((c) => c.userId === userId && c.connectionId === connection.id);
      if (copy && copy.syncedAt >= event.updatedAt) continue;
      try {
        const token = await this.connections.getValidAccessToken(connection.id);
        const payload = this.payloadFor(event, userId, organizerId, origin);
        await this.writeCopy(token, payload, event.id, userId, connection.id, event.updatedAt, copy);
      } catch (error) {
        this.logger.warn(`Outlook copy of event ${event.id} for user ${userId} failed: ${error}`);
        if (copy) {
          await this.prisma.calendarEventOutlookCopy.update({ where: { id: copy.id }, data: { lastError: String(error).slice(0, 2000) } });
        }
      }
    }
  }

  /** Teams fields are added in plan Task 10; this hook keeps the non-Teams path unchanged. */
  protected payloadFor(event: any, userId: string, _organizerId: string | null, origin: string): GraphEventInput {
    return buildOutlookEvent(event, { caseUrl: `${origin}/cases/${event.caseId}`, transactionId: `${event.id}:${userId}` });
  }

  private async writeCopy(token: string, payload: GraphEventInput, eventId: string, userId: string, connectionId: string, version: Date, copy?: Copy) {
    let graphEventId: string;
    if (copy) {
      try {
        graphEventId = (await this.calendar.updateEvent(token, copy.graphEventId, payload)).id;
      } catch (error) {
        if (!(error instanceof GraphApiError && error.status === 404)) throw error;
        await this.prisma.calendarEventOutlookCopy.delete({ where: { id: copy.id } });
        graphEventId = (await this.calendar.createEvent(token, payload)).id; // user deleted it in Outlook
      }
    } else {
      graphEventId = (await this.calendar.createEvent(token, payload)).id;
    }
    await this.prisma.calendarEventOutlookCopy.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, connectionId, graphEventId, syncedAt: version },
      update: { connectionId, graphEventId, syncedAt: version, lastError: null },
    });
    return graphEventId;
  }

  private async deleteCopy(copy: Copy) {
    try {
      const token = await this.connections.getValidAccessToken(copy.connectionId);
      await this.calendar.deleteEvent(token, copy.graphEventId);
    } catch (error) {
      if (!(error instanceof GraphApiError && error.status === 404)) {
        this.logger.warn(`Could not delete Outlook copy ${copy.graphEventId}: ${error}`);
      }
    }
    await this.prisma.calendarEventOutlookCopy.delete({ where: { id: copy.id } });
  }

  async removeAllForConnection(connectionId: string): Promise<void> {
    const copies = (await this.prisma.calendarEventOutlookCopy.findMany({ where: { connectionId } })) as Copy[];
    for (const copy of copies) await this.deleteCopy(copy);
  }

  @Cron('*/2 * * * *')
  async reconcileAll(): Promise<void> {
    const since = new Date(Date.now() - DAY);
    const connections = await this.prisma.mailboxConnection.findMany({ where: { status: 'ACTIVE', userId: { not: null } } });
    const activeIds = new Set(connections.map((c) => c.id));
    const ids = new Set<string>();

    for (const connection of connections) {
      const userId = connection.userId!;
      const copies = (await this.prisma.calendarEventOutlookCopy.findMany({ where: { userId } })) as Copy[];
      if (!connection.syncCalendar) {
        copies.forEach((c) => ids.add(c.eventId));
        continue;
      }
      const events = await this.prisma.calendarEvent.findMany({
        where: { AND: [eventForUserWhere(userId), { startAt: { gte: since } }] },
        select: { id: true, updatedAt: true },
      });
      const byEvent = new Map(copies.map((c) => [c.eventId, c]));
      for (const event of events) {
        const copy = byEvent.get(event.id);
        if (!copy || copy.syncedAt < event.updatedAt) ids.add(event.id);
        byEvent.delete(event.id);
      }
      byEvent.forEach((c) => ids.add(c.eventId)); // deleted, reassigned or out of window
    }

    // Copies whose account was disconnected: no token left to call Graph — forget them.
    await this.prisma.calendarEventOutlookCopy.deleteMany({ where: { connectionId: { notIn: [...activeIds] } } });

    for (const id of ids) {
      try {
        await this.syncEvent(id);
      } catch (error) {
        this.logger.warn(`reconcile ${id} failed: ${error}`);
      }
    }
  }
}
```
Notes for the implementer:
- `findActiveForUser` returns the full row (includes `syncCalendar`); `desired` stores it, typed as the Prisma `MailboxConnection`.
- Copies of an event that moved into the past are queued by `reconcileAll` (they drop out of `events`) and then left alone by `doSync` step 3 — that's intended; they stay as history in Outlook. To avoid re-queuing them every 2 minutes, filter: only add a leftover copy id when the event is missing or not past — simplest: in `reconcileAll`, after building `byEvent` leftovers, look them up once: `const leftovers = await this.prisma.calendarEvent.findMany({ where: { id: { in: [...byEvent.keys()] } }, select: { id: true, startAt: true } })` and skip ids whose `startAt < since`. Add this; the spec test (`deleted` missing from DB) still passes when `findMany` for leftovers returns `[]` — mock a second `calendarEvent.findMany` resolution of `[]` in that test with `mockResolvedValueOnce` ordering (events first, leftovers second).
- `reconcileAll` test mocks `calendarEventOutlookCopy.findMany` once; `deleteMany` must exist on the mock (it does).

Module: add `OutlookCalendarSyncService` to `providers` and `exports` (FirmLinkService is already a provider there).

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js src/outlook-integration && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/api/src/outlook-integration
/usr/bin/git commit -m "feat(outlook): one-way calendar sync to each responsible lawyer's Outlook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Wire immediate sync into event writers + settings switch (A)

**Files:**
- Modify: `apps/api/src/calendar/calendar.module.ts`
- Modify: `apps/api/src/calendar/calendar.service.ts`
- Modify: `apps/api/src/calendar/event-responsibility.service.ts`
- Modify: `apps/api/src/calendar/court-day.service.ts`
- Modify: `apps/api/src/outlook-integration/outlook-connections.controller.ts`
- Test: `apps/api/src/calendar/calendar.service.spec.ts`, `apps/api/src/outlook-integration/outlook-connections.controller.spec.ts`

**Interfaces:**
- Consumes: `OutlookCalendarSyncService.syncEventSoon`, `removeAllForConnection` (Task 8).
- Produces: `CalendarService` constructor gains `private outlookCalendar: OutlookCalendarSyncService` (last parameter). `create`, `update`, `remove` call `this.outlookCalendar.syncEventSoon(id)` after their DB write. `EventResponsibilityService.reschedule` calls it for the moved event and every moved deadline event. `CourtDayService.complete` calls it for the newly created hearing. Turning `syncCalendar` off calls `removeAllForConnection(id)`; turning it on runs nothing extra (the cron picks it up within 2 minutes).

- [ ] **Step 1: Write the failing tests**

In `calendar.service.spec.ts` add `{ provide: OutlookCalendarSyncService, useValue: mockOutlookCalendar }` with `const mockOutlookCalendar = { syncEventSoon: jest.fn() };` and:
```ts
it('queues an Outlook sync after create, update and remove', async () => {
  // reuse the spec's existing create/update/remove arrangements (copy their mock setups)
  await service.create(user, createDto);
  expect(mockOutlookCalendar.syncEventSoon).toHaveBeenCalledWith(createdEvent.id);
  await service.update(user, createdEvent.id, { title: 'ใหม่' });
  await service.remove(user, createdEvent.id);
  expect(mockOutlookCalendar.syncEventSoon).toHaveBeenCalledTimes(3);
});
```
(`user`, `createDto`, `createdEvent` = the fixtures already used by that spec's create/update/remove tests; if names differ, use those.)

In `outlook-connections.controller.spec.ts` add `{ provide: OutlookCalendarSyncService, useValue: calendarSync }` with `const calendarSync = { removeAllForConnection: jest.fn() };` and:
```ts
it('turning calendar sync off removes that account’s Outlook copies', async () => {
  connections.updateSettings.mockResolvedValue({ before: { syncCalendar: true, syncInboxToIntake: false }, after: { syncCalendar: false, syncInboxToIntake: false } });
  await controller.updateSettings(user, 'c1', { syncCalendar: false });
  expect(calendarSync.removeAllForConnection).toHaveBeenCalledWith('c1');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api exec jest --config jest.config.js src/calendar/calendar.service.spec.ts src/outlook-integration/outlook-connections.controller.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`calendar.module.ts`: add `OutlookIntegrationModule` to `imports` (import from `../outlook-integration/outlook-integration.module`). OutlookIntegrationModule must not import CalendarModule (it doesn't — it only imports `event-people.ts`, a plain file).

`calendar.service.ts`: inject `private outlookCalendar: OutlookCalendarSyncService`; in `create` → `const event = await this.createInternal(dto, user.id); this.outlookCalendar.syncEventSoon(event.id); return event;`; in `update` call `this.outlookCalendar.syncEventSoon(id)` before `return updated;`; in `remove` call it after the delete. (`createInternal`/`updateInternal` callers elsewhere are covered by the 2-minute cron — do not add hooks there.)

`event-responsibility.service.ts` `reschedule()`: after the transaction commits (where it already sends its notice), call `this.outlookCalendar.syncEventSoon(eventId)` and the same for each linked deadline event id it moved (use the ids it already collects for the `updateMany`; if it only has a `where`, select ids first). Inject the service.

`court-day.service.ts` `complete()`: after creating the next hearing, `this.outlookCalendar.syncEventSoon(next.id)`. Inject the service.

Update those two services' existing specs to provide `{ provide: OutlookCalendarSyncService, useValue: { syncEventSoon: jest.fn() } }` so they still compile.

`outlook-connections.controller.ts` `updateSettings`, inside the same try block as Task 4:
```ts
if (before.syncCalendar && !after.syncCalendar) await this.calendarSync.removeAllForConnection(id);
```
(inject `OutlookCalendarSyncService` as `calendarSync`).

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js src/calendar src/outlook-integration && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS. Also run `pnpm --filter api exec jest --config jest.config.js src/app.module.spec.ts` to confirm DI still resolves (expected PASS in a worktree).

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/api/src
/usr/bin/git commit -m "feat(calendar): push event changes to Outlook right away; calendar switch cleans up copies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Teams meetings on client meetings — API (E)

**Files:**
- Create: `apps/api/prisma/migrations/20261013140000_event_teams_meeting/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (`CalendarEvent`)
- Modify: `apps/api/src/calendar/dto/calendar.dto.ts`
- Modify: `apps/api/src/calendar/calendar.service.ts`
- Modify: `apps/api/src/outlook-integration/calendar/outlook-calendar-sync.service.ts`
- Modify: `apps/api/src/outlook-integration/calendar/outlook-event-payload.ts`
- Modify: `apps/api/src/notifications/reminder.scheduler.ts`
- Test: `apps/api/src/calendar/calendar.service.spec.ts`, `apps/api/src/outlook-integration/calendar/outlook-calendar-sync.service.spec.ts`, `apps/api/src/outlook-integration/calendar/outlook-event-payload.spec.ts`

**Interfaces:**
- Consumes: Tasks 7–9.
- Produces:
  - `CalendarEvent.onlineMeeting Boolean @default(false)`, `onlineMeetingUrl String?`, `meetingOrganizerId String?` (FK → User SetNull), `inviteeEmails String[] @default([])`.
  - DTOs (`CreateEventDto`, `UpdateEventDto`): `onlineMeeting?: boolean`, `inviteeEmails?: string[]` (`@IsEmail({}, { each: true })`, `@ArrayMaxSize(20)`).
  - `CalendarService.create` with `onlineMeeting: true`: only for `type === CLIENT_MEETING` (else 400 `ประชุม Teams ใช้ได้กับนัดลูกความเท่านั้น`); organizer = actor if `findActiveForUser(actor)` else the first `eventPeopleIds` member with an active connection; none → 400 `ต้องเชื่อม Microsoft 365 ในหน้าตั้งค่าก่อนจึงสร้างลิงก์ Teams ได้`.
  - Organizer copy payload adds `isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness', attendees`; after create, if `result.onlineMeeting?.joinUrl` and the event's `onlineMeetingUrl` is empty, store it and set that copy's `syncedAt` to the returned row's `updatedAt` (no self-triggered re-patch).
  - Reminder text gets `\nTeams: <url>` when set.

Spec decision recorded here: the spec said "save the event, show a message" when nobody is connected; we refuse with 400 instead so the lawyer is never left believing a Teams link exists. Update the spec's ส่วน E bullet to match in the same commit.

- [ ] **Step 1: Migration + schema**

```sql
ALTER TABLE "CalendarEvent"
  ADD COLUMN "onlineMeeting" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onlineMeetingUrl" TEXT,
  ADD COLUMN "meetingOrganizerId" TEXT,
  ADD COLUMN "inviteeEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_meetingOrganizerId_fkey"
  FOREIGN KEY ("meetingOrganizerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```
Schema `CalendarEvent`:
```prisma
  onlineMeeting      Boolean  @default(false)
  onlineMeetingUrl   String?
  meetingOrganizerId String?
  inviteeEmails      String[] @default([])
  meetingOrganizer   User?    @relation("EventMeetingOrganizer", fields: [meetingOrganizerId], references: [id], onDelete: SetNull)
```
and on `User`: `organizedMeetings CalendarEvent[] @relation("EventMeetingOrganizer")`. Apply `20261013140000_event_teams_meeting`.

- [ ] **Step 2: Write the failing tests**

`outlook-event-payload.spec.ts` add:
```ts
it('organizer copy carries the Teams flags and invitees; others do not', () => {
  const e = { ...base, type: 'CLIENT_MEETING', onlineMeeting: true, inviteeEmails: ['client@x.com'] };
  const organizer = buildOutlookEvent(e, { ...opts, asOrganizer: true });
  expect(organizer).toMatchObject({
    isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness',
    attendees: [{ emailAddress: { address: 'client@x.com' }, type: 'required' }],
  });
  const colleague = buildOutlookEvent(e, { ...opts, asOrganizer: false });
  expect(colleague.isOnlineMeeting).toBeUndefined();
  expect(colleague.attendees).toBeUndefined();
});
```
`outlook-calendar-sync.service.spec.ts` add:
```ts
it('stores the Teams join URL from the organizer copy without re-patching it', async () => {
  const e = event({ type: 'CLIENT_MEETING', onlineMeeting: true, meetingOrganizerId: 'u1', inviteeEmails: ['c@x.com'] });
  prisma.calendarEvent.findUnique.mockResolvedValue(e);
  prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
  connections.findActiveForUser.mockResolvedValue(conn('u1'));
  calendar.createEvent.mockResolvedValue({ id: 'g1', onlineMeeting: { joinUrl: 'https://teams/x' } });
  const bumped = new Date('2026-10-13T10:05:00Z');
  prisma.calendarEvent.update.mockResolvedValue({ updatedAt: bumped });
  await svc.syncEvent('e1');
  expect(calendar.createEvent.mock.calls[0][1]).toMatchObject({ isOnlineMeeting: true });
  expect(prisma.calendarEvent.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { onlineMeetingUrl: 'https://teams/x' }, select: { updatedAt: true } });
  expect(prisma.calendarEventOutlookCopy.update).toHaveBeenCalledWith({ where: { eventId_userId: { eventId: 'e1', userId: 'u1' } }, data: { syncedAt: bumped } });
});

it('the organizer gets the meeting even with calendar sync off', async () => {
  prisma.calendarEvent.findUnique.mockResolvedValue(event({ type: 'CLIENT_MEETING', onlineMeeting: true, meetingOrganizerId: 'org', assignees: [{ userId: 'u1' }] }));
  prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
  connections.findActiveForUser.mockImplementation(async (id: string) => conn(id, { syncCalendar: false }));
  calendar.createEvent.mockResolvedValue({ id: 'g1' });
  await svc.syncEvent('e1');
  expect(calendar.createEvent).toHaveBeenCalledTimes(1); // org only; u1 has sync off
});
```
`calendar.service.spec.ts` add (adapt fixture names to the spec):
```ts
describe('Teams meetings', () => {
  it('rejects Teams on anything but a client meeting', async () => {
    await expect(service.create(user, { ...createDto, type: 'COURT_DATE', onlineMeeting: true } as any)).rejects.toThrow('นัดลูกความ');
  });
  it('rejects when nobody involved has connected Microsoft 365', async () => {
    mockOutlookConnections.findActiveForUser.mockResolvedValue(null);
    await expect(service.create(user, { ...createDto, type: 'CLIENT_MEETING', onlineMeeting: true } as any)).rejects.toThrow('เชื่อม Microsoft 365');
  });
  it('makes the creator the organizer when connected', async () => {
    mockOutlookConnections.findActiveForUser.mockImplementation(async (id: string) => (id === user.id ? { id: 'c' } : null));
    await service.create(user, { ...createDto, type: 'CLIENT_MEETING', onlineMeeting: true, inviteeEmails: ['c@x.com'] } as any);
    const data = mockPrisma.calendarEvent.create.mock.calls.at(-1)[0].data;
    expect(data).toMatchObject({ onlineMeeting: true, meetingOrganizerId: user.id, inviteeEmails: ['c@x.com'] });
  });
});
```
(provide `{ provide: OutlookConnectionsService, useValue: mockOutlookConnections }` with `const mockOutlookConnections = { findActiveForUser: jest.fn() }`.)

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter api exec jest --config jest.config.js src/calendar/calendar.service.spec.ts src/outlook-integration/calendar`
Expected: FAIL.

- [ ] **Step 4: Implement**

DTOs (both create and update):
```ts
@IsOptional() @IsBoolean() onlineMeeting?: boolean;

@IsOptional() @IsArray() @ArrayMaxSize(20) @IsEmail({}, { each: true })
inviteeEmails?: string[];
```
(import `IsBoolean`, `IsEmail`.)

`calendar.service.ts`, in `create` before `createInternal` (inject `OutlookConnectionsService` as `outlookConnections`):
```ts
let meetingOrganizerId: string | undefined;
if (dto.onlineMeeting) {
  if ((dto.type ?? EventType.OTHER) !== EventType.CLIENT_MEETING) {
    throw new BadRequestException('ประชุม Teams ใช้ได้กับนัดลูกความเท่านั้น');
  }
  const candidates = [user.id, ...(dto.assigneeIds ?? (dto.assigneeId ? [dto.assigneeId] : []))];
  for (const id of candidates) {
    if (await this.outlookConnections.findActiveForUser(id)) { meetingOrganizerId = id; break; }
  }
  if (!meetingOrganizerId) {
    throw new BadRequestException('ต้องเชื่อม Microsoft 365 ในหน้าตั้งค่าก่อนจึงสร้างลิงก์ Teams ได้');
  }
}
const event = await this.createInternal({ ...dto, meetingOrganizerId } as CreateEventDto & { meetingOrganizerId?: string }, user.id);
```
In `createInternal`, both branches spread `eventData` into `data`; make sure `onlineMeeting`, `inviteeEmails` and `meetingOrganizerId` pass through (they do if `eventData` is the DTO minus assignee fields — verify, and add them explicitly if the create builds `data` field by field). In `update`: if `dto.onlineMeeting === true` and the stored event has no organizer, resolve the organizer the same way (extract the loop into `private async resolveMeetingOrganizer(actorId: string, people: string[]): Promise<string>` used by both); if `dto.onlineMeeting === false`, also set `onlineMeetingUrl: null, meetingOrganizerId: null`.

`outlook-event-payload.ts`: extend `PayloadEvent` with `onlineMeeting?: boolean; inviteeEmails?: string[]` and `opts` with `asOrganizer?: boolean`; at the end:
```ts
...(opts.asOrganizer && e.onlineMeeting
  ? {
      isOnlineMeeting: true as const,
      onlineMeetingProvider: 'teamsForBusiness' as const,
      attendees: (e.inviteeEmails ?? []).map((address) => ({ emailAddress: { address }, type: 'required' as const })),
    }
  : {}),
```
and only render the body's Teams line when `!opts.asOrganizer` (the organizer's Outlook shows Teams natively).

`outlook-calendar-sync.service.ts`:
- `payloadFor(event, userId, organizerId, origin)` → `buildOutlookEvent(event, { caseUrl, transactionId, asOrganizer: userId === organizerId })`.
- `writeCopy` returns the Graph result; change it to return `{ id, joinUrl }` (`joinUrl = result.onlineMeeting?.joinUrl`). In `doSync`, after `writeCopy` for the organizer:
```ts
if (userId === organizerId && joinUrl && !event.onlineMeetingUrl) {
  const { updatedAt } = await this.prisma.calendarEvent.update({
    where: { id: event.id }, data: { onlineMeetingUrl: joinUrl }, select: { updatedAt: true },
  });
  await this.prisma.calendarEventOutlookCopy.update({
    where: { eventId_userId: { eventId: event.id, userId } }, data: { syncedAt: updatedAt },
  });
}
```
Colleagues' copies then become stale (`syncedAt < updatedAt`) and get the link on the next run — intended. Remove the `as any` reads of `onlineMeeting`/`meetingOrganizerId` now that the client is regenerated.

`reminder.scheduler.ts`: append to `summaryText`:
```ts
+ (event.onlineMeetingUrl ? `\nTeams: ${event.onlineMeetingUrl}` : '')
```
(make sure the reminder query selects `onlineMeetingUrl` — if it uses `include`, scalars come along already.)

Spec edit: in `docs/superpowers/specs/2026-10-13-microsoft365-integration-design.md` ส่วน E, replace `ไม่มีใครเชื่อม → บันทึกนัดได้ แต่ขึ้นข้อความ "ต้องเชื่อม Microsoft ก่อนจึงสร้างลิงก์ Teams ได้"` with `ไม่มีใครเชื่อม → ไม่ให้บันทึกแบบ Teams (400 "ต้องเชื่อม Microsoft 365 ในหน้าตั้งค่าก่อนจึงสร้างลิงก์ Teams ได้") — เอาติ๊กออกแล้วบันทึกเป็นนัดปกติได้`.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js src/calendar src/outlook-integration src/notifications/reminder && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/api docs/superpowers/specs/2026-10-13-microsoft365-integration-design.md
/usr/bin/git commit -m "feat(calendar): Teams links for client meetings via the organizer's Outlook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Teams in the event dialog — web (E)

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`CalendarEventItem`)
- Modify: `apps/web/src/components/calendar/CalendarEventDialog.tsx`

**Interfaces:**
- Consumes: API fields from Task 10; client contacts already on the case (`api.getCase(token, caseId)` returns `client.contacts` with `email` — confirm by reading `CaseDetail`/`ClientItem` types around `api.ts:491-497`; if the dialog has no case detail at hand, fetch it once when the user ticks Teams).
- Produces: `CalendarEventItem` gains `onlineMeeting?: boolean; onlineMeetingUrl?: string | null; inviteeEmails?: string[]`.

- [ ] **Step 1: Types**

In `CalendarEventItem` add the three optional fields above.

- [ ] **Step 2: Form state + payload**

In `initialForm(...)` add `onlineMeeting: event?.onlineMeeting ?? false, inviteeEmails: event?.inviteeEmails ?? []`. In `handleSubmit` payload add:
```ts
onlineMeeting: form.type === 'CLIENT_MEETING' ? form.onlineMeeting : false,
inviteeEmails: form.type === 'CLIENT_MEETING' && form.onlineMeeting ? form.inviteeEmails : [],
```

- [ ] **Step 3: Edit-mode controls** (render only when `form.type === 'CLIENT_MEETING'`, after the assignee picker)

```tsx
<label className="flex items-center gap-2 text-sm">
  <input type="checkbox" checked={form.onlineMeeting}
    onChange={(e) => setForm((f) => ({ ...f, onlineMeeting: e.target.checked }))} />
  ประชุมออนไลน์ (Microsoft Teams)
</label>
{form.onlineMeeting && (
  <div className="space-y-2">
    <p className="text-xs text-muted-foreground">
      ระบบสร้างลิงก์ Teams ในปฏิทิน Outlook ของผู้จัด และ Outlook จะส่งคำเชิญถึงอีเมลด้านล่าง
    </p>
    <div className="flex flex-wrap gap-1">
      {contactEmails.map((email) => (
        <button key={email} type="button"
          className={`rounded-full border px-2 py-0.5 text-xs ${form.inviteeEmails.includes(email) ? 'bg-primary text-primary-foreground' : ''}`}
          onClick={() => setForm((f) => ({
            ...f,
            inviteeEmails: f.inviteeEmails.includes(email) ? f.inviteeEmails.filter((x) => x !== email) : [...f.inviteeEmails, email],
          }))}>
          {email}
        </button>
      ))}
    </div>
    <Input placeholder="เพิ่มอีเมลผู้รับเชิญ แล้วกด Enter" value={inviteDraft}
      onChange={(e) => setInviteDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const email = inviteDraft.trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !form.inviteeEmails.includes(email)) {
          setForm((f) => ({ ...f, inviteeEmails: [...f.inviteeEmails, email] }));
          setInviteDraft('');
        }
      }} />
    {form.inviteeEmails.filter((x) => !contactEmails.includes(x)).map((email) => (
      <span key={email} className="mr-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
        {email}
        <button type="button" aria-label={`ลบ ${email}`}
          onClick={() => setForm((f) => ({ ...f, inviteeEmails: f.inviteeEmails.filter((x) => x !== email) }))}>×</button>
      </span>
    ))}
  </div>
)}
```
State: `const [inviteDraft, setInviteDraft] = useState('');` and `const [contactEmails, setContactEmails] = useState<string[]>([]);` loaded by an effect when `form.onlineMeeting && form.caseId` (fetch the case, collect `client.contacts[].email` non-null, lower-cased, unique). The API error text (e.g. "ต้องเชื่อม Microsoft 365…") already surfaces through the dialog's existing `setError(e.message)` path — keep it.

- [ ] **Step 4: View-mode join button** (inside the `mode === 'view'` branch, near title/time)

```tsx
{event.onlineMeetingUrl && (
  <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" asChild>
      <a href={event.onlineMeetingUrl} target="_blank" rel="noopener noreferrer">เข้าร่วม Teams</a>
    </Button>
    <Button size="sm" variant="outline" type="button"
      onClick={() => navigator.clipboard.writeText(event.onlineMeetingUrl!)}>
      คัดลอกลิงก์
    </Button>
  </div>
)}
{event.onlineMeeting && !event.onlineMeetingUrl && (
  <p className="text-xs text-muted-foreground">กำลังสร้างลิงก์ Teams… (ภายใน 2 นาที)</p>
)}
```
(If `Button` in this codebase has no `asChild`, use a styled `<a>` with the button classes the file already uses for links.)

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec next lint --dir src/components/calendar`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/web/src
/usr/bin/git commit -m "feat(web): Teams option, invitees and join button on client meetings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Phase verification

- [ ] **Step 1: Full API suite + typechecks**

Run: `pnpm --filter @lawfirm/shared build && pnpm --filter api exec jest --config jest.config.js && pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter web exec tsc --noEmit`
Expected: all PASS. Fix any regression in specs touched by the visibility rule (Task 5) or new constructor params (Tasks 9–10) — adjust the spec setup, not the rule.

- [ ] **Step 2: Local smoke (no Microsoft)**

Start the worktree API (see memory/launch.json `api-worktree`, port 3011) and confirm it boots, then:
`curl -s -o /dev/null -w "%{http_code}\n" localhost:3011/outlook/connections` → `401` (guarded), and `curl -s -o /dev/null -w "%{http_code}\n" "localhost:3011/outlook/start?ticket=bad"` → `400`.
Expected: both codes as stated; API log shows `OutlookCalendarSyncService` cron registered without errors.

- [ ] **Step 3: Commit (only if Step 1 required fixes)**

```bash
/usr/bin/git add -A apps
/usr/bin/git commit -m "test: align specs with M365 foundation changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
