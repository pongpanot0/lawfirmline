# AI Secretary (เลขาทนาย AI) — Design

Date: 2026-10-31 · Status: draft for approval

## Intent

Lawyers want a secretary they can *ask*, not more AI buttons. Today when a
client phones and asks "how is case A going?", the lawyer has to open the paper
file or the computer to find out. The secretary should answer in seconds, on
the phone in their hand, from data already in Samnuan. The firm owner
(เจ้าสำนัก) separately needs a morning picture of where work is stuck, with
whom, and for how many days.

The secretary **only ever talks to firm staff**. It never drafts or sends
anything to clients — the lawyer talks to the client.

## Goals

1. **Ask the secretary (web + mobile).** One chat where a lawyer types — or on
   mobile speaks — questions across all cases they can see:
   - **Case overview (priority #1):** case title, our client, who sued whom,
     opposing side and opposing counsel, court + black/red numbers, claim amount
     (ทุนทรัพย์), the intake assessment (decision FILE_SUIT/…, case strength,
     notes), current stage and when it got there, the last 2–3 events, the next
     hearing/deadline, and the **internal** layer: open tasks, each with
     assignee and how many days it has been stuck/overdue, and who to chase
     (incl. on-hold items waiting on the client or an outside party).
   - **Find documents:** "find the lease contract in the Bangkok Bank case" →
     list of matching documents with links to open them.
   - **Read/summarise a document** the lawyer picks from those results.
   - **Hearings/appointments:** "what court dates do I have this week",
     "when is the next hearing in case A".
   - Resolve a case from a client name, nickname, case title, ownRef, or
     black/red number. If several cases match, ask which one.
2. **Morning brief for the owner — The Siam Barrister only.** Every morning a
   brief of stuck work across the firm: grouped by person, worst first (longest
   stuck / closest to a court date or filing deadline). Delivered as an in-app
   push + inbox notification that opens a **brief page** (mobile and web), with
   past days viewable.
3. **Cheap.** gpt-4o-mini everywhere; deterministic queries do the heavy
   lifting; the model only routes questions and writes prose.

## Non-goals (v1)

- Anything sent to clients (drafted client updates, LINE/email to clients).
- The secretary creating or changing records. It is read-only. (Turning a voice
  note into a task/hearing is a later step; when it comes it must propose a
  draft the user confirms.)
- M365 email thread summary / reply drafts — later.
- Daily brief for firms other than The Siam Barrister.

## Anti-goals (a failure even if it "works")

- Showing a user any case, task, document or hearing they cannot already see.
- Inventing facts. If the data isn't in Samnuan the secretary says so plainly
  ("ไม่มีข้อมูลทุนทรัพย์ในระบบ") — never guesses a stage, amount or date.
- Running AI on its own except the one sanctioned job (the Siam Barrister
  morning brief). All other AI stays user-invoked (standing product rule).
- Slow: on a phone call a 20-second spinner is a failure. Target first answer
  < 6 s for a case overview.

## Constraints and decisions already made

- **Users:** firm staff only. Lawyers ask per case; owner/office manager get the
  brief. The secretary answers in Thai (English if asked in English).
- **Model:** `chatModel()` from `apps/api/src/common/openai-model.ts`
  (gpt-4o-mini by default). Raw `fetch` to OpenAI like every other call site;
  log every call to `AiRun` via the existing `logRun` pattern with new
  `operation` values (`secretary_chat`, `secretary_transcribe`, `daily_brief`).
- **Authorization:** every data lookup goes through
  `CaseAccessService.getCaseFilterForUser` (and `getIntakeFilterForUser` for
  intake data) for the *asking user*. The model never receives an id it could
  use to reach data outside that filter: tools re-check access on every call.
- **Redaction:** text sent to OpenAI passes through `redactForAi`
  (`packages/shared/src/ai-redaction.ts`) like RAG does.
- **Credits:** chat turns are charged via the existing `@RequireCredits` /
  `AiCreditsInterceptor` (new cost constant, same order as RAG_QA). The morning
  brief is not charged to the firm.
- **Morning brief scope:** enabled only for firms whose slug is listed in env
  `AI_DAILY_BRIEF_FIRM_SLUGS` (prod: `thesiambarristers`). No per-firm flag
  mechanism exists today; an env list is the smallest thing that works.
  *(my call)*
- **Brief cost:** "stuck" is computed in SQL/Prisma with no AI; one
  gpt-4o-mini call per firm per day writes a short headline paragraph on top of
  the computed list. If the AI call fails, the brief still goes out with the
  computed list only.

## How it works (decided at the level that matters)

### Secretary chat (API)

- New endpoint, e.g. `POST /ai/secretary` with `{ messages }` (short
  client-held history, capped to the last ~10 turns). Stateless server-side in
  v1 — no conversation table. *(my call)*
- OpenAI **tool calling** (`tools` / `tool_choice: auto`) with a small set of
  read-only tools, each a thin wrapper over a deterministic service method
  scoped to the user:
  - `find_cases(query)` → up to ~8 candidates (id, title, client, ownRef,
    black/red no., stage).
  - `case_overview(caseId)` → the structured overview in Goal 1.
  - `search_documents(query, caseId?)` → reuse `searchDocumentsByContent` +
    filename/title match.
  - `read_document(documentId, question?)` → reuse the RAG retrieval for that
    document/case (existing chunks) and answer from it.
  - `list_events(from, to, caseId?, mine?)` → `CalendarEvent` (+ deadlines).
- Response: assistant text **plus structured "cards"** the client renders as
  tappable links (case, document, event), so the lawyer can jump into the
  record. The text must only state facts present in tool output.
- **Case overview is also a plain endpoint** (`GET /cases/:id/brief`) returning
  the structured data with no AI, used by the overview tool and directly by
  the UI ("ภาพรวมคดี" card) — zero model cost when the lawyer is already on
  the case.

### "Stuck" definition (shared by overview and morning brief)

For each open task (status ≠ DONE): days stuck = days since its last movement,
where last movement = latest of `assignedAt`, `acknowledgedAt`,
`planConfirmedAt`, `submittedAt`, last `TaskAssignmentLog.createdAt`, last
`AuditLog TASK_CHANGED` for that task, falling back to `createdAt`. Also report
days overdue (`dueDate` past). On-hold tasks (`TaskOnHold` open) show the hold
reason and who is being waited on. Cases with no stage change for
`slaConfig.stuckStatusDays` (reuse `operations` defaults) count as stuck cases.
Builder may reuse/extract from `operations.service.ts` case-health and
`escalation.scheduler.ts` rather than re-deriving.

### Morning brief

- Cron in `Asia/Bangkok`, 07:30 *(my call — before the existing 08:00 digest)*.
- For each enabled firm: compute stuck list → one AI headline → store a
  `DailyBrief` row (firmId, date unique, computed JSON, summary text, model,
  createdAt) → inbox `Notification` + Expo push to users whose firm role has
  the `viewAllCases` capability (OWNER, OFFICE_MANAGER), `appPath` → brief page.
- Idempotent per firm per day (unique on firmId+date; re-runs don't re-notify).
- New Prisma model + migration; new `NotificationCategory` value if needed.
- Pages: mobile `app/brief.tsx` (today + date picker for past), web
  `/brief`. Each row taps through to the task/case.

### Voice (mobile)

- Mic button in the mobile secretary screen; record with `expo-audio`
  (new dependency), upload to `POST /ai/secretary/transcribe`, API calls
  OpenAI transcription (`gpt-4o-mini-transcribe`, Thai), returns text which is
  placed in the input for the user to send (or auto-send — builder's choice).
  Audio is not stored.

### UI entry points

- **Web:** the global `AIAssistantPanel` (Sparkles button, `AppShell`). With no
  case in context it opens the secretary chat; on a case page it keeps the
  existing case chat but the secretary is reachable too. Show the button on
  `/dashboard` for the secretary.
- **Mobile:** a "เลขา" entry on the home tab (large, one tap) opening
  `app/secretary.tsx` with the mic front and centre; case detail gets a
  "ภาพรวมคดี" card from `GET /cases/:id/brief`.

### Decided by the owner after builder review

- **Task visibility in the overview:** the overview's "who to chase" list shows
  **every open task on a case the user can access** (case filter, not the
  per-user task filter), but only title, assignee, status, days stuck / days
  overdue and hold reason — never task description, comments or attachments.
  Opening the task itself still goes through the normal task filter.
- **What counts as stuck in the morning brief:** a task is listed when it is
  **overdue**, or has had **no movement for ≥ 3 days**, or is **on hold past
  its `nextFollowUpAt`**. Ranking: tasks on cases with a court date / deadline
  in the next 7 days first, then by days stuck/overdue descending; grouped by
  assignee. The 3-day threshold lives in `Firm.slaConfig` (new key, default 3)
  so it can be tuned without a deploy.

### Calls settled after builder review *(my calls)*

- **Document not indexed yet** (`read_document` on a doc with no chunks): the
  secretary says it hasn't read that document yet, and the request starts
  indexing for that case in the background (existing `ensureCaseIndexed`;
  embeddings are cheap) so the next ask works. No OCR/extraction inside the
  chat turn — keeps the 6 s target.
- **Matters still at intake are in scope for finding.** `find_cases` also
  matches intakes (via `getIntakeFilterForUser`); the answer says plainly the
  matter is still at intake and gives its stage, assessment/decision,
  opposing party, estimated damage and open intake tasks. The morning brief
  covers intake tasks too (tasks with `intakeId`).

## Left to the builder

- Exact tool JSON schemas, prompt wording, and card shapes.
- How history is trimmed; streaming vs. non-streaming (non-streaming is fine
  if the 6 s target holds).
- Whether to extract shared "stuck" logic into one service or keep it in the
  brief module, as long as overview and brief agree.
- Test layout, following existing jest conventions (`fetch` spied for OpenAI,
  hand-rolled Prisma mocks). Required: access-filter tests for every tool, the
  stuck-days computation, brief idempotency and firm gating.

## Cost estimate

Chat turn ≈ 3–6k input / 400 output tokens on gpt-4o-mini ≈ $0.001. Brief:
~1 call/day ≈ $0.03/month. Transcription ≈ $0.003/min. Well inside $100/month.
