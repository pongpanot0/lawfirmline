# LINE Case/Task/Todo Bot ("ลอว์") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff (หัวหน้า) create an Intake (future Case), attach a Task to an existing Case, or create a standalone Todo — all through a step-by-step conversation with a LINE bot named "ลอว์", triggered by `@law` in a group chat or a Rich Menu button in a 1:1 chat.

**Architecture:** Extends the existing LINE webhook (`apps/api/src/notifications/line.controller.ts`) with a stateful conversation layer. An in-memory session store (keyed by LINE userId, 10-minute TTL) drives a step-by-step question flow per action type (Intake / Task / Todo). Each flow reuses existing services (`IntakeService`, `TasksService`, `ClientsService`, `CasesService`) — no new business-logic duplication, only a new LINE-facing orchestration layer plus one schema change (`Task.caseId` becomes nullable to support standalone todos).

**Tech Stack:** NestJS (existing `apps/api`), Prisma, LINE Messaging API (existing `LineMessagingService`/`LineLinkService`), `@nestjs/schedule` (already registered in `AppModule`) for session cleanup. No new external dependencies (no Redis — single in-memory session store, acceptable because sessions are short-lived and this is a single-instance deployment).

**Spec:** This plan implements the design agreed in the `/grill-me` session on 2026-09-04 (see conversation history — no separate spec doc was written; the plan below is the spec of record).

## Global Constraints

- Single-tenant LINE channel — one `LINE_CHANNEL_ID`/`SECRET` for the whole deployment, matching the existing integration. No per-firm LINE channel support.
- No new unit-test framework. This repo has no Jest/`@nestjs/testing` setup anywhere in `apps/api`. Each task instead has explicit **manual verification** steps (curl against the webhook, or direct service calls via a scratch script) matching the project's existing convention (Playwright e2e for HTTP-level flows only). One Playwright e2e test is added at the end for the primary flow, following the existing pattern in `e2e/tests/*.spec.ts`.
- Auth: anyone with `User.lineUserId` set (any role) may trigger the bot — no ADMIN/LAWYER restriction.
- Every DB write goes through existing services (`IntakeService.create`, `TasksService.create`, etc.) — never raw Prisma calls from the new LINE layer, so existing validation/scoping is reused.
- Multi-tenancy field is `firmId` (not `organizationId`). Resolve a LINE-linked user's `AuthUser` via `TenantService.buildAuthUser(userId)` (`apps/api/src/saas/tenant.service.ts:31`), exported from `SaasModule`.
- LINE quick-reply buttons use action `type: 'message'` (the button's tap sends its label back as ordinary user text) — this lets every button tap flow through the same `handleIncomingMessage`-style text router used for link codes, with no new `postback` event handling needed.
- Bot name: **"ลอว์"**. Group trigger: `@law` (case-insensitive, matched via the LINE `mention` payload on the message event). 1:1 trigger: tapping the Rich Menu button (which sends the fixed text `เมนู` per LINE's `richmenu` `message` action).

---

## File Structure

```
apps/api/src/notifications/
  line-messaging.service.ts        (MODIFY — generic target + quick reply)
  line-link.service.ts             (unchanged — still owns link-code linking)
  line.controller.ts               (MODIFY — parse mention/source, route to router)
  notifications.module.ts          (MODIFY — register new providers)
  line-conversation/
    line-conversation.types.ts     (NEW — session/step/flow types)
    line-conversation-store.service.ts   (NEW — in-memory session store + TTL cron)
    line-auth-context.service.ts   (NEW — LINE userId -> AuthUser resolution)
    line-bot-router.service.ts     (NEW — trigger detection, main menu, step dispatch)
    line-notification.service.ts   (NEW — post-creation group + DM messages)
    flows/
      line-intake-flow.service.ts  (NEW — Case/Intake creation flow)
      line-task-flow.service.ts    (NEW — Task-in-existing-case flow)
      line-todo-flow.service.ts    (NEW — standalone Todo flow)
      flow-confirmation.util.ts    (NEW — shared summary/edit-picker rendering)
apps/api/src/tasks/
  tasks.service.ts                 (MODIFY — caseId nullable, source param)
  tasks.controller.ts              (unchanged — still requires caseId via route)
apps/api/src/users/
  users.service.ts                 (MODIFY — add findAllByFirm)
apps/api/prisma/schema.prisma      (MODIFY — Task.caseId nullable, TaskSource enum)
apps/api/prisma/migrations/<ts>_task_optional_case_and_source/migration.sql (NEW)
apps/api/.env.example              (MODIFY — add WEB_APP_URL if missing)
e2e/tests/line-bot-case.spec.ts    (NEW — e2e happy path)
scripts/setup-line-rich-menu.ts    (NEW — one-time Rich Menu registration script)
```

---

### Task 1: Make `Task.caseId` nullable, add `TaskSource`

**Files:**
- Modify: `apps/api/prisma/schema.prisma:569-584` (Task model)
- Create: `apps/api/prisma/migrations/<timestamp>_task_optional_case_and_source/migration.sql`
- Modify: `apps/api/src/tasks/tasks.service.ts:19,36-40`
- Modify: `apps/api/src/tasks/dto/task.dto.ts` (no field changes needed — `source` is set internally, never client-supplied)

**Interfaces:**
- Produces: `TaskSource` enum (`WEB`, `LINE`) usable by later tasks. `TasksService.create(user: AuthUser, caseId: string | null, dto: CreateTaskDto, source?: TaskSource)` — new signature; `source` defaults to `TaskSource.WEB` so the existing HTTP controller (which never passes it) keeps working unchanged.

- [ ] **Step 1: Edit the Prisma schema**

In `apps/api/prisma/schema.prisma`, add the enum near `TaskStatus` (around line 122-126) and update the `Task` model (lines 569-584):

```prisma
enum TaskSource {
  WEB
  LINE
}

model Task {
  id          String     @id @default(uuid())
  caseId      String?
  title       String
  description String?
  status      TaskStatus @default(TODO)
  assigneeId  String?
  createdById String
  dueDate     DateTime?
  source      TaskSource @default(WEB)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  case      Case?  @relation(fields: [caseId], references: [id], onDelete: Cascade)
  assignee  User?  @relation("TaskAssignee", fields: [assigneeId], references: [id])
  createdBy User   @relation("TaskCreator", fields: [createdById], references: [id])
}
```

(Only `caseId: String` → `String?`, `case: Case` → `Case?`, and the new `source` field change from the current model — keep every other existing field/relation exactly as-is.)

- [ ] **Step 2: Generate and review the migration**

Run:
```bash
cd apps/api && pnpm prisma migrate dev --name task_optional_case_and_source --create-only
```
Open the generated `migration.sql` and confirm it contains exactly:
```sql
ALTER TABLE "Task" ALTER COLUMN "caseId" DROP NOT NULL;
CREATE TYPE "TaskSource" AS ENUM ('WEB', 'LINE');
ALTER TABLE "Task" ADD COLUMN "source" "TaskSource" NOT NULL DEFAULT 'WEB';
```
If Prisma also tries to drop/recreate the foreign key, that's expected (nullable FK columns get redefined) — confirm it does NOT drop or alter any other column.

- [ ] **Step 3: Apply the migration**

```bash
pnpm prisma migrate dev
```
Expected: migration applies cleanly, `prisma generate` runs, no errors.

- [ ] **Step 4: Update `TasksService.create` to accept nullable `caseId` and a `source`**

Edit `apps/api/src/tasks/tasks.service.ts`. Current `create` (line 36) takes `(user: AuthUser, caseId: string, dto: CreateTaskDto)`. Change to:

```typescript
import { TaskSource } from '@prisma/client';

async create(
  user: AuthUser,
  caseId: string | null,
  dto: CreateTaskDto,
  source: TaskSource = TaskSource.WEB,
) {
  return this.prisma.task.create({
    data: {
      caseId,
      title: dto.title,
      description: dto.description,
      assigneeId: dto.assigneeId,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      status: dto.status,
      createdById: user.id,
      source,
    },
    include: taskInclude,
  });
}
```
(Keep the existing `taskInclude` constant and any other fields already present in the surrounding file — only change the signature and the `caseId`/`source` handling.)

- [ ] **Step 5: Manual verification**

```bash
cd apps/api && pnpm build
```
Expected: compiles with no type errors (the existing `tasks.controller.ts` call site `this.tasksService.create(user, caseId, dto)` still type-checks because `source` has a default).

Then start the API (`pnpm dev`) and confirm the existing endpoint still works:
```bash
curl -X POST http://localhost:3001/cases/<existing-case-id>/tasks \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"title":"regression check"}'
```
Expected: 201, response includes `"source":"WEB"`, `"caseId":"<existing-case-id>"`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/tasks/tasks.service.ts
git commit -m "feat(tasks): make Task.caseId optional, add TaskSource for standalone todos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Extend `LineMessagingService` with generic push target + quick replies

**Files:**
- Modify: `apps/api/src/notifications/line-messaging.service.ts`

**Interfaces:**
- Consumes: nothing new (same `ConfigService` deps).
- Produces:
  - `type QuickReplyItem = { label: string; text: string }` (exported)
  - `pushTo(targetId: string, text: string, quickReply?: QuickReplyItem[]): Promise<boolean>` — pushes to ANY target id (user, group, or room — LINE's push endpoint treats them identically via the `to` field).
  - `replyWithQuickReply(replyToken: string, text: string, quickReply?: QuickReplyItem[]): Promise<boolean>` — extends existing `replyText`.

- [ ] **Step 1: Add the quick-reply type and a shared message-builder**

In `apps/api/src/notifications/line-messaging.service.ts`, near the top (after imports, before the class):

```typescript
export interface QuickReplyItem {
  label: string;
  text: string;
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
```

- [ ] **Step 2: Add `pushTo` (generic target push)**

Add a new public method, reusing the existing `getAccessToken()` (line 52) and the same fetch pattern as the existing `pushMessage` private method (line 172):

```typescript
async pushTo(targetId: string, text: string, quickReply?: QuickReplyItem[]): Promise<boolean> {
  const token = await this.getAccessToken();
  if (!token) return false;
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: targetId, messages: [buildMessage(text, quickReply)] }),
  });
  return res.ok;
}
```

- [ ] **Step 3: Add `replyWithQuickReply`**

Add alongside the existing `replyText` (line 120), reusing the same reply-endpoint pattern:

```typescript
async replyWithQuickReply(
  replyToken: string,
  text: string,
  quickReply?: QuickReplyItem[],
): Promise<boolean> {
  const token = await this.getAccessToken();
  if (!token) return false;
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [buildMessage(text, quickReply)] }),
  });
  return res.ok;
}
```

- [ ] **Step 4: Manual verification**

```bash
cd apps/api && pnpm build
```
Expected: no type errors. Then, with a real `LINE_CHANNEL_ACCESS_TOKEN` configured and a personal LINE account linked (see Task 5's precondition), write a one-off scratch script or use the Nest REPL to call `lineMessagingService.pushTo(<your lineUserId>, 'ทดสอบ', [{label:'ตกลง', text:'ตกลง'}])` and confirm a message with one quick-reply button arrives in LINE.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/line-messaging.service.ts
git commit -m "feat(line): add generic push target and quick-reply support to LineMessagingService

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Session types + in-memory conversation store

**Files:**
- Create: `apps/api/src/notifications/line-conversation/line-conversation.types.ts`
- Create: `apps/api/src/notifications/line-conversation/line-conversation-store.service.ts`

**Interfaces:**
- Produces:
  - `enum FlowType { CASE, TASK, TODO }`
  - `enum ConversationStep { ... }` (full list below)
  - `interface ConversationTarget { replyToken?: string; sourceType: 'user' | 'group' | 'room'; groupId?: string; roomId?: string }`
  - `interface ConversationSession { lineUserId: string; userId: string; firmId: string; flowType: FlowType | null; step: ConversationStep; data: Record<string, unknown>; searchResults?: Array<{ id: string; label: string }>; pagingOffset?: number; target: ConversationTarget; createdAt: number; updatedAt: number }`
  - `LineConversationStoreService` methods: `start(session: Omit<ConversationSession,'createdAt'|'updatedAt'>): ConversationSession`, `get(lineUserId: string): ConversationSession | undefined`, `update(lineUserId: string, patch: Partial<ConversationSession>): ConversationSession | undefined`, `clear(lineUserId: string): void` — consumed by Tasks 6, 8, 9, 10.

- [ ] **Step 1: Write the types file**

`apps/api/src/notifications/line-conversation/line-conversation.types.ts`:

```typescript
export enum FlowType {
  CASE = 'CASE',
  TASK = 'TASK',
  TODO = 'TODO',
}

export enum ConversationStep {
  SELECT_ACTION = 'SELECT_ACTION',

  CASE_TITLE = 'CASE_TITLE',
  CASE_CLIENT_SEARCH = 'CASE_CLIENT_SEARCH',
  CASE_CLIENT_PICK = 'CASE_CLIENT_PICK',
  CASE_DESCRIPTION = 'CASE_DESCRIPTION',
  CASE_CONFIRM = 'CASE_CONFIRM',
  CASE_EDIT_PICK_FIELD = 'CASE_EDIT_PICK_FIELD',
  CASE_EDIT_VALUE = 'CASE_EDIT_VALUE',

  TASK_CASE_SEARCH = 'TASK_CASE_SEARCH',
  TASK_CASE_PICK = 'TASK_CASE_PICK',
  TASK_TITLE = 'TASK_TITLE',
  TASK_ASSIGNEE_PICK = 'TASK_ASSIGNEE_PICK',
  TASK_DUE_DATE = 'TASK_DUE_DATE',
  TASK_CONFIRM = 'TASK_CONFIRM',
  TASK_EDIT_PICK_FIELD = 'TASK_EDIT_PICK_FIELD',
  TASK_EDIT_VALUE = 'TASK_EDIT_VALUE',

  TODO_TITLE = 'TODO_TITLE',
  TODO_ASSIGNEE_PICK = 'TODO_ASSIGNEE_PICK',
  TODO_DUE_DATE = 'TODO_DUE_DATE',
  TODO_CONFIRM = 'TODO_CONFIRM',
  TODO_EDIT_PICK_FIELD = 'TODO_EDIT_PICK_FIELD',
  TODO_EDIT_VALUE = 'TODO_EDIT_VALUE',
}

export interface ConversationTarget {
  replyToken?: string;
  sourceType: 'user' | 'group' | 'room';
  groupId?: string;
  roomId?: string;
}

export interface SearchResultItem {
  id: string;
  label: string;
}

export interface ConversationSession {
  lineUserId: string;
  userId: string;
  firmId: string;
  flowType: FlowType | null;
  step: ConversationStep;
  data: Record<string, unknown>;
  searchResults?: SearchResultItem[];
  pagingOffset?: number;
  editingField?: string;
  target: ConversationTarget;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Write the store service**

`apps/api/src/notifications/line-conversation/line-conversation-store.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConversationSession } from './line-conversation.types';

const SESSION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class LineConversationStoreService {
  private readonly logger = new Logger(LineConversationStoreService.name);
  private readonly sessions = new Map<string, ConversationSession>();

  start(session: Omit<ConversationSession, 'createdAt' | 'updatedAt'>): ConversationSession {
    const now = Date.now();
    const full: ConversationSession = { ...session, createdAt: now, updatedAt: now };
    this.sessions.set(session.lineUserId, full);
    return full;
  }

  get(lineUserId: string): ConversationSession | undefined {
    const session = this.sessions.get(lineUserId);
    if (!session) return undefined;
    if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
      this.sessions.delete(lineUserId);
      return undefined;
    }
    return session;
  }

  update(lineUserId: string, patch: Partial<ConversationSession>): ConversationSession | undefined {
    const existing = this.get(lineUserId);
    if (!existing) return undefined;
    const updated: ConversationSession = { ...existing, ...patch, updatedAt: Date.now() };
    this.sessions.set(lineUserId, updated);
    return updated;
  }

  clear(lineUserId: string): void {
    this.sessions.delete(lineUserId);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  pruneExpired(): void {
    const now = Date.now();
    let pruned = 0;
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.updatedAt > SESSION_TTL_MS) {
        this.sessions.delete(key);
        pruned++;
      }
    }
    if (pruned > 0) this.logger.debug(`Pruned ${pruned} expired LINE conversation session(s)`);
  }
}
```

- [ ] **Step 3: Manual verification**

```bash
cd apps/api && pnpm build
```
Expected: compiles cleanly (this service isn't wired into any module yet — Task 11 registers the module — so this step just confirms it type-checks standalone).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/notifications/line-conversation/line-conversation.types.ts apps/api/src/notifications/line-conversation/line-conversation-store.service.ts
git commit -m "feat(line): add in-memory conversation session store with 10-minute TTL

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Resolve LINE user to `AuthUser` (`LineAuthContextService`)

**Files:**
- Create: `apps/api/src/notifications/line-conversation/line-auth-context.service.ts`

**Interfaces:**
- Consumes: `PrismaService` (`apps/api/src/prisma/prisma.service.ts`), `TenantService.buildAuthUser(userId: string): Promise<AuthUser | null>` (`apps/api/src/saas/tenant.service.ts:31`), `AuthUser` from `@lawfirm/shared`.
- Produces: `resolve(lineUserId: string): Promise<AuthUser | null>` — consumed by Task 6 (router) to gate every trigger.

- [ ] **Step 1: Write the service**

`apps/api/src/notifications/line-conversation/line-auth-context.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantService } from '../../saas/tenant.service';

@Injectable()
export class LineAuthContextService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantService,
  ) {}

  async resolve(lineUserId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { lineUserId } });
    if (!user) return null;
    return this.tenant.buildAuthUser(user.id);
  }
}
```

- [ ] **Step 2: Manual verification**

```bash
cd apps/api && pnpm build
```
Expected: compiles. Confirm `TenantService` is importable from `../../saas/tenant.service` relative to the new file's path (`apps/api/src/notifications/line-conversation/` → `apps/api/src/saas/tenant.service.ts` is two levels up then into `saas/`) — check the resolved path matches an existing cross-module import elsewhere in the codebase for the same relative depth (e.g. how `subscription.service.ts` imports `TenantService` within `saas/`) and adjust the relative path if the module structure differs.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/line-conversation/line-auth-context.service.ts
git commit -m "feat(line): resolve LINE-linked users to AuthUser via TenantService

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `UsersService.findAllByFirm` (paginated, firm-scoped staff list)

**Files:**
- Modify: `apps/api/src/users/users.service.ts`

**Interfaces:**
- Produces: `findAllByFirm(firmId: string, offset = 0, limit = 13): Promise<{ items: Array<{ id: string; label: string }>; hasMore: boolean }>` — consumed by Task 8's Task-assignee picker and Task 9's Todo-assignee picker.

- [ ] **Step 1: Add the method**

In `apps/api/src/users/users.service.ts`, alongside the existing `findAll()` (line 28) and `findLawyers(firmId)` (line 64), add:

```typescript
async findAllByFirm(
  firmId: string,
  offset = 0,
  limit = 13,
): Promise<{ items: Array<{ id: string; label: string }>; hasMore: boolean }> {
  const members = await this.prisma.firmMember.findMany({
    where: { firmId },
    include: { user: true },
    orderBy: { user: { firstName: 'asc' } },
    skip: offset,
    take: limit + 1,
  });
  const hasMore = members.length > limit;
  const page = members.slice(0, limit);
  return {
    items: page.map((m) => ({ id: m.user.id, label: `${m.user.firstName} ${m.user.lastName}` })),
    hasMore,
  };
}
```

(This uses the `firmMember` join table the same way `findLawyers` already does at `apps/api/src/users/users.service.ts:64-73` — confirm the exact Prisma relation name there and match it; adjust `include: { user: true }` if the existing code uses a different relation field name.)

- [ ] **Step 2: Manual verification**

```bash
cd apps/api && pnpm build
```
Then in the Nest REPL or a scratch script, call `usersService.findAllByFirm('<a-real-firmId>', 0, 13)` and confirm it returns staff of that firm only, with `hasMore: false` if the firm has ≤13 staff.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/users/users.service.ts
git commit -m "feat(users): add findAllByFirm for paginated firm-scoped staff listing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Shared confirmation/edit-picker rendering

**Files:**
- Create: `apps/api/src/notifications/line-conversation/flows/flow-confirmation.util.ts`

**Interfaces:**
- Produces:
  - `type FieldSpec = { key: string; label: string; format?: (value: unknown) => string }`
  - `renderSummary(fields: FieldSpec[], data: Record<string, unknown>): string` — Thai-labeled multi-line summary text.
  - `buildFieldPickerQuickReply(fields: FieldSpec[]): QuickReplyItem[]` — one button per editable field, each button's `text` is `แก้:<fieldKey>`.
  - `CONFIRM_QUICK_REPLY: QuickReplyItem[]` — `[{label:'✅ ยืนยัน', text:'ยืนยัน'}, {label:'✏️ แก้ไข', text:'แก้ไข'}, {label:'❌ ยกเลิก', text:'ยกเลิก'}]`
- Consumed by Tasks 8, 9, 10 (all three flow services).

- [ ] **Step 1: Write the util**

`apps/api/src/notifications/line-conversation/flows/flow-confirmation.util.ts`:

```typescript
import { QuickReplyItem } from '../../line-messaging.service';

export interface FieldSpec {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

export const CONFIRM_QUICK_REPLY: QuickReplyItem[] = [
  { label: '✅ ยืนยัน', text: 'ยืนยัน' },
  { label: '✏️ แก้ไข', text: 'แก้ไข' },
  { label: '❌ ยกเลิก', text: 'ยกเลิก' },
];

export function renderSummary(fields: FieldSpec[], data: Record<string, unknown>): string {
  const lines = fields.map((f) => {
    const raw = data[f.key];
    const value = raw === undefined || raw === null || raw === '' ? '(ไม่ระบุ)' : f.format ? f.format(raw) : String(raw);
    return `${f.label}: ${value}`;
  });
  return `กรุณาตรวจสอบข้อมูล:\n\n${lines.join('\n')}`;
}

export function buildFieldPickerQuickReply(fields: FieldSpec[]): QuickReplyItem[] {
  return fields.map((f) => ({ label: f.label.slice(0, 20), text: `แก้:${f.key}` }));
}
```

(`QuickReplyItem` is exported from Task 2's `line-messaging.service.ts` — import path `../../line-messaging.service` relative to `flows/` — adjust if the directory depth doesn't match.)

- [ ] **Step 2: Manual verification**

```bash
cd apps/api && pnpm build
```
Expected: compiles (no runtime behavior to check yet — it's a pure-function util, exercised end-to-end in Tasks 8-10).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/line-conversation/flows/flow-confirmation.util.ts
git commit -m "feat(line): add shared confirm/edit-picker rendering for conversation flows

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Post-creation notifications (`LineNotificationService`)

**Files:**
- Create: `apps/api/src/notifications/line-conversation/line-notification.service.ts`
- Modify: `apps/api/.env.example` — add `WEB_APP_URL=http://localhost:3000` if not already present (check first; the notifications module already reads several `LINE_*` vars via `ConfigService` the same way).

**Interfaces:**
- Consumes: `LineMessagingService.pushTo` (Task 2), `PrismaService`.
- Produces: `notifyCreated(params: { target: ConversationTarget; summaryText: string; assigneeUserId?: string | null; entityPath: string }): Promise<void>` — consumed by Tasks 8, 9, 10 after a successful create.

- [ ] **Step 1: Write the service**

`apps/api/src/notifications/line-conversation/line-notification.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LineMessagingService } from '../line-messaging.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationTarget } from './line-conversation.types';

@Injectable()
export class LineNotificationService {
  constructor(
    private line: LineMessagingService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async notifyCreated(params: {
    target: ConversationTarget;
    summaryText: string;
    assigneeUserId?: string | null;
    entityPath: string;
  }): Promise<void> {
    const webUrl = this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
    const link = `${webUrl}${params.entityPath}`;
    const groupMessage = `${params.summaryText}\n\n🔗 ${link}`;

    const groupOrRoomId = params.target.groupId ?? params.target.roomId;
    if (groupOrRoomId) {
      await this.line.pushTo(groupOrRoomId, groupMessage);
    } else if (params.target.sourceType === 'user') {
      // Triggered from a 1:1 chat — the confirm-step reply already showed the summary,
      // no separate group push needed.
    }

    if (params.assigneeUserId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: params.assigneeUserId } });
      if (assignee?.lineUserId) {
        await this.line.pushTo(
          assignee.lineUserId,
          `📌 คุณได้รับมอบหมายงานใหม่\n\n${params.summaryText}\n\n🔗 ${link}`,
        );
      }
    }
  }
}
```

- [ ] **Step 2: Confirm/add `WEB_APP_URL`**

```bash
grep -n "WEB_APP_URL" apps/api/.env.example apps/api/.env
```
If missing from `apps/api/.env.example`, add `WEB_APP_URL=http://localhost:3000` next to the other non-secret config vars, and add the real deployed URL to `apps/api/.env` (not committed).

- [ ] **Step 3: Manual verification**

```bash
cd apps/api && pnpm build
```
Full behavioral check happens in Task 8's end-to-end verification (first working flow).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/notifications/line-conversation/line-notification.service.ts apps/api/.env.example
git commit -m "feat(line): add post-creation group + personal DM notifications

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Case (Intake) creation flow

**Files:**
- Create: `apps/api/src/notifications/line-conversation/flows/line-intake-flow.service.ts`

**Interfaces:**
- Consumes: `IntakeService.create(user: AuthUser, dto: CreateIntakeDto)` (`apps/api/src/intake/intake.service.ts:63`), `ClientsService.findAll(user: AuthUser, search?: string)` (`apps/api/src/clients/clients.service.ts:15`), `LineConversationStoreService` (Task 3), `flow-confirmation.util` (Task 6), `LineNotificationService` (Task 7), `LineMessagingService.replyWithQuickReply`/`pushTo` (Task 2).
- Produces: `handle(session: ConversationSession, text: string): Promise<void>` — dispatched to by Task 9 (router) whenever `session.flowType === FlowType.CASE`. Also `start(session base fields): void`-equivalent entry called by the router when the user picks "สร้าง Case".

- [ ] **Step 1: Write the flow service**

`apps/api/src/notifications/line-conversation/flows/line-intake-flow.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { IntakeService } from '../../../intake/intake.service';
import { ClientsService } from '../../../clients/clients.service';
import { LineMessagingService } from '../../line-messaging.service';
import { LineNotificationService } from '../line-notification.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { ConversationSession, ConversationStep } from '../line-conversation.types';
import { renderSummary, buildFieldPickerQuickReply, CONFIRM_QUICK_REPLY, FieldSpec } from './flow-confirmation.util';

const FIELDS: FieldSpec[] = [
  { key: 'title', label: 'ชื่อเรื่อง' },
  { key: 'clientName', label: 'ลูกความ' },
  { key: 'description', label: 'รายละเอียด' },
];

@Injectable()
export class LineIntakeFlowService {
  constructor(
    private intake: IntakeService,
    private clients: ClientsService,
    private line: LineMessagingService,
    private notify: LineNotificationService,
    private store: LineConversationStoreService,
  ) {}

  async start(session: ConversationSession): Promise<void> {
    this.store.update(session.lineUserId, { step: ConversationStep.CASE_TITLE, data: {} });
    await this.reply(session, 'สร้าง Case ใหม่ครับ 📋\n\nชื่อเรื่อง/หัวข้อคดีคืออะไรครับ?');
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    if (text === 'ยกเลิก') {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'ยกเลิกการสร้าง Case แล้วครับ');
      return;
    }

    switch (session.step) {
      case ConversationStep.CASE_TITLE: {
        this.store.update(session.lineUserId, {
          data: { ...session.data, title: text },
          step: ConversationStep.CASE_CLIENT_SEARCH,
        });
        await this.reply(session, 'ลูกความชื่ออะไรครับ? (พิมพ์ชื่อเพื่อค้นหา)');
        return;
      }
      case ConversationStep.CASE_CLIENT_SEARCH: {
        const results = await this.clients.findAll(
          { firmId: session.firmId } as any,
          text,
        );
        if (results.length === 0) {
          this.store.update(session.lineUserId, {
            data: { ...session.data, clientName: text },
            step: ConversationStep.CASE_DESCRIPTION,
          });
          await this.reply(session, `ไม่พบลูกความที่ตรงกับ "${text}" — จะใช้ชื่อนี้ไปก่อนนะครับ\n\nมีรายละเอียดเพิ่มเติมไหมครับ? (หรือพิมพ์ "ข้าม")`);
          return;
        }
        this.store.update(session.lineUserId, {
          step: ConversationStep.CASE_CLIENT_PICK,
          searchResults: results.slice(0, 12).map((c: any) => ({ id: c.id, label: c.name })),
        });
        await this.line.replyWithQuickReply(
          session.target.replyToken!,
          'เลือกลูกความ หรือพิมพ์ "ไม่เจอ" เพื่อใช้ชื่อที่พิมพ์ไปแทน',
          [
            ...results.slice(0, 12).map((c: any) => ({ label: c.name.slice(0, 20), text: c.name })),
            { label: 'ไม่เจอ', text: 'ไม่เจอ' },
          ],
        );
        return;
      }
      case ConversationStep.CASE_CLIENT_PICK: {
        if (text === 'ไม่เจอ') {
          this.store.update(session.lineUserId, { step: ConversationStep.CASE_CLIENT_SEARCH });
          await this.reply(session, 'พิมพ์ชื่อลูกความอีกครั้งครับ');
          return;
        }
        const picked = session.searchResults?.find((r) => r.label === text);
        this.store.update(session.lineUserId, {
          data: { ...session.data, clientId: picked?.id, clientName: text },
          step: ConversationStep.CASE_DESCRIPTION,
        });
        await this.reply(session, 'มีรายละเอียดเพิ่มเติมไหมครับ? (หรือพิมพ์ "ข้าม")');
        return;
      }
      case ConversationStep.CASE_DESCRIPTION: {
        const description = text === 'ข้าม' ? undefined : text;
        const data = { ...session.data, description };
        this.store.update(session.lineUserId, { data, step: ConversationStep.CASE_CONFIRM });
        await this.confirmStep(session, data);
        return;
      }
      case ConversationStep.CASE_CONFIRM: {
        if (text === 'ยืนยัน') {
          await this.create(session);
          return;
        }
        if (text === 'แก้ไข') {
          this.store.update(session.lineUserId, { step: ConversationStep.CASE_EDIT_PICK_FIELD });
          await this.line.replyWithQuickReply(
            session.target.replyToken!,
            'จะแก้ไขข้อมูลไหนครับ?',
            buildFieldPickerQuickReply(FIELDS),
          );
          return;
        }
        await this.confirmStep(session, session.data);
        return;
      }
      case ConversationStep.CASE_EDIT_PICK_FIELD: {
        const field = text.startsWith('แก้:') ? text.slice(3) : null;
        if (!field || !FIELDS.some((f) => f.key === field)) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        this.store.update(session.lineUserId, { editingField: field, step: ConversationStep.CASE_EDIT_VALUE });
        const label = FIELDS.find((f) => f.key === field)!.label;
        await this.reply(session, `กรอกค่าใหม่สำหรับ "${label}" ครับ`);
        return;
      }
      case ConversationStep.CASE_EDIT_VALUE: {
        const field = session.editingField!;
        const data = { ...session.data, [field]: text };
        this.store.update(session.lineUserId, { data, step: ConversationStep.CASE_CONFIRM, editingField: undefined });
        await this.confirmStep(session, data);
        return;
      }
    }
  }

  private async confirmStep(session: ConversationSession, data: Record<string, unknown>): Promise<void> {
    await this.line.replyWithQuickReply(session.target.replyToken!, renderSummary(FIELDS, data), CONFIRM_QUICK_REPLY);
  }

  private async create(session: ConversationSession): Promise<void> {
    const data = session.data as { title: string; clientId?: string; clientName?: string; description?: string };
    const created = await this.intake.create(
      { id: session.userId, firmId: session.firmId } as any,
      {
        receivedDate: new Date().toISOString(),
        title: data.title,
        clientId: data.clientId,
        clientName: data.clientName,
        description: data.description,
        referralChannel: 'LINE' as any,
      },
    );
    this.store.clear(session.lineUserId);
    await this.reply(session, `สร้าง Case สำเร็จแล้วครับ ✅\n\n"${data.title}"`);
    await this.notify.notifyCreated({
      target: session.target,
      summaryText: `📋 สร้าง Intake ใหม่: ${data.title}${data.clientName ? `\nลูกความ: ${data.clientName}` : ''}`,
      entityPath: `/intake/${created.id}`,
    });
  }

  private async reply(session: ConversationSession, text: string): Promise<void> {
    if (session.target.replyToken) {
      await this.line.replyWithQuickReply(session.target.replyToken, text);
    } else {
      await this.line.pushTo(session.lineUserId, text);
    }
  }
}
```

Note the `{ id: session.userId, firmId: session.firmId } as any` calls to `intake.create` — `IntakeService.create` only reads `user.firmId` and `user.id` (per `apps/api/src/intake/intake.service.ts:66-67`); this minimal object satisfies that without needing the full `AuthUser` shape. Confirm this against the actual body of `intake.service.ts:63-83` before writing — if it reads any other field from `user`, build a full context via `LineAuthContextService.resolve` (Task 4) instead and pass that.

- [ ] **Step 2: Manual verification (first end-to-end flow)**

This is the first fully-wired flow, but it isn't reachable via the webhook until Task 11 wires the router into `line.controller.ts`. For now, verify in isolation:

```bash
cd apps/api && pnpm build
```
Expected: compiles. Full behavioral verification (webhook → reply) happens in Task 11's manual test, which exercises this exact flow.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/line-conversation/flows/line-intake-flow.service.ts
git commit -m "feat(line): add Case/Intake creation conversation flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Task-in-existing-case creation flow

**Files:**
- Create: `apps/api/src/notifications/line-conversation/flows/line-task-flow.service.ts`

**Interfaces:**
- Consumes: `CasesService.findAll(user: AuthUser, query: CaseQueryDto)` (`apps/api/src/cases/cases.service.ts:40`), `TasksService.create(user, caseId, dto, source)` (Task 1's new signature), `UsersService.findAllByFirm` (Task 5), rest same as Task 8.
- Produces: `start`/`handle` — same shape as Task 8, dispatched by the router when `flowType === FlowType.TASK`.

- [ ] **Step 1: Write the flow service**

`apps/api/src/notifications/line-conversation/flows/line-task-flow.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { TaskSource } from '@prisma/client';
import { TasksService } from '../../../tasks/tasks.service';
import { CasesService } from '../../../cases/cases.service';
import { UsersService } from '../../../users/users.service';
import { LineMessagingService } from '../../line-messaging.service';
import { LineNotificationService } from '../line-notification.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { ConversationSession, ConversationStep } from '../line-conversation.types';
import { renderSummary, buildFieldPickerQuickReply, CONFIRM_QUICK_REPLY, FieldSpec } from './flow-confirmation.util';

const FIELDS: FieldSpec[] = [
  { key: 'title', label: 'ชื่องาน' },
  { key: 'assigneeLabel', label: 'ผู้รับผิดชอบ' },
  { key: 'dueDate', label: 'กำหนดส่ง' },
];

@Injectable()
export class LineTaskFlowService {
  constructor(
    private tasks: TasksService,
    private cases: CasesService,
    private users: UsersService,
    private line: LineMessagingService,
    private notify: LineNotificationService,
    private store: LineConversationStoreService,
  ) {}

  async start(session: ConversationSession): Promise<void> {
    this.store.update(session.lineUserId, { step: ConversationStep.TASK_CASE_SEARCH, data: {} });
    await this.reply(session, 'เพิ่มงานในคดี — พิมพ์ชื่อคดีหรือเลขคดี (ดำ/แดง) เพื่อค้นหาครับ');
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    if (text === 'ยกเลิก') {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'ยกเลิกแล้วครับ');
      return;
    }

    switch (session.step) {
      case ConversationStep.TASK_CASE_SEARCH: {
        const result = await this.cases.findAll(
          { firmId: session.firmId } as any,
          { search: text } as any,
        );
        const items = (result as any).items ?? result;
        if (!items?.length) {
          await this.reply(session, `ไม่พบคดีที่ตรงกับ "${text}" ลองพิมพ์คำอื่นดูครับ`);
          return;
        }
        const page = items.slice(0, 13);
        this.store.update(session.lineUserId, {
          step: ConversationStep.TASK_CASE_PICK,
          searchResults: page.map((c: any) => ({ id: c.id, label: c.title })),
        });
        await this.line.replyWithQuickReply(
          session.target.replyToken!,
          'เลือกคดีครับ',
          page.map((c: any) => ({ label: c.title.slice(0, 20), text: c.title })),
        );
        return;
      }
      case ConversationStep.TASK_CASE_PICK: {
        const picked = session.searchResults?.find((r) => r.label === text);
        if (!picked) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        this.store.update(session.lineUserId, {
          data: { ...session.data, caseId: picked.id, caseLabel: picked.label },
          step: ConversationStep.TASK_TITLE,
        });
        await this.reply(session, 'ชื่องานที่จะมอบหมายคืออะไรครับ?');
        return;
      }
      case ConversationStep.TASK_TITLE: {
        this.store.update(session.lineUserId, {
          data: { ...session.data, title: text },
          step: ConversationStep.TASK_ASSIGNEE_PICK,
          pagingOffset: 0,
        });
        await this.showAssigneePage(session, 0);
        return;
      }
      case ConversationStep.TASK_ASSIGNEE_PICK: {
        if (text === 'ดูเพิ่มเติม') {
          const nextOffset = (session.pagingOffset ?? 0) + 13;
          this.store.update(session.lineUserId, { pagingOffset: nextOffset });
          await this.showAssigneePage(session, nextOffset);
          return;
        }
        const picked = session.searchResults?.find((r) => r.label === text);
        if (!picked) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        this.store.update(session.lineUserId, {
          data: { ...session.data, assigneeId: picked.id, assigneeLabel: picked.label },
          step: ConversationStep.TASK_DUE_DATE,
        });
        await this.reply(session, 'กำหนดส่งงานวันไหนครับ? (รูปแบบ YYYY-MM-DD หรือพิมพ์ "ข้าม")');
        return;
      }
      case ConversationStep.TASK_DUE_DATE: {
        const dueDate = text === 'ข้าม' ? undefined : text;
        const data = { ...session.data, dueDate };
        this.store.update(session.lineUserId, { data, step: ConversationStep.TASK_CONFIRM });
        await this.confirmStep(session, data);
        return;
      }
      case ConversationStep.TASK_CONFIRM: {
        if (text === 'ยืนยัน') {
          await this.create(session);
          return;
        }
        if (text === 'แก้ไข') {
          this.store.update(session.lineUserId, { step: ConversationStep.TASK_EDIT_PICK_FIELD });
          await this.line.replyWithQuickReply(
            session.target.replyToken!,
            'จะแก้ไขข้อมูลไหนครับ?',
            buildFieldPickerQuickReply(FIELDS),
          );
          return;
        }
        await this.confirmStep(session, session.data);
        return;
      }
      case ConversationStep.TASK_EDIT_PICK_FIELD: {
        const field = text.startsWith('แก้:') ? text.slice(3) : null;
        if (!field || !FIELDS.some((f) => f.key === field)) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        this.store.update(session.lineUserId, { editingField: field, step: ConversationStep.TASK_EDIT_VALUE });
        await this.reply(session, `กรอกค่าใหม่สำหรับ "${FIELDS.find((f) => f.key === field)!.label}" ครับ`);
        return;
      }
      case ConversationStep.TASK_EDIT_VALUE: {
        const field = session.editingField!;
        const data = { ...session.data, [field]: text };
        this.store.update(session.lineUserId, { data, step: ConversationStep.TASK_CONFIRM, editingField: undefined });
        await this.confirmStep(session, data);
        return;
      }
    }
  }

  private async showAssigneePage(session: ConversationSession, offset: number): Promise<void> {
    const { items, hasMore } = await this.users.findAllByFirm(session.firmId, offset, 12);
    this.store.update(session.lineUserId, { searchResults: items });
    const buttons = items.map((u) => ({ label: u.label.slice(0, 20), text: u.label }));
    if (hasMore) buttons.push({ label: 'ดูเพิ่มเติม', text: 'ดูเพิ่มเติม' });
    await this.line.replyWithQuickReply(session.target.replyToken!, 'มอบหมายให้ใครครับ?', buttons);
  }

  private async confirmStep(session: ConversationSession, data: Record<string, unknown>): Promise<void> {
    await this.line.replyWithQuickReply(session.target.replyToken!, renderSummary(FIELDS, data), CONFIRM_QUICK_REPLY);
  }

  private async create(session: ConversationSession): Promise<void> {
    const data = session.data as { caseId: string; caseLabel: string; title: string; assigneeId?: string; assigneeLabel?: string; dueDate?: string };
    const created = await this.tasks.create(
      { id: session.userId, firmId: session.firmId } as any,
      data.caseId,
      { title: data.title, assigneeId: data.assigneeId, dueDate: data.dueDate },
      TaskSource.LINE,
    );
    this.store.clear(session.lineUserId);
    await this.reply(session, `เพิ่มงานในคดี "${data.caseLabel}" สำเร็จแล้วครับ ✅`);
    await this.notify.notifyCreated({
      target: session.target,
      summaryText: `✅ งานใหม่ในคดี "${data.caseLabel}": ${data.title}${data.assigneeLabel ? `\nผู้รับผิดชอบ: ${data.assigneeLabel}` : ''}`,
      assigneeUserId: data.assigneeId,
      entityPath: `/cases/${data.caseId}`,
    });
  }

  private async reply(session: ConversationSession, text: string): Promise<void> {
    if (session.target.replyToken) {
      await this.line.replyWithQuickReply(session.target.replyToken, text);
    } else {
      await this.line.pushTo(session.lineUserId, text);
    }
  }
}
```

Before finalizing, read `apps/api/src/cases/cases.service.ts:40-73` and `apps/api/src/cases/dto/case.dto.ts` for the exact `CaseQueryDto`/`findAll` return shape (paginated `{items, total}` vs plain array) and adjust the `result as any).items ?? result` line to match exactly — remove the `as any` fallback once the real shape is confirmed.

- [ ] **Step 2: Manual verification**

```bash
cd apps/api && pnpm build
```
Full behavioral check in Task 11.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/line-conversation/flows/line-task-flow.service.ts
git commit -m "feat(line): add task-in-existing-case creation conversation flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Standalone Todo creation flow

**Files:**
- Create: `apps/api/src/notifications/line-conversation/flows/line-todo-flow.service.ts`

**Interfaces:**
- Consumes: `TasksService.create(user, null, dto, TaskSource.LINE)`, `UsersService.findAllByFirm`, same infra as Tasks 8/9.
- Produces: `start`/`handle`, dispatched by router when `flowType === FlowType.TODO`.

- [ ] **Step 1: Write the flow service**

`apps/api/src/notifications/line-conversation/flows/line-todo-flow.service.ts` — structurally identical to Task 9's `LineTaskFlowService` but **without** the `TASK_CASE_SEARCH`/`TASK_CASE_PICK` steps (skip straight to title) and calling `tasks.create(user, null, dto, TaskSource.LINE)`:

```typescript
import { Injectable } from '@nestjs/common';
import { TaskSource } from '@prisma/client';
import { TasksService } from '../../../tasks/tasks.service';
import { UsersService } from '../../../users/users.service';
import { LineMessagingService } from '../../line-messaging.service';
import { LineNotificationService } from '../line-notification.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { ConversationSession, ConversationStep } from '../line-conversation.types';
import { renderSummary, buildFieldPickerQuickReply, CONFIRM_QUICK_REPLY, FieldSpec } from './flow-confirmation.util';

const FIELDS: FieldSpec[] = [
  { key: 'title', label: 'ชื่องาน' },
  { key: 'assigneeLabel', label: 'ผู้รับผิดชอบ' },
  { key: 'dueDate', label: 'กำหนดส่ง' },
];

@Injectable()
export class LineTodoFlowService {
  constructor(
    private tasks: TasksService,
    private users: UsersService,
    private line: LineMessagingService,
    private notify: LineNotificationService,
    private store: LineConversationStoreService,
  ) {}

  async start(session: ConversationSession): Promise<void> {
    this.store.update(session.lineUserId, { step: ConversationStep.TODO_TITLE, data: {} });
    await this.reply(session, 'สร้าง Todo ใหม่ — ชื่องานคืออะไรครับ?');
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    if (text === 'ยกเลิก') {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'ยกเลิกแล้วครับ');
      return;
    }

    switch (session.step) {
      case ConversationStep.TODO_TITLE: {
        this.store.update(session.lineUserId, {
          data: { ...session.data, title: text },
          step: ConversationStep.TODO_ASSIGNEE_PICK,
          pagingOffset: 0,
        });
        await this.showAssigneePage(session, 0);
        return;
      }
      case ConversationStep.TODO_ASSIGNEE_PICK: {
        if (text === 'ดูเพิ่มเติม') {
          const nextOffset = (session.pagingOffset ?? 0) + 13;
          this.store.update(session.lineUserId, { pagingOffset: nextOffset });
          await this.showAssigneePage(session, nextOffset);
          return;
        }
        const picked = session.searchResults?.find((r) => r.label === text);
        if (!picked) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        this.store.update(session.lineUserId, {
          data: { ...session.data, assigneeId: picked.id, assigneeLabel: picked.label },
          step: ConversationStep.TODO_DUE_DATE,
        });
        await this.reply(session, 'กำหนดส่งวันไหนครับ? (YYYY-MM-DD หรือพิมพ์ "ข้าม")');
        return;
      }
      case ConversationStep.TODO_DUE_DATE: {
        const dueDate = text === 'ข้าม' ? undefined : text;
        const data = { ...session.data, dueDate };
        this.store.update(session.lineUserId, { data, step: ConversationStep.TODO_CONFIRM });
        await this.confirmStep(session, data);
        return;
      }
      case ConversationStep.TODO_CONFIRM: {
        if (text === 'ยืนยัน') {
          await this.create(session);
          return;
        }
        if (text === 'แก้ไข') {
          this.store.update(session.lineUserId, { step: ConversationStep.TODO_EDIT_PICK_FIELD });
          await this.line.replyWithQuickReply(
            session.target.replyToken!,
            'จะแก้ไขข้อมูลไหนครับ?',
            buildFieldPickerQuickReply(FIELDS),
          );
          return;
        }
        await this.confirmStep(session, session.data);
        return;
      }
      case ConversationStep.TODO_EDIT_PICK_FIELD: {
        const field = text.startsWith('แก้:') ? text.slice(3) : null;
        if (!field || !FIELDS.some((f) => f.key === field)) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        this.store.update(session.lineUserId, { editingField: field, step: ConversationStep.TODO_EDIT_VALUE });
        await this.reply(session, `กรอกค่าใหม่สำหรับ "${FIELDS.find((f) => f.key === field)!.label}" ครับ`);
        return;
      }
      case ConversationStep.TODO_EDIT_VALUE: {
        const field = session.editingField!;
        const data = { ...session.data, [field]: text };
        this.store.update(session.lineUserId, { data, step: ConversationStep.TODO_CONFIRM, editingField: undefined });
        await this.confirmStep(session, data);
        return;
      }
    }
  }

  private async showAssigneePage(session: ConversationSession, offset: number): Promise<void> {
    const { items, hasMore } = await this.users.findAllByFirm(session.firmId, offset, 12);
    this.store.update(session.lineUserId, { searchResults: items });
    const buttons = items.map((u) => ({ label: u.label.slice(0, 20), text: u.label }));
    if (hasMore) buttons.push({ label: 'ดูเพิ่มเติม', text: 'ดูเพิ่มเติม' });
    await this.line.replyWithQuickReply(session.target.replyToken!, 'มอบหมายให้ใครครับ?', buttons);
  }

  private async confirmStep(session: ConversationSession, data: Record<string, unknown>): Promise<void> {
    await this.line.replyWithQuickReply(session.target.replyToken!, renderSummary(FIELDS, data), CONFIRM_QUICK_REPLY);
  }

  private async create(session: ConversationSession): Promise<void> {
    const data = session.data as { title: string; assigneeId?: string; assigneeLabel?: string; dueDate?: string };
    const created = await this.tasks.create(
      { id: session.userId, firmId: session.firmId } as any,
      null,
      { title: data.title, assigneeId: data.assigneeId, dueDate: data.dueDate },
      TaskSource.LINE,
    );
    this.store.clear(session.lineUserId);
    await this.reply(session, `สร้าง Todo สำเร็จแล้วครับ ✅ "${data.title}"`);
    await this.notify.notifyCreated({
      target: session.target,
      summaryText: `📝 Todo ใหม่: ${data.title}${data.assigneeLabel ? `\nผู้รับผิดชอบ: ${data.assigneeLabel}` : ''}`,
      assigneeUserId: data.assigneeId,
      entityPath: `/todos/${created.id}`,
    });
  }

  private async reply(session: ConversationSession, text: string): Promise<void> {
    if (session.target.replyToken) {
      await this.line.replyWithQuickReply(session.target.replyToken, text);
    } else {
      await this.line.pushTo(session.lineUserId, text);
    }
  }
}
```

Note: `entityPath: /todos/${created.id}` assumes a future web UI route for standalone todos. If no such route exists yet, change the link target to the general tasks/dashboard page the web app already has (check `apps/web/src/app/(dashboard)/` for an existing route before finalizing this string).

- [ ] **Step 2: Manual verification**

```bash
cd apps/api && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/line-conversation/flows/line-todo-flow.service.ts
git commit -m "feat(line): add standalone todo creation conversation flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Router, trigger detection, and webhook wiring

**Files:**
- Create: `apps/api/src/notifications/line-conversation/line-bot-router.service.ts`
- Modify: `apps/api/src/notifications/line.controller.ts` (webhook body typing + event handling)
- Modify: `apps/api/src/notifications/notifications.module.ts` (register all new providers)

**Interfaces:**
- Consumes: `LineAuthContextService.resolve` (Task 4), `LineConversationStoreService` (Task 3), `LineIntakeFlowService`/`LineTaskFlowService`/`LineTodoFlowService` (Tasks 8-10), `LineLinkService.handleIncomingMessage` (existing, unchanged — still tried first).
- Produces: `LineBotRouterService.route(lineUserId: string, text: string, target: ConversationTarget, mentionsBot: boolean): Promise<void>` — called from `line.controller.ts`'s webhook handler for every incoming text message.

- [ ] **Step 1: Write the router**

`apps/api/src/notifications/line-conversation/line-bot-router.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { LineMessagingService } from '../line-messaging.service';
import { LineAuthContextService } from './line-auth-context.service';
import { LineConversationStoreService } from './line-conversation-store.service';
import { LineIntakeFlowService } from './flows/line-intake-flow.service';
import { LineTaskFlowService } from './flows/line-task-flow.service';
import { LineTodoFlowService } from './flows/line-todo-flow.service';
import { ConversationTarget, FlowType } from './line-conversation.types';

const MAIN_MENU_QUICK_REPLY = [
  { label: '📋 สร้าง Case', text: 'สร้าง Case' },
  { label: '✅ เพิ่ม Task ในคดี', text: 'เพิ่ม Task' },
  { label: '📝 สร้าง Todo', text: 'สร้าง Todo' },
];

@Injectable()
export class LineBotRouterService {
  constructor(
    private line: LineMessagingService,
    private auth: LineAuthContextService,
    private store: LineConversationStoreService,
    private intakeFlow: LineIntakeFlowService,
    private taskFlow: LineTaskFlowService,
    private todoFlow: LineTodoFlowService,
  ) {}

  async route(lineUserId: string, text: string, target: ConversationTarget, mentionsBot: boolean): Promise<void> {
    const existing = this.store.get(lineUserId);

    // In a group/room, only react when there's an active session for this user
    // OR the bot was just mentioned. In a 1:1 chat, every message is fair game.
    const isGroupOrRoom = target.sourceType === 'group' || target.sourceType === 'room';
    if (isGroupOrRoom && !existing && !mentionsBot) return;

    const authUser = await this.auth.resolve(lineUserId);
    if (!authUser) {
      await this.replyUnlinked(target);
      return;
    }

    if (existing) {
      await this.dispatch(existing.flowType!, { ...existing, target }, text);
      return;
    }

    // Fresh trigger: show the main menu.
    this.store.start({
      lineUserId,
      userId: authUser.id,
      firmId: authUser.firmId,
      flowType: null,
      step: 'SELECT_ACTION' as any,
      data: {},
      target,
    });
    await this.showMainMenu(target);
  }

  async handleMenuSelection(lineUserId: string, text: string, target: ConversationTarget): Promise<boolean> {
    const session = this.store.get(lineUserId);
    if (!session || session.flowType !== null) return false;

    const map: Record<string, FlowType> = {
      'สร้าง Case': FlowType.CASE,
      'เพิ่ม Task': FlowType.TASK,
      'สร้าง Todo': FlowType.TODO,
    };
    const flowType = map[text];
    if (!flowType) {
      await this.showMainMenu(target);
      return true;
    }

    const updated = this.store.update(lineUserId, { flowType, target })!;
    if (flowType === FlowType.CASE) await this.intakeFlow.start(updated);
    if (flowType === FlowType.TASK) await this.taskFlow.start(updated);
    if (flowType === FlowType.TODO) await this.todoFlow.start(updated);
    return true;
  }

  private async dispatch(flowType: FlowType, session: any, text: string): Promise<void> {
    if (flowType === null) {
      const handled = await this.handleMenuSelection(session.lineUserId, text, session.target);
      if (!handled) await this.showMainMenu(session.target);
      return;
    }
    if (flowType === FlowType.CASE) return this.intakeFlow.handle(session, text);
    if (flowType === FlowType.TASK) return this.taskFlow.handle(session, text);
    if (flowType === FlowType.TODO) return this.todoFlow.handle(session, text);
  }

  private async showMainMenu(target: ConversationTarget): Promise<void> {
    const text = 'สวัสดีครับ ผมลอว์ 🤖 จะให้ช่วยอะไรดีครับ?';
    if (target.replyToken) {
      await this.line.replyWithQuickReply(target.replyToken, text, MAIN_MENU_QUICK_REPLY);
    }
  }

  private async replyUnlinked(target: ConversationTarget): Promise<void> {
    const text = 'บัญชีไลน์นี้ยังไม่ได้ผูกกับผู้ใช้งานในระบบครับ กรุณาไปที่หน้าตั้งค่า > เชื่อมต่อ LINE บนเว็บแอปเพื่อขอรหัสผูกบัญชี แล้วพิมพ์รหัส (เช่น LF-XXXXXX) กลับมาที่นี่ครับ';
    if (target.replyToken) await this.line.replyWithQuickReply(target.replyToken, text);
  }
}
```

**Important fix needed while implementing:** `dispatch`'s `flowType === null` branch duplicates `route`'s "fresh trigger" logic in a confusing way. Simplify before committing: `route()` should be the ONLY place that starts a session and shows the main menu; `dispatch` should assume `session.flowType` is already either a real `FlowType` or the sentinel "awaiting menu selection" state. Rewrite `route()`/`dispatch()` together so there is exactly one code path for "no session yet → show menu" and one for "session exists with `flowType === null` → treat this message as the menu answer" — do not leave both `route` and `dispatch` independently capable of showing the menu, as written above they can double-fire. Verify with a manual trace of: message 1 (no session) → menu shown; message 2 ("สร้าง Case") → intake flow starts; before finalizing this task.

- [ ] **Step 2: Update the webhook body type and controller**

In `apps/api/src/notifications/line.controller.ts`, extend the `LineWebhookBody` interface (line 24-32) to add `mention` and richer `source`:

```typescript
interface LineWebhookBody {
  destination?: string;
  events?: Array<{
    type: string;
    replyToken?: string;
    source?: { userId?: string; type?: string; groupId?: string; roomId?: string };
    message?: {
      type: string;
      text?: string;
      mention?: { mentionees: Array<{ type: string; isSelf?: boolean }> };
    };
  }>;
}
```

Modify the `message`/`text` branch (currently lines 69-86) to: (1) still try `lineLink.handleIncomingMessage` first (link-code path, unchanged priority), and (2) if that returns `null`, hand off to the new router:

```typescript
if (event.type === 'message' && event.message?.type === 'text') {
  const userId = event.source?.userId;
  const text = event.message.text ?? '';
  if (!userId) continue;

  const linkReply = await lineLink.handleIncomingMessage(userId, text);
  if (linkReply) {
    if (event.replyToken) await line.replyText(event.replyToken, linkReply);
    continue;
  }

  const sourceType = (event.source?.type as 'user' | 'group' | 'room') ?? 'user';
  const mentionsBot = !!event.message.mention?.mentionees?.some((m) => m.isSelf);
  await router.route(userId, text, {
    replyToken: event.replyToken,
    sourceType,
    groupId: event.source?.groupId,
    roomId: event.source?.roomId,
  }, mentionsBot);
  continue;
}
```

Add `router: LineBotRouterService` to the controller's constructor injection (alongside the existing `line`/`lineLink`, following the same `private` param pattern at line 38-41). Read the actual surrounding loop structure in `line.controller.ts` first (the `for (const event of body.events ?? [])` loop and its `continue`/early-return style) and match the existing control flow exactly rather than assuming a specific loop shape.

- [ ] **Step 3: Register everything in `notifications.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { ReminderScheduler } from './reminder.scheduler';
import { LineMessagingService } from './line-messaging.service';
import { LineLinkService } from './line-link.service';
import { EmailService } from './email.service';
import { LineConversationStoreService } from './line-conversation/line-conversation-store.service';
import { LineAuthContextService } from './line-conversation/line-auth-context.service';
import { LineBotRouterService } from './line-conversation/line-bot-router.service';
import { LineNotificationService } from './line-conversation/line-notification.service';
import { LineIntakeFlowService } from './line-conversation/flows/line-intake-flow.service';
import { LineTaskFlowService } from './line-conversation/flows/line-task-flow.service';
import { LineTodoFlowService } from './line-conversation/flows/line-todo-flow.service';
import { IntakeModule } from '../intake/intake.module';
import { TasksModule } from '../tasks/tasks.module';
import { ClientsModule } from '../clients/clients.module';
import { CasesModule } from '../cases/cases.module';
import { UsersModule } from '../users/users.module';
import { SaasModule } from '../saas/saas.module';

@Module({
  imports: [IntakeModule, TasksModule, ClientsModule, CasesModule, UsersModule, SaasModule],
  controllers: [LineController],
  providers: [
    ReminderScheduler,
    LineMessagingService,
    LineLinkService,
    EmailService,
    LineConversationStoreService,
    LineAuthContextService,
    LineBotRouterService,
    LineNotificationService,
    LineIntakeFlowService,
    LineTaskFlowService,
    LineTodoFlowService,
  ],
  exports: [LineMessagingService, LineLinkService, EmailService],
})
export class NotificationsModule {}
```

Before writing this, confirm the exact module file names/exported class names for `ClientsModule`, `CasesModule`, `UsersModule` (e.g. `apps/api/src/clients/clients.module.ts` exporting `ClientsService`) — grep for `export class.*Module` in each directory and correct the import list if any name differs from the guess above. Also confirm none of these imports creates a circular dependency (e.g. if `CasesModule` already imports `NotificationsModule` transitively) — if it does, import the specific service via a forwardRef or restructure so `NotificationsModule` only imports the modules that don't loop back.

- [ ] **Step 4: Manual verification (full webhook flow)**

```bash
cd apps/api && pnpm build && pnpm dev
```
1. Link your own LINE account via the existing web flow (Settings > Connect LINE), confirm `User.lineUserId` is set.
2. In a personal 1:1 chat with the OA, send any text (e.g. "เมนู"). Expected: bot replies with the 3-button main menu.
3. Tap "📋 สร้าง Case". Expected: bot asks for the case title.
4. Answer each question through to the confirm step; tap "✅ ยืนยัน". Expected: bot confirms creation, and (check the DB) an `Intake` row exists with `referralChannel: 'LINE'`, `receivedById` = your user, `firmId` = your firm.
5. Add the OA to a test LINE group containing a second linked staff account. Have that second person send `@law` (with an actual @-mention of the bot). Expected: bot responds with the main menu ONLY to that mention — a plain unrelated message in the group beforehand must NOT trigger it.
6. Repeat step 3-4 choosing "เพิ่ม Task ในคดี" against a real existing case, and "สร้าง Todo" — confirm rows land correctly (`Task.caseId` set vs `null`, `source: 'LINE'` in both).
7. Confirm the group receives a summary push message after each successful creation, and — if you assigned to a LINE-linked staff member — that person receives a personal DM.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/line-conversation/line-bot-router.service.ts apps/api/src/notifications/line.controller.ts apps/api/src/notifications/notifications.module.ts
git commit -m "feat(line): wire conversational router into the LINE webhook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Rich Menu setup (1:1 entry point)

**Files:**
- Create: `scripts/setup-line-rich-menu.ts`

**Interfaces:**
- Consumes: `LINE_CHANNEL_ACCESS_TOKEN` (or OAuth token) from env directly (this is a standalone script, not run through Nest DI).
- Produces: a LINE Rich Menu with a single button labeled "สร้างงานใหม่" that sends the text `เมนู`, set as the default menu for all users of the OA.

- [ ] **Step 1: Write the setup script**

`scripts/setup-line-rich-menu.ts`:

```typescript
import { readFileSync } from 'fs';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required');

const RICH_MENU_BODY = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: 'law-main-menu',
  chatBarText: 'เมนู',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 2500, height: 843 },
      action: { type: 'message', label: 'สร้างงานใหม่', text: 'เมนู' },
    },
  ],
};

async function main() {
  const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(RICH_MENU_BODY),
  });
  if (!createRes.ok) throw new Error(`create failed: ${createRes.status} ${await createRes.text()}`);
  const { richMenuId } = await createRes.json();
  console.log('Created rich menu:', richMenuId);

  const imagePath = process.argv[2];
  if (!imagePath) throw new Error('Usage: ts-node setup-line-rich-menu.ts <path-to-2500x843-png>');
  const image = readFileSync(imagePath);
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'image/png' },
    body: image,
  });
  if (!uploadRes.ok) throw new Error(`image upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  console.log('Uploaded rich menu image');

  const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!defaultRes.ok) throw new Error(`set-default failed: ${defaultRes.status} ${await defaultRes.text()}`);
  console.log('Set as default rich menu for all users');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Produce a placeholder image and run the script**

A rich menu image (2500×843 PNG) is a design asset this plan cannot generate — before running, produce (or ask a designer for) one simple image with the text "สร้างงานใหม่" on it. For local verification a solid-color placeholder PNG at that exact resolution is sufficient to prove the API wiring works; swap in a real design before production rollout.

```bash
LINE_CHANNEL_ACCESS_TOKEN=<token> npx ts-node scripts/setup-line-rich-menu.ts ./path-to-image.png
```
Expected: all three `console.log` lines print with no thrown error.

- [ ] **Step 3: Manual verification**

Open the LINE OA in a personal 1:1 chat on your phone. Expected: the rich menu image appears docked at the bottom of the chat. Tap it. Expected: the chat shows you sent "เมนู" and the bot replies with the main 3-button menu (same as Task 11 step 4's verification).

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-line-rich-menu.ts
git commit -m "feat(line): add one-time Rich Menu setup script for 1:1 entry point

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: E2E happy-path test

**Files:**
- Create: `e2e/tests/line-bot-case.spec.ts`
- Reference: `e2e/tests/pii.spec.ts` (existing pattern to match exactly)

**Interfaces:**
- Consumes: the real running API's `POST /line/webhook` endpoint, `E2E_API_URL` env var, plus a real login per the existing e2e login pattern.

- [ ] **Step 1: Read the reference test first**

```bash
cat e2e/tests/pii.spec.ts
```
Copy its exact login/setup boilerplate (the `page.request.post(`${API}/auth/login`, ...)` pattern) rather than re-deriving it.

- [ ] **Step 2: Write the test**

`e2e/tests/line-bot-case.spec.ts` — send a synthetic webhook payload simulating a linked staff user's full "create Intake" conversation, and assert on the resulting Intake via the authenticated REST API (`GET /intake?search=...`) rather than trying to intercept the outbound LINE push (which requires a real LINE account and can't be asserted in CI). Structure:

```typescript
import { test, expect } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
// A LINE userId pre-seeded (via the seed script) as already linked to a known test staff user.
const TEST_LINE_USER_ID = process.env.E2E_LINE_TEST_USER_ID ?? 'U-e2e-test-line-user';

function webhookEvent(text: string, replyToken = 'e2e-reply-token') {
  return {
    destination: 'e2e',
    events: [
      {
        type: 'message',
        replyToken,
        source: { userId: TEST_LINE_USER_ID, type: 'user' },
        message: { type: 'text', text },
      },
    ],
  };
}

test('create a case (Intake) end-to-end via the LINE webhook conversation', async ({ page, request }) => {
  const login = await request.post(`${API}/auth/login`, {
    data: { email: process.env.E2E_TEST_EMAIL, password: process.env.E2E_TEST_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = await login.json();

  const uniqueTitle = `E2E LINE Case ${Date.now()}`;

  await request.post(`${API}/line/webhook`, { data: webhookEvent('เมนู') });
  await request.post(`${API}/line/webhook`, { data: webhookEvent('สร้าง Case') });
  await request.post(`${API}/line/webhook`, { data: webhookEvent(uniqueTitle) });
  await request.post(`${API}/line/webhook`, { data: webhookEvent('ไม่มี') }); // client search miss, treated as free-text name
  await request.post(`${API}/line/webhook`, { data: webhookEvent('ข้าม') }); // skip description
  await request.post(`${API}/line/webhook`, { data: webhookEvent('ยืนยัน') });

  const intakes = await request.get(`${API}/intake?search=${encodeURIComponent(uniqueTitle)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(intakes.ok()).toBeTruthy();
  const body = await intakes.json();
  const items = body.items ?? body;
  expect(items.some((i: any) => i.title === uniqueTitle && i.referralChannel === 'LINE')).toBeTruthy();
});
```

Notes to resolve while implementing: (a) the webhook route has no signature-verification bypass for tests — check whether `LineMessagingService.verifyWebhookSignature` short-circuits when `LINE_CHANNEL_SECRET` is unset in the e2e environment (per `apps/api/.env.example`, it's optional), and if not, either set no secret in the e2e env or compute a valid HMAC signature header in the test; (b) confirm `/intake` supports a `?search=` query param matching `IntakeQueryDto` — read `apps/api/src/intake/intake.controller.ts` and `intake.service.ts:35` before finalizing (`IntakeQueryDto` at `apps/api/src/intake/dto/intake.dto.ts:249-266` currently only shows `status`/`page`/`limit` — if there's no `search` field, add one to `IntakeQueryDto`/`IntakeService.findAll` mirroring the existing `Case`/`Client` search pattern, or change the assertion to fetch by `status=RECEIVED` and filter client-side by title in the test instead); (c) seed `TEST_LINE_USER_ID` as a linked `User.lineUserId` in `apps/api/prisma/seed.ts` if no such fixture exists yet.

- [ ] **Step 3: Run it**

```bash
npx playwright test e2e/tests/line-bot-case.spec.ts
```
Expected: passes against a locally running API + seeded test user.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/line-bot-case.spec.ts apps/api/prisma/seed.ts
git commit -m "test(e2e): add end-to-end case-creation-via-LINE-webhook test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** sender/auth (Task 4, 11), trigger locations (Task 11/12), format (Tasks 3, 8-10), scope of 3 flows (Tasks 8-10), Intake-not-Case for case creation (Task 8), client/case fuzzy search (Tasks 8, 9 reusing existing `findAll`), assignee pool = all staff + pagination (Task 5, 9, 10), silent skip on unlinked assignee (Task 7's `if (assignee?.lineUserId)` guard, no branch for the false case), confirm+field-edit (Task 6 util, used in 8-10), 10-min timeout (Task 3), notifications (Task 7), unlinked-caller message (Task 11's `replyUnlinked`), `Task.caseId` nullable + `source` (Task 1), single-tenant (Global Constraints — no per-firm LINE channel code anywhere), bot name "ลอว์" (Task 11's copy).
- **Known open items intentionally left as in-task research** (flagged inline rather than guessed): exact `CaseQueryDto`/`findAll` return shape (Task 9), exact module export names for `ClientsModule`/`CasesModule`/`UsersModule` (Task 11), whether `IntakeQueryDto` needs a `search` field added (Task 13), whether `Task.caseId` schema syntax needs adjustment for any other field only visible once the file is opened (Task 1) — each is called out explicitly at its point of use, not silently assumed.
- **Router double-fire bug**: flagged explicitly inside Task 11 as a "must fix before committing" note, since the draft code has a subtle duplicate-menu-trigger risk between `route()` and `dispatch()`.
