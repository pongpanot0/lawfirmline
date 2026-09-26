# Multi-assignee Appointments + On-leave Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let an appointment (CalendarEvent) have several assignees, and show when a person being assigned (to an event or a task) is on leave that day.

**Architecture:** A new join table `CalendarEventAssignee` holds every person on an event. `CalendarEvent.assigneeId` stays as the primary person (the first one) for the single-owner acknowledgement flow. One shared API helper supplies both the "people on this event" list and the Prisma where-clause, and every reader uses it. The web side has a pure helper that maps leave rows to a per-user flag for a date; every picker renders from it.

**Tech Stack:** NestJS + Prisma (apps/api), Next.js (apps/web), Expo (apps/mobile).

**Spec:** `docs/superpowers/specs/2026-09-26-multi-assignee-events-leave-flag-design.md`

## Global Constraints
- Every query is scoped by `user.firmId`. An assignee must be a firm member (`firmMember` row for that firmId); a non-member is rejected with BadRequest `'ผู้รับผิดชอบต้องเป็นสมาชิกในสำนักงาน'`.
- `assigneeIds`: optional, `@IsArray @ArrayMaxSize(10) @ArrayUnique @IsUUID('all', {each:true})`.
- The people on an event are its assignee rows if any exist, else `case.leadLawyerId`.
- The leave flag is a warning, never a block. Label for APPROVED: `ลา` plus the Thai type (ลาป่วย / ลากิจ / ลาพักร้อน). Label for PENDING: `ขอลา (รออนุมัติ)`. Warning line: `⚠ {ชื่อ} ลาวันที่ {d/M/yyyy พ.ศ.}`.
- Never run prisma migrate dev/deploy/reset or write to the shared DB. Generate the migration with `prisma migrate diff` between the old and new schema files.
- Tests: api `cd apps/api && npx jest --config jest.config.js <path>`. Web pure tests: `cd apps/web && node --test --experimental-strip-types src/lib/<file>.test.ts`. Typecheck api, web and mobile.
- Never use git stash. Never commit apps/web/tsconfig.tsbuildinfo. Stage files by explicit path. Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Schema, migration, and the shared event-people helper

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260926200000_calendar_event_assignees/migration.sql`
- Create: `apps/api/src/calendar/event-people.ts`, `apps/api/src/calendar/event-people.spec.ts`

**Produces:**
```prisma
model CalendarEventAssignee {
  eventId   String
  userId    String
  createdAt DateTime @default(now())
  event CalendarEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User          @relation("EventCoAssignee", fields: [userId], references: [id], onDelete: Cascade)
  @@id([eventId, userId])
  @@index([userId])
}
// CalendarEvent: + assignees CalendarEventAssignee[]
// User: + eventAssignments CalendarEventAssignee[] @relation("EventCoAssignee")
```
```ts
// event-people.ts
export const eventAssigneesInclude: { assignees: { select: { userId: true; user: { select: { id: true; firstName: true; lastName: true } } }; orderBy: { createdAt: 'asc' } } };
export function eventPeopleIds(e: { assignees?: { userId: string }[] | null; case?: { leadLawyerId: string | null } | null }): string[]; // rows' userIds, else [leadLawyerId] if set, else []
export function eventForUserWhere(userId: string): Prisma.CalendarEventWhereInput; // { OR: [{ assignees: { some: { userId } } }, { assignees: { none: {} }, case: { leadLawyerId: userId } }] }
```

- [ ] Save the old schema to the scratch dir, edit the schema, then run `npx prisma format && npx prisma validate`. Keep the formatting churn minimal: only the new model and relation lines should change. If `prisma format` realigns unrelated models, revert those hunks.
- [ ] Generate the migration with `npx prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script`. Append this backfill: `INSERT INTO "CalendarEventAssignee" ("eventId","userId") SELECT "id","assigneeId" FROM "CalendarEvent" WHERE "assigneeId" IS NOT NULL ON CONFLICT DO NOTHING;`. Then run `npx prisma generate`.
- [ ] TDD `event-people.spec.ts`:
  - rows win over the lead lawyer
  - no rows returns `[leadLawyerId]`
  - no rows and no lead returns `[]`
  - `eventForUserWhere` returns the exact object above
- [ ] Implement and run the spec, then `tsc`. Commit `feat(calendar): event assignee join table and people helper`.

### Task 2: Event create/update take `assigneeIds`

**Files:** `apps/api/src/calendar/dto/calendar.dto.ts`, `calendar.service.ts` (createInternal ~L105-159, updateInternal ~L194-207, eventInclude ~L42), `calendar.service.spec.ts`, `calendar/court-day.service.ts` (~L282 next-hearing copy), `intelligence/date-suggestions.service.ts` (~L48-69, pass `assigneeIds: [overrides.assigneeId]`).

**Produces:** `CreateEventDto.assigneeIds?: string[]` and `UpdateEventDto.assigneeIds?: string[]`, with the legacy `assigneeId?` kept. The internal method `resolveAssigneeIds(firmId, dto): Promise<string[] | undefined>` returns undefined when neither field is sent, and throws BadRequest for a non-member. Event responses include `assignees: { userId, user: {id, firstName, lastName} }[]` via `eventAssigneesInclude`.

Rules:
- **Create:** ids = `resolveAssigneeIds` ?? []. Set `assigneeId = ids[0] ?? null`, and create the rows (`assignees: { create: ids.map(userId => ({ userId })) }`) in the same create or transaction.
- **Update:** if `resolveAssigneeIds` returns an array, run one transaction that does `deleteMany({ where: { eventId } })`, recreates the rows in order, and sets `assigneeId = ids[0] ?? null`. Otherwise leave assignees untouched. Strip `assigneeIds`/`assigneeId` from the `...dto` spread.
- **Court-day next hearing:** copy every assignee row of the current event, and set `assigneeId` to the current event's assigneeId.

- [ ] TDD specs:
  - create with 2 ids creates 2 rows and sets `assigneeId` to the first
  - legacy `assigneeId` becomes 1 row
  - a non-member id throws BadRequest
  - update with `[]` clears the rows and sets `assigneeId` to null
  - update without the field leaves assignees untouched
- [ ] Implement, run the calendar, intelligence and court-day specs plus tsc, and commit `feat(calendar): events accept several assignees`.

### Task 3: Readers use every assignee

**Files:**
- `agenda/agenda.service.ts` (fetchEvents ~L162-168, row mapper ~L247-248, `EventRow` ~L57): visibility uses `eventForUserWhere`, the row gains `assignees: {id, name}[]`, and `assigneeId`/`assigneeName` stay as the primary person.
- `dashboard/dashboard.service.ts` ~L266-292: count a hearing for **each** id in `eventPeopleIds`.
- `notifications/line-link.service.ts` ~L167 `getLineUserIdsForEvent`: takes the event with assignees and returns the LINE ids of every person in `eventPeopleIds`. `notifications/reminder.scheduler.ts` ~L73-83: pushes to all of them, includes `eventAssigneesInclude` in its query, and dedupes.
- `billing/time-suggestions.service.ts` ~L55: use `eventForUserWhere(userId)`.
- `leave/leave.service.ts` `findCourtConflicts` ~L51-58: use `eventForUserWhere(userId)`.
- Update the matching specs: `agenda.service.spec.ts`, `dashboard.service.spec.ts`, `reminder.scheduler.spec.ts`, `line-link.recipients.spec.ts`, `time-suggestions.service.spec.ts`, `leave.service.spec.ts`.

- [ ] For each reader: first a failing spec for the 2-assignee case (both people see or count or receive it), then the change. Keep the lead-lawyer fallback behaviour covered.
- [ ] Run all the named specs plus tsc. Commit `feat(calendar): agenda, workload, reminders, time and leave conflicts see every assignee`.

### Task 4: Web leave-flag helper and multi-assignee event dialog

**Files:**
- Create: `apps/web/src/lib/leave-flags.ts`, `apps/web/src/lib/leave-flags.test.ts`, `apps/web/src/lib/use-leave-flags.ts`
- Modify: `apps/web/src/lib/api.ts` (`CalendarEventItem` gains `assignees?: {userId; user:{id,firstName,lastName}}[]`; create/update payloads take `assigneeIds?: string[]`), `components/calendar/CalendarEventDialog.tsx` (~L296-306 select → checkbox list, form init ~L373/L387, submit ~L97, name lookup ~L167), `components/calendar/CalendarWorkspace.tsx` and `components/cases/CaseCalendarPanel.tsx` (they pass the users and date through), `components/calendar/FirmDayAgenda.tsx` (~L70-126: clash detection per assignee, using the event's assignees or falling back to the lead lawyer).

**Produces:**
```ts
// leave-flags.ts (pure)
export type LeaveFlag = { userId: string; kind: 'ON_LEAVE' | 'PENDING'; label: string };
export function leaveFlagsForDate(leaves: Pick<LeaveItem,'userId'|'status'|'type'|'startDate'|'endDate'>[], date: string /* YYYY-MM-DD */): Map<string, LeaveFlag>;
// APPROVED covering date → ON_LEAVE, label 'ลา' + ' · ' + typeTh; PENDING covering → PENDING 'ขอลา (รออนุมัติ)'; APPROVED wins over PENDING; REJECTED ignored; compare on startDate.slice(0,10) <= date <= endDate.slice(0,10)
export function leaveWarning(name: string, date: string): string; // `⚠ ${name} ลาวันที่ ${Thai d/M/yyyy BE}`
// use-leave-flags.ts (client hook)
export function useLeaveFlags(token: string | null, date: string | null): Map<string, LeaveFlag>; // getLeaves(token, date, date), try/catch → empty map; refetch when date changes
```
Dialog behaviour:
- A checkbox list of users. The first checked user is the primary and gets the badge `หลัก`; the order follows click order.
- A flagged user shows a warning or muted badge with the flag label.
- For each selected flagged user, a warning line appears under the list.
- Selecting nobody means the case's lead lawyer is used; show the existing `assigneeLead` copy as a hint.
- Submit sends `assigneeIds`.
- Editing reads `event.assignees`, falling back to `[event.assigneeId]`.

- [ ] TDD `leave-flags.test.ts`:
  - approved covering the date
  - pending
  - rejected ignored
  - date outside the range
  - approved beats pending for the same user
  - Thai BE date in `leaveWarning` (e.g. 2026-10-03 → `3/10/2569`)
- [ ] Implement the helper, hook and dialog changes, then FirmDayAgenda. Run `npx tsc --noEmit` and the web node tests. Commit `feat(web): appointments take several people and flag who is on leave`.

### Task 5: Leave flag in web task pickers

**Files:** `components/cases/CaseTasksPanel.tsx` (~L143, L211, L250), `components/tasks/TaskDetailDrawer.tsx` (~L294, L420), `app/(dashboard)/todos/page.tsx` (~L370, L399, L491), `components/cases/StageTasksDialog.tsx` (~L76), `components/intake/IntakeTasksPanel.tsx` (~L126), `app/(dashboard)/cases/[id]/page.tsx` (~L698 quick task).

**Consumes:** `useLeaveFlags(token, date)` and `leaveWarning` from Task 4.

Behaviour:
- In each `<select>`, the option text for a flagged user becomes `${name} — ${flag.label}`.
- When the selected user is flagged, render the warning line (`text-amber-700 text-xs`) under the select.
- The date is the task's due date (`YYYY-MM-DD`) if set, otherwise today in Bangkok. StageTasksDialog uses each row's own dueDate, so compute the flags for the dates it needs; fetch the whole range once with `getLeaves(min, max)` and call `leaveFlagsForDate` per row.
- To avoid duplicating the option markup, add a tiny component `components/ui/AssigneeOptions.tsx` (`{ users, flags }` → `<option>`s) and use it in every picker.

- [ ] Implement, run `npx tsc --noEmit`, and commit `feat(web): task assignee pickers show who is on leave`.

### Task 6: Mobile reassign sheet leave flag

**Files:** `apps/mobile/src/components/ReassignSheet.tsx`, `apps/mobile/src/api/hooks.ts` (add `useLeaves(from, to)` → `/leaves?from&to`, query key `['leaves', from, to]`), `apps/mobile/src/api/types.ts`.

Behaviour:
- Each person row shows a small tag with the flag label, computed with the same rules as Task 4 for the task's due date or today. Port `leaveFlagsForDate` into the mobile lib; no cross-app imports exist.
- Selecting a flagged person shows the warning text above the confirm button.

- [ ] Implement, run `cd apps/mobile && npx tsc --noEmit`, and commit `feat(mobile): reassign sheet shows who is on leave`.
