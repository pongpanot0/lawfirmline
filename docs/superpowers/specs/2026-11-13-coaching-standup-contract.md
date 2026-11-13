# Coaching + daily standup — contract

Approved mockups: `docs/superpowers/specs/coaching-mockups/` (01–10 PNG + HTML, README). They are the 1:1 visual target.

## Rules (non-negotiable)
- AI runs ONLY from the manager's button press (`POST /coaching/draft`). It saves nothing. A note is saved only by `POST /coaching` after the manager confirms.
- AI input is redacted the same way `secretary/daily-brief.service.ts` and `intelligence/document-intelligence.service.ts` do (no client/party names leave the firm), and usage is recorded via `rag/ai-usage.service.ts` like other AI calls.
- Standup pre-fill uses real data only, no AI.
- Every endpoint is firm-scoped; any task id in a body goes through `assertFirmRefs` (common/firm-refs.ts) and, for standups, must be a task assigned to the caller.
- "Manager" = firm capability `runOperations` (same as the radar).

## Data (apps/api/prisma/schema.prisma + one migration)
```prisma
enum StandupStatus { CHECKED_IN SKIPPED }

model DailyStandup {
  id               String        @id @default(uuid())
  firmId           String
  userId           String
  day              DateTime      @db.Date   // Bangkok calendar day
  status           StandupStatus
  yesterdayTaskIds String[]      @default([])
  yesterdayNote    String?       @db.Text
  todayTaskIds     String[]      @default([])
  todayNote        String?       @db.Text
  blocker          String?       @db.Text   // null/empty = "ไม่มี ทุกอย่างโอเค"
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  firm Firm @relation(fields: [firmId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([firmId, userId, day])
  @@index([firmId, day])
}

/// One row per user per Bangkok day so the morning prompt is sent once.
model StandupPromptLog {
  id     String   @id @default(uuid())
  userId String
  day    DateTime @db.Date
  @@unique([userId, day])
}

model CoachingNote {
  id             String    @id @default(uuid())
  firmId         String
  userId         String    // who receives it
  authorId       String    // manager who sent it
  praise         String    @db.Text
  improve        String    @db.Text
  nextStep       String    @db.Text
  linkedTaskIds  String[]  @default([])
  aiDrafted      Boolean   @default(false)
  acknowledgedAt DateTime?
  reply          String?   // one line, max 280
  createdAt      DateTime  @default(now())
  firm   Firm @relation(fields: [firmId], references: [id], onDelete: Cascade)
  user   User @relation("CoachingNoteRecipient", fields: [userId], references: [id], onDelete: Cascade)
  author User @relation("CoachingNoteAuthor", fields: [authorId], references: [id])
  @@index([firmId, userId, createdAt])
  @@index([firmId, acknowledgedAt])
}
```
`NotificationCategory` gains `COACHING` and `STANDUP`.

## Who must check in
`standupRequired(member, day)`: FirmRole is `LAWYER` or `SENIOR_LAWYER`, `day` is Mon–Fri (Bangkok), the user has no approved `LeaveRequest` covering `day`, and `day` is not a `PublicHoliday`. Put the pure date/role part in `packages/shared/src/standup.ts` with a unit test.

## Shared types (packages/shared/src/coaching.ts, standup.ts; export from index)
```ts
export type TaskRef = { id: string; title: string; caseRef: string | null };
export type StandupState = 'not_required' | 'on_leave' | 'not_yet' | 'checked_in' | 'skipped' | 'blocked';
export interface StandupEntry { day: string; status: 'CHECKED_IN' | 'SKIPPED'; yesterday: TaskRef[]; yesterdayNote: string | null; today: TaskRef[]; todayNote: string | null; blocker: string | null; updatedAt: string }
export interface StandupToday { day: string; required: boolean; state: StandupState; entry: StandupEntry | null; suggestions: { yesterday: TaskRef[]; today: TaskRef[] } }
export interface CoachingDraft { praise: string; improve: string; nextStep: string; linkedTasks: TaskRef[] }
export interface CoachingNoteView { id: string; user: { id: string; firstName: string; lastName: string }; author: { id: string; firstName: string; lastName: string }; praise: string; improve: string; nextStep: string; linkedTasks: TaskRef[]; aiDrafted: boolean; acknowledgedAt: string | null; reply: string | null; createdAt: string }
export interface CoachingTeamSummary { sentThisMonth: number; awaitingAck: number; notCoached30d: number }
```
`TeamRadarMember` gains `standup: StandupState` (today) and `coaching: { unacknowledged: number; lastSentAt: string | null }`.

Suggestions: `yesterday` = tasks assigned to the caller with a DAILY_UPDATE comment by them or completed on the previous working day; `today` = their open tasks due today or planned for today (reuse whatever the daily board uses for "today").

## Endpoints
Standup (any firm member; `required` false → card hidden):
- `GET  /standup/today` → `StandupToday`
- `PUT  /standup/today` body `{ yesterdayTaskIds: string[]; yesterdayNote?: string; todayTaskIds: string[]; todayNote?: string; blocker?: string }` → `StandupEntry` (upsert CHECKED_IN, editable all day)
- `POST /standup/today/skip` → `StandupEntry` (SKIPPED)
- `GET  /standup/members/:userId?days=6` (manager) → `StandupEntry[]` newest first

Coaching:
- `POST /coaching/draft` body `{ userId }` (manager, throttled) → `CoachingDraft`. Reads last 14 days of that user's DAILY_UPDATE comments and comments on their tasks, last 10 standups, and radar stats (open points vs standardPoints, overdue count, finished points/week over 8 weeks). Thai, warm, specific; 1–3 improvements naming the task; one concrete next step. Never persists.
- `POST /coaching` body `{ userId, praise, improve, nextStep, linkedTaskIds, aiDrafted }` (manager) → `CoachingNoteView`; creates Notification (category COACHING, path `/coaching/mine`, appPath null) + push.
- `GET  /coaching?userId=&status=pending|acknowledged` (manager) → `{ summary: CoachingTeamSummary; notes: CoachingNoteView[] }`
- `GET  /coaching/members/:userId` (manager) → `CoachingNoteView[]`
- `GET  /coaching/mine` → `CoachingNoteView[]`
- `POST /coaching/:id/acknowledge` body `{ reply?: string }` (recipient only) → `CoachingNoteView`

## Scheduler
`@Cron('30 8 * * 1-5', { timeZone: 'Asia/Bangkok' })`: for each firm member with `standupRequired` today, no `DailyStandup` row and no `StandupPromptLog` row → create Notification (category STANDUP, title "เช็กอินเช้านี้", path `/my-day`) + push, then write the log row. Respects `UserNotificationPreference` like other categories.

## Web (Terra)
- `/operations`: "ต้องจัดการวันนี้" + suggestion card (keep `suggestMember` logic) and the radar per mockups 01/06.
- `PersonWorkloadDrawer`: tabs ภาระงาน | เช็กอิน | คำแนะนำ (09, 02, 03).
- `/coaching` team page (04), `/coaching/mine` (05).
- `/my-day`: standup card on top (07, 08); mobile width (10).
- Fix from review: standup cue in radar rows is icon + text on one line; chip icons inline (see chipfix in mockups).
