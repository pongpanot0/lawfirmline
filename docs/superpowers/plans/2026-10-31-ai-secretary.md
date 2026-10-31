# AI Secretary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only "AI secretary" lawyers can ask (web + mobile, text or voice) about cases, documents and hearings, plus a 07:30 stuck-work brief for The Siam Barrister's owner.

**Architecture:** Deterministic, access-filtered query services (case brief, stuck work, matter search, events) do the work; a thin OpenAI tool-calling loop on gpt-4o-mini routes questions to them and phrases the answer. The morning brief computes stuck work in Prisma and makes one AI call for a headline. All in a new `apps/api/src/secretary/` module; UI on web (`AIAssistantPanel`, `/brief`) and mobile (`app/secretary.tsx`, `app/brief.tsx`).

**Tech Stack:** NestJS + Prisma (Postgres), raw `fetch` to OpenAI (chat completions with `tools`, audio transcriptions), Next.js web, Expo SDK 56 mobile (+ `expo-audio`), jest/ts-jest.

**Spec:** `docs/superpowers/specs/2026-10-31-ai-secretary-design.md` — read it before your task.

## Global Constraints

- Model: `chatModel(config)` from `apps/api/src/common/openai-model.ts` for chat; `OPENAI_TRANSCRIBE_MODEL` env, default `gpt-4o-mini-transcribe`, for audio. Raw `fetch`, key from `OPENAI_API_KEY`.
- Every OpenAI call logged to `AiRun` via `RagService.logRun` with operation `secretary_chat` | `secretary_transcribe` | `daily_brief`.
- Every data read is scoped to the asking user: `CaseAccessService.getCaseFilterForUser(user)` for cases (and everything hanging off a case), `getIntakeFilterForUser(user)` for intakes. Tools re-check access on every call; an inaccessible id behaves exactly like a non-existent one.
- Overview task list = every open task on an accessible case/intake, fields **only** `id, title, status, assigneeName, dueDate, daysStuck, daysOverdue, holdReason` — never description, comments, attachments.
- Text sent to OpenAI goes through `redactForAi` (`@lawfirm/shared`).
- Read-only: no secretary code path creates/updates/deletes records (except `DailyBrief` rows, `AiRun`, notifications, and the background `ensureCaseIndexed`).
- Answers in Thai unless the user writes in English. Never state a fact not present in tool output; missing data is said plainly (e.g. "ไม่มีข้อมูลทุนทรัพย์ในระบบ").
- Stuck task (brief): overdue, OR no movement ≥ `slaConfig.stuckTaskDays` (default **3**), OR open `TaskOnHold` with `nextFollowUpAt` < now. Ranking: tasks whose case has a `CalendarEvent` (COURT_DATE or DEADLINE) in the next 7 days first, then `max(daysStuck, daysOverdue)` desc; grouped by assignee.
- Brief: cron `30 7 * * *`, `timeZone: 'Asia/Bangkok'`; only firms whose `slug` is in env `AI_DAILY_BRIEF_FIRM_SLUGS` (comma list; prod `thesiambarristers`); recipients = firm members with role OWNER or OFFICE_MANAGER; one row per firm per Bangkok date, re-runs never re-notify; AI failure → brief still sent with the computed list.
- Credits: `AI_CREDIT_COST.SECRETARY_CHAT = 1` and `SECRETARY_TRANSCRIBE = 1` in `packages/shared/src/ai-credits.ts`, applied with `@RequireCredits` + `AiCreditsInterceptor`. Brief is not charged.
- Migrations in a worktree: never `prisma migrate dev`. Write the SQL migration by hand under `apps/api/prisma/migrations/20261031100000_daily_brief/`, run `npx prisma generate`. Rebuild `packages/shared` (`npm run build` there) after editing it.
- Tests: jest, hand-rolled Prisma mocks, `jest.spyOn(global, 'fetch')` for OpenAI (see `apps/api/src/tasks/task-ai-follow-up.spec.ts`). Run from `apps/api`: `npx jest src/secretary`.

## Review Focus

1. **Name matches several matters** ("คดีคุณสมชาย" → 3 cases): secretary must list candidates and ask, never pick one silently. → Task 4 test `asks which case when find_matters returns several`.
2. **Model passes an id the user can't access** (hallucinated or from an earlier turn of another user's history sent by a tampered client): tool returns not-found, no data. → Task 3 tests `*_rejects_inaccessible_*`.
3. **Fields empty in the data** (no claim amount, no next hearing, no intake): brief marks them null and the reply says "ไม่มีข้อมูล". → Task 2 test `returns nulls for missing fields`; Task 4 system prompt rule + test that the prompt contains the rule.
4. **OpenAI down / non-200 / timeout**: chat returns a Thai error message with HTTP 502, logs AiRun status `error`; brief still sends computed list. → Task 4 test `returns 502 on upstream failure`; Task 5 test `sends computed brief when AI fails`.
5. **Runaway tool loop**: model keeps calling tools. Hard cap 4 tool rounds, then answer with what it has. → Task 4 test `stops after 4 tool rounds`.

---

### Task 1: Stuck-work core

**Files:**
- Create: `apps/api/src/secretary/stuck.ts`, `apps/api/src/secretary/stuck.spec.ts`
- Modify: `apps/api/src/operations/operations.service.ts:56-62` (add `stuckTaskDays: 3` to `getSlaConfig` defaults)

**Interfaces:**
- Produces:
  ```ts
  export interface TaskMovementInput {
    createdAt: Date; assignedAt: Date | null; acknowledgedAt: Date | null;
    planConfirmedAt: Date | null; submittedAt: Date | null;
    assignmentLogDates: Date[]; changeAuditDates: Date[];
  }
  export function lastMovementAt(t: TaskMovementInput): Date;
  export function bangkokDaysBetween(from: Date, to: Date): number; // whole days, Asia/Bangkok calendar
  export interface StuckTaskRow {
    taskId: string; title: string; status: string;
    caseId: string | null; intakeId: string | null; matterTitle: string;
    assigneeId: string | null; assigneeName: string | null;
    dueDate: Date | null; daysStuck: number; daysOverdue: number;
    holdReason: string | null; holdFollowUpOverdue: boolean; hearingWithin7Days: boolean;
  }
  export function isStuck(r: StuckTaskRow, stuckTaskDays: number): boolean;
  export function rankStuck(rows: StuckTaskRow[]): StuckTaskRow[];
  ```

- [ ] **Step 1: Write failing tests** in `stuck.spec.ts`:
  - `lastMovementAt` returns the max over all dates, falls back to `createdAt` when all others are null/empty.
  - `bangkokDaysBetween(2026-10-30T23:00Z, 2026-10-31T01:00Z)` = 0 (same Bangkok day); 3 calendar days apart = 3.
  - `isStuck`: daysOverdue 1 → true; daysStuck 3 with threshold 3 → true; daysStuck 2 → false; `holdFollowUpOverdue` → true.
  - `rankStuck`: `hearingWithin7Days` rows first; then `max(daysStuck, daysOverdue)` desc.
- [ ] **Step 2:** `npx jest src/secretary/stuck.spec.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `stuck.ts` (pure functions, no Nest). Add `stuckTaskDays: 3` default in `getSlaConfig`.
- [ ] **Step 4:** Run tests → PASS; `npx jest src/operations` still PASS.
- [ ] **Step 5:** Commit `feat(secretary): stuck-work core`.

### Task 2: Case/intake brief service + endpoint

**Files:**
- Create: `packages/shared/src/secretary.ts` (export from `packages/shared/src/index.ts`), `apps/api/src/secretary/matter-brief.service.ts`, `apps/api/src/secretary/matter-brief.service.spec.ts`, `apps/api/src/secretary/secretary.module.ts`, `apps/api/src/secretary/secretary.controller.ts`
- Modify: `apps/api/src/app.module.ts` (import `SecretaryModule`)

**Interfaces:**
- Consumes: Task 1 (`lastMovementAt`, `bangkokDaysBetween`, `StuckTaskRow`).
- Produces (shared types):
  ```ts
  export interface MatterTaskItem { id: string; title: string; status: string; assigneeName: string | null; dueDate: string | null; daysStuck: number; daysOverdue: number; holdReason: string | null; }
  export interface MatterBrief {
    kind: 'case' | 'intake'; id: string; title: string; ownRef: string | null;
    clientName: string | null; partyRole: string | null;
    ourParties: string[]; opponents: { name: string; role: string }[]; opposingCounsel: string[];
    courtName: string | null; blackCaseNumber: string | null; redCaseNumber: string | null;
    claimedAmount: number | null;
    assessment: { decision: string | null; caseStrength: string | null; notes: string | null; estimatedDamage: number | null } | null;
    status: string | null; stage: string | null; stageChangedAt: string | null;
    recentEvents: { at: string; title: string }[];        // last 3 of CaseActivity + CaseStatusLog
    nextEvent: { id: string; at: string; title: string; type: string; courtName: string | null } | null;
    openTasks: MatterTaskItem[];                            // sorted daysOverdue desc, daysStuck desc
    leadLawyerName: string | null;
  }
  ```
- Produces (API): `MatterBriefService.getCaseBrief(user: AuthUser, caseId: string): Promise<MatterBrief | null>`, `getIntakeBrief(user: AuthUser, intakeId: string): Promise<MatterBrief | null>`; endpoint `GET /cases/:caseId/brief` (JwtAuthGuard + CaseAccessGuard) → 404 when null.
- Also exported for Task 5: `MatterBriefService.loadOpenTaskRows(where: Prisma.TaskWhereInput, now: Date): Promise<StuckTaskRow[]>` — single query (task + assignee name + case/intake title + assignment logs + `TASK_CHANGED` audit dates + open hold + whether the case has a COURT_DATE/DEADLINE event in next 7 days), mapped through Task 1 functions.

- [ ] **Step 1: Failing tests** (`matter-brief.service.spec.ts`, Prisma mocked):
  - `returns null for a case outside the user's filter` (findFirst called with `AND: [getCaseFilterForUser(user), { id }]` and returns null).
  - `maps parties by side` — OURS → `ourParties`, OPPONENT → `opponents`, `opposingLawyer`/OPPOSING_LAWYER role → `opposingCounsel`.
  - `includes intake assessment via Case.intakeId`.
  - `open tasks include every open task on the case, without description` — assert task query `where` has `caseId` and `status: { not: 'DONE' }` and no per-user task filter; assert returned items have exactly the `MatterTaskItem` keys.
  - `returns nulls for missing fields` (no claim, no events, no intake → `claimedAmount: null`, `nextEvent: null`, `assessment: null`).
  - `nextEvent is the earliest CalendarEvent with startAt >= now`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement shared types (rebuild `packages/shared`), service, module (providers: `MatterBriefService`, `CaseAccessService`; import `PrismaModule` as other modules do), controller route.
- [ ] **Step 4:** `npx jest src/secretary` → PASS; `npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | grep secretary` → empty.
- [ ] **Step 5:** Commit `feat(secretary): case/intake brief`.

### Task 3: Secretary tools

**Files:**
- Create: `apps/api/src/secretary/secretary-tools.service.ts`, `apps/api/src/secretary/secretary-tools.service.spec.ts`
- Modify: `apps/api/src/secretary/secretary.module.ts` (import `RagModule` via `forwardRef` if needed)

**Interfaces:**
- Consumes: Task 2 `MatterBriefService`; `RagService.searchDocumentsByContent(user, q)`, `RagService.retrieve(caseId, firmId, query, documentIds?, userId?)`, `RagService.ensureCaseIndexed(caseId, firmId)`.
- Produces:
  ```ts
  export type SecretaryCard =
    | { type: 'case'; id: string; title: string; ownRef: string | null }
    | { type: 'intake'; id: string; title: string }
    | { type: 'document'; id: string; caseId: string | null; filename: string }
    | { type: 'event'; id: string; caseId: string; title: string; startAt: string };
  // (put SecretaryCard in packages/shared/src/secretary.ts)
  export interface ToolResult { content: unknown; cards: SecretaryCard[] }
  class SecretaryToolsService {
    definitions(): OpenAiToolDef[];   // JSON schemas for the 5 tools below
    run(user: AuthUser, name: string, args: unknown): Promise<ToolResult>;  // unknown name / bad args → { content: { error } }
  }
  ```
  Tools: `find_matters({ query })` — cases (title/ownRef/clientName/customerRef/black/red numbers, participant names, `contains` insensitive) + intakes (title/client name), max 8 total, each with stage; `case_overview({ caseId? , intakeId? })` → `MatterBrief`; `search_documents({ query, caseId? })` → content search + filename `contains` match over accessible cases, max 10; `read_document({ documentId, question })` → retrieve top chunks for that doc; if the doc has no chunks: fire-and-forget `ensureCaseIndexed` and return `{ notIndexed: true }`; `list_events({ from, to, caseId?, mineOnly? })` → `CalendarEvent` on accessible cases in range (max 50), `mineOnly` = assignee or co-assignee is user.

- [ ] **Step 1: Failing tests:**
  - `find_matters searches only accessible cases and intakes` (assert both filters are in the `where`).
  - `case_overview_rejects_inaccessible_case` → `{ content: { error: 'not_found' }, cards: [] }`.
  - `read_document_rejects_inaccessible_document` (document whose case is outside filter → not_found).
  - `read_document on unindexed doc returns notIndexed and triggers indexing`.
  - `list_events_rejects_inaccessible_case` and `list_events mineOnly filters by assignee or co-assignee`.
  - `unknown tool returns error content`.
  - Every result's `content` is passed through `redactForAi` when serialized (assert a phone number in a participant name comes out redacted).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(secretary): read-only tools`.

### Task 4: Secretary chat + transcribe endpoints

**Files:**
- Create: `apps/api/src/secretary/secretary-chat.service.ts`, `apps/api/src/secretary/secretary-chat.service.spec.ts`, `apps/api/src/secretary/dto/secretary-chat.dto.ts`
- Modify: `apps/api/src/secretary/secretary.controller.ts`, `packages/shared/src/ai-credits.ts`

**Interfaces:**
- Consumes: Task 3 `SecretaryToolsService`.
- Produces: `POST /ai/secretary` body `{ messages: { role: 'user' | 'assistant'; content: string }[] }` (1–20 items, each ≤ 4000 chars, last must be `user`; server keeps the last 10) → `{ reply: string; cards: SecretaryCard[] }`. `POST /ai/secretary/transcribe` multipart field `audio` (≤ 10 MB, audio/* only) → `{ text: string }`. Both JwtAuthGuard + `@RequireCredits` + `AiCreditsInterceptor`.
  `SecretaryChatService.chat(user, messages): Promise<{ reply; cards }>`, `transcribe(user, file: Express.Multer.File): Promise<{ text }>`.

- [ ] **Step 1: Failing tests** (fetch spied):
  - `sends tools and the system prompt` — request body has `tools` with the 5 names, `tool_choice: 'auto'`, model from `chatModel`, system prompt contains the rules "ตอบจากข้อมูลที่เครื่องมือส่งกลับเท่านั้น", "ถ้าไม่มีข้อมูลให้บอกว่าไม่มีข้อมูล", "อ่านอย่างเดียว", today's Bangkok date, and the user's name.
  - `executes tool calls and feeds results back` — first response has `tool_calls` for `find_matters`, second is final text; `run` called with parsed args; cards from tool results are returned (deduped by type+id).
  - `asks which case when find_matters returns several` — system prompt contains the instruction to list candidates and ask when more than one matter matches (assert string present).
  - `stops after 4 tool rounds` — fetch always returns tool_calls; 5th request sent with `tool_choice: 'none'`; result is its text.
  - `returns 502 on upstream failure` — non-200 → throws `BadGatewayException` with Thai message; `logRun` called with status `error`.
  - `logs secretary_chat with summed tokens`.
  - `transcribe posts multipart to /v1/audio/transcriptions with language th` and logs `secretary_transcribe`; non-audio mimetype → `BadRequestException`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (add credit constants, rebuild shared). **Step 4:** `npx jest src/secretary` → PASS.
- [ ] **Step 5:** Commit `feat(secretary): chat and voice transcription endpoints`.

### Task 5: Daily brief (model, job, endpoints)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `DailyBrief`; `NotificationCategory` + `DAILY_BRIEF`; back-relation on `Firm`)
- Create: `apps/api/prisma/migrations/20261031100000_daily_brief/migration.sql`, `apps/api/src/secretary/daily-brief.service.ts`, `apps/api/src/secretary/daily-brief.scheduler.ts`, `apps/api/src/secretary/daily-brief.service.spec.ts`
- Modify: `apps/api/src/secretary/secretary.module.ts`, `secretary.controller.ts`, `packages/shared/src/secretary.ts`

**Interfaces:**
- Consumes: Task 1 `isStuck`, `rankStuck`; Task 2 `MatterBriefService.loadOpenTaskRows`; `AssignmentNotifierService.notifyFirmOwners({ firmId, roles: [OWNER, OFFICE_MANAGER], actorUserId: '', category: DAILY_BRIEF, summaryText, path: '/brief', appPath: '/brief' })` (if it does not also push, call `PushService.sendToUsers` for the same users with `data: { url: '/brief' }`).
- Produces:
  ```prisma
  model DailyBrief {
    id String @id @default(cuid())
    firmId String
    firm Firm @relation(fields: [firmId], references: [id], onDelete: Cascade)
    date String            // 'YYYY-MM-DD' Bangkok
    summary String?        // AI headline; null when AI failed
    data Json              // DailyBriefData
    model String?
    createdAt DateTime @default(now())
    @@unique([firmId, date])
  }
  ```
  Shared: `DailyBriefData { generatedAt: string; stuckTaskDays: number; totals: { stuckTasks: number; overdueTasks: number; people: number }; groups: { assigneeId: string | null; assigneeName: string; items: StuckItem[] }[]; stuckCases: { caseId: string; title: string; stage: string | null; daysSinceStageChange: number }[] }` where `StuckItem` = `MatterTaskItem & { caseId: string | null; intakeId: string | null; matterTitle: string; hearingWithin7Days: boolean }`.
  `DailyBriefService.generateForFirm(firmId: string, now: Date): Promise<'created' | 'exists'>`, `runAll(now)`, `get(user, date?)`, `listDates(user)` (last 30). Endpoints `GET /ai/daily-brief?date=YYYY-MM-DD` (latest when omitted; 404 when none) and `GET /ai/daily-brief/dates`, both requiring `@RequireCapability('viewAllCases')` via `FirmRoleGuard`. Scheduler `@Cron('30 7 * * *', { timeZone: 'Asia/Bangkok' })` → `runAll(new Date())`, errors per firm logged, not thrown.

- [ ] **Step 1: Failing tests:**
  - `runAll only processes firms in AI_DAILY_BRIEF_FIRM_SLUGS` (env `thesiambarristers,other`; firm findMany `where.slug.in` matches; empty env → no work).
  - `generateForFirm returns exists and does not notify when the row for today exists` (unique-violation P2002 on create also → `exists`, no notify).
  - `selects stuck tasks with firm threshold` (slaConfig `{ stuckTaskDays: 5 }` respected; default 3).
  - `groups by assignee, worst first` (uses `rankStuck`; unassigned group named "ยังไม่มีผู้รับผิดชอบ").
  - `includes stuck cases past stuckStatusDays`.
  - `sends computed brief when AI fails` — fetch rejects → row saved with `summary: null`, notifier still called.
  - `AI input contains only counts, names and titles (redacted)` — assert request body passes through `redactForAi`.
  - `get rejects other firms' briefs` (query scoped by `user.firmId`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Schema + hand-written SQL migration (CREATE TABLE, unique index, FK, `ALTER TYPE "NotificationCategory" ADD VALUE 'DAILY_BRIEF'`), `npx prisma generate`, implement service/scheduler/endpoints.
- [ ] **Step 4:** `npx jest src/secretary src/notifications` → PASS; tsc clean for `secretary`.
- [ ] **Step 5:** Commit `feat(secretary): daily stuck-work brief`.

### Task 6: Web UI

**Files:**
- Create: `apps/web/src/components/ai/SecretaryChat.tsx`, `apps/web/src/components/cases/CaseBriefCard.tsx`, `apps/web/src/app/(dashboard)/brief/page.tsx`
- Modify: `apps/web/src/lib/api.ts` (add `secretaryChat`, `getCaseBrief`, `getDailyBrief(date?)`, `getDailyBriefDates`), `apps/web/src/components/ai/AIAssistantPanel.tsx`, `apps/web/src/components/layout/AppShell.tsx:47`, `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`, the sidebar nav file (add "สรุปประจำวัน" for viewAllCases roles)

**Interfaces:** Consumes Task 2/4/5 endpoints and shared types.

- [ ] **Step 1:** `SecretaryChat`: message list, input, send → `secretaryChat`, renders `reply` + cards as links (`/cases/:id`, `/intake/:id`, document opens existing document viewer route, event → `/calendar?event=`); keeps history in component state (last 10 sent). Loading and Thai error states; disabled send while pending.
- [ ] **Step 2:** `AIAssistantPanel`: with no `caseId`/`intakeId` render `SecretaryChat`; with a case, add a tab "เลขา" beside the existing case chat. `AppShell`: show the button on `/dashboard` too.
- [ ] **Step 3:** `CaseBriefCard` at the top of the case page (no AI; shows all `MatterBrief` fields, "ไม่มีข้อมูล" for nulls, open-tasks table with days stuck/overdue highlighted ≥ 3 / > 0).
- [ ] **Step 4:** `/brief` page: date select from `getDailyBriefDates`, headline, totals, groups → rows link to `/tasks/:id`; empty state "ยังไม่มีสรุปสำหรับวันนี้"; 403/404 handled.
- [ ] **Step 5:** `cd apps/web && npx tsc --noEmit && npm run lint` → clean for touched files. Verify in the browser preview (case page card, chat on dashboard with mocked/real API).
- [ ] **Step 6:** Commit `feat(web): AI secretary chat, case brief card, daily brief page`.

### Task 7: Mobile UI

**Files:**
- Create: `apps/mobile/app/secretary.tsx`, `apps/mobile/app/brief.tsx`, `apps/mobile/src/components/CaseBriefCard.tsx`
- Modify: `apps/mobile/package.json` (`npx expo install expo-audio`), `apps/mobile/app.json`/`app.config` (mic permission text "ใช้ไมโครโฟนเพื่อสั่งงานเลขาด้วยเสียง"), `apps/mobile/src/api/hooks.ts` (+ `useSecretaryChat`, `useTranscribe`, `useCaseBrief`, `useDailyBrief`, `useDailyBriefDates`), `apps/mobile/app/(tabs)/index.tsx` (large "เลขา" entry; "สรุปประจำวัน" entry for owner roles), `apps/mobile/app/case/[id].tsx` (brief card)

**Interfaces:** Consumes Task 2/4/5 endpoints; notification `appPath: '/brief'` already routes via `notifications.tsx`.

- [ ] **Step 1:** `secretary.tsx`: chat list + input; big hold-to-talk / tap-to-record mic (`expo-audio` `useAudioRecorder`, `RecordingPresets.HIGH_QUALITY`), on stop upload via multipart to `/ai/secretary/transcribe`, put text into the input and send automatically; cards tap to `/case/:id`, `/intake/:id`, `/event/:id`; permission-denied message.
- [ ] **Step 2:** `CaseBriefCard` on case detail (same fields as web).
- [ ] **Step 3:** `brief.tsx`: today + date chips (last 30), groups, tap row → `/task/:id`.
- [ ] **Step 4:** `cd apps/mobile && npx tsc --noEmit` → clean. Commit `feat(mobile): AI secretary with voice, case brief, daily brief`.

### Task 8: Final verification

- [ ] `cd apps/api && npx jest` (full) — compare failures with `main` baseline; only pre-existing failures allowed.
- [ ] `npx tsc --noEmit` in api/web/mobile — no new errors.
- [ ] Apply the migration to the local DB (psql + `npx prisma migrate resolve --applied 20261031100000_daily_brief`), start api, hit `GET /cases/:id/brief` and `POST /ai/secretary` with a seeded user; run `DailyBriefService.runAll` once for `thesiambarristers` and check the row + notification.
- [ ] Write `.claude/completions/2026-10-31-ai-secretary.md` (what shipped, env `AI_DAILY_BRIEF_FIRM_SLUGS=thesiambarristers` and `OPENAI_TRANSCRIBE_MODEL` for prod, migration before deploy, mobile needs a new build for `expo-audio`).
