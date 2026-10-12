# Task Flow, Review Handoff & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Part T (T1–T5) of the 2026-10-11 spec: stage-scoped SOP apply with due dates and party side, a review handoff that keeps the worker as assignee, notifications on every task/review event, richer task forms, and a closing email that really sends.

**Architecture:** The review handoff stops swapping `Task.assigneeId`: the worker stays the assignee, `status = PENDING_REVIEW` plus `submittedAt` marks the hand-in, and "who must review" is one rule — `reviewerId ?? case.leadLawyerId` — shared by a Prisma `where` helper in the API (`apps/api/src/tasks/review-queue.ts`) and a pure helper in `packages/shared/src/task-review.ts` used by web and mobile. Every task/review event goes out through the existing `AssignmentNotifierService.notifyAssigned` (inbox + push + LINE, per-category preferences). SOP apply (`PracticeSetupService.applyPlaybook`) is narrowed to the current + next stage, dates each task with `DeadlineRulesService.computeDueDate`, filters steps by `side` vs `Case.partyRole`, and sends one batched notice per assignee. The closing email "อนุมัติ" calls a new `EmailService.sendClosingEmail` and stores `sentAt`/`sentTo`.

**Tech Stack:** NestJS + Prisma (Postgres) in `apps/api`, Next.js in `apps/web`, Expo in `apps/mobile`, shared TS in `packages/shared`, Jest for API/shared tests.

**Spec:** `docs/superpowers/specs/2026-10-11-litigation-and-task-flow-fixes.md` (Part T only)

**Depends on:** `docs/superpowers/plans/2026-10-11-litigation-correctness.md` (Part L) — run it first.

## Global Constraints

- Implement **Part T only** (T1–T5). Decisions in the spec are final; do not re-open them.
- Part L (`docs/superpowers/plans/2026-10-11-litigation-correctness.md`) is merged first. This plan relies on: `CASE_STAGE_ORDER` = FACT_GATHERING, PRE_LITIGATION, FILING, ANSWER, MEDIATION, HEARING, AWAITING_JUDGMENT, APPEAL, SUPREME, ENFORCEMENT, CLOSING; `PartyRole` (PLAINTIFF, DEFENDANT, PETITIONER, RESPONDENT); `DeadlineRulesService.computeDueDate(triggerDate, offset, dayBasis, holidays, adjustDays = 0): string` and `DeadlineRulesService.loadHolidays(from, spanDays, client)`.
- Prisma migrations: hand-written SQL in `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`, timestamps from `20261011150000`. Apply with `psql`, then `pnpm exec prisma migrate resolve --applied <folder>`, then `pnpm exec prisma generate`. **Never run `migrate dev` or `migrate deploy`.**
- Apply command (run from repo root): `cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/<folder>/migration.sql && pnpm exec prisma migrate resolve --applied <folder> && pnpm exec prisma generate && cd ../..`
- After editing `packages/shared`, run `pnpm --filter @lawfirm/shared build` (web/mobile/api consume `dist`).
- All new UI text in Thai; add English only where the page already reads from an EN dictionary (`apps/web/src/lib/i18n/*`, `d.todos.*`).
- Call git as `/usr/bin/git`. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- API tests: `pnpm --filter api exec jest --config jest.config.js <paths>`. Shared helpers have no runner of their own; their specs live in `apps/api/src/common/*.spec.ts` (like `firm-capabilities.spec.ts`) and import from `@lawfirm/shared` — rebuild shared first. Web lib tests: `cd apps/web && node --test --experimental-strip-types <path> && cd ../..`. Typecheck: `pnpm --filter api exec tsc --noEmit -p tsconfig.json`, `pnpm --filter web exec tsc --noEmit`, `pnpm --filter @lawfirm/mobile typecheck`. Mobile static checks: `node apps/mobile/scripts/<check>.cjs`.
- Notifications never fail the mutation that triggered them (`notifyAssigned` already swallows errors; keep calls after the DB write).
- Reviewer eligibility everywhere = firm OWNER, SENIOR_LAWYER, or the task's case lead lawyer; never OFFICE_MANAGER (unless they are the case lead — they cannot be, leads are lawyers), never the assignee.
- Handoff note: trimmed length ≥ 5 (`TASK_HANDOFF_NOTE_MIN = 5`), enforced in the API DTO/service and in web, mobile and LINE.

## Review Focus

1. **Legacy PENDING_REVIEW rows** whose assignee is still the reviewer must be repaired by the backfill and must not show up twice (once as "รอตรวจ" for the reviewer-as-assignee, once as "รอฉันตรวจ"). Test: Task 1 Step 4 SQL check + Task 4 queue test asserting the queue uses `reviewerId`/lead, not `assigneeId`.
2. **Reviewer who is not on the case** (a SENIOR_LAWYER picked as `reviewerId`) must still open the task and accept/reject it. Test: Task 3 `accept` by an explicit reviewer who is not lead.
3. **Lead lawyer who is also the assignee** with `reviewerId = null`: handoff must be refused (nobody else to review) instead of sending the work to themselves. Test: Task 3 "lead cannot hand off to self".
4. **SOP apply on a case whose stage is not in `CASE_STAGE_ORDER`** (legacy `INTAKE_REVIEW`) or is the last stage (`CLOSING`): must not crash and must not create every stage. Test: Task 8 `stagesToApply` cases.
5. **Closing email with a contact that has no email / belongs to another client, or provider not configured**: must refuse before marking the draft sent, and must not leave a half-sent draft marked unsent after some recipients succeeded. Test: Task 9 specs.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` | `Task.submittedAt`, `Task.requiresAttachment`, `Task.reviewer` relation, `TaskComment.mentionedUserIds`, `ReviewRound.dueReminderSentAt`, `ClosingEmailDraft.sentAt/sentTo` |
| `apps/api/prisma/migrations/20261011150000_task_flow_schema/` | DDL |
| `apps/api/prisma/migrations/20261011150100_review_assignee_backfill/` | Restore worker as assignee on PENDING_REVIEW tasks |
| `apps/api/prisma/migrations/20261011150200_default_playbook_step_tags/` | `side` / `requiresAttachment` on already-seeded default releases |
| `packages/shared/src/task-review.ts` (new) | `TASK_HANDOFF_NOTE_MIN`, `REVIEWER_FIRM_ROLES`, `effectiveReviewerId`, `awaitsReviewBy`, `canDelegateTask`, `visibleTaskLabels`, `taskStageChip` |
| `packages/shared/src/default-playbooks.ts` | Step `side`, `requiresAttachment`; tags on civil/criminal/family steps |
| `packages/shared/src/task-operations.ts` | `reviews` per member uses the reviewer rule |
| `apps/api/src/tasks/review-queue.ts` (new) | `reviewQueueWhere(userId)` Prisma filter |
| `apps/api/src/tasks/tasks.service.ts` | Handoff/accept/reject keep the worker, reviewer eligibility, delegation, notifications (handoff, accept, reassign, hold) |
| `apps/api/src/tasks/dto/task-handoff.dto.ts`, `dto/task.dto.ts`, `dto/task-detail.dto.ts` | Note min length, `requiresAttachment`, `mentionedUserIds` |
| `apps/api/src/tasks/task-detail.service.ts` | Daily-update blocker → lead; `@mention` notifications |
| `apps/api/src/common/services/case-access.service.ts` | Reviewer can see a standalone task under review |
| `apps/api/src/dashboard/dashboard.service.ts`, `apps/api/src/agenda/*`, `apps/api/src/operations/daily-operations.service.ts` | "รอฉันตรวจ" sections |
| `apps/api/src/notifications/line-actions.ts`, `line-conversation/line-quick-actions.service.ts`, `line-conversation/flows/line-task-review-flow.service.ts` (new), `line-conversation/line-bot-router.service.ts`, `line-conversation/line-conversation.types.ts`, `notifications.module.ts` | LINE approve/return buttons, handoff/return note follow-up |
| `apps/api/src/notifications/email.service.ts` | `sendClosingEmail` |
| `apps/web/src/lib/task-review-view.ts`, `lib/workload-label.ts`, `lib/mentions.ts`, `lib/on-hold.ts` (new, + tests) | Pure web helpers |
| `apps/web/src/components/tasks/ReviewQueueList.tsx` (new), `components/agenda/MyDayPanel.tsx`, `app/(dashboard)/playbooks/[id]/QuickFlowCanvas.tsx`, `lib/practice-setup.ts` | "รอฉันตรวจ" list, SOP step side/attachment |
| `apps/mobile/src/workflow.ts`, `apps/mobile/scripts/check-routine-workflow.cjs` | Mobile reviewer rule and its static check |
| `apps/api/src/document-review/document-review.service.ts`, `document-review.scheduler.ts` (new), `document-review.module.ts` | Round created/decided notices, due-tomorrow reminder 08:30 |
| `apps/api/src/deadlines/deadline-rules.service.ts` | Suggestion created → lead lawyer |
| `apps/api/src/practice-setup/practice-setup.service.ts`, `practice-setup/stage-scope.ts` (new) | T1 apply rules |
| `apps/api/src/closing-email/*`, `apps/api/src/notifications/email.service.ts` | T5 send |
| `apps/web/src/lib/api.ts` | Types + calls for new fields/endpoints |
| `apps/web/src/components/KanbanBoard.tsx`, `components/cases/CaseTasksPanel.tsx`, `components/tasks/TaskDetailDrawer.tsx`, `app/(dashboard)/todos/page.tsx`, `app/(dashboard)/dashboard/page.tsx`, `components/cases/CaseClosingReportPanel.tsx` | Web UI |
| `apps/mobile/app/(tabs)/tasks.tsx`, `apps/mobile/app/task/new.tsx`, `apps/mobile/src/components/TaskWorkView.tsx`, `apps/mobile/src/api/client.ts`, `apps/mobile/src/api/types.ts` | Mobile UI |

---

## Tasks

(tasks appended one at a time below)

### Task 1: Schema, migrations and the PENDING_REVIEW backfill

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `User` ~:618, `Task` :1310-1382, `TaskComment` :1400-1412, `ClosingEmailDraft` :2118-2138, `ReviewRound` :2450-2467)
- Create: `apps/api/prisma/migrations/20261011150000_task_flow_schema/migration.sql`
- Create: `apps/api/prisma/migrations/20261011150100_review_assignee_backfill/migration.sql`
- Modify: `apps/web/src/lib/api.ts` (`TaskItem` ~:722), `apps/mobile/src/api/types.ts` (task type ~:90-110)

**Interfaces:**
- Consumes: nothing.
- Produces (Prisma): `Task.submittedAt: DateTime?`, `Task.requiresAttachment: Boolean @default(false)`, `Task.reviewer: User? @relation("TaskReviewer")` (FK `reviewerId` → `User.id`, `ON DELETE SET NULL`), `User.reviewTasks Task[] @relation("TaskReviewer")`, `TaskComment.mentionedUserIds: String[] @default([])`, `ReviewRound.dueReminderSentAt: DateTime?`, `ClosingEmailDraft.sentAt: DateTime?`, `ClosingEmailDraft.sentTo: String[] @default([])`.
- Produces (client types): `TaskItem.submittedAt?: string | null`, `TaskItem.requiresAttachment?: boolean`, `TaskItem.reviewer?: TaskPerson | null` (web) and the same three on the mobile task type.

- [ ] **Step 1: Edit the Prisma schema**

In `model User`, next to `assignedTasks` / `createdTasks`, add:

```prisma
  reviewTasks                Task[]                       @relation("TaskReviewer")
```

In `model Task`, below `reviewerId String?`, add:

```prisma
  /// When the worker handed the task in for review (PENDING_REVIEW). The worker stays `assigneeId`.
  submittedAt             DateTime?
  /// Handoff is refused until at least one attachment exists.
  requiresAttachment      Boolean       @default(false)
```

and in the relation block, below `createdBy`:

```prisma
  reviewer       User?               @relation("TaskReviewer", fields: [reviewerId], references: [id], onDelete: SetNull)
```

and an index next to the others:

```prisma
  @@index([reviewerId, status])
```

In `model TaskComment`, below `kind`:

```prisma
  /// Firm members tagged with @ in this comment (same contract as CaseComment.mentionedUserIds).
  mentionedUserIds String[] @default([])
```

In `model ReviewRound`, below `dueAt`:

```prisma
  /// Set once the "due tomorrow" reminder went out, so a restart never sends it twice.
  dueReminderSentAt DateTime?
```

In `model ClosingEmailDraft`, below `approvedAt`:

```prisma
  sentAt              DateTime?
  /// Email addresses the approved draft was actually delivered to.
  sentTo              String[]                  @default([])
```

- [ ] **Step 2: Write the DDL migration**

Create `apps/api/prisma/migrations/20261011150000_task_flow_schema/migration.sql`:

```sql
-- Task: hand-in time, attachment gate, reviewer FK
ALTER TABLE "Task" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "requiresAttachment" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Task" SET "reviewerId" = NULL
  WHERE "reviewerId" IS NOT NULL AND "reviewerId" NOT IN (SELECT "id" FROM "User");
ALTER TABLE "Task" ADD CONSTRAINT "Task_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Task_reviewerId_status_idx" ON "Task"("reviewerId", "status");

-- Task comments: @mentions
ALTER TABLE "TaskComment" ADD COLUMN "mentionedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Document review: due-tomorrow reminder claim
ALTER TABLE "ReviewRound" ADD COLUMN "dueReminderSentAt" TIMESTAMP(3);

-- Closing email: delivery record
ALTER TABLE "ClosingEmailDraft" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "ClosingEmailDraft" ADD COLUMN "sentTo" TEXT[] DEFAULT ARRAY[]::TEXT[];
```

- [ ] **Step 3: Write the backfill migration**

Create `apps/api/prisma/migrations/20261011150100_review_assignee_backfill/migration.sql`:

```sql
-- Before 2026-10-11 a handoff moved assigneeId to the reviewer. Ownership now
-- stays with the worker: restore the last HANDED_OFF sender as assignee, keep
-- who it was handed to as the reviewer (standalone todos had no reviewerId),
-- and stamp submittedAt with the handoff time.
WITH last_handoff AS (
  SELECT DISTINCT ON ("taskId") "taskId", "fromUserId", "toUserId", "createdAt"
  FROM "TaskAssignmentLog"
  WHERE "action" = 'HANDED_OFF' AND "fromUserId" IS NOT NULL
  ORDER BY "taskId", "createdAt" DESC
)
UPDATE "Task" t
SET "assigneeId"  = h."fromUserId",
    "reviewerId"  = COALESCE(t."reviewerId", CASE WHEN t."caseId" IS NULL THEN h."toUserId" END),
    "submittedAt" = h."createdAt"
FROM last_handoff h
WHERE t."id" = h."taskId"
  AND t."status" = 'PENDING_REVIEW';
```

- [ ] **Step 4: Apply both migrations and verify**

Run (from repo root), once per folder in order:

```bash
cd apps/api && set -a && . ./.env && set +a \
 && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261011150000_task_flow_schema/migration.sql \
 && pnpm exec prisma migrate resolve --applied 20261011150000_task_flow_schema \
 && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261011150100_review_assignee_backfill/migration.sql \
 && pnpm exec prisma migrate resolve --applied 20261011150100_review_assignee_backfill \
 && pnpm exec prisma generate && cd ../..
```

Then check no PENDING_REVIEW task is still assigned to the person it was handed to:

```bash
cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -Atc "
SELECT count(*) FROM \"Task\" t
JOIN LATERAL (SELECT \"fromUserId\",\"toUserId\" FROM \"TaskAssignmentLog\" l
  WHERE l.\"taskId\"=t.id AND l.action='HANDED_OFF' ORDER BY l.\"createdAt\" DESC LIMIT 1) h ON true
WHERE t.status='PENDING_REVIEW' AND t.\"assigneeId\" = h.\"toUserId\" AND h.\"fromUserId\" <> h.\"toUserId\";" && cd ../..
```

Expected: `0`.

- [ ] **Step 5: Mirror the new fields in the client types**

In `apps/web/src/lib/api.ts`, inside `interface TaskItem`, below `reviewerId?: string | null;`:

```ts
  reviewer?: TaskPerson | null;
  submittedAt?: string | null;
  requiresAttachment?: boolean;
```

In `apps/mobile/src/api/types.ts`, in the task type that declares `requiresReview?: boolean;` (~:94), add the same three fields (use that file's person type, e.g. `{ id: string; firstName: string; lastName: string } | null` for `reviewer`).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter web exec tsc --noEmit && pnpm --filter @lawfirm/mobile typecheck`
Expected: no new errors (the generated client now has the fields; nothing consumes them yet).

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261011150000_task_flow_schema apps/api/prisma/migrations/20261011150100_review_assignee_backfill apps/web/src/lib/api.ts apps/mobile/src/api/types.ts
/usr/bin/git commit -m "feat(tasks): schema for review ownership, attachment gate, mentions, closing email send

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Shared review/delegation helpers and SOP step tags

**Files:**
- Create: `packages/shared/src/task-review.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './task-review';` next to `export * from './default-playbooks';` :1013)
- Modify: `packages/shared/src/default-playbooks.ts` (`DefaultPlaybookStep` :8-17; civil steps :71-95, :113; criminal; family)
- Create: `apps/api/prisma/migrations/20261011150200_default_playbook_step_tags/migration.sql`
- Test: `apps/api/src/common/task-review.spec.ts`

**Interfaces:**
- Consumes: `FirmRole`, `canAssignFirmRole`, `CASE_STAGE_LABELS_TH`, `CaseStage`, `PartyRole` (Part L adds PETITIONER/RESPONDENT) from `@lawfirm/shared`.
- Produces (all exported from `@lawfirm/shared`):
  - `TASK_HANDOFF_NOTE_MIN = 5`
  - `type PlaybookSide = 'PLAINTIFF' | 'DEFENDANT'`
  - `REVIEWER_FIRM_ROLES: FirmRole[]` = OWNER, SENIOR_LAWYER
  - `effectiveReviewerId(task: { reviewerId?: string | null; case?: { leadLawyerId?: string | null } | null }, caseLeadId?: string | null): string | null`
  - `awaitsReviewBy(task: { status: string; reviewerId?: string | null; case?: { leadLawyerId?: string | null } | null }, userId: string, caseLeadId?: string | null): boolean`
  - `isEligibleReviewer(p: { role: string | null | undefined; userId: string; caseLeadId?: string | null; assigneeId?: string | null }): boolean`
  - `canDelegateTask(assigner: FirmRole, assignee: FirmRole): boolean`
  - `partySide(partyRole: string | null | undefined): PlaybookSide | null`
  - `visibleTaskLabels(labels: string[] | null | undefined): string[]`
  - `taskStageChip(labels: string[] | null | undefined): string | null` → `"ขั้น: <stage label>"`
  - `DefaultPlaybookStep.side?: PlaybookSide`, `DefaultPlaybookStep.requiresAttachment?: boolean`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/task-review.spec.ts`:

```ts
import {
  DEFAULT_PLAYBOOKS,
  FirmRole,
  TASK_HANDOFF_NOTE_MIN,
  awaitsReviewBy,
  canDelegateTask,
  effectiveReviewerId,
  isEligibleReviewer,
  partySide,
  taskStageChip,
  visibleTaskLabels,
} from '@lawfirm/shared';

describe('task review helpers', () => {
  it('the reviewer is reviewerId, else the case lead', () => {
    expect(effectiveReviewerId({ reviewerId: 'r1', case: { leadLawyerId: 'lead' } })).toBe('r1');
    expect(effectiveReviewerId({ reviewerId: null, case: { leadLawyerId: 'lead' } })).toBe('lead');
    expect(effectiveReviewerId({ reviewerId: null }, 'lead-from-page')).toBe('lead-from-page');
    expect(effectiveReviewerId({ reviewerId: null, case: null })).toBeNull();
  });

  it('awaits review only while PENDING_REVIEW and only for the reviewer', () => {
    const task = { status: 'PENDING_REVIEW', reviewerId: null, case: { leadLawyerId: 'lead' } };
    expect(awaitsReviewBy(task, 'lead')).toBe(true);
    expect(awaitsReviewBy(task, 'worker')).toBe(false);
    expect(awaitsReviewBy({ ...task, status: 'IN_PROGRESS' }, 'lead')).toBe(false);
  });

  it('eligible reviewers: owner, senior, case lead — never office manager, never the assignee', () => {
    expect(isEligibleReviewer({ role: FirmRole.OWNER, userId: 'o' })).toBe(true);
    expect(isEligibleReviewer({ role: FirmRole.SENIOR_LAWYER, userId: 's' })).toBe(true);
    expect(isEligibleReviewer({ role: FirmRole.LAWYER, userId: 'lead', caseLeadId: 'lead' })).toBe(true);
    expect(isEligibleReviewer({ role: FirmRole.LAWYER, userId: 'l' })).toBe(false);
    expect(isEligibleReviewer({ role: FirmRole.OFFICE_MANAGER, userId: 'om' })).toBe(false);
    expect(isEligibleReviewer({ role: FirmRole.SENIOR_LAWYER, userId: 's', assigneeId: 's' })).toBe(false);
  });

  it('a lawyer may delegate to an assistant or the office manager; nothing else changes', () => {
    expect(canDelegateTask(FirmRole.LAWYER, FirmRole.ASSISTANT)).toBe(true);
    expect(canDelegateTask(FirmRole.LAWYER, FirmRole.OFFICE_MANAGER)).toBe(true);
    expect(canDelegateTask(FirmRole.LAWYER, FirmRole.LAWYER)).toBe(false);
    expect(canDelegateTask(FirmRole.LAWYER, FirmRole.SENIOR_LAWYER)).toBe(false);
    expect(canDelegateTask(FirmRole.SENIOR_LAWYER, FirmRole.LAWYER)).toBe(true);
    expect(canDelegateTask(FirmRole.ASSISTANT, FirmRole.ASSISTANT)).toBe(false);
  });

  it('maps party roles to a playbook side', () => {
    expect(partySide('PLAINTIFF')).toBe('PLAINTIFF');
    expect(partySide('PETITIONER')).toBe('PLAINTIFF');
    expect(partySide('DEFENDANT')).toBe('DEFENDANT');
    expect(partySide('RESPONDENT')).toBe('DEFENDANT');
    expect(partySide(null)).toBeNull();
  });

  it('hides internal labels and shows a readable stage chip', () => {
    const labels = ['stage:FILING', 'playbook:abc', 'ด่วน'];
    expect(visibleTaskLabels(labels)).toEqual(['ด่วน']);
    expect(taskStageChip(labels)).toBe('ขั้น: ยื่นฟ้อง');
    expect(taskStageChip(['ด่วน'])).toBeNull();
    expect(taskStageChip(['stage:NOPE'])).toBeNull();
  });

  it('exposes the handoff note minimum', () => {
    expect(TASK_HANDOFF_NOTE_MIN).toBe(5);
  });
});

describe('default playbook tags', () => {
  const civil = DEFAULT_PLAYBOOKS.find((p) => p.key === 'DEFAULT_CIVIL')!;
  const step = (title: string) => civil.steps.find((s) => s.title === title)!;

  it('tags the civil answer/default-judgment steps by side', () => {
    expect(step('ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)').side).toBe('DEFENDANT');
    expect(step('ขอให้ศาลพิพากษาโดยขาดนัดยื่นคำให้การ (ฝ่ายโจทก์)').side).toBe('PLAINTIFF');
  });

  it('requires an attachment on the civil drafting steps', () => {
    for (const title of ['ร่างคำฟ้องและบัญชีท้ายฟ้อง', 'ร่างและยื่นอุทธรณ์', 'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)', 'ยื่นบัญชีระบุพยานและสำเนาเอกสาร']) {
      expect(step(title).requiresAttachment).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lawfirm/shared build && pnpm --filter api exec jest --config jest.config.js src/common/task-review.spec.ts`
Expected: FAIL — `effectiveReviewerId is not a function` (and the tag assertions get `undefined`).

- [ ] **Step 3: Implement `packages/shared/src/task-review.ts`**

```ts
import { FirmRole } from './firm-role';
// Runtime values from index are read at call time, so the index ⇄ module cycle is safe.
import { canAssignFirmRole, CASE_STAGE_LABELS_TH, CaseStage } from './index';

/** A handoff note shorter than this is refused on every surface (web, mobile, LINE, API). */
export const TASK_HANDOFF_NOTE_MIN = 5;

export type PlaybookSide = 'PLAINTIFF' | 'DEFENDANT';

/** Firm roles that may review any task. The case lead may review that case's tasks whatever their role. */
export const REVIEWER_FIRM_ROLES: FirmRole[] = [FirmRole.OWNER, FirmRole.SENIOR_LAWYER];

type ReviewableTask = { reviewerId?: string | null; case?: { leadLawyerId?: string | null } | null };

/** Who must review: the named reviewer, else the case lead (from the task's case or the page's case). */
export function effectiveReviewerId(task: ReviewableTask, caseLeadId?: string | null): string | null {
  return task.reviewerId ?? task.case?.leadLawyerId ?? caseLeadId ?? null;
}

/** The "รอฉันตรวจ" rule: PENDING_REVIEW AND (reviewerId = me OR (reviewerId IS NULL AND case lead = me)). */
export function awaitsReviewBy(task: ReviewableTask & { status: string }, userId: string, caseLeadId?: string | null): boolean {
  return task.status === 'PENDING_REVIEW' && effectiveReviewerId(task, caseLeadId) === userId;
}

export function isEligibleReviewer(p: { role: string | null | undefined; userId: string; caseLeadId?: string | null; assigneeId?: string | null }): boolean {
  if (p.assigneeId && p.userId === p.assigneeId) return false;
  if (p.caseLeadId && p.userId === p.caseLeadId) return true;
  return REVIEWER_FIRM_ROLES.includes(p.role as FirmRole);
}

/** Rank rule for handing work to someone else; a LAWYER may also hand work to an ASSISTANT or the OFFICE_MANAGER. */
export function canDelegateTask(assigner: FirmRole, assignee: FirmRole): boolean {
  if (assigner === FirmRole.LAWYER) return assignee === FirmRole.ASSISTANT || assignee === FirmRole.OFFICE_MANAGER;
  return canAssignFirmRole(assigner, assignee);
}

/** The side of the dispute our client is on; petitioner files like a plaintiff, respondent answers like a defendant. */
export function partySide(partyRole: string | null | undefined): PlaybookSide | null {
  if (partyRole === 'PLAINTIFF' || partyRole === 'PETITIONER') return 'PLAINTIFF';
  if (partyRole === 'DEFENDANT' || partyRole === 'RESPONDENT') return 'DEFENDANT';
  return null;
}

const INTERNAL_LABEL = /^(stage|playbook):/;

/** `stage:*` and `playbook:*` stay in data for queries but never render. */
export function visibleTaskLabels(labels: string[] | null | undefined): string[] {
  return (labels ?? []).filter((label) => !INTERNAL_LABEL.test(label));
}

export function taskStageChip(labels: string[] | null | undefined): string | null {
  const stage = (labels ?? []).find((label) => label.startsWith('stage:'))?.slice('stage:'.length);
  const name = stage ? CASE_STAGE_LABELS_TH[stage as CaseStage] : undefined;
  return name ? `ขั้น: ${name}` : null;
}
```

In `packages/shared/src/index.ts`, next to `export * from './default-playbooks';` add `export * from './task-review';`.

- [ ] **Step 4: Tag the default playbooks**

In `packages/shared/src/default-playbooks.ts`:

1. Add the import `import type { PlaybookSide } from './task-review';` and extend the step type:

```ts
export interface DefaultPlaybookStep {
  routine?: TaskRoutineDefinition;
  title: string;
  instructions: string;
  primaryRole?: `${FirmRole}`;
  secondaryRole?: `${FirmRole}`;
  stage?: `${CaseStage}`;
  offsetDays?: number;
  dayBasis?: 'CALENDAR' | 'BUSINESS';
  /** Only for cases where our client is on this side (Case.partyRole); both sides when unknown. */
  side?: PlaybookSide;
  /** The task cannot be handed in for review without at least one attachment. */
  requiresAttachment?: boolean;
}
```

2. Append these properties to the existing step objects (find each by its exact `title`; add to the line holding `primaryRole…dayBasis`):

| Playbook `key` | Step title | Add |
|---|---|---|
| DEFAULT_CIVIL | `ร่างคำฟ้องและบัญชีท้ายฟ้อง` | `requiresAttachment: true` |
| DEFAULT_CIVIL | `ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)` | `side: 'DEFENDANT', requiresAttachment: true` |
| DEFAULT_CIVIL | `ขอให้ศาลพิพากษาโดยขาดนัดยื่นคำให้การ (ฝ่ายโจทก์)` | `side: 'PLAINTIFF'` |
| DEFAULT_CIVIL | `ยื่นบัญชีระบุพยานและสำเนาเอกสาร` | `requiresAttachment: true` |
| DEFAULT_CIVIL | `ร่างและยื่นอุทธรณ์` | `requiresAttachment: true` |
| DEFAULT_CRIMINAL | `ยื่นคำร้องขอปล่อยชั่วคราว (ถ้าลูกความถูกควบคุม)` | `side: 'DEFENDANT'` |
| DEFAULT_CRIMINAL | `ร่างและยื่นฟ้อง/คำร้องเข้าเป็นโจทก์ร่วม` | `side: 'PLAINTIFF'` |
| DEFAULT_CRIMINAL | `ยื่นคำร้องขอค่าสินไหมทดแทน (ผู้เสียหาย)` | `side: 'PLAINTIFF'` |
| DEFAULT_CRIMINAL | `เตรียมคำให้การจำเลยและนัดพร้อม/ตรวจพยานหลักฐาน` | `side: 'DEFENDANT'` |
| DEFAULT_FAMILY | `ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)` | `side: 'DEFENDANT'` |

Example — the civil answer step becomes:

```ts
      {
        title: 'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)',
        instructions: 'ต้องยื่นภายใน 15 วันนับแต่ได้รับหมายเรียก (ป.วิ.พ. ม.177); หากส่งโดยปิดหมาย/วิธีอื่น หมายมีผลเมื่อพ้น 15 วัน (ม.79) รวมราว 30 วัน — นับจากวันรับหมายจริงเสมอ หรือยื่นคำร้องขอขยายเวลาก่อนครบกำหนด (ม.23)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'ANSWER', offsetDays: 10, dayBasis: 'CALENDAR',
        side: 'DEFENDANT', requiresAttachment: true,
      },
```

- [ ] **Step 5: Tag releases already seeded into firms**

`ensureDefaultPlaybooks` copies `DEFAULT_PLAYBOOKS` into each firm once, so existing firms keep untagged steps. Create `apps/api/prisma/migrations/20261011150200_default_playbook_step_tags/migration.sql`:

```sql
-- Adds side/requiresAttachment to the default SOP steps firms already hold.
-- Matches by templateKey + exact step title; firm-edited titles are left alone.
WITH tags(template_key, title, patch) AS (VALUES
  ('DEFAULT_CIVIL',    'ร่างคำฟ้องและบัญชีท้ายฟ้อง',                         '{"requiresAttachment": true}'::jsonb),
  ('DEFAULT_CIVIL',    'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)',                    '{"side": "DEFENDANT", "requiresAttachment": true}'::jsonb),
  ('DEFAULT_CIVIL',    'ขอให้ศาลพิพากษาโดยขาดนัดยื่นคำให้การ (ฝ่ายโจทก์)',     '{"side": "PLAINTIFF"}'::jsonb),
  ('DEFAULT_CIVIL',    'ยื่นบัญชีระบุพยานและสำเนาเอกสาร',                     '{"requiresAttachment": true}'::jsonb),
  ('DEFAULT_CIVIL',    'ร่างและยื่นอุทธรณ์',                                  '{"requiresAttachment": true}'::jsonb),
  ('DEFAULT_CRIMINAL', 'ยื่นคำร้องขอปล่อยชั่วคราว (ถ้าลูกความถูกควบคุม)',       '{"side": "DEFENDANT"}'::jsonb),
  ('DEFAULT_CRIMINAL', 'ร่างและยื่นฟ้อง/คำร้องเข้าเป็นโจทก์ร่วม',              '{"side": "PLAINTIFF"}'::jsonb),
  ('DEFAULT_CRIMINAL', 'ยื่นคำร้องขอค่าสินไหมทดแทน (ผู้เสียหาย)',              '{"side": "PLAINTIFF"}'::jsonb),
  ('DEFAULT_CRIMINAL', 'เตรียมคำให้การจำเลยและนัดพร้อม/ตรวจพยานหลักฐาน',       '{"side": "DEFENDANT"}'::jsonb),
  ('DEFAULT_FAMILY',   'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)',                    '{"side": "DEFENDANT"}'::jsonb)
)
UPDATE "PlaybookRelease" r
SET "steps" = (
  SELECT jsonb_agg(
    s.step || COALESCE((SELECT t.patch FROM tags t WHERE t.template_key = r."templateKey" AND t.title = s.step->>'title'), '{}'::jsonb)
    ORDER BY s.ord)
  FROM jsonb_array_elements(r."steps") WITH ORDINALITY AS s(step, ord)
)
WHERE r."templateKey" IN ('DEFAULT_CIVIL', 'DEFAULT_CRIMINAL', 'DEFAULT_FAMILY')
  AND jsonb_typeof(r."steps") = 'array';
```

Apply it (repo root):

```bash
cd apps/api && set -a && . ./.env && set +a \
 && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261011150200_default_playbook_step_tags/migration.sql \
 && pnpm exec prisma migrate resolve --applied 20261011150200_default_playbook_step_tags && cd ../..
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @lawfirm/shared build && pnpm --filter api exec jest --config jest.config.js src/common/task-review.spec.ts src/common/firm-capabilities.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add packages/shared/src/task-review.ts packages/shared/src/index.ts packages/shared/src/default-playbooks.ts apps/api/src/common/task-review.spec.ts apps/api/prisma/migrations/20261011150200_default_playbook_step_tags
/usr/bin/git commit -m "feat(shared): reviewer rule, delegation rule, label helpers and SOP step side/attachment tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Review handoff keeps the worker — API core (handoff, accept, reject, reviewer eligibility)

**Files:**
- Modify: `apps/api/src/tasks/tasks.service.ts` (`taskInclude` :62, `boardInclude` :87, `assertAccess` :144-189, `assertLeadOrOwnerForReview` :192 (delete), `taskAssignmentSummary` :220, `create` :512-513, `update` :626-646, `validateReview` :765, `completeWorkflowStep` :903-906, `handoff` :968, `accept` :1010, `reject` :1031, `handoffStandalone` :1107, `acceptStandalone` :1155, `rejectStandalone` :1174)
- Modify: `apps/api/src/tasks/dto/task-handoff.dto.ts`, `apps/api/src/tasks/dto/task.dto.ts`
- Modify: `apps/api/src/common/services/case-access.service.ts:130-148` (standalone reviewer visibility)
- Modify: `apps/api/src/notifications/line-actions.ts` (add `review`)
- Test: `apps/api/src/tasks/tasks.service.spec.ts` (rewrite `describe('handoff')`, `describe('accept / reject')`, `describe('handoffStandalone')`, `describe('acceptStandalone / rejectStandalone')`; extend the OFFICE_MANAGER `validateReview` test)

**Interfaces:**
- Consumes: `TASK_HANDOFF_NOTE_MIN`, `REVIEWER_FIRM_ROLES`, `effectiveReviewerId`, `isEligibleReviewer` (Task 2); `Task.submittedAt`, `Task.requiresAttachment`, `Task.reviewer` (Task 1).
- Produces:
  - `TasksService.handoff(caseId, taskId, user, dto: HandoffTaskDto)` — keeps `assigneeId`, sets `PENDING_REVIEW` + `submittedAt`, notifies the reviewer.
  - `TasksService.handoffStandalone(taskId, user, dto: HandoffStandaloneTaskDto)` — also persists `reviewerId = dto.reviewerId`.
  - `TasksService.accept / reject / acceptStandalone / rejectStandalone` — authorised by `private assertReviewer(task: { reviewerId: string | null }, leadLawyerId: string | null, user: AuthUser): void`.
  - `private async referenceLine(caseId?: string | null, intakeId?: string | null): Promise<string | null>` (extracted from `taskAssignmentSummary`).
  - `private async notifyWorker(task: { id: string; title: string; caseId: string | null; assigneeId: string | null }, user: AuthUser, summaryText: string): Promise<void>`.
  - `validateReview(user, required, reviewerId, ctx?: { caseId?: string | null; assigneeId?: string | null })`.
  - `lineActions.review(taskId): QuickReplyItem[]` → postbacks `task:accept:<id>`, `task:reject:<id>` (handled in Task 6).
  - `CreateTaskDto.requiresAttachment?: boolean`, `UpdateTaskDto.requiresAttachment?: boolean`; `HandoffTaskDto.note: string` (required, ≥ 5).
  - Board/detail rows include `reviewer: { id, firstName, lastName } | null`.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/tasks/tasks.service.spec.ts`, first suite (`describe('TasksService on-hold')`):

1. Extend `mockPrisma` with:

```ts
    user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'สมชาย', lastName: 'ใจดี' }) },
    taskAttachment: { count: jest.fn().mockResolvedValue(1) },
```

and `firmMember: { count: jest.fn(), findFirst: jest.fn() },`. Capture the notifier so tests can assert on it:

```ts
  const notifier = { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() };
```

and provide it with `{ provide: AssignmentNotifierService, useValue: notifier }`.

2. Replace the whole `describe('handoff', …)` block with:

```ts
  describe('handoff', () => {
    const legalCase = { id: 'case-1', leadLawyerId: 'senior-1', ownRef: 'TSB-1' };
    const working = { id: 'task-1', caseId: 'case-1', title: 'ถอดเทป', assigneeId: 'user-1', reviewerId: null, status: TaskStatus.IN_PROGRESS, requiresAttachment: false };

    beforeEach(() => {
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' });
    });

    it('refuses when the caller would be reviewing their own work', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...working, assigneeId: 'senior-1' });
      await expect(service.handoff('case-1', 'task-1', { id: 'senior-1', firmId: 'firm-1' } as any, { note: 'เสร็จแล้วครับ' }))
        .rejects.toThrow(BadRequestException);
    });

    it('refuses a caller who is not the assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...working, assigneeId: 'other-lawyer' });
      await expect(service.handoff('case-1', 'task-1', user, { note: 'เสร็จแล้วครับ' })).rejects.toThrow(ForbiddenException);
    });

    it('requires a note of at least 5 characters (whitespace does not count)', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(working);
      await expect(service.handoff('case-1', 'task-1', user, { note: '  ok   ' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it('requires an attachment when the task demands one', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...working, requiresAttachment: true });
      mockPrisma.taskAttachment.count.mockResolvedValueOnce(0);
      await expect(service.handoff('case-1', 'task-1', user, { note: 'แนบร่างแล้ว' })).rejects.toThrow('แนบไฟล์');
    });

    it('keeps the worker as assignee, stamps submittedAt, logs and notifies the reviewer with LINE buttons', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(working);

      await service.handoff('case-1', 'task-1', user, { note: 'เสร็จแล้วครับ' });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.PENDING_REVIEW, assigneeId: 'user-1', submittedAt: expect.any(Date), completedAt: null },
      });
      expect(mockPrisma.taskAssignmentLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: TaskLogAction.HANDED_OFF, fromUserId: 'user-1', toUserId: 'senior-1', note: 'เสร็จแล้วครับ' }),
      });
      const call = notifier.notifyAssigned.mock.calls[0][0];
      expect(call.userIds).toEqual(['senior-1']);
      expect(call.summaryText).toContain('เสร็จแล้วครับ');
      expect(call.lineActions('senior-1').map((a: any) => a.data)).toEqual(['task:accept:task-1', 'task:reject:task-1']);
    });

    it('records IN_PROGRESS before PENDING_REVIEW when handed off straight from TODO', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...working, status: TaskStatus.TODO });
      await service.handoff('case-1', 'task-1', user, { note: 'เสร็จแล้วครับ' });
      expect(mockPrisma.task.update.mock.calls.map((c: any[]) => c[0].data.status)).toEqual([TaskStatus.IN_PROGRESS, TaskStatus.PENDING_REVIEW]);
    });
  });
```

3. Replace the whole `describe('accept / reject', …)` block with:

```ts
  describe('accept / reject', () => {
    const legalCase = { id: 'case-1', leadLawyerId: 'senior-1' };
    const lead = { id: 'senior-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
    const namedReviewer = { id: 'reviewer-9', firmId: 'firm-1', firmRole: FirmRole.SENIOR_LAWYER } as any;
    const pending = { id: 'task-1', caseId: 'case-1', title: 'ถอดเทป', status: TaskStatus.PENDING_REVIEW, assigneeId: 'user-1', reviewerId: null, createdById: 'user-1' };

    beforeEach(() => {
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' });
    });

    it('a stranger cannot accept', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await expect(service.accept('case-1', 'task-1', { id: 'x', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any)).rejects.toThrow(ForbiddenException);
    });

    it('OFFICE_MANAGER cannot accept or reject a reviewer-less task', async () => {
      const manager = { id: 'om-1', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as any;
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await expect(service.accept('case-1', 'task-1', manager)).rejects.toThrow(ForbiddenException);
      await expect(service.reject('case-1', 'task-1', manager, { reason: 'x' })).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it('the case lead and the OWNER pass the reviewer-less check', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await service.accept('case-1', 'task-1', lead);
      await service.accept('case-1', 'task-1', { id: 'owner-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any);
      expect(mockPrisma.task.update).toHaveBeenCalledTimes(2);
    });

    it('a named reviewer who is not on the case accepts; the lead then cannot', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...pending, reviewerId: 'reviewer-9' });
      await service.accept('case-1', 'task-1', namedReviewer);
      expect(mockPrisma.task.update).toHaveBeenCalledWith({ where: { id: 'task-1' }, data: { status: TaskStatus.DONE, completedAt: expect.any(Date) } });
      await expect(service.accept('case-1', 'task-1', lead)).rejects.toThrow(ForbiddenException);
    });

    it('accept tells the worker', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await service.accept('case-1', 'task-1', lead);
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['user-1'], summaryText: expect.stringContaining('ผ่านการตรวจ') }));
    });

    it('reject requires PENDING_REVIEW', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...pending, status: TaskStatus.TODO });
      await expect(service.reject('case-1', 'task-1', lead, { reason: 'แก้คำผิด' })).rejects.toThrow(BadRequestException);
    });

    it('reject sends the task back to NEEDS_REVISION with the same assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await service.reject('case-1', 'task-1', lead, { reason: 'แก้คำผิด' });
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.NEEDS_REVISION, assigneeId: 'user-1', submittedAt: null, routineCompletedChecks: [] },
      });
      expect(mockPrisma.taskAssignmentLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: TaskLogAction.REJECTED, toUserId: 'user-1', note: 'แก้คำผิด' }),
      });
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['user-1'] }));
    });
  });
```

4. Replace `describe('handoffStandalone', …)` with:

```ts
  describe('handoffStandalone', () => {
    const todo = { id: 'task-1', caseId: null, firmId: 'firm-1', title: 'ร่างสัญญา', assigneeId: 'user-1', reviewerId: null, status: TaskStatus.IN_PROGRESS, requiresAttachment: false };

    beforeEach(() => {
      mockPrisma.task.findUnique.mockResolvedValue(todo);
      mockPrisma.task.findFirst.mockResolvedValue(todo);
    });

    it('refuses a caller who is not the assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...todo, assigneeId: 'other-user' });
      await expect(service.handoffStandalone('task-1', user, { reviewerId: 'reviewer-1', note: 'ส่งตรวจครับ' })).rejects.toThrow(ForbiddenException);
    });

    it('refuses the caller as their own reviewer', async () => {
      await expect(service.handoffStandalone('task-1', user, { reviewerId: 'user-1', note: 'ส่งตรวจครับ' })).rejects.toThrow(BadRequestException);
    });

    it('refuses a reviewer who is not OWNER/SENIOR_LAWYER in this firm (office manager included)', async () => {
      mockPrisma.firmMember.findFirst.mockResolvedValue({ role: FirmRole.OFFICE_MANAGER });
      await expect(service.handoffStandalone('task-1', user, { reviewerId: 'om-1', note: 'ส่งตรวจครับ' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it('keeps the worker, records the reviewer and notifies them', async () => {
      mockPrisma.firmMember.findFirst.mockResolvedValue({ role: FirmRole.SENIOR_LAWYER });
      await service.handoffStandalone('task-1', user, { reviewerId: 'reviewer-1', note: 'ส่งตรวจครับ' });
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.PENDING_REVIEW, reviewerId: 'reviewer-1', submittedAt: expect.any(Date), completedAt: null },
      });
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['reviewer-1'] }));
    });
  });
```

5. Replace `describe('acceptStandalone / rejectStandalone', …)` with:

```ts
  describe('acceptStandalone / rejectStandalone', () => {
    const reviewer = { id: 'reviewer-1', firmId: 'firm-1', firmRole: FirmRole.SENIOR_LAWYER } as any;
    const pending = { id: 'task-1', caseId: null, firmId: 'firm-1', title: 'ร่างสัญญา', assigneeId: 'user-1', reviewerId: 'reviewer-1', status: TaskStatus.PENDING_REVIEW, createdById: 'user-1' };

    beforeEach(() => mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' }));

    it('only the reviewer may accept — not the worker', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await expect(service.acceptStandalone('task-1', user)).rejects.toThrow(ForbiddenException);
    });

    it('the reviewer accepts and the worker is told', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await service.acceptStandalone('task-1', reviewer);
      expect(mockPrisma.task.update).toHaveBeenCalledWith({ where: { id: 'task-1' }, data: { status: TaskStatus.DONE, completedAt: expect.any(Date) } });
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['user-1'] }));
    });

    it('rejectStandalone requires PENDING_REVIEW', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...pending, status: TaskStatus.TODO });
      await expect(service.rejectStandalone('task-1', reviewer, { reason: 'แก้คำผิด' })).rejects.toThrow(BadRequestException);
    });

    it('rejectStandalone keeps the worker as assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await service.rejectStandalone('task-1', reviewer, { reason: 'แก้คำผิด' });
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.NEEDS_REVISION, assigneeId: 'user-1', submittedAt: null, routineCompletedChecks: [] },
      });
    });
  });
```

6. In `describe('TasksService — OFFICE_MANAGER')`, add after `'is never offered as a reviewer'` (add `case: { findUnique: jest.fn() }` to that suite's `mockPrisma` if missing):

```ts
  it('accepts the case lead as reviewer whatever their role, never the assignee', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({ leadLawyerId: 'lead-lawyer' });
    await expect((service as any).validateReview(manager, true, 'lead-lawyer', { caseId: 'case-1', assigneeId: 'a1' })).resolves.toBeUndefined();
    await expect((service as any).validateReview(manager, true, 'a1', { caseId: 'case-1', assigneeId: 'a1' })).rejects.toThrow('คนละคน');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/tasks/tasks.service.spec.ts`
Expected: FAIL — handoff still writes `assigneeId: 'senior-1'`, no `submittedAt`, no note check, notifier not called, standalone accept checks `assigneeId`.

- [ ] **Step 3: DTOs**

`apps/api/src/tasks/dto/task-handoff.dto.ts` — make the note required on both handoff DTOs:

```ts
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { TASK_HANDOFF_NOTE_MIN } from '@lawfirm/shared';

export class HandoffTaskDto {
  @IsString()
  @MinLength(TASK_HANDOFF_NOTE_MIN, { message: `เขียนหมายเหตุถึงผู้ตรวจอย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร` })
  note!: string;

  @IsOptional()
  @IsDateString()
  stageDueDate?: string;
}
```

and the same `note!: string` with `@IsString() @MinLength(...)` on `HandoffStandaloneTaskDto` (keep `reviewerId` and `stageDueDate`). `RejectTaskDto` / `ReassignTaskDto` unchanged.

`apps/api/src/tasks/dto/task.dto.ts` — on `CreateTaskDto` (and `UpdateTaskDto`, if it is not a `PartialType` of it) add next to `requiresReview`:

```ts
  @IsOptional()
  @IsBoolean()
  requiresAttachment?: boolean;
```

In `TasksService.create`, pass it to `prisma.task.create` data: `requiresAttachment: dto.requiresAttachment ?? false,`. `update` spreads `fields`, so it already persists.

- [ ] **Step 4: Reviewer rule, eligibility, includes**

In `tasks.service.ts`:

1. Imports: add `effectiveReviewerId, REVIEWER_FIRM_ROLES, TASK_HANDOFF_NOTE_MIN` to the `@lawfirm/shared` import; add `Task` to the `../generated/prisma` import.
2. `taskInclude` and `boardInclude`: add `reviewer: { select: { id: true, firstName: true, lastName: true } },`.
3. Delete `assertLeadOrOwnerForReview` and add:

```ts
  /**
   * Accept/reject follow the reviewer, never the assignee: the named reviewer,
   * else the case lead. A reviewer-less case task may also be closed by the
   * OWNER, so a lead who left the case never strands it.
   */
  private assertReviewer(task: { reviewerId: string | null }, leadLawyerId: string | null, user: AuthUser) {
    if (effectiveReviewerId(task, leadLawyerId) === user.id) return;
    if (!task.reviewerId && leadLawyerId && user.firmRole === FirmRole.OWNER) return;
    throw new ForbiddenException('เฉพาะผู้ตรวจของงานนี้เท่านั้น');
  }
```

4. Replace `validateReview`:

```ts
  private async validateReview(
    user: AuthUser,
    required: boolean,
    reviewerId?: string | null,
    ctx: { caseId?: string | null; assigneeId?: string | null } = {},
  ) {
    if (!required && !reviewerId) return;
    if (!reviewerId) throw new BadRequestException('เลือกผู้ตรวจสำหรับงานที่ต้องตรวจ');
    if (ctx.assigneeId && ctx.assigneeId === reviewerId) throw new BadRequestException('ผู้ทำงานและผู้ตรวจต้องเป็นคนละคน');
    if (ctx.caseId) {
      const legalCase = await this.prisma.case.findUnique({ where: { id: ctx.caseId }, select: { leadLawyerId: true } });
      if (legalCase?.leadLawyerId === reviewerId) return;
    }
    const reviewer = await this.prisma.firmMember.findFirst({
      where: { firmId: user.firmId, userId: reviewerId, role: { in: REVIEWER_FIRM_ROLES } },
      select: { userId: true },
    });
    if (!reviewer) throw new BadRequestException('ผู้ตรวจต้องเป็น Owner ทนายอาวุโส หรือทนายหลักของคดีนี้');
  }
```

Call sites: in `create` replace the two lines at :512-513 with
`await this.validateReview(user, dto.requiresReview ?? false, dto.reviewerId, { caseId, assigneeId: dto.assigneeId });`
and in `update` (:630) pass `{ caseId: task.caseId, assigneeId: dto.assigneeId ?? task.assigneeId }` as the fourth argument.

5. Standalone visibility for the reviewer. In `assertAccess`, after `if (task.assigneeId === user.id || task.createdById === user.id) return task;` add:

```ts
    if (task.reviewerId === user.id) return task;
```

In `case-access.service.ts` `getTaskAccessFilterForUser`, the non-`viewAllCases` branch becomes:

```ts
        ...(hasFirmCapability(user.firmRole, 'viewAllCases') ? [] : [{ OR: [
          { assigneeId: user.id }, { createdById: user.id }, { reviewerId: user.id }, this.getTaskFilterForUser(user),
        ] }]),
```

and `assertStandaloneOwnership` keeps working because `assertAccess` now admits the reviewer.

6. Extract the reference line and add the worker notice helper (replace `taskAssignmentSummary`):

```ts
  private async referenceLine(caseId?: string | null, intakeId?: string | null): Promise<string | null> {
    if (caseId) {
      const legalCase = await this.prisma.case.findUnique({
        where: { id: caseId },
        select: { ownRef: true, blackCaseNumber: true, redCaseNumber: true },
      });
      return legalCase && formatCaseNotificationReference(legalCase);
    }
    if (intakeId) {
      const intake = await this.prisma.intake.findUnique({ where: { id: intakeId }, select: { case: { select: { ownRef: true } } } });
      return formatIntakeNotificationReference(intake?.case?.ownRef);
    }
    return null;
  }

  private async taskAssignmentSummary(title: string, caseId?: string | null, intakeId?: string | null) {
    const reference = await this.referenceLine(caseId, intakeId);
    return `📌 คุณได้รับมอบหมายงานใหม่\nงาน: ${title}${reference ? `\n${reference}` : ''}`;
  }

  private async notifyWorker(task: { id: string; title: string; caseId: string | null; assigneeId: string | null }, user: AuthUser, summaryText: string) {
    if (!task.assigneeId) return;
    await this.assignmentNotifier.notifyAssigned({
      firmId: user.firmId,
      userIds: [task.assigneeId],
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText,
      entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
      appPath: taskAppRoute(task.id),
    });
  }

  /** Note, attachment gate and routine checks shared by both handoff routes; TODO is first recorded as IN_PROGRESS. */
  private async prepareHandoff(task: Task, user: AuthUser, note: string | undefined): Promise<string> {
    const trimmed = (note ?? '').trim();
    if (trimmed.length < TASK_HANDOFF_NOTE_MIN) {
      throw new BadRequestException(`เขียนหมายเหตุถึงผู้ตรวจอย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร`);
    }
    if (task.requiresAttachment && !(await this.prisma.taskAttachment.count({ where: { taskId: task.id } }))) {
      throw new BadRequestException('งานนี้ต้องแนบไฟล์ผลงานก่อนส่งตรวจ');
    }
    await this.assertRoutineReady(task);
    if (task.status === TaskStatus.TODO) {
      await this.updateWithHistory({ where: { id: task.id }, data: { status: TaskStatus.IN_PROGRESS } }, user);
    }
    return trimmed;
  }

  private async notifyReviewer(task: { id: string; title: string; caseId: string | null }, reviewerId: string, user: AuthUser, note: string) {
    const [worker, reference] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user.id }, select: { firstName: true, lastName: true } }),
      this.referenceLine(task.caseId),
    ]);
    await this.assignmentNotifier.notifyAssigned({
      firmId: user.firmId,
      userIds: [reviewerId],
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText: `📋 ส่งงานให้ตรวจ: ${task.title}\nจาก: ${worker?.firstName ?? ''} ${worker?.lastName ?? ''}${reference ? `\n${reference}` : ''}\nหมายเหตุ: ${note}`,
      entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
      appPath: taskAppRoute(task.id),
      lineActions: () => lineActions.review(task.id),
    });
  }
```

- [ ] **Step 5: Rewrite the six review methods**

```ts
  async handoff(caseId: string, taskId: string, user: AuthUser, dto: HandoffTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');
    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');

    const reviewerId = effectiveReviewerId(task, legalCase.leadLawyerId)!;
    if (reviewerId === user.id) throw new BadRequestException('คุณเป็นผู้ตรวจงานนี้เอง ไม่ต้องส่งตรวจ');
    if (task.assigneeId && task.assigneeId !== user.id) throw new ForbiddenException('คุณไม่ใช่ผู้รับผิดชอบงานนี้');
    const allowed: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.NEEDS_REVISION, TaskStatus.DONE];
    if (!allowed.includes(task.status as TaskStatus)) throw new BadRequestException('งานนี้ไม่อยู่ในสถานะที่ส่งต่อได้');

    const note = await this.prepareHandoff(task, user, dto.note);
    await this.ensureCaseMembership(caseId, reviewerId);
    await this.updateWithHistory({ where: { id: taskId }, data: {
      status: TaskStatus.PENDING_REVIEW, assigneeId: task.assigneeId ?? user.id, submittedAt: new Date(), completedAt: null,
    } }, user);
    await this.logAssignment({
      taskId, action: TaskLogAction.HANDED_OFF, fromUserId: user.id, toUserId: reviewerId, performedById: user.id,
      note, stageDueDate: dto.stageDueDate ? new Date(dto.stageDueDate) : undefined,
    });
    await this.logActivity(caseId, `ส่งงาน "${task.title}" ให้ตรวจ`, user.id);
    await this.notifyReviewer(task, reviewerId, user, note);
    return this.findOne(taskId);
  }

  async accept(caseId: string, taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');
    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');
    this.assertReviewer(task, legalCase.leadLawyerId, user);
    if (task.status !== TaskStatus.PENDING_REVIEW) throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');

    await this.assertRoutineReady(task);
    await this.updateWithHistory({ where: { id: taskId }, data: { status: TaskStatus.DONE, completedAt: new Date() } }, user);
    await this.logActivity(caseId, `ปิดงาน "${task.title}"`, user.id);
    await this.notifyWorker(task, user, `✅ งานผ่านการตรวจแล้ว\nงาน: ${task.title}`);
    await this.onTaskCompleted(await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } }), user.id);
    return this.findOne(taskId);
  }

  async reject(caseId: string, taskId: string, user: AuthUser, dto: RejectTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');
    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');
    this.assertReviewer(task, legalCase.leadLawyerId, user);
    if (task.status !== TaskStatus.PENDING_REVIEW) throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');
    return this.sendBack(task, user, dto.reason);
  }

  /** Reject = back to NEEDS_REVISION with the same worker (legacy rows fall back to the last sender). */
  private async sendBack(task: Task, user: AuthUser, reason: string) {
    const lastHandoff = task.assigneeId ? null : await this.prisma.taskAssignmentLog.findFirst({
      where: { taskId: task.id, action: TaskLogAction.HANDED_OFF }, orderBy: { createdAt: 'desc' },
    });
    const workerId = task.assigneeId ?? lastHandoff?.fromUserId ?? task.createdById;
    await this.updateWithHistory({ where: { id: task.id }, data: {
      status: TaskStatus.NEEDS_REVISION, assigneeId: workerId, submittedAt: null, routineCompletedChecks: [],
    } }, user);
    await this.logAssignment({ taskId: task.id, action: TaskLogAction.REJECTED, fromUserId: user.id, toUserId: workerId, performedById: user.id, note: reason });
    await this.logActivity(task.caseId, `ตีกลับงาน "${task.title}": ${reason}`, user.id);
    await this.notifyWorker({ ...task, assigneeId: workerId }, user, `🔁 งานถูกตีกลับให้แก้ไข\nงาน: ${task.title}\nเหตุผล: ${reason}`);
    return this.findOne(task.id);
  }

  async handoffStandalone(taskId: string, user: AuthUser, dto: HandoffStandaloneTaskDto) {
    await this.assertAccess(taskId, user);
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId: null } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');
    if (task.assigneeId !== user.id) throw new ForbiddenException('คุณไม่ใช่ผู้รับผิดชอบงานนี้');
    if (dto.reviewerId === user.id) throw new BadRequestException('ไม่สามารถส่งงานให้ตัวเองตรวจได้');
    if (task.reviewerId && task.reviewerId !== dto.reviewerId) throw new BadRequestException('ส่งงานให้ผู้ตรวจที่ระบุไว้เท่านั้น');
    const allowed: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.NEEDS_REVISION];
    if (!allowed.includes(task.status as TaskStatus)) throw new BadRequestException('งานนี้ไม่อยู่ในสถานะที่ส่งต่อได้');
    await this.validateReview(user, true, dto.reviewerId, { assigneeId: task.assigneeId });

    const note = await this.prepareHandoff(task, user, dto.note);
    await this.updateWithHistory({ where: { id: taskId }, data: {
      status: TaskStatus.PENDING_REVIEW, reviewerId: dto.reviewerId, submittedAt: new Date(), completedAt: null,
    } }, user);
    await this.logAssignment({
      taskId, action: TaskLogAction.HANDED_OFF, fromUserId: user.id, toUserId: dto.reviewerId, performedById: user.id,
      note, stageDueDate: dto.stageDueDate ? new Date(dto.stageDueDate) : undefined,
    });
    await this.notifyReviewer(task, dto.reviewerId, user, note);
    return this.findOne(taskId);
  }

  async acceptStandalone(taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId: null } });
    if (!task || (task.firmId && task.firmId !== user.firmId)) throw new NotFoundException('ไม่พบงานนี้');
    this.assertReviewer(task, null, user);
    if (task.status !== TaskStatus.PENDING_REVIEW) throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');
    await this.assertRoutineReady(task);
    await this.updateWithHistory({ where: { id: taskId }, data: { status: TaskStatus.DONE, completedAt: new Date() } }, user);
    await this.notifyWorker(task, user, `✅ งานผ่านการตรวจแล้ว\nงาน: ${task.title}`);
    await this.onTaskCompleted(await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } }), user.id);
    return this.findOne(taskId);
  }

  async rejectStandalone(taskId: string, user: AuthUser, dto: RejectTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId: null } });
    if (!task || (task.firmId && task.firmId !== user.firmId)) throw new NotFoundException('ไม่พบงานนี้');
    this.assertReviewer(task, null, user);
    if (task.status !== TaskStatus.PENDING_REVIEW) throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');
    return this.sendBack(task, user, dto.reason);
  }
```

In `completeWorkflowStep`, add `submittedAt: toReview ? new Date() : null` to the `updateMany` data, and pass `lineActions: () => lineActions.review(task.id)` to its reviewer notice.

In `notifications/line-actions.ts` add to `lineActions`:

```ts
  /** Sent to the reviewer with a handoff. "ส่งกลับ" asks for the reason as a follow-up message (Task 6). */
  review(taskId: string): QuickReplyItem[] {
    return [
      { label: '✅ อนุมัติ', text: 'อนุมัติงาน', data: `task:accept:${taskId}` },
      { label: '↩️ ส่งกลับ', text: 'ส่งงานกลับแก้', data: `task:reject:${taskId}` },
    ];
  },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/tasks src/common/services/case-access.service.spec.ts src/notifications`
Expected: PASS. Fix any other spec in `src/tasks` that asserted the old reassign-on-handoff (`complete-workflow-step.spec.ts`, `tasks.assignment-notify.spec.ts`) by changing the expectation to the worker staying assignee — do not change behaviour to satisfy them.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/api/src/tasks apps/api/src/common/services/case-access.service.ts apps/api/src/notifications/line-actions.ts
/usr/bin/git commit -m "feat(tasks): review handoff keeps the worker as assignee; reviewer rule, note, attachment gate, notices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: "รอฉันตรวจ" queues in every API list (my tasks, my-day, dashboard, operations)

**Files:**
- Create: `apps/api/src/tasks/review-queue.ts`
- Test: `apps/api/src/tasks/review-queue.spec.ts`
- Modify: `packages/shared/src/agenda.ts` (`MyDayResponse` :86-94, new `ReviewQueueItem`)
- Modify: `packages/shared/src/task-operations.ts` (`DailyWorkTask.case` :51, `assignmentCandidates` :87; `PersonWorkload` type wherever it is declared — grep `interface PersonWorkload`)
- Modify: `apps/api/src/tasks/tasks.service.ts` (`findMine` :328-366)
- Modify: `apps/api/src/agenda/agenda.service.ts` (`getMyDay` :91-121)
- Modify: `apps/api/src/dashboard/dashboard.service.ts` (`getStats` return)
- Modify: `apps/api/src/operations/daily-operations.service.ts` (`board` task select/mapping :55-80, `person` :135-180)
- Test: `apps/api/src/tasks/tasks.service.spec.ts` (`describe('findMine')`), `apps/api/src/agenda/agenda.service.spec.ts`, `apps/api/src/common/task-review.spec.ts`

**Interfaces:**
- Consumes: `awaitsReviewBy` (Task 2); `Task.submittedAt`, `Task.reviewerId` semantics (Task 3).
- Produces:
  - `reviewQueueWhere(user: { id: string; firmId: string }): Prisma.TaskWhereInput`
  - `reviewQueueSelect` (Prisma select) and `toReviewQueueItem(row): ReviewQueueItem`
  - `@lawfirm/shared` `interface ReviewQueueItem { id: string; title: string; caseId: string | null; caseRef: string | null; caseTitle: string | null; workerName: string | null; submittedAt: string | null; dueDate: string | null }`
  - `MyDayResponse.reviewQueue: ReviewQueueItem[]`; dashboard `getStats(...).reviewQueue: ReviewQueueItem[]`; `PersonWorkload.reviews` now = the person's review queue, new `PersonWorkload.submitted: { id: string; title: string; dueDate: string | null }[]` (their own work waiting for someone else).
  - `GET /todos?view=review` returns exactly the spec rule.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/tasks/review-queue.spec.ts`:

```ts
import { reviewQueueWhere, toReviewQueueItem } from './review-queue';

describe('review queue', () => {
  it('is PENDING_REVIEW where I am the named reviewer, or the lead of a reviewer-less case task, inside my firm', () => {
    expect(reviewQueueWhere({ id: 'me', firmId: 'f1' })).toEqual({
      status: 'PENDING_REVIEW',
      AND: [
        { OR: [{ firmId: 'f1' }, { case: { firmId: 'f1' } }] },
        { OR: [{ reviewerId: 'me' }, { reviewerId: null, case: { leadLawyerId: 'me', deletedAt: null } }] },
      ],
    });
  });

  it('maps a row to the card the reviewer sees', () => {
    expect(toReviewQueueItem({
      id: 't1', title: 'ร่างคำฟ้อง', caseId: 'c1', dueDate: null, submittedAt: new Date('2026-10-11T03:00:00Z'),
      case: { id: 'c1', ownRef: 'TSB-1', title: 'ผิดสัญญา' }, assignee: { id: 'w', firstName: 'สมชาย', lastName: 'ใจดี' },
    })).toEqual({
      id: 't1', title: 'ร่างคำฟ้อง', caseId: 'c1', caseRef: 'TSB-1', caseTitle: 'ผิดสัญญา',
      workerName: 'สมชาย ใจดี', submittedAt: '2026-10-11T03:00:00.000Z', dueDate: null,
    });
  });
});
```

In `tasks.service.spec.ts` inside `describe('findMine')` add:

```ts
    it('view=review is exactly the reviewer rule, never "assigned to me"', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      await service.findMine({ ...user, firmRole: 'OWNER' }, 'review');
      const where = mockPrisma.task.findMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual(expect.objectContaining({
        status: 'PENDING_REVIEW',
        AND: expect.arrayContaining([{ OR: [{ reviewerId: 'user-1' }, { reviewerId: null, case: { leadLawyerId: 'user-1', deletedAt: null } }] }]),
      }));
      expect(JSON.stringify(where)).not.toContain('"assigneeId":"user-1"');
    });
```

In `agenda.service.spec.ts` add a test (reuse the suite's `user`/`service` setup and fake timers at `NOW`):

```ts
  it('my-day carries a review queue built from the reviewer rule', async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([]);
    mockPrisma.task.findMany.mockImplementation(async ({ where }: any) => where?.status === 'PENDING_REVIEW'
      ? [{ id: 'r1', title: 'ตรวจคำฟ้อง', caseId: 'case-1', dueDate: null, submittedAt: NOW,
          case: { id: 'case-1', ownRef: 'C-001', title: 'คดีทดสอบ' }, assignee: { id: 'w', firstName: 'สมชาย', lastName: 'ใจดี' } }]
      : []);
    const day = await service.getMyDay(user);
    expect(day.reviewQueue).toEqual([expect.objectContaining({ id: 'r1', workerName: 'สมชาย ใจดี', caseRef: 'C-001' })]);
  });
```

In `apps/api/src/common/task-review.spec.ts` add:

```ts
import { assignmentCandidates } from '@lawfirm/shared';

describe('assignmentCandidates reviews', () => {
  it('counts a review for the reviewer, not for the worker who still holds the task', () => {
    const base = { title: 't', priority: 'MEDIUM', workType: null, size: 'M', dueDate: null, scheduledFor: null, queuePosition: 0,
      requiresReview: true, assignedAt: null, acknowledgedAt: null, completedAt: null, holdReason: null, blockedBy: null, blocker: null,
      planConfirmedAt: null, followedUpAt: null, latestUpdate: null, caseId: 'c1' } as any;
    const tasks = [{ ...base, id: 'a', status: 'PENDING_REVIEW', assigneeId: 'worker', workerId: 'worker', reviewerId: null, case: { id: 'c1', ownRef: 'R', title: 'T', leadLawyerId: 'lead' } }];
    const members = ['worker', 'lead'].map((userId) => ({ userId, firstName: userId, lastName: '', email: '', role: 'LAWYER', workTypes: [], onLeave: false, appointments: [] })) as any;
    const result = assignmentCandidates(members, tasks, 'OTHER' as any, '2026-10-12');
    expect(result.find((r) => r.member.userId === 'lead')!.reviews.map((t) => t.id)).toEqual(['a']);
    expect(result.find((r) => r.member.userId === 'worker')!.reviews).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/tasks/review-queue.spec.ts src/tasks/tasks.service.spec.ts src/agenda/agenda.service.spec.ts src/common/task-review.spec.ts`
Expected: FAIL — `Cannot find module './review-queue'`, `day.reviewQueue` undefined, worker counted as reviewer.

- [ ] **Step 3: Implement the helper and the shared type**

Append to `packages/shared/src/agenda.ts`:

```ts
/** A task waiting for the caller's review ("รอฉันตรวจ"). */
export interface ReviewQueueItem {
  id: string;
  title: string;
  caseId: string | null;
  caseRef: string | null;
  caseTitle: string | null;
  workerName: string | null;
  submittedAt: string | null;
  dueDate: string | null;
}
```

and add `reviewQueue: ReviewQueueItem[];` to `MyDayResponse`.

Create `apps/api/src/tasks/review-queue.ts`:

```ts
import { ReviewQueueItem, TaskStatus } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';

/** PENDING_REVIEW AND (reviewerId = me OR (reviewerId IS NULL AND case.leadLawyerId = me)), inside my firm. */
export function reviewQueueWhere(user: { id: string; firmId: string }): Prisma.TaskWhereInput {
  return {
    status: TaskStatus.PENDING_REVIEW,
    AND: [
      { OR: [{ firmId: user.firmId }, { case: { firmId: user.firmId } }] },
      { OR: [{ reviewerId: user.id }, { reviewerId: null, case: { leadLawyerId: user.id, deletedAt: null } }] },
    ],
  };
}

export const reviewQueueSelect = {
  id: true, title: true, caseId: true, dueDate: true, submittedAt: true,
  case: { select: { id: true, ownRef: true, title: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TaskSelect;

type ReviewQueueRow = {
  id: string; title: string; caseId: string | null; dueDate: Date | null; submittedAt: Date | null;
  case: { id: string; ownRef: string; title: string } | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
};

export function toReviewQueueItem(row: ReviewQueueRow): ReviewQueueItem {
  return {
    id: row.id,
    title: row.title,
    caseId: row.caseId,
    caseRef: row.case?.ownRef ?? null,
    caseTitle: row.case?.title ?? null,
    workerName: row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    dueDate: row.dueDate?.toISOString() ?? null,
  };
}

/** Oldest hand-in first: the reviewer clears what has waited longest. */
export const reviewQueueOrder: Prisma.TaskOrderByWithRelationInput[] = [{ submittedAt: 'asc' }, { createdAt: 'asc' }];
```

- [ ] **Step 4: Use it everywhere a reviewer list is built**

1. `TasksService.findMine` — the `review` branch of `viewFilter` becomes `reviewQueueWhere(user)` (import from `./review-queue`). Leave `all`/`mine`: the worker is still the assignee, so their PENDING_REVIEW rows already appear there (the clients group them under "รอตรวจ").

2. `AgendaService.getMyDay` — add to the `Promise.all` and the result (inject nothing new; `this.prisma` is there):

```ts
    const [overdueItems, aheadItems, reviewRows] = await Promise.all([
      this.getOverdue(user, todayStart),
      this.getAgenda(user, todayStart, horizonEnd),
      this.prisma.task.findMany({ where: reviewQueueWhere(user), select: reviewQueueSelect, orderBy: reviewQueueOrder, take: 20 }),
    ]);
```

and return `{ today: todayKey, overdue: overdueItems, todayItems, tomorrow, upcoming, warnings, reviewQueue: reviewRows.map(toReviewQueueItem) }`. Update any `MyDayResponse` literal in `line-myday.spec.ts`/`daily-digest.scheduler.spec.ts` fixtures by adding `reviewQueue: []`.

3. `DashboardService.getStats` — add a parallel query and return it:

```ts
      this.prisma.task.findMany({ where: reviewQueueWhere(user), select: reviewQueueSelect, orderBy: reviewQueueOrder, take: 8 }),
```

and `reviewQueue: reviewRows.map(toReviewQueueItem)` in the returned object (`dashboard.service.spec.ts` mocks: make `task.findMany` default to `[]`).

4. `DailyOperationsService.board` — in the task `select/include`, change the case select to `case: { select: { id: true, ownRef: true, title: true, leadLawyerId: true } }`, and the mapping's `workerId` to plain `t.assigneeId` (the worker never leaves `assigneeId` now; the backfill fixed old rows). In `packages/shared/src/task-operations.ts` change `DailyWorkTask.case` to `{ id: string; ownRef: string; title: string; leadLawyerId?: string } | null` and in `assignmentCandidates`:

```ts
      reviews: tasks.filter(t => awaitsReviewBy(t, member.userId)),
```

(import `awaitsReviewBy` from `./task-review`). The mobile static check `apps/mobile/scripts/check-routine-workflow.cjs:11-12` encodes the old rule (a PENDING_REVIEW row counted as the *assignee's* review); change it to:

```js
const review = { ...task, status: 'PENDING_REVIEW', reviewerId: 'worker', case: null };
assert.equal(candidate([review]).queue.length, 0); assert.equal(candidate([review]).reviews.length, 1);
assert.equal(candidate([{ ...review, reviewerId: 'someone-else' }]).reviews.length, 0);
```

and run `node apps/mobile/scripts/check-routine-workflow.cjs` with the other checks in Step 5.

5. `DailyOperationsService.person` — the person's own PENDING_REVIEW rows become `submitted`, and `reviews` comes from the queue. Add to its `Promise.all`:

```ts
      this.prisma.task.findMany({ where: reviewQueueWhere({ id: userId, firmId: user.firmId }), select: { id: true, title: true, dueDate: true, caseId: true }, orderBy: reviewQueueOrder }),
```

and replace the `reviews:` line with:

```ts
      submitted: tasks.filter((t) => t.status === TaskStatus.PENDING_REVIEW).map((t) => ({ id: t.id, title: canSee(t.caseId) ? t.title : 'งานที่คุณไม่มีสิทธิ์ดู', dueDate: t.dueDate?.toISOString() ?? null })),
      reviews: reviewRows.map((t) => ({ id: t.id, title: canSee(t.caseId) ? t.title : 'งานที่คุณไม่มีสิทธิ์ดู', dueDate: t.dueDate?.toISOString() ?? null })),
```

Add `submitted: { id: string; title: string; dueDate: string | null }[];` to the shared `PersonWorkload` type. In `radar`, update the comment above `const open = …` to: `// Work handed in for review waits on someone else; it is not queue load.` (logic unchanged).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @lawfirm/shared build && pnpm --filter api exec jest --config jest.config.js src/tasks src/agenda src/dashboard src/operations src/common/task-review.spec.ts src/notifications`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add packages/shared/src/agenda.ts packages/shared/src/task-operations.ts apps/api/src/tasks apps/api/src/agenda apps/api/src/dashboard apps/api/src/operations apps/api/src/common/task-review.spec.ts apps/api/src/notifications apps/mobile/scripts/check-routine-workflow.cjs
/usr/bin/git commit -m "feat(tasks): review queue by reviewer rule in my tasks, my-day, dashboard and operations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Task-event notifications (reassign, hold, blocker, @mention) and LAWYER delegation

**Files:**
- Modify: `apps/api/src/tasks/tasks.service.ts` (`assertCanAssignTodo` :395-408, `validateAssigneeForSubtask` :410-420, `update` :702-713, `reassign` :1077-1105, `startOnHold` :1206-1229, `resumeFromOnHold` :1255-1267)
- Modify: `apps/api/src/tasks/tasks.controller.ts` (`resumeFromOnHold` passes the user)
- Modify: `apps/api/src/tasks/task-detail.service.ts` (`dailyUpdate` :326-336, `addComment` :338-371)
- Modify: `apps/api/src/tasks/dto/task-detail.dto.ts` (`CreateTaskCommentDto`)
- Test: `apps/api/src/tasks/tasks.assignment-notify.spec.ts`, `apps/api/src/tasks/task-detail.service.spec.ts`, `apps/api/src/tasks/tasks.service.spec.ts` (OFFICE_MANAGER/delegation suite)

**Interfaces:**
- Consumes: `canDelegateTask` (Task 2); `TaskComment.mentionedUserIds` (Task 1); `referenceLine`, `taskAssignmentSummary` (Task 3).
- Produces:
  - `TasksService.reassign(...)` notifies the new assignee (assignment summary + LINE task buttons) and the previous assignee ("↪️ … ถูกมอบให้ … แทน").
  - `TasksService.startOnHold(caseId, taskId, user, dto)` / `resumeFromOnHold(caseId, taskId, user: AuthUser)` notify the case lead + task observers (minus the actor). Re-holding after a resume reuses the single `TaskOnHold` row (upsert) instead of failing on `taskId @unique`.
  - `private async notifyLeadAndObservers(task: { id: string; title: string; caseId: string | null }, user: AuthUser, summaryText: string): Promise<void>`
  - `CreateTaskCommentDto.mentionedUserIds?: string[]` (≤ 20 UUIDs); `TaskDetailService.addComment` stores the firm-member subset and sends them a COMMENT notice "💬 … กล่าวถึงคุณ".
  - `TaskDetailService.dailyUpdate` with a non-empty `blocker` notifies the case lead.
  - `assertCanAssignTodo` admits LAWYER → ASSISTANT / OFFICE_MANAGER.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/tasks/tasks.assignment-notify.spec.ts` (inside the describe; add `taskOnHold: { findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn() }` and `user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'สมหญิง', lastName: 'รักงาน' }) }` to `mockPrisma`, and `taskObserver.findMany` already returns `[]`):

```ts
  it('reassign tells the new and the previous assignee', async () => {
    mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', caseId: 'c1', title: 'ถอดเทป', assigneeId: 'old', requiresReview: false, routine: null });
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'c1', leadLawyerId: 'user-1', ownRef: 'TSB-1' });
    mockPrisma.task.findUnique.mockResolvedValue({ id: 't1' });
    await service.reassign('c1', 't1', user, { assigneeId: 'new' });
    const recipients = mockNotifier.notifyAssigned.mock.calls.map((c) => c[0].userIds);
    expect(recipients).toEqual(expect.arrayContaining([['new'], ['old']]));
    const toOld = mockNotifier.notifyAssigned.mock.calls.find((c) => c[0].userIds[0] === 'old')![0];
    expect(toOld.summaryText).toContain('สมหญิง รักงาน');
  });

  it('starting and resuming a hold tells the lead and the observers, not the actor', async () => {
    mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', caseId: 'c1', title: 'ถอดเทป', onHold: null });
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'c1', leadLawyerId: 'lead' });
    mockPrisma.taskObserver.findMany.mockResolvedValue([{ userId: 'obs' }, { userId: 'user-1' }]);
    mockPrisma.taskOnHold.upsert.mockResolvedValue({ id: 'h1' });
    await service.startOnHold('c1', 't1', user, { reason: 'รอลูกความส่งเอกสาร' });
    expect(mockNotifier.notifyAssigned).toHaveBeenLastCalledWith(expect.objectContaining({
      userIds: ['lead', 'obs'], summaryText: expect.stringContaining('รอลูกความส่งเอกสาร'),
    }));

    mockPrisma.taskOnHold.findFirst.mockResolvedValue({ id: 'h1', endedAt: null, task: { title: 'ถอดเทป' } });
    mockPrisma.taskOnHold.update.mockResolvedValue({ id: 'h1' });
    await service.resumeFromOnHold('c1', 't1', user);
    expect(mockNotifier.notifyAssigned).toHaveBeenLastCalledWith(expect.objectContaining({
      userIds: ['lead', 'obs'], summaryText: expect.stringContaining('กลับมาทำต่อ'),
    }));
  });

  it('a task that was held and resumed can be held again (one hold row per task)', async () => {
    mockPrisma.task.findFirst.mockResolvedValue({ id: 't1', caseId: 'c1', title: 'ถอดเทป', onHold: { id: 'h1', endedAt: new Date() } });
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'c1', leadLawyerId: 'lead' });
    mockPrisma.taskOnHold.upsert.mockResolvedValue({ id: 'h1' });
    await service.startOnHold('c1', 't1', user, { reason: 'รอศาลออกหมาย' });
    expect(mockPrisma.taskOnHold.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { taskId: 't1' },
      update: expect.objectContaining({ reason: 'รอศาลออกหมาย', endedAt: null }),
    }));
  });
```

In the OFFICE_MANAGER/delegation suite of `tasks.service.spec.ts` (the one with `assertCanAssignTodo` tests) add:

```ts
  it('a LAWYER may hand a todo to an ASSISTANT or the OFFICE_MANAGER, never to another LAWYER', async () => {
    const lawyer = { id: 'law-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
    mockPrisma.firmMember.findFirst.mockResolvedValueOnce({ role: FirmRole.ASSISTANT });
    await expect((service as any).assertCanAssignTodo(lawyer, 'asst-1')).resolves.toBeUndefined();
    mockPrisma.firmMember.findFirst.mockResolvedValueOnce({ role: FirmRole.OFFICE_MANAGER });
    await expect((service as any).assertCanAssignTodo(lawyer, 'om-1')).resolves.toBeUndefined();
    mockPrisma.firmMember.findFirst.mockResolvedValueOnce({ role: FirmRole.LAWYER });
    await expect((service as any).assertCanAssignTodo(lawyer, 'law-2')).rejects.toThrow(ForbiddenException);
  });

  it('an ASSISTANT still cannot hand work to anyone else', async () => {
    const assistant = { id: 'a-1', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any;
    await expect((service as any).assertCanAssignTodo(assistant, 'a-2')).rejects.toThrow(ForbiddenException);
  });
```

Append to `apps/api/src/tasks/task-detail.service.spec.ts` (add `firmMember: { findMany: jest.fn().mockResolvedValue([]) }` and `case: { findUnique: jest.fn() }` to `mockPrisma`):

```ts
  it('stores only firm-member mentions and tells each mentioned person once', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1' });
    mockPrisma.task.findUnique.mockResolvedValue({ assigneeId: 'm1', parentId: null, caseId: 'c1', title: 'ร่างคำฟ้อง', createdById: 'u1' });
    mockPrisma.firmMember.findMany.mockResolvedValue([{ userId: 'm1' }]);
    mockPrisma.taskComment.create.mockResolvedValue({ id: 'cm1' });
    await service.addComment('t1', lawyer, { body: '@สมชาย ช่วยดูข้อ 3', mentionedUserIds: ['m1', 'outsider'] });
    expect(mockPrisma.taskComment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mentionedUserIds: ['m1'] }),
    }));
    const calls = mockTasks.notifyViaAssignmentNotifier.mock.calls.map((c) => c[0]);
    expect(calls.filter((c) => c.userIds.includes('m1'))).toHaveLength(1);
    expect(calls.find((c) => c.userIds.includes('m1')).summaryText).toContain('กล่าวถึงคุณ');
  });

  it('a daily update with a blocker tells the case lead', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', assigneeId: 'u1', status: 'IN_PROGRESS', caseId: 'c1', title: 'สืบทรัพย์' });
    mockPrisma.case.findUnique.mockResolvedValue({ leadLawyerId: 'lead' });
    mockPrisma.taskComment.create.mockResolvedValue({ id: 'cm1' });
    await service.dailyUpdate('t1', lawyer, { completed: 'ค้นโฉนดแล้ว', remaining: 'บัญชีธนาคาร', blocker: 'ธนาคารไม่ตอบ' });
    expect(mockTasks.notifyViaAssignmentNotifier).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['lead'], summaryText: expect.stringContaining('ธนาคารไม่ตอบ'),
    }));
  });

  it('a daily update without a blocker notifies nobody', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', assigneeId: 'u1', status: 'IN_PROGRESS', caseId: 'c1', title: 'สืบทรัพย์' });
    mockPrisma.taskComment.create.mockResolvedValue({ id: 'cm1' });
    await service.dailyUpdate('t1', lawyer, { completed: 'ค้นโฉนดแล้ว', remaining: 'บัญชีธนาคาร', blocker: '' });
    expect(mockTasks.notifyViaAssignmentNotifier).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/tasks/tasks.assignment-notify.spec.ts src/tasks/task-detail.service.spec.ts src/tasks/tasks.service.spec.ts`
Expected: FAIL — no notices for reassign/hold/blocker/mention, `taskOnHold.upsert` not called, LAWYER refused.

- [ ] **Step 3: Delegation rule**

In `tasks.service.ts` import `canDelegateTask` from `@lawfirm/shared` (drop `canAssignFirmRole` if unused) and replace `assertCanAssignTodo`'s body after the self check:

```ts
    if (![FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.OFFICE_MANAGER, FirmRole.LAWYER].includes(user.firmRole)) {
      throw new ForbiddenException('ผู้ช่วยมอบหมายงานให้ผู้อื่นไม่ได้');
    }
    const member = await this.prisma.firmMember.findFirst({
      where: { role: { not: FirmRole.EXTERNAL }, firmId: user.firmId, userId: assigneeId },
      select: { role: true },
    });
    if (!member) throw new NotFoundException('ผู้รับมอบหมายไม่ได้อยู่ในสำนักงานนี้');
    if (!canDelegateTask(user.firmRole, member.role as FirmRole)) {
      throw new ForbiddenException(user.firmRole === FirmRole.LAWYER
        ? 'ทนายความมอบหมายงานได้เฉพาะผู้ช่วยหรือผู้จัดการสำนักงาน'
        : 'มอบหมายได้เฉพาะสมาชิกที่มีบทบาทต่ำกว่าของคุณเท่านั้น');
    }
```

In `validateAssigneeForSubtask` replace `canAssignFirmRole(user.firmRole, member.role as FirmRole)` with `canDelegateTask(user.firmRole, member.role as FirmRole)`.

- [ ] **Step 4: Reassign, hold and resume notices**

Add the helper:

```ts
  /** Hold/resume and similar case-level news: the lead lawyer and the task's observers, never the actor. */
  private async notifyLeadAndObservers(task: { id: string; title: string; caseId: string | null }, user: AuthUser, summaryText: string) {
    const legalCase = task.caseId ? await this.prisma.case.findUnique({ where: { id: task.caseId }, select: { leadLawyerId: true } }) : null;
    const userIds = [...new Set([legalCase?.leadLawyerId, ...(await this.getParentObserverIds(task.id))].filter((id): id is string => !!id && id !== user.id))];
    await this.notifyViaAssignmentNotifier({
      firmId: user.firmId,
      userIds,
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText,
      entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
      appPath: taskAppRoute(task.id),
    });
  }

  private async notifyPreviousAssignee(task: { id: string; title: string; caseId: string | null }, previousId: string | null, newAssigneeId: string, user: AuthUser) {
    if (!previousId || previousId === newAssigneeId || previousId === user.id) return;
    const next = await this.prisma.user.findUnique({ where: { id: newAssigneeId }, select: { firstName: true, lastName: true } });
    await this.notifyViaAssignmentNotifier({
      firmId: user.firmId,
      userIds: [previousId],
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText: `↪️ งาน "${task.title}" ถูกมอบให้ ${next?.firstName ?? ''} ${next?.lastName ?? ''} แทน`,
      entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
      appPath: taskAppRoute(task.id),
    });
  }
```

In `reassign`, after `logActivity`:

```ts
    if (dto.assigneeId !== user.id) {
      await this.assignmentNotifier.notifyAssigned({
        firmId: user.firmId,
        userIds: [dto.assigneeId],
        actorUserId: user.id,
        category: NotificationCategory.TASK,
        summaryText: await this.taskAssignmentSummary(task.title, caseId, task.intakeId),
        entityPath: `/cases/${caseId}`,
        appPath: taskAppRoute(taskId),
        lineActions: () => lineActions.task(taskId, { canComplete: canCompleteFromLine(task) }),
      });
    }
    await this.notifyPreviousAssignee(task, task.assigneeId, dto.assigneeId, user);
```

In `update`, inside the existing `if (dto.assigneeId && dto.assigneeId !== task.assigneeId && dto.assigneeId !== user.id)` notice block's neighbourhood, add (outside that `if`, guarded on a real change):

```ts
    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      await this.notifyPreviousAssignee(task, task.assigneeId, dto.assigneeId, user);
    }
```

Replace `startOnHold`'s create with an upsert and notify:

```ts
    const data = {
      reason: dto.reason,
      category: dto.category ?? 'OTHER',
      followerUserId: dto.followerUserId ?? null,
      nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null,
      createdById: user.id,
    } as const;
    // One TaskOnHold row per task (taskId is unique): a resumed hold is reopened, not duplicated.
    const hold = await this.prisma.taskOnHold.upsert({
      where: { taskId },
      create: { taskId, ...data },
      update: { ...data, startedAt: new Date(), endedAt: null, lastFollowUpAt: null, notes: null },
    });
    await this.notifyLeadAndObservers({ id: taskId, title: task.title, caseId }, user, `⏸️ พักงาน: ${task.title}\nเหตุผล: ${dto.reason}`);
    return hold;
```

Change `resumeFromOnHold(caseId: string, taskId: string, user: AuthUser)`: load the task title (`include: { task: { select: { title: true } } }` on the `findFirst`), and after the update:

```ts
    await this.notifyLeadAndObservers({ id: taskId, title: hold.task.title, caseId }, user, `▶️ งานกลับมาทำต่อ: ${hold.task.title}`);
```

In `tasks.controller.ts`, `resumeFromOnHold` gains `@CurrentUser() user: AuthUser` and calls `this.tasksService.resumeFromOnHold(caseId, taskId, user)`. Fix the existing `resumeFromOnHold` tests in `tasks.service.spec.ts` to pass `user` and to mock `findFirst` with `task: { title: 'x' }`; change the existing `startOnHold` "creates a TaskOnHold row" test to expect `taskOnHold.upsert`.

- [ ] **Step 5: @mentions and blocker notice**

`apps/api/src/tasks/dto/task-detail.dto.ts`:

```ts
export class CreateTaskCommentDto {
  @IsString()
  @Length(1, 4000)
  body!: string;

  /** Same contract as case comments: the picker inserts "@ชื่อ" and sends the ids. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  mentionedUserIds?: string[];
}
```

(import `ArrayMaxSize, IsArray` from `class-validator`).

`TaskDetailService.addComment` — after loading `task`, before `create`:

```ts
    const mentioned = dto.mentionedUserIds?.length
      ? (await this.prisma.firmMember.findMany({
          where: { firmId: user.firmId, role: { not: FirmRole.EXTERNAL }, userId: { in: [...new Set(dto.mentionedUserIds)].slice(0, 20) } },
          select: { userId: true },
        })).map((m) => m.userId).filter((id) => id !== user.id)
      : [];
```

store `mentionedUserIds: mentioned` in the `taskComment.create` data, remove `mentioned` from the generic `notifyIds` (`.filter((id) => id !== user.id && !mentioned.includes(id))`), and send:

```ts
    if (mentioned.length) {
      await this.tasks.notifyViaAssignmentNotifier({
        firmId: user.firmId,
        userIds: mentioned,
        actorUserId: user.id,
        category: NotificationCategory.COMMENT,
        summaryText: `💬 ${user.firstName ?? ''} กล่าวถึงคุณในงาน "${task.title}"\n${dto.body.trim().slice(0, 200)}`,
        entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
        appPath: taskAppRoute(taskId),
      });
    }
```

(If `AuthUser` has no `firstName`, drop the name: `💬 มีคนกล่าวถึงคุณในงาน "…"`.)

`TaskDetailService.dailyUpdate` — keep the create, then:

```ts
    const comment = await this.prisma.taskComment.create({ … as today … });
    const blocker = dto.blocker?.trim();
    if (blocker && blocker !== 'ไม่มี' && task.caseId) {
      const legalCase = await this.prisma.case.findUnique({ where: { id: task.caseId }, select: { leadLawyerId: true } });
      if (legalCase && legalCase.leadLawyerId !== user.id) {
        await this.tasks.notifyViaAssignmentNotifier({
          firmId: user.firmId,
          userIds: [legalCase.leadLawyerId],
          actorUserId: user.id,
          category: NotificationCategory.TASK,
          summaryText: `🚧 งานติดขัด: ${task.title}\nติดอะไร: ${blocker}`,
          entityPath: `/cases/${task.caseId}`,
          appPath: taskAppRoute(taskId),
        });
      }
    }
    return comment;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/tasks`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/api/src/tasks
/usr/bin/git commit -m "feat(tasks): notify on reassign, hold/resume, blockers and @mentions; lawyers delegate to assistants

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: LINE — approve / send back buttons and the note follow-up

**Files:**
- Modify: `apps/api/src/tasks/tasks.service.ts` (add `handoffById`, `acceptById`, `rejectById`; pass `canHandoff` to `lineActions.task` in `create` :598 and `update` :711)
- Modify: `apps/api/src/notifications/line-actions.ts` (`task` gains `canHandoff`)
- Modify: `apps/api/src/notifications/line-conversation/line-conversation.types.ts` (`FlowType.TASK_REVIEW`, steps)
- Create: `apps/api/src/notifications/line-conversation/flows/line-task-review-flow.service.ts`
- Modify: `apps/api/src/notifications/line-conversation/line-quick-actions.service.ts` (`task:accept`)
- Modify: `apps/api/src/notifications/line-conversation/line-bot-router.service.ts` (start the note flow from a postback; dispatch it)
- Modify: `apps/api/src/notifications/notifications.module.ts` (provide the flow)
- Test: `apps/api/src/notifications/line-conversation/line-task-review-flow.service.spec.ts` (new), `line-quick-actions.service.spec.ts`, `line-bot-router.actions.spec.ts`

**Interfaces:**
- Consumes: `TASK_HANDOFF_NOTE_MIN` (Task 2); `handoff`, `handoffStandalone`, `accept`, `acceptStandalone`, `reject`, `rejectStandalone`, `lineActions.review` (Task 3).
- Produces:
  - `TasksService.handoffById(taskId: string, user: AuthUser, note: string)`, `acceptById(taskId: string, user: AuthUser)`, `rejectById(taskId: string, user: AuthUser, reason: string)` — route to the case or standalone variant.
  - `lineActions.task(taskId, { canComplete: boolean; canHandoff?: boolean })` adds `📤 ส่งตรวจ` → `task:handoff:<id>`.
  - `FlowType.TASK_REVIEW`; `ConversationStep.TASK_HANDOFF_NOTE`, `ConversationStep.TASK_REJECT_REASON`.
  - `LineTaskReviewFlowService.begin(session: ConversationSession, kind: 'handoff' | 'reject', taskId: string): Promise<void>` and `handle(session, text): Promise<void>`.
  - `REVIEW_NOTE_ACTION = /^task:(handoff|reject):([0-9a-f-]{36})$/i` (exported from the flow file).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/notifications/line-conversation/line-task-review-flow.service.spec.ts`:

```ts
import { LineTaskReviewFlowService } from './flows/line-task-review-flow.service';
import { ConversationStep, FlowType } from './line-conversation.types';

const ID = '11111111-2222-3333-4444-555555555555';

describe('LineTaskReviewFlowService', () => {
  const tasks = { handoffById: jest.fn(), rejectById: jest.fn() } as any;
  const line = { replyWithQuickReply: jest.fn(), pushTo: jest.fn() } as any;
  const store = { update: jest.fn(), clear: jest.fn() } as any;
  const auth = { resolve: jest.fn().mockResolvedValue({ id: 'u1', firmId: 'f1' }) } as any;
  const session = (step: ConversationStep) => ({
    lineUserId: 'L1', userId: 'u1', firmId: 'f1', flowType: FlowType.TASK_REVIEW, step,
    data: { taskId: ID }, target: { replyToken: 'rt', sourceType: 'user' as const }, createdAt: 0, updatedAt: 0,
  });
  let flow: LineTaskReviewFlowService;

  beforeEach(() => {
    jest.clearAllMocks();
    flow = new LineTaskReviewFlowService(tasks, line, store, auth);
  });

  it('asks for the handoff note and stores the step', async () => {
    await flow.begin(session(ConversationStep.SELECT_ACTION), 'handoff', ID);
    expect(store.update).toHaveBeenCalledWith('L1', { flowType: FlowType.TASK_REVIEW, step: ConversationStep.TASK_HANDOFF_NOTE, data: { taskId: ID } });
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', expect.stringContaining('หมายเหตุ'), expect.anything());
  });

  it('refuses a note shorter than 5 characters and keeps waiting', async () => {
    await flow.handle(session(ConversationStep.TASK_HANDOFF_NOTE), ' ok ');
    expect(tasks.handoffById).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', expect.stringContaining('5'), expect.anything());
  });

  it('hands off with the note as the tapper and ends the flow', async () => {
    tasks.handoffById.mockResolvedValue({ title: 'ร่างคำฟ้อง' });
    await flow.handle(session(ConversationStep.TASK_HANDOFF_NOTE), 'ร่างเสร็จ แนบไฟล์แล้ว');
    expect(tasks.handoffById).toHaveBeenCalledWith(ID, { id: 'u1', firmId: 'f1' }, 'ร่างเสร็จ แนบไฟล์แล้ว');
    expect(store.clear).toHaveBeenCalledWith('L1');
  });

  it('sends back with the reason', async () => {
    tasks.rejectById.mockResolvedValue({ title: 'ร่างคำฟ้อง' });
    await flow.handle(session(ConversationStep.TASK_REJECT_REASON), 'แก้ทุนทรัพย์ข้อ 2');
    expect(tasks.rejectById).toHaveBeenCalledWith(ID, { id: 'u1', firmId: 'f1' }, 'แก้ทุนทรัพย์ข้อ 2');
  });

  it('reports a refusal from the service and ends the flow', async () => {
    tasks.handoffById.mockRejectedValue(new Error('งานนี้ต้องแนบไฟล์ผลงานก่อนส่งตรวจ'));
    await flow.handle(session(ConversationStep.TASK_HANDOFF_NOTE), 'ส่งตรวจครับผม');
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', expect.stringContaining('แนบไฟล์'), expect.anything());
    expect(store.clear).toHaveBeenCalledWith('L1');
  });
});
```

In `line-quick-actions.service.spec.ts`, add `acceptById: jest.fn()` to `tasks` and:

```ts
  it('approves a task under review as the tapper', async () => {
    tasks.acceptById.mockResolvedValue({ title: 'ร่างคำฟ้อง' });
    await expect(svc.handle(user, `task:accept:${ID}`)).resolves.toContain('อนุมัติ');
    expect(tasks.acceptById).toHaveBeenCalledWith(ID, user);
  });
```

In `line-bot-router.actions.spec.ts`, add `const reviewFlow = { begin: jest.fn(), handle: jest.fn() } as any;`, pass it as the last constructor argument, and add:

```ts
  it('a "ส่งกลับ"/"ส่งตรวจ" button starts the note follow-up instead of acting at once', async () => {
    await router.route('L1', 'task:reject:11111111-1111-1111-1111-111111111111', dm, false);
    expect(reviewFlow.begin).toHaveBeenCalledWith(expect.anything(), 'reject', '11111111-1111-1111-1111-111111111111');
    expect(quickActions.handle).not.toHaveBeenCalled();
  });

  it('the next message in that flow goes to the review flow', async () => {
    store.get.mockReturnValue({ flowType: 'TASK_REVIEW', target: dm });
    await router.route('L1', 'แก้ทุนทรัพย์ข้อ 2', dm, false);
    expect(reviewFlow.handle).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/notifications/line-conversation`
Expected: FAIL — module `./flows/line-task-review-flow.service` not found; `task:accept` returns null.

- [ ] **Step 3: Task dispatchers and the handoff button**

In `tasks.service.ts`:

```ts
  /** LINE knows only a task id; route to the case or standalone review action the web uses. */
  async handoffById(taskId: string, user: AuthUser, note: string) {
    const task = await this.assertAccess(taskId, user);
    if (task.caseId) return this.handoff(task.caseId, taskId, user, { note });
    if (!task.reviewerId) throw new BadRequestException('งานนี้ยังไม่ได้เลือกผู้ตรวจ ส่งตรวจจากแอปหรือเว็บแทน');
    return this.handoffStandalone(taskId, user, { reviewerId: task.reviewerId, note });
  }

  async acceptById(taskId: string, user: AuthUser) {
    const task = await this.assertAccess(taskId, user);
    return task.caseId ? this.accept(task.caseId, taskId, user) : this.acceptStandalone(taskId, user);
  }

  async rejectById(taskId: string, user: AuthUser, reason: string) {
    const task = await this.assertAccess(taskId, user);
    return task.caseId ? this.reject(task.caseId, taskId, user, { reason }) : this.rejectStandalone(taskId, user, { reason });
  }
```

In `create` and `update`, change the assignee's LINE buttons to
`lineActions.task(task.id, { canComplete: canCompleteFromLine(task), canHandoff: !!task.requiresReview })` (use `updated` in `update`; same in `reassign` from Task 5).

In `line-actions.ts`:

```ts
  task(taskId: string, opts: { canComplete: boolean; canHandoff?: boolean }): QuickReplyItem[] {
    return [
      { label: '👍 รับทราบ', text: 'รับทราบงาน', data: `task:ack:${taskId}` },
      ...(opts.canComplete ? [{ label: '✅ เสร็จแล้ว', text: 'งานเสร็จแล้ว', data: `task:done:${taskId}` }] : []),
      ...(opts.canHandoff ? [{ label: '📤 ส่งตรวจ', text: 'ส่งงานให้ตรวจ', data: `task:handoff:${taskId}` }] : []),
    ];
  },
```

- [ ] **Step 4: The flow, types, quick action, router and module**

`line-conversation.types.ts`: add `TASK_REVIEW = 'TASK_REVIEW',` to `FlowType` and, under the TODO steps:

```ts
  TASK_HANDOFF_NOTE = 'TASK_HANDOFF_NOTE',
  TASK_REJECT_REASON = 'TASK_REJECT_REASON',
```

Create `flows/line-task-review-flow.service.ts`:

```ts
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { TASK_HANDOFF_NOTE_MIN } from '@lawfirm/shared';
import { TasksService } from '../../../tasks/tasks.service';
import { LineMessagingService, QuickReplyItem } from '../../line-messaging.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { LineAuthContextService } from '../line-auth-context.service';
import { ConversationSession, ConversationStep, FlowType } from '../line-conversation.types';
import { withEscape } from './flow-confirmation.util';

/** Postbacks that need a typed follow-up before they act. */
export const REVIEW_NOTE_ACTION = /^task:(handoff|reject):([0-9a-f-]{36})$/i;

/**
 * "📤 ส่งตรวจ" and "↩️ ส่งกลับ" need words from the person who tapped: the
 * handoff note for the reviewer (≥ 5 chars, same rule as web/mobile) or the
 * reason for sending back. The next message is that text; the action then
 * runs through the same TasksService method the web uses.
 */
@Injectable()
export class LineTaskReviewFlowService {
  constructor(
    @Inject(forwardRef(() => TasksService)) private tasks: TasksService,
    private line: LineMessagingService,
    private store: LineConversationStoreService,
    private auth: LineAuthContextService,
  ) {}

  async begin(session: ConversationSession, kind: 'handoff' | 'reject', taskId: string): Promise<void> {
    const step = kind === 'handoff' ? ConversationStep.TASK_HANDOFF_NOTE : ConversationStep.TASK_REJECT_REASON;
    this.store.update(session.lineUserId, { flowType: FlowType.TASK_REVIEW, step, data: { taskId } });
    await this.reply(session, kind === 'handoff'
      ? `พิมพ์หมายเหตุถึงผู้ตรวจ (อย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร) แล้วส่งมาได้เลยครับ`
      : 'พิมพ์เหตุผลที่ส่งงานกลับให้แก้ แล้วส่งมาได้เลยครับ');
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    const taskId = String(session.data.taskId ?? '');
    const value = text.trim();
    const handoff = session.step === ConversationStep.TASK_HANDOFF_NOTE;
    if (value.length < (handoff ? TASK_HANDOFF_NOTE_MIN : 1)) {
      await this.reply(session, `หมายเหตุสั้นไป พิมพ์อย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษรครับ`);
      return;
    }
    const user = await this.auth.resolve(session.lineUserId);
    this.store.clear(session.lineUserId);
    if (!user) return;
    try {
      const task = handoff
        ? await this.tasks.handoffById(taskId, user, value)
        : await this.tasks.rejectById(taskId, user, value);
      await this.reply(session, handoff ? `📤 ส่งงาน "${task.title}" ให้ตรวจแล้วครับ` : `↩️ ส่งงาน "${task.title}" กลับให้แก้แล้วครับ`);
    } catch (error) {
      await this.reply(session, `ทำรายการไม่สำเร็จ: ${error instanceof Error ? error.message : 'กรุณาลองใหม่'}`);
    }
  }

  private async reply(session: ConversationSession, text: string, quickReply?: QuickReplyItem[]) {
    const items = withEscape(quickReply);
    if (session.target.replyToken) await this.line.replyWithQuickReply(session.target.replyToken, text, items);
    else await this.line.pushTo(session.lineUserId, text, items);
  }
}
```

`line-quick-actions.service.ts` — add a case:

```ts
      case 'task:accept': {
        const task = await this.tasks.acceptById(id, user);
        return `✅ อนุมัติงาน "${task.title}" แล้วครับ`;
      }
```

`line-bot-router.service.ts`:
1. Import `LineTaskReviewFlowService, REVIEW_NOTE_ACTION` and add `private reviewFlow: LineTaskReviewFlowService,` as the **last** constructor parameter.
2. Right before `const actionReply = await this.quickActions.handle(authUser, text);` insert:

```ts
    const reviewNote = REVIEW_NOTE_ACTION.exec(text);
    if (reviewNote) {
      const session = this.store.start({
        lineUserId, userId: authUser.id, firmId: authUser.firmId,
        flowType: FlowType.TASK_REVIEW, step: ConversationStep.SELECT_ACTION, data: {}, target,
      });
      await this.reviewFlow.begin(session, reviewNote[1].toLowerCase() as 'handoff' | 'reject', reviewNote[2]);
      return;
    }
```

3. At the end of `route`, add `if (existing.flowType === FlowType.TASK_REVIEW) return this.reviewFlow.handle(updated, text);`.

`notifications.module.ts`: import `LineTaskReviewFlowService` and add it to `providers` next to `LineTodoFlowService`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/notifications src/tasks`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/api/src/tasks/tasks.service.ts apps/api/src/notifications
/usr/bin/git commit -m "feat(line): approve / send back from LINE and a typed note for handoff and returns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Document-review and deadline-suggestion notices, 08:30 "due tomorrow" reminder

**Files:**
- Modify: `apps/api/src/document-review/document-review.service.ts` (`createReviewRound` :73-110, `recordDecision` :127-188)
- Create: `apps/api/src/document-review/document-review.scheduler.ts`
- Modify: `apps/api/src/document-review/document-review.module.ts`
- Modify: `apps/api/src/deadlines/deadline-rules.service.ts` (constructor :77, `applyTrigger` :171-215), `apps/api/src/deadlines/deadlines.module.ts`
- Test: `apps/api/src/document-review/document-review.service.spec.ts`, `apps/api/src/document-review/document-review.scheduler.spec.ts` (new), `apps/api/src/deadlines/deadline-rules.service.spec.ts`

**Interfaces:**
- Consumes: `AssignmentNotifierService.notifyAssigned` (exported by `NotificationsModule`); `ReviewRound.dueReminderSentAt` (Task 1); `bangkokDayStart`, `addBangkokDays` from `apps/api/src/common/utils/bangkok-time.ts`.
- Produces:
  - `DocumentReviewService` constructor `(prisma: PrismaService, notifier: AssignmentNotifierService)`.
  - Round created → each reviewer; round closed (APPROVED or RETURNED) → `createdById`.
  - `DocumentReviewScheduler.remindDueTomorrow(now = new Date()): Promise<number>` — `@Cron('30 8 * * *', { timeZone: 'Asia/Bangkok' })`, reviewers without a decision on WAITING_REVIEW rounds due tomorrow (Bangkok), each round once.
  - `DeadlineRulesService.applyTrigger` notifies the case lead when it created ≥ 1 suggestion.

- [ ] **Step 0: Check Part L did not already add the deadline notice**

Run: `grep -n "notifyAssigned\|AssignmentNotifierService" apps/api/src/deadlines/deadline-rules.service.ts`
If Part L already notifies the lead on new suggestions, skip the deadline parts of Steps 1/3 (keep only its test if missing). Otherwise do them.

- [ ] **Step 1: Write the failing tests**

In `document-review.service.spec.ts`: add `const notifier = { notifyAssigned: jest.fn() };`, provide `{ provide: AssignmentNotifierService, useValue: notifier }` (import from `../notifications/assignment-notifier.service`), extend the version fixture so `getVersionOrThrow` returns `{ id: 'version-1', status: 'DRAFT', document: { id: 'doc-1', filename: 'คำฟ้อง.docx', caseId: 'case-1' } }`, and add:

```ts
  describe('notices', () => {
    it('tells each reviewer when a round is created', async () => {
      mockPrisma.documentVersion.findFirst.mockResolvedValue({ id: 'version-1', status: 'DRAFT', document: { id: 'doc-1', filename: 'คำฟ้อง.docx', caseId: 'case-1' } });
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1', leadLawyer: null, assignments: [{ user: { id: 'reviewer-1' } }, { user: { id: 'reviewer-2' } }] });
      mockPrisma.firmMember.findMany.mockResolvedValue([]);
      mockPrisma.reviewRound.findFirst.mockResolvedValue({ ...baseRound });
      await service.createReviewRound({ id: 'author', firmId: 'firm-1' } as any, 'case-1', 'doc-1', 'version-1', { reviewerIds: ['reviewer-1', 'reviewer-2'] } as any);
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({
        userIds: ['reviewer-1', 'reviewer-2'], summaryText: expect.stringContaining('คำฟ้อง.docx'),
      }));
    });

    it('tells the creator when a round is returned', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue({ ...baseRound, createdById: 'author', documentVersion: { document: { filename: 'คำฟ้อง.docx' } } });
      await service.recordDecision(user, 'case-1', 'doc-1', 'round-1', { action: 'return', reason: 'แก้ข้อ 2', reviewedDocumentVersionId: 'version-1' } as any);
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({
        userIds: ['author'], summaryText: expect.stringContaining('ส่งกลับ'),
      }));
    });

    it('tells the creator only when the last approval closes the round', async () => {
      mockPrisma.reviewRound.findFirst.mockResolvedValue({ ...baseRound, createdById: 'author', documentVersion: { document: { filename: 'คำฟ้อง.docx' } } });
      mockPrisma.reviewDecision.findMany.mockResolvedValue([{ decision: 'APPROVED' }]);
      await service.recordDecision(user, 'case-1', 'doc-1', 'round-1', { action: 'approve', reviewedDocumentVersionId: 'version-1' } as any);
      expect(notifier.notifyAssigned).not.toHaveBeenCalled();
      mockPrisma.reviewDecision.findMany.mockResolvedValue([{ decision: 'APPROVED' }, { decision: 'APPROVED' }]);
      await service.recordDecision({ id: 'reviewer-2', firmId: 'firm-1' } as any, 'case-1', 'doc-1', 'round-1', { action: 'approve', reviewedDocumentVersionId: 'version-1' } as any);
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['author'], summaryText: expect.stringContaining('ผ่าน') }));
    });
  });
```

Create `apps/api/src/document-review/document-review.scheduler.spec.ts`:

```ts
import { DocumentReviewScheduler } from './document-review.scheduler';

describe('DocumentReviewScheduler', () => {
  const prisma = { reviewRound: { findMany: jest.fn(), updateMany: jest.fn() } } as any;
  const notifier = { notifyAssigned: jest.fn() } as any;
  const scheduler = new DocumentReviewScheduler(prisma, notifier);
  // 08:30 Bangkok, Mon 12 Oct 2026
  const now = new Date('2026-10-12T01:30:00Z');

  beforeEach(() => jest.clearAllMocks());

  it('reminds only reviewers who have not decided, on rounds due tomorrow, once', async () => {
    prisma.reviewRound.findMany.mockResolvedValue([{
      id: 'r1', reviewerIds: ['a', 'b'], decisions: [{ reviewerId: 'a' }], dueAt: new Date('2026-10-13T09:00:00Z'),
      documentVersion: { document: { filename: 'คำฟ้อง.docx', caseId: 'c1', case: { firmId: 'f1' } } },
    }]);
    prisma.reviewRound.updateMany.mockResolvedValue({ count: 1 });
    await expect(scheduler.remindDueTomorrow(now)).resolves.toBe(1);
    expect(prisma.reviewRound.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'WAITING_REVIEW', dueReminderSentAt: null,
        dueAt: { gte: new Date('2026-10-12T17:00:00Z'), lt: new Date('2026-10-13T17:00:00Z') },
      }),
    }));
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['b'], firmId: 'f1' }));
  });

  it('skips a round another instance already claimed', async () => {
    prisma.reviewRound.findMany.mockResolvedValue([{ id: 'r1', reviewerIds: ['a'], decisions: [], dueAt: new Date(), documentVersion: { document: { filename: 'x', caseId: 'c1', case: { firmId: 'f1' } } } }]);
    prisma.reviewRound.updateMany.mockResolvedValue({ count: 0 });
    await expect(scheduler.remindDueTomorrow(now)).resolves.toBe(0);
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });
});
```

In `deadline-rules.service.spec.ts`, provide `{ provide: AssignmentNotifierService, useValue: notifier }` (with `const notifier = { notifyAssigned: jest.fn() }`), add `case: { findUnique: jest.fn().mockResolvedValue({ leadLawyerId: 'lead', ownRef: 'TSB-1' }) }` to `mockPrisma`, and inside the `applyTrigger` describe:

```ts
    it('tells the case lead how many suggestions are waiting', async () => {
      // reuse the existing "raises a suggestion per matching rule" arrangement
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 2 });
      await service.applyTrigger(context);
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({
        userIds: ['lead'], summaryText: expect.stringContaining('2'),
      }));
    });
```

(`context` = the trigger context object the neighbouring tests already pass; copy it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/document-review src/deadlines/deadline-rules.service.spec.ts`
Expected: FAIL — scheduler module missing; notifier never called.

- [ ] **Step 3: Implement**

`document-review.service.ts` — inject the notifier and add notices:

```ts
import { NotificationCategory } from '../generated/prisma';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
…
  constructor(private prisma: PrismaService, private notifier: AssignmentNotifierService) {}
```

At the end of `createReviewRound`, before `return`, capture the round and notify:

```ts
    const round = await this.getReviewRound(caseId, documentId, (await this.prisma.reviewRound.findFirst({
      where: { documentVersionId }, orderBy: { createdAt: 'desc' }, select: { id: true },
    }))!.id);
    await this.notifier.notifyAssigned({
      firmId: user.firmId,
      userIds: dto.reviewerIds,
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText: `📝 ขอให้ตรวจเอกสาร: ${version.document.filename}${dto.dueAt ? `\nกำหนด: ${formatBangkokDateThai(new Date(dto.dueAt))}` : ''}`,
      entityPath: `/cases/${caseId}`,
    });
    return round;
```

(import `formatBangkokDateThai` from `../common/utils/bangkok-time`.)

Change `roundInclude` to also carry the filename: `documentVersion: { include: { document: { select: { filename: true } } } }`. In `recordDecision`, add a helper call in both closing branches — after the RETURNED updates and after the APPROVED updates (only inside `if (allApproved)`):

```ts
  private async notifyRoundClosed(round: { createdById: string; documentVersion: { document: { filename: string } } }, user: AuthUser, caseId: string, approved: boolean, reason?: string) {
    await this.notifier.notifyAssigned({
      firmId: user.firmId,
      userIds: [round.createdById],
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText: approved
        ? `✅ เอกสารผ่านการตรวจ: ${round.documentVersion.document.filename}`
        : `↩️ เอกสารถูกส่งกลับแก้: ${round.documentVersion.document.filename}${reason ? `\nเหตุผล: ${reason}` : ''}`,
      entityPath: `/cases/${caseId}`,
    });
  }
```

Calls: `await this.notifyRoundClosed(round, user, caseId, false, dto.reason);` in the return branch and `await this.notifyRoundClosed(round, user, caseId, true);` inside `if (allApproved)`.

Create `document-review.scheduler.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationCategory, ReviewRoundStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { addBangkokDays, bangkokDayStart } from '../common/utils/bangkok-time';

@Injectable()
export class DocumentReviewScheduler {
  private readonly logger = new Logger(DocumentReviewScheduler.name);

  constructor(private prisma: PrismaService, private notifier: AssignmentNotifierService) {}

  @Cron('30 8 * * *', { timeZone: 'Asia/Bangkok' })
  async run() {
    const sent = await this.remindDueTomorrow();
    if (sent) this.logger.log(`Reminded ${sent} review round(s) due tomorrow`);
  }

  /** Rounds still waiting whose due date is tomorrow (Bangkok); each round is claimed once. */
  async remindDueTomorrow(now = new Date()): Promise<number> {
    const tomorrow = addBangkokDays(bangkokDayStart(now), 1);
    const rounds = await this.prisma.reviewRound.findMany({
      where: { status: ReviewRoundStatus.WAITING_REVIEW, dueReminderSentAt: null, dueAt: { gte: tomorrow, lt: addBangkokDays(tomorrow, 1) } },
      include: { decisions: { select: { reviewerId: true } }, documentVersion: { include: { document: { select: { filename: true, caseId: true, case: { select: { firmId: true } } } } } } },
    });
    let sent = 0;
    for (const round of rounds) {
      const claimed = await this.prisma.reviewRound.updateMany({ where: { id: round.id, dueReminderSentAt: null }, data: { dueReminderSentAt: now } });
      if (!claimed.count) continue;
      const decided = new Set(round.decisions.map((d) => d.reviewerId));
      const pending = round.reviewerIds.filter((id) => !decided.has(id));
      const doc = round.documentVersion.document;
      if (!pending.length || !doc.case) continue;
      await this.notifier.notifyAssigned({
        firmId: doc.case.firmId,
        userIds: pending,
        actorUserId: '',
        category: NotificationCategory.TASK,
        summaryText: `⏰ ครบกำหนดตรวจเอกสารพรุ่งนี้: ${doc.filename}`,
        entityPath: doc.caseId ? `/cases/${doc.caseId}` : '/dashboard',
      });
      sent++;
    }
    return sent;
  }
}
```

`document-review.module.ts`:

```ts
import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentReviewService } from './document-review.service';
import { DocumentReviewController } from './document-review.controller';
import { DocumentReviewScheduler } from './document-review.scheduler';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [DocumentReviewController],
  providers: [DocumentReviewService, DocumentReviewScheduler],
  exports: [DocumentReviewService],
})
export class DocumentReviewModule {}
```

Deadlines (skip if Step 0 found it): `deadlines.module.ts` adds `imports: [forwardRef(() => NotificationsModule)]`; `DeadlineRulesService` constructor becomes

```ts
  constructor(
    private prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => AssignmentNotifierService)) private notifier?: AssignmentNotifierService,
  ) {}
```

and at the end of `applyTrigger`, after `createMany`:

```ts
    if (result.count > 0) await this.notifyLead(context, result.count);
    return result.count;
  }

  // ponytail: called inside the caller's transaction; a rolled-back trigger can leave one stray notice. Move to an outbox if that ever matters.
  private async notifyLead(context: DeadlineTriggerContext, count: number) {
    const legalCase = await this.prisma.case.findUnique({ where: { id: context.caseId }, select: { leadLawyerId: true, ownRef: true } });
    if (!legalCase || !this.notifier) return;
    await this.notifier.notifyAssigned({
      firmId: context.firmId,
      userIds: [legalCase.leadLawyerId],
      actorUserId: context.createdById ?? '',
      category: NotificationCategory.CALENDAR,
      summaryText: `📅 มีกำหนดเวลาจากกฎหมาย ${count} รายการรอยืนยัน\nคดี ${legalCase.ownRef}`,
      entityPath: `/cases/${context.caseId}`,
    });
  }
```

(import `forwardRef, Inject, Optional` from `@nestjs/common`, `NotificationCategory` from the generated client.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/document-review src/deadlines src/calendar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/api/src/document-review apps/api/src/deadlines
/usr/bin/git commit -m "feat(notifications): document review round notices, due-tomorrow reminder, deadline suggestions to lead

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Apply SOP — current + next stage, due dates, party side, one notice per assignee

**Files:**
- Create: `apps/api/src/practice-setup/stage-scope.ts`
- Modify: `apps/api/src/practice-setup/practice-setup.service.ts` (`PlaybookStep` :30-39, `StageTaskProposal`/`StageTaskInput` :40-41, `applyPlaybook` :247-341, `proposeStageTasks` :348-400, `createStageTasks` :403-497)
- Modify: `apps/api/src/practice-setup/practice-setup.controller.ts` (`StepDto` :12-21, `StageTaskItemDto` :39-45)
- Test: `apps/api/src/practice-setup/stage-scope.spec.ts` (new), `apps/api/src/practice-setup/practice-setup.service.spec.ts` (`describe('applyPlaybook with stage grouping')` :309-460, `describe('stage-driven task proposals')`)

**Interfaces:**
- Consumes: `CASE_STAGE_ORDER` (Part L order), `partySide`, `PlaybookSide` (Task 2), `DeadlineRulesService.computeDueDate(triggerDate, offset, dayBasis, holidays): string` and `loadHolidays(from, spanDays, client)` (existing / Part L), `Task.requiresAttachment` (Task 1), `AssignmentNotifierService.notifyAssigned`.
- Produces:
  - `stagesToApply(stage: string | null | undefined): CaseStage[]`
  - `stepMatchesSide(step: { side?: PlaybookSide }, side: PlaybookSide | null): boolean`
  - `stepTaskTitle(step: { title: string; side?: PlaybookSide }, side: PlaybookSide | null): string`
  - `PlaybookStep.side?: PlaybookSide`, `PlaybookStep.requiresAttachment?: boolean`; `StageTaskProposal.requiresAttachment: boolean`; `StageTaskInput.requiresAttachment?: boolean`.
  - `applyPlaybook` creates tasks only for `stagesToApply(case.stage)` (+ unstaged steps), each with `dueDate` = apply day + offset, filtered by side, and sends one "ได้รับ N งานใหม่จาก SOP คดี {ownRef}" per assignee.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/practice-setup/stage-scope.spec.ts`:

```ts
import { CaseStage } from '@lawfirm/shared';
import { stagesToApply, stepMatchesSide, stepTaskTitle } from './stage-scope';

describe('stage scope', () => {
  it('current and next stage in CASE_STAGE_ORDER', () => {
    expect(stagesToApply(CaseStage.FILING)).toEqual([CaseStage.FILING, CaseStage.ANSWER]);
    expect(stagesToApply(CaseStage.AWAITING_JUDGMENT)).toEqual([CaseStage.AWAITING_JUDGMENT, CaseStage.APPEAL]);
  });

  it('the last stage has no next', () => {
    expect(stagesToApply(CaseStage.CLOSING)).toEqual([CaseStage.CLOSING]);
  });

  it('a stage outside the order (legacy INTAKE_REVIEW) or none starts at the first stage', () => {
    expect(stagesToApply(CaseStage.INTAKE_REVIEW)).toEqual([CaseStage.INTAKE_REVIEW, CaseStage.FACT_GATHERING]);
    expect(stagesToApply(null)).toEqual([CaseStage.FACT_GATHERING]);
  });

  it('side filter: untagged always, tagged only on our side, both when our side is unknown', () => {
    expect(stepMatchesSide({}, 'PLAINTIFF')).toBe(true);
    expect(stepMatchesSide({ side: 'DEFENDANT' }, 'PLAINTIFF')).toBe(false);
    expect(stepMatchesSide({ side: 'PLAINTIFF' }, 'PLAINTIFF')).toBe(true);
    expect(stepMatchesSide({ side: 'DEFENDANT' }, null)).toBe(true);
  });

  it('marks a sided step "(ถ้าเป็นฝ่าย…)" only when our side is unknown and the title does not already say so', () => {
    expect(stepTaskTitle({ title: 'ยื่นคำร้องขอปล่อยชั่วคราว', side: 'DEFENDANT' }, null)).toBe('ยื่นคำร้องขอปล่อยชั่วคราว (ถ้าเป็นฝ่ายจำเลย)');
    expect(stepTaskTitle({ title: 'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)', side: 'DEFENDANT' }, null)).toBe('ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)');
    expect(stepTaskTitle({ title: 'ยื่นคำร้องขอปล่อยชั่วคราว', side: 'DEFENDANT' }, 'DEFENDANT')).toBe('ยื่นคำร้องขอปล่อยชั่วคราว');
  });
});
```

In `practice-setup.service.spec.ts`, `describe('applyPlaybook with stage grouping')`:

1. Change `theCase` to `{ id: 'case-1', firmId: 'firm-1', caseTypeId: 'ct-1', leadLawyerId: 'owner-1', ownRef: 'TSB-1', stage: CaseStage.FILING, partyRole: null }` so the existing three tests (FILING + ANSWER + unstaged) still expect 6 tasks.
2. Every `new PracticeSetupService(…)` in this describe passes a deadline stub and a notifier instead of `{} as never` for the 4th and 5th args:

```ts
    const deadlines = { computeDueDate: jest.fn(() => '2026-10-20'), loadHolidays: jest.fn().mockResolvedValue(new Set()) };
    const notifier = { notifyAssigned: jest.fn() };
    const service = new PracticeSetupService(prisma as never, { getCaseFilterForUser: jest.fn().mockReturnValue({}) } as never,
      { record: jest.fn() } as never, deadlines as never, notifier as never, {} as never);
```

3. Add:

```ts
  function harness(steps: unknown[], caseOverride: Record<string, unknown> = {}) {
    const db = {
      $queryRaw: jest.fn(),
      case: { findFirst: jest.fn().mockResolvedValue({ ...theCase, ...caseOverride }) },
      appliedPlaybook: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(({ data }) => Promise.resolve({ id: 'pb-1', ...data })) },
      playbookRelease: { findFirst: jest.fn().mockResolvedValue({ id: 'release-1', steps }) },
      caseAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      firmMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'lawyer-2', role: 'LAWYER' }, { userId: 'asst-1', role: 'ASSISTANT' }]) },
      task: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    let n = 1;
    db.task.create.mockImplementation(({ data }) => Promise.resolve({ id: `task-${n++}`, ...data }));
    const deadlines = { computeDueDate: jest.fn(() => '2026-10-20'), loadHolidays: jest.fn().mockResolvedValue(new Set()) };
    const notifier = { notifyAssigned: jest.fn() };
    const service = new PracticeSetupService({ $transaction: jest.fn((cb) => cb(db)) } as never,
      { getCaseFilterForUser: jest.fn().mockReturnValue({}) } as never, { record: jest.fn() } as never,
      deadlines as never, notifier as never, {} as never);
    return { db, deadlines, notifier, service };
  }

  it('creates only the current and the next stage', async () => {
    const { db, service } = harness([
      { title: 'Filing', instructions: '', stage: CaseStage.FILING, primaryRole: 'LAWYER' },
      { title: 'Answer', instructions: '', stage: CaseStage.ANSWER, primaryRole: 'LAWYER' },
      { title: 'Hearing', instructions: '', stage: CaseStage.HEARING, primaryRole: 'LAWYER' },
    ]);
    await service.applyPlaybook(user, theCase.id, 'release-1');
    const titles = db.task.create.mock.calls.map((c) => c[0].data.title);
    expect(titles).toEqual(expect.arrayContaining(['Filing', 'Answer']));
    expect(titles).not.toContain('Hearing');
  });

  it('dates each task from the apply day with the deadline helper and copies requiresAttachment', async () => {
    const { db, deadlines, service } = harness([
      { title: 'ร่างคำฟ้อง', instructions: '', stage: CaseStage.FILING, offsetDays: 7, dayBasis: 'BUSINESS', requiresAttachment: true },
    ]);
    await service.applyPlaybook(user, theCase.id, 'release-1');
    expect(deadlines.computeDueDate).toHaveBeenCalledWith(expect.any(Date), 7, 'BUSINESS', expect.any(Set));
    const sub = db.task.create.mock.calls.map((c) => c[0].data).find((d) => d.title === 'ร่างคำฟ้อง');
    expect(sub).toEqual(expect.objectContaining({ dueDate: new Date('2026-10-20T00:00:00.000Z'), requiresAttachment: true }));
  });

  it('skips steps for the other side; marks them when our side is unknown', async () => {
    const steps = [
      { title: 'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)', instructions: '', stage: CaseStage.FILING, side: 'DEFENDANT' },
      { title: 'ขอให้พิพากษาโดยขาดนัด', instructions: '', stage: CaseStage.FILING, side: 'PLAINTIFF' },
    ];
    const plaintiff = harness(steps, { partyRole: 'PLAINTIFF' });
    await plaintiff.service.applyPlaybook(user, theCase.id, 'release-1');
    expect(plaintiff.db.task.create.mock.calls.map((c) => c[0].data.title)).not.toContain('ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)');

    const unknown = harness(steps, { partyRole: null });
    await unknown.service.applyPlaybook(user, theCase.id, 'release-1');
    expect(unknown.db.task.create.mock.calls.map((c) => c[0].data.title)).toEqual(expect.arrayContaining([
      'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)', 'ขอให้พิพากษาโดยขาดนัด (ถ้าเป็นฝ่ายโจทก์)',
    ]));
  });

  it('sends one batched notice per assignee, never to the person applying', async () => {
    const { notifier, service } = harness([
      { title: 'A', instructions: '', stage: CaseStage.FILING, primaryRole: 'ASSISTANT' },
      { title: 'B', instructions: '', stage: CaseStage.FILING, primaryRole: 'ASSISTANT' },
      { title: 'C', instructions: '', stage: CaseStage.FILING, primaryRole: 'LAWYER' },
    ]);
    await service.applyPlaybook(user, theCase.id, 'release-1');
    const sent = notifier.notifyAssigned.mock.calls.map((c) => [c[0].userIds, c[0].summaryText.split('\n')[0]]);
    expect(sent).toEqual(expect.arrayContaining([
      [['asst-1'], 'ได้รับ 2 งานใหม่จาก SOP คดี TSB-1'],
      [['lawyer-2'], 'ได้รับ 1 งานใหม่จาก SOP คดี TSB-1'],
    ]));
    expect(sent.flatMap(([ids]) => ids)).not.toContain('owner-1'); // stage parents are containers, not work
  });
```

In `describe('stage-driven task proposals')` add (reuse its `buildService`, `user`, `theCase` and the release mock style of the existing `'only returns steps whose stage matches'` test; give `theCase` `partyRole: 'PLAINTIFF'` for this test):

```ts
  it('drops steps for the other side', async () => {
    const { service, prisma } = buildService();
    prisma.case.findFirst.mockResolvedValue({ ...theCase, partyRole: 'PLAINTIFF' });
    prisma.appliedPlaybook.findMany.mockResolvedValue([{ release: { id: 'r1', name: 'แพ่ง', steps: [
      { title: 'ยื่นคำให้การ', instructions: '', stage: CaseStage.ANSWER, side: 'DEFENDANT' },
      { title: 'ขอให้พิพากษาโดยขาดนัด', instructions: '', stage: CaseStage.ANSWER, side: 'PLAINTIFF' },
    ] } }]);
    prisma.playbookRelease.findMany.mockResolvedValue([]);
    const result = await service.proposeStageTasks(user, theCase.id, CaseStage.ANSWER);
    expect(result.map((r) => r.title)).toEqual(['ขอให้พิพากษาโดยขาดนัด']);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/practice-setup`
Expected: FAIL — `./stage-scope` missing; HEARING created; no due dates; no notices.

- [ ] **Step 3: Implement `stage-scope.ts`**

```ts
import { CASE_STAGE_ORDER, CaseStage, PlaybookSide } from '@lawfirm/shared';

/** "Apply whole SOP" creates the current stage and the next; later stages come through the stage-change proposal. */
export function stagesToApply(stage: string | null | undefined): CaseStage[] {
  const index = CASE_STAGE_ORDER.indexOf(stage as CaseStage);
  if (index === -1) return [...(stage ? [stage as CaseStage] : []), CASE_STAGE_ORDER[0]];
  return CASE_STAGE_ORDER.slice(index, index + 2);
}

export function stepMatchesSide(step: { side?: PlaybookSide }, side: PlaybookSide | null): boolean {
  return !step.side || !side || step.side === side;
}

const SIDE_LABEL: Record<PlaybookSide, string> = { PLAINTIFF: 'โจทก์', DEFENDANT: 'จำเลย' };

/** With our side unknown, both sides' steps are created; a sided title says which side it is for. */
export function stepTaskTitle(step: { title: string; side?: PlaybookSide }, side: PlaybookSide | null): string {
  const title = step.title.trim();
  if (!step.side || side || title.includes('ฝ่าย')) return title;
  return `${title} (ถ้าเป็นฝ่าย${SIDE_LABEL[step.side]})`;
}
```

- [ ] **Step 4: Wire it into the service and DTOs**

`practice-setup.controller.ts` `StepDto` — add:

```ts
  @IsOptional() @IsIn(['PLAINTIFF', 'DEFENDANT']) side?: 'PLAINTIFF' | 'DEFENDANT';
  @IsOptional() @IsBoolean() requiresAttachment?: boolean;
```

and `StageTaskItemDto` — add `@IsOptional() @IsBoolean() requiresAttachment?: boolean;`.

`practice-setup.service.ts`:

1. `PlaybookStep` gains `side?: PlaybookSide; requiresAttachment?: boolean;`; `StageTaskProposal` gains `requiresAttachment: boolean`; `StageTaskInput` gains `requiresAttachment?: boolean`. Import `partySide, PlaybookSide` from `@lawfirm/shared` and the three helpers from `./stage-scope`.

2. `applyPlaybook` — inside the transaction, after `theCase` is loaded:

```ts
      const side = partySide(theCase?.partyRole);
      const inScope = new Set<string>(stagesToApply(theCase?.stage));
      const steps = preview.steps.filter((s) => (!s.stage || inScope.has(s.stage)) && stepMatchesSide(s, side));
      const applyDay = new Date();
      const holidays = await this.deadlineRules.loadHolidays(applyDay, Math.max(0, ...steps.map((s) => s.offsetDays ?? 0)), db);
      const dueDateOf = (step: PlaybookStep) => step.offsetDays == null ? null
        : new Date(`${this.deadlineRules.computeDueDate(applyDay, step.offsetDays, (step.dayBasis ?? 'CALENDAR') as DeadlineDayBasis, holidays)}T00:00:00.000Z`);
      const perAssignee = new Map<string, number>();
      const count = (assigneeId: string) => { if (assigneeId !== user.id) perAssignee.set(assigneeId, (perAssignee.get(assigneeId) ?? 0) + 1); };
```

   Build `stageGroups` from `steps` (not `preview.steps`). In both `db.task.create` calls for steps (subtask and flat), use `title: stepTaskTitle(step, side)`, add `dueDate: dueDateOf(step), requiresAttachment: step.requiresAttachment ?? false,` and call `count(assigneeId)` after each. Keep `routineFields(step, assigneeId)` keyed on `preview.steps.indexOf(step)` (unchanged, `step` is the same object).

   In `routineFields`, prefer the case lead as reviewer when they are not the assignee (the widened reviewer rule):

```ts
        const reviewerId = (preview.ownerId !== assigneeId ? preview.ownerId : undefined)
          ?? firmMembers.find(m => m.userId !== assigneeId && ['OWNER', 'SENIOR_LAWYER'].includes(m.role))?.userId;
```

   Return `{ applied, perAssignee, ownRef: theCase?.ownRef ?? '' }` from the transaction for a fresh apply, and `{ applied: preview.existing, perAssignee: new Map(), ownRef: '' }` for the early `preview.existing` return. In `.then`:

```ts
    }).then(async ({ applied, perAssignee, ownRef }) => {
      await this.automationLog.record({ firmId: user.firmId, automation: 'playbook-apply', trigger: { caseId, releaseId, by: user.id }, result: { taskIds: applied.taskIds } });
      for (const [assigneeId, n] of perAssignee) {
        await this.assignmentNotifier.notifyAssigned({
          firmId: user.firmId,
          userIds: [assigneeId],
          actorUserId: user.id,
          category: NotificationCategory.TASK,
          summaryText: `ได้รับ ${n} งานใหม่จาก SOP คดี ${ownRef}`,
          entityPath: `/cases/${caseId}`,
        });
      }
      return applied;
    });
```

3. `proposeStageTasks` — load `const side = partySide(c.partyRole);`, skip `!stepMatchesSide(step, side)` in the loop, key `stepsByTitle` by `stepTaskTitle(step, side)` and use that as `title`, and add `requiresAttachment: step.requiresAttachment ?? false` to each proposal.

4. `createStageTasks` — in the child `task.create` data add `requiresAttachment: t.requiresAttachment ?? false`; replace its routine reviewer pick with the same "lead first unless assignee" rule as step 2.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @lawfirm/shared build && pnpm --filter api exec jest --config jest.config.js src/practice-setup`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/api/src/practice-setup
/usr/bin/git commit -m "feat(sop): apply current+next stage with due dates, party side and one notice per assignee

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Closing email — "อนุมัติ" sends it

**Files:**
- Modify: `apps/api/src/notifications/email.service.ts` (new `sendClosingEmail`)
- Modify: `apps/api/src/closing-email/closing-email.service.ts` (constructor, every `include`, `approveDraft` :181-199)
- Modify: `apps/api/src/closing-email/closing-email.controller.ts` (`approve` takes a body), `dto/closing-email.dto.ts` (new `ApproveClosingEmailDraftDto`), `closing-email.module.ts`
- Modify: `apps/web/src/lib/api.ts` (`ClosingEmailDraft` :3519, `approveClosingEmailDraft` :3092)
- Modify: `apps/web/src/components/cases/CaseClosingReportPanel.tsx` (`handleApprove` :111-127, status line :201-204, approve button/help text :244-257)
- Test: `apps/api/src/closing-email/closing-email.service.spec.ts`, `apps/api/src/notifications/email.service.spec.ts`

**Interfaces:**
- Consumes: `ClosingEmailDraft.sentAt`, `ClosingEmailDraft.sentTo` (Task 1); `ClientContact { id, clientId, name, email }`.
- Produces:
  - `EmailService.sendClosingEmail(p: { to: string; subject: string; bodyText: string; firmName: string }): Promise<boolean>` (true = accepted by the provider; never throws).
  - `ClosingEmailService.approveDraft(user, caseId, draftId, dto: { contactIds: string[] })` → draft with `status: 'APPROVED'`, `sentAt`, `sentTo`.
  - Draft `include` = `{ recipientClient: { select: { id, name, contacts: { select: { id, name, email, isPrimary } } } } }`.
  - Web `api.approveClosingEmailDraft(token, caseId, draftId, contactIds: string[])`; `ClosingEmailDraft.sentAt: string | null`, `sentTo: string[]`, `recipientClient.contacts`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/closing-email/closing-email.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { EmailService } from '../notifications/email.service';

describe('ClosingEmailService.approveDraft', () => {
  const prisma = {
    closingEmailDraft: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    clientContact: { findMany: jest.fn() },
  };
  const email = { isConfigured: jest.fn().mockReturnValue(true), sendClosingEmail: jest.fn() };
  const user = { id: 'u1', firmId: 'f1', firmName: 'สำนักงานทดสอบ' } as any;
  const draft = { id: 'd1', caseId: 'c1', status: 'DRAFT', subject: 'สรุปคดี', bodyText: 'เรียน ลูกความ', recipientClientId: 'cl1' };
  let service: ClosingEmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    email.isConfigured.mockReturnValue(true);
    const module = await Test.createTestingModule({
      providers: [ClosingEmailService, { provide: PrismaService, useValue: prisma }, { provide: EmailService, useValue: email }],
    }).compile();
    service = module.get(ClosingEmailService);
    prisma.closingEmailDraft.findFirst.mockResolvedValue(draft);
    prisma.closingEmailDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.closingEmailDraft.update.mockImplementation(async ({ data }) => ({ ...draft, ...data }));
  });

  it('sends to the selected contacts of the draft client and records who got it', async () => {
    prisma.clientContact.findMany.mockResolvedValue([{ id: 'k1', email: 'a@x.co' }, { id: 'k2', email: 'b@x.co' }]);
    email.sendClosingEmail.mockResolvedValue(true);
    const result = await service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1', 'k2'] });
    expect(prisma.clientContact.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['k1', 'k2'] }, clientId: 'cl1', email: { not: null } }, select: { id: true, email: true },
    });
    expect(email.sendClosingEmail).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ status: 'APPROVED', sentTo: ['a@x.co', 'b@x.co'], sentAt: expect.any(Date) }));
  });

  it('refuses a contact that is not on the draft client or has no email', async () => {
    prisma.clientContact.findMany.mockResolvedValue([{ id: 'k1', email: 'a@x.co' }]);
    await expect(service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1', 'other'] })).rejects.toThrow(BadRequestException);
    expect(email.sendClosingEmail).not.toHaveBeenCalled();
  });

  it('refuses before sending when email is not configured', async () => {
    email.isConfigured.mockReturnValue(false);
    await expect(service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1'] })).rejects.toThrow('อีเมล');
    expect(prisma.closingEmailDraft.update).not.toHaveBeenCalled();
  });

  it('keeps the draft unsent when every delivery fails', async () => {
    prisma.clientContact.findMany.mockResolvedValue([{ id: 'k1', email: 'a@x.co' }]);
    email.sendClosingEmail.mockResolvedValue(false);
    await expect(service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1'] })).rejects.toThrow('ส่งอีเมลไม่สำเร็จ');
    expect(prisma.closingEmailDraft.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'DRAFT' } }));
  });

  it('records only the recipients that succeeded when some fail', async () => {
    prisma.clientContact.findMany.mockResolvedValue([{ id: 'k1', email: 'a@x.co' }, { id: 'k2', email: 'b@x.co' }]);
    email.sendClosingEmail.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const result = await service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1', 'k2'] });
    expect(result.sentTo).toEqual(['a@x.co']);
  });

  it('a second approve of an already-approved draft is refused without sending', async () => {
    prisma.closingEmailDraft.updateMany.mockResolvedValue({ count: 0 });
    prisma.clientContact.findMany.mockResolvedValue([{ id: 'k1', email: 'a@x.co' }]);
    await expect(service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1'] })).rejects.toThrow('อนุมัติไปแล้ว');
    expect(email.sendClosingEmail).not.toHaveBeenCalled();
  });
});
```

(The existing `gatherCaseData` suite constructs the service via `Test.createTestingModule`; add `{ provide: EmailService, useValue: {} }` to its providers.)

Append to `apps/api/src/notifications/email.service.spec.ts`, following that file's existing fetch-mock pattern:

```ts
  it('sendClosingEmail returns false instead of throwing when the provider refuses', async () => {
    // configure RESEND_API_KEY / SENDGRID_FROM_EMAIL the way the neighbouring tests do
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ message: 'bad' }) });
    await expect(service.sendClosingEmail({ to: 'a@x.co', subject: 's', bodyText: 'b', firmName: 'f' })).resolves.toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/closing-email src/notifications/email.service.spec.ts`
Expected: FAIL — `sendClosingEmail is not a function`, approve does not send.

- [ ] **Step 3: Implement the API**

`email.service.ts` — add:

```ts
  /** Closing report to a client contact. Plain text is the source; HTML keeps its line breaks. */
  async sendClosingEmail(p: { to: string; subject: string; bodyText: string; firmName: string }): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:640px;white-space:pre-wrap">${escapeHtml(p.bodyText)}</div><p style="font-size:12px;color:#6b7280">${escapeHtml(p.firmName)}</p>`;
    try {
      await this.send({ to: p.to, subject: p.subject, text: p.bodyText, html });
      this.logger.log(`Closing email sent to ${maskEmail(p.to)}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send closing email to ${maskEmail(p.to)}: ${error instanceof Error ? error.message : 'unknown'}`);
      return false;
    }
  }
```

`dto/closing-email.dto.ts`:

```ts
export class ApproveClosingEmailDraftDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  contactIds!: string[];
}
```

(add `ArrayMaxSize, ArrayMinSize, IsUUID` to the import.)

`closing-email.module.ts`: `imports: [forwardRef(() => NotificationsModule)]` (EmailService is exported there).

`closing-email.controller.ts` `approve`: add `@Body() dto: ApproveClosingEmailDraftDto` and call `this.closingEmailService.approveDraft(user, caseId, draftId, dto)`.

`closing-email.service.ts`:

```ts
const draftInclude = {
  recipientClient: { select: { id: true, name: true, contacts: { select: { id: true, name: true, email: true, isPrimary: true } } } },
} as const;
```

Use `include: draftInclude` in `createDraft`, `listDrafts`, `updateDraft`. Constructor: `constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}`. Replace `approveDraft`:

```ts
  async approveDraft(user: AuthUser, caseId: string, draftId: string, dto: ApproveClosingEmailDraftDto) {
    const draft = await this.prisma.closingEmailDraft.findFirst({ where: { id: draftId, caseId } });
    if (!draft) throw new NotFoundException('ไม่พบร่างอีเมลนี้');
    if (draft.status === ClosingEmailDraftStatus.APPROVED) throw new BadRequestException('ร่างนี้อนุมัติไปแล้ว');
    if (!this.email.isConfigured()) throw new BadRequestException('ระบบยังไม่ได้ตั้งค่าการส่งอีเมล ติดต่อผู้ดูแลระบบ');
    if (!draft.recipientClientId) throw new BadRequestException('ร่างนี้ไม่มีลูกความผู้รับ');

    const contacts = await this.prisma.clientContact.findMany({
      where: { id: { in: dto.contactIds }, clientId: draft.recipientClientId, email: { not: null } },
      select: { id: true, email: true },
    });
    if (contacts.length !== new Set(dto.contactIds).size) {
      throw new BadRequestException('เลือกได้เฉพาะผู้ติดต่อของลูกความรายนี้ที่มีอีเมล');
    }

    // Claim first: a double click must not send twice.
    const claimed = await this.prisma.closingEmailDraft.updateMany({
      where: { id: draftId, status: ClosingEmailDraftStatus.DRAFT },
      data: { status: ClosingEmailDraftStatus.APPROVED },
    });
    if (!claimed.count) throw new BadRequestException('ร่างนี้อนุมัติไปแล้ว');

    const sentTo: string[] = [];
    for (const contact of contacts) {
      const ok = await this.email.sendClosingEmail({ to: contact.email!, subject: draft.subject, bodyText: draft.bodyText, firmName: user.firmName });
      if (ok) sentTo.push(contact.email!);
    }
    if (!sentTo.length) {
      await this.prisma.closingEmailDraft.updateMany({ where: { id: draftId }, data: { status: ClosingEmailDraftStatus.DRAFT } });
      throw new BadRequestException('ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่');
    }

    return this.prisma.closingEmailDraft.update({
      where: { id: draftId },
      data: { status: ClosingEmailDraftStatus.APPROVED, approvedById: user.id, approvedAt: new Date(), sentAt: new Date(), sentTo },
      include: draftInclude,
    });
  }
```

- [ ] **Step 4: Web**

`apps/web/src/lib/api.ts`:

```ts
export interface ClosingEmailDraft {
  id: string;
  caseId: string;
  subject: string;
  bodyText: string;
  recipientKind: 'CLIENT' | 'CUSTOMER';
  recipientClientId: string | null;
  recipientClient?: { id: string; name: string; contacts?: { id: string; name: string; email: string | null; isPrimary: boolean }[] } | null;
  selectedActivityIds: string[];
  missingDataNotes: string[];
  status: 'DRAFT' | 'APPROVED';
  sentAt?: string | null;
  sentTo?: string[];
  createdAt: string;
}
```

```ts
  approveClosingEmailDraft: (token: string, caseId: string, draftId: string, contactIds: string[]) =>
    request<ClosingEmailDraft>(`/cases/${caseId}/closing-email-drafts/${draftId}/approve`, {
      method: 'POST',
      token,
      body: JSON.stringify({ contactIds }),
    }),
```

(match the `body` convention the neighbouring `request` calls use.)

`CaseClosingReportPanel.tsx`:

1. State: `const [contactIds, setContactIds] = useState<string[]>([]);` and when a draft is selected/loaded, default it to the primary contacts with email:

```ts
  useEffect(() => {
    setContactIds((draft?.recipientClient?.contacts ?? []).filter((c) => c.email && c.isPrimary).map((c) => c.id));
  }, [draft?.id]);
```

2. `handleApprove`: call `api.approveClosingEmailDraft(token, caseId, draft.id, contactIds)` and set the notice to ``ส่งแล้วถึง ${approved.sentTo?.join(', ')}``.

3. Status line: replace `{approved ? 'อนุมัติแล้ว' : 'ยังเป็นร่าง'}` with
   `{draft.sentAt ? `ส่งแล้ว ${formatDateTime(draft.sentAt)}` : approved ? 'อนุมัติแล้ว' : 'ยังเป็นร่าง'}`
   and, when `draft.sentTo?.length`, a line `<p className="mb-2 text-xs text-muted-foreground">ส่งถึง: {draft.sentTo.join(', ')}</p>`.

4. Above the buttons, when `!approved`, a recipient picker:

```tsx
                {!approved && (
                  <fieldset className="mb-2 space-y-1 text-sm">
                    <legend className="text-xs text-muted-foreground">ส่งถึงผู้ติดต่อ</legend>
                    {(draft.recipientClient?.contacts ?? []).filter((c) => c.email).map((c) => (
                      <label key={c.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={contactIds.includes(c.id)}
                          onChange={(e) => setContactIds((ids) => e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id))}
                        />
                        {c.name} · {c.email}
                      </label>
                    ))}
                    {!(draft.recipientClient?.contacts ?? []).some((c) => c.email) && (
                      <p className="text-xs text-destructive">ลูกความรายนี้ยังไม่มีผู้ติดต่อที่มีอีเมล</p>
                    )}
                  </fieldset>
                )}
```

5. Approve button: `disabled={busy !== null || approved || dirty || contactIds.length === 0}`, label `{draft.sentAt ? 'ส่งแล้ว' : busy === 'approve' ? 'กำลังส่ง...' : 'อนุมัติและส่ง'}`; help text when not dirty: `'อนุมัติแล้วระบบจะส่งอีเมลถึงผู้ติดต่อที่เลือกทันที'`.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js src/closing-email src/notifications/email.service.spec.ts && pnpm --filter web exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/api/src/closing-email apps/api/src/notifications/email.service.ts apps/api/src/notifications/email.service.spec.ts apps/web/src/lib/api.ts apps/web/src/components/cases/CaseClosingReportPanel.tsx
/usr/bin/git commit -m "feat(closing-email): approving a draft sends it to the chosen client contacts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Web — review flow on boards, "รอตรวจ" / "รอฉันตรวจ", hidden internal labels, held badge

**Files:**
- Create: `apps/web/src/lib/task-review-view.ts`, `apps/web/src/lib/task-review-view.test.ts`
- Create: `apps/web/src/components/tasks/ReviewQueueList.tsx`
- Modify: `apps/api/src/tasks/tasks.service.ts` (`boardInclude` :87 — add `onHold`), `apps/api/src/tasks/task-detail.service.ts` (detail include — add `reviewer`)
- Modify: `apps/web/src/lib/api.ts` (`TaskItem.onHold`, `getMyTodos(view)`, `DashboardStats.reviewQueue`, `handoffTask`/`handoffTodo` note required)
- Modify: `apps/web/src/lib/i18n/dashboard.ts` (:814/:1905 keep; :856/:1947 note placeholder; new keys)
- Modify: `apps/web/src/components/KanbanBoard.tsx` (props :30-66, `renderTask` :155-330)
- Modify: `apps/web/src/components/cases/CaseTasksPanel.tsx` (:103-107 handoff, :149-152, :356-368 board props)
- Modify: `apps/web/src/app/(dashboard)/todos/page.tsx` (`loadTasks` :92, `handleHandoff` :155-164, scopes :253-262 and :321, list layout :600-622)
- Modify: `apps/web/src/components/tasks/TaskDetailDrawer.tsx` (`canReview` :279, handoff block :406-410, labels :513-520)
- Modify: `apps/web/src/app/(dashboard)/dashboard/page.tsx` (aside, before "นัดและกำหนดถัดไป"), `apps/web/src/components/agenda/MyDayPanel.tsx` (before the overdue section :281)

**Interfaces:**
- Consumes: `awaitsReviewBy`, `effectiveReviewerId`, `isEligibleReviewer`, `visibleTaskLabels`, `taskStageChip`, `TASK_HANDOFF_NOTE_MIN`, `ReviewQueueItem` (Tasks 2/4); API from Tasks 3/4.
- Produces:
  - `submittedByMe(task, userId): boolean`, `reviewerName(task, caseLead?): string | null`, `isHeld(task): boolean`, `handoffNoteError(note: string): string | null` in `lib/task-review-view.ts`.
  - `<ReviewQueueList items={ReviewQueueItem[]} />` — "รอฉันตรวจ" card list linking to the task.
  - `KanbanBoard` prop `caseLeadId?: string | null` (replaces `isReviewer` and `handoffAllowed` for review decisions).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/task-review-view.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffNoteError, isHeld, reviewerName, submittedByMe } from './task-review-view.ts';

const person = (id: string, firstName: string) => ({ id, firstName, lastName: 'ส.' });

test('my submitted work is mine while it waits for review', () => {
  assert.equal(submittedByMe({ status: 'PENDING_REVIEW', assignee: person('me', 'ก') } as any, 'me'), true);
  assert.equal(submittedByMe({ status: 'IN_PROGRESS', assignee: person('me', 'ก') } as any, 'me'), false);
});

test('the card names the real reviewer, else the case lead', () => {
  assert.equal(reviewerName({ reviewer: person('r', 'สมศรี') } as any, person('lead', 'หัวหน้า')), 'สมศรี ส.');
  assert.equal(reviewerName({ reviewer: null } as any, person('lead', 'หัวหน้า')), 'หัวหน้า ส.');
  assert.equal(reviewerName({ reviewer: null } as any), null);
});

test('held only while the hold is open', () => {
  assert.equal(isHeld({ onHold: { reason: 'รอศาล', endedAt: null } } as any), true);
  assert.equal(isHeld({ onHold: { reason: 'รอศาล', endedAt: '2026-10-01T00:00:00Z' } } as any), false);
  assert.equal(isHeld({ onHold: null } as any), false);
});

test('handoff note needs at least 5 non-blank characters', () => {
  assert.match(handoffNoteError('  ok ') ?? '', /5/);
  assert.equal(handoffNoteError('ร่างเสร็จแล้ว'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lawfirm/shared build && cd apps/web && node --test --experimental-strip-types src/lib/task-review-view.test.ts; cd ../..`
Expected: FAIL — cannot find `./task-review-view.ts`.

- [ ] **Step 3: Implement the helpers and data plumbing**

Create `apps/web/src/lib/task-review-view.ts`:

```ts
import { TASK_HANDOFF_NOTE_MIN } from '@lawfirm/shared';

type Person = { id: string; firstName: string; lastName?: string | null };
type ReviewTask = {
  status: string;
  assignee?: Person | null;
  reviewer?: Person | null;
  onHold?: { reason: string; endedAt: string | null } | null;
};

const fullName = (p: Person) => `${p.firstName} ${p.lastName ?? ''}`.trim();

/** My own work handed in and waiting — listed under "รอตรวจ", never under "รอฉันตรวจ". */
export function submittedByMe(task: ReviewTask, userId: string): boolean {
  return task.status === 'PENDING_REVIEW' && task.assignee?.id === userId;
}

/** "ส่งให้ {name} ตรวจ": the named reviewer, else the case lead. */
export function reviewerName(task: ReviewTask, caseLead?: Person | null): string | null {
  const reviewer = task.reviewer ?? caseLead;
  return reviewer ? fullName(reviewer) : null;
}

export function isHeld(task: ReviewTask): boolean {
  return !!task.onHold && !task.onHold.endedAt;
}

export function handoffNoteError(note: string): string | null {
  return note.trim().length >= TASK_HANDOFF_NOTE_MIN ? null : `เขียนหมายเหตุถึงผู้ตรวจอย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร`;
}
```

API (small, for the cards): in `tasks.service.ts` `boardInclude` add `onHold: { select: { reason: true, endedAt: true } },`; in `task-detail.service.ts` detail include add `reviewer: person,`.

`apps/web/src/lib/api.ts`:
- `TaskItem`: add `onHold?: { reason: string; endedAt: string | null } | null;` and `case?: { …existing…; leadLawyerId?: string } | null`.
- `getMyTodos: (token: string, view: 'all' | 'review' = 'all') => request<TaskItem[]>(view === 'all' ? '/todos' : `/todos?view=${view}`, { token }),`
- `DashboardStats`: add `reviewQueue?: import('@lawfirm/shared').ReviewQueueItem[];`
- `handoffTask` data: `{ note: string; stageDueDate?: string }`; `handoffTodo` data: `{ reviewerId: string; note: string; stageDueDate?: string }`.

`lib/i18n/dashboard.ts`: change `handoffNotePlaceholder` to `'หมายเหตุถึงผู้ตรวจ (อย่างน้อย 5 ตัวอักษร)'` / `'Note to the reviewer (at least 5 characters)'`; add `todos.submittedGroup: 'รอตรวจ'` / `'Awaiting review'`, `todos.heldBadge: 'พักอยู่'` / `'On hold'`, `todos.reviewQueueTitle: 'รอฉันตรวจ'` / `'Awaiting my review'`, `todos.reviewQueueEmpty: 'ไม่มีงานรอตรวจ'` / `'Nothing to review'`.

- [ ] **Step 4: KanbanBoard**

1. Props: remove `isReviewer` and `handoffAllowed` from the interface and destructuring; add

```ts
  /** Case boards: the lead reviews reviewer-less tasks and is named on the handoff button. */
  caseLeadId?: string | null;
```

   Keep `reviewerName` (the case lead's name) as the fallback label. Run `grep -rn "isReviewer=\|handoffAllowed=" apps/web/src` and remove those props from every `<KanbanBoard>` caller (tsc flags any left).

2. In `renderTask`, replace the `canHandoff` / `canReview` block with:

```ts
        const reviewer = effectiveReviewerId(task, caseLeadId);
        const canHandoff =
          enableHandoff &&
          (isAssignee || !task.assignee) &&
          reviewer !== currentUserId &&
          handoffSourceStatuses.includes(task.status);
        const canReview = enableHandoff && awaitsReviewBy(task, currentUserId, caseLeadId);
        const shownLabels = visibleTaskLabels(task.labels);
        const stageChip = taskStageChip(task.labels);
        const handoffLabel = reviewerNameOf(task, null) ?? reviewerName;
```

   (import `awaitsReviewBy, effectiveReviewerId, visibleTaskLabels, taskStageChip` from `@lawfirm/shared` and `reviewerName as reviewerNameOf, isHeld, handoffNoteError` from `@/lib/task-review-view`.) For standalone boards (`requireReviewerOnHandoff`) `reviewer` is `task.reviewerId ?? null`, so the check is unchanged there.

3. Labels: replace the `labels` constant usage with `shownLabels`, and render the stage chip and held badge before them:

```tsx
            {(stageChip || isHeld(task)) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {stageChip && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{stageChip}</span>}
                {isHeld(task) && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300" title={task.onHold?.reason}>{d.todos.heldBadge}</span>}
              </div>
            )}
```

4. Handoff button text: `{handoffLabel ? fmt(d.todos.handoffToReviewer, { name: handoffLabel }) : d.todos.handoffToSenior}`.

5. Handoff form: under the note `<input>` show `{handoffNote && handoffNoteError(handoffNote) && <p className="text-xs text-muted-foreground">{handoffNoteError(handoffNote)}</p>}` and add `|| !!handoffNoteError(handoffNote)` to the submit button's `disabled`. Pass `handoffNote.trim()` to `onHandoff`.

6. Standalone reviewer `<select>`: filter `reviewerChoices` with `isEligibleReviewer({ role: u.firmRole, userId: u.id, assigneeId: task.assignee?.id ?? currentUserId })` (the option type gains `firmRole?: string | null`; `todos/page.tsx` already passes `users` that carry `firmRole`).

- [ ] **Step 5: Case board, todos page, drawer**

`CaseTasksPanel.tsx`:
- `handleHandoff`: `await api.handoffTask(token, caseId, taskId, { note });`
- Delete `isReviewer`; pass `caseLeadId={caseDetail?.leadLawyer?.id ?? null}` and drop `isReviewer` / `handoffAllowed` from `<KanbanBoard>`.

`todos/page.tsx`:
- `loadTasks`: fetch `api.getMyTodos(token, 'review')` in the same `Promise.all` and merge into `tasksById` (so a reviewer always sees their queue even for tasks the inbox query does not return).
- `handleHandoff`: send `{ note }` / `{ reviewerId, note }` (no `|| undefined`).
- `scope === 'review'` filter and its count (:261, :321) become `awaitsReviewBy(t, user?.id ?? '')` (import from `@lawfirm/shared`).
- List layout: when `scope === 'mine'`, render rows where `submittedByMe(task, user.id)` after the others under a heading `<li className="bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">{d.todos.submittedGroup}</li>`; show `isHeld(task)` as the `heldBadge` pill next to the status pill.

`TaskDetailDrawer.tsx`:
- `const canReview = !!user && awaitsReviewBy(task ?? { status: '' }, user.id, task?.case?.leadLawyerId);` (replaces `pendingReview && ownWork`).
- Handoff block: add a `TextareaField label="หมายเหตุถึงผู้ตรวจ *"` bound to a new `handoffNote` state; standalone reviewer picker filters with `isEligibleReviewer({ role: u.firmRole, userId: u.id, assigneeId: task.assignee?.id })`; the button is disabled while `!!handoffNoteError(handoffNote)` and sends `{ note: handoffNote.trim() }` / `{ reviewerId, note: handoffNote.trim() }`; when `task.requiresAttachment && task.attachments.length === 0` show `<p className="text-xs text-destructive">งานนี้ต้องแนบไฟล์ผลงานก่อนส่งตรวจ</p>` and disable the button. Label the button `ส่งให้ ${reviewerName(task, …lead…) ?? 'ผู้ตรวจ'} ตรวจ` (lead from the case detail if the drawer has it; otherwise `task.reviewer`).
- In the `canReview` block, show the worker's note first (spec: "the note is shown to the reviewer"):

```tsx
                {(() => { const sent = task.assignmentLogs?.filter((l) => l.action === TaskLogAction.HANDED_OFF).at(-1); return sent?.note
                  ? <p className="whitespace-pre-line rounded-lg bg-muted/50 p-2 text-sm">📝 {sent.note}<span className="mt-1 block text-xs text-muted-foreground">{sent.fromUser ? `${sent.fromUser.firstName} ${sent.fromUser.lastName}` : ''} · {formatDateTime(sent.createdAt)}</span></p>
                  : null; })()}
```

  Do the same on the Kanban card when `canReview` (one line, `numberOfLines`-style `line-clamp-2`), using the last HANDED_OFF log if the board row has it; board rows only carry `handedOffById`, so on the board show just "มีหมายเหตุ — เปิดงานเพื่ออ่าน" when `task.status === 'PENDING_REVIEW'`.
- Labels editor: render `visibleTaskLabels(task.labels)` only, and when removing a label patch `labels: task.labels.filter((x) => x !== l)` (internal labels stay in data); show `taskStageChip(task.labels)` as a read-only chip.

- [ ] **Step 6: "รอฉันตรวจ" on dashboard and my-day**

Create `apps/web/src/components/tasks/ReviewQueueList.tsx`:

```tsx
'use client';

import Link from 'next/link';
import type { ReviewQueueItem } from '@lawfirm/shared';
import { formatDateTime } from '@/lib/utils';

export function ReviewQueueList({ items, title = 'รอฉันตรวจ', empty = 'ไม่มีงานรอตรวจ' }: { items: ReviewQueueItem[]; title?: string; empty?: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card" aria-label={title}>
      <h2 className="border-b border-border px-5 py-4 text-sm font-semibold">{title} <span className="ml-1 tabular-nums text-muted-foreground">{items.length}</span></h2>
      {items.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p> : (
        <ul className="divide-y divide-border/70">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={item.caseId ? `/cases/${item.caseId}/tasks?task=${item.id}` : `/todos?task=${item.id}`} className="block px-5 py-4 hover:bg-muted/40">
                <p className="break-words text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[item.caseRef, item.workerName && `จาก ${item.workerName}`, item.submittedAt && `ส่งเมื่อ ${formatDateTime(item.submittedAt)}`].filter(Boolean).join(' · ')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- `dashboard/page.tsx`: at the top of the `<aside>`, render `{(data?.reviewQueue ?? agenda?.reviewQueue)?.length ? <ReviewQueueList items={(data?.reviewQueue ?? agenda?.reviewQueue)!} title={d.todos.reviewQueueTitle} empty={d.todos.reviewQueueEmpty} /> : null}` (use the page's `t()` helper if it has no `d`).
- `MyDayPanel.tsx`: before the overdue section, `{data.reviewQueue?.length > 0 && <ReviewQueueList items={data.reviewQueue} />}`.

- [ ] **Step 7: Verify**

Run:
```bash
pnpm --filter @lawfirm/shared build
cd apps/web && node --test --experimental-strip-types src/lib/task-review-view.test.ts src/lib/daily-workboard.test.ts && cd ../..
pnpm --filter web exec tsc --noEmit
pnpm --filter api exec jest --config jest.config.js src/tasks
```
Expected: all PASS / no type errors. Then open the case tasks tab in the browser (port per `.claude/launch.json`): a lawyer's card says "ส่งให้ {lead} ตรวจ", the note button stays disabled under 5 chars, the lead sees อนุมัติ/ส่งกลับ, the worker sees the card under "รอตรวจ" and no `stage:`/`playbook:` labels anywhere.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/web/src apps/api/src/tasks/tasks.service.ts apps/api/src/tasks/task-detail.service.ts
/usr/bin/git commit -m "feat(web): review flow keeps the worker, รอตรวจ/รอฉันตรวจ lists, readable stage chip, held badge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Web — task form, delegation pickers, พักงาน in the drawer, @mentions, SOP step options

**Files:**
- Create: `apps/web/src/lib/workload-label.ts`, `apps/web/src/lib/mentions.ts`, `apps/web/src/lib/on-hold.ts`, `apps/web/src/lib/task-form.test.ts`
- Modify: `apps/web/src/app/(dashboard)/cases/new/page.tsx` (`workloadLabel` :101-105 → import)
- Modify: `apps/web/src/components/cases/CaseTasksPanel.tsx` (state :38-47, `handleCreate` :121-151, `reviewers` :174, form :239-335, footer :337-342)
- Modify: `apps/web/src/components/cases/CaseCommentsPanel.tsx` (`getMentionContext` :60-67 → import)
- Modify: `apps/web/src/components/tasks/TaskDetailDrawer.tsx` (pickers :362, :454, :616; comments :649-673; new hold section; requiresAttachment toggle)
- Modify: `apps/web/src/app/(dashboard)/todos/page.tsx` (`assignableUsers` :81-83)
- Modify: `apps/web/src/app/(dashboard)/operations/page.tsx` (`ON_HOLD_CATEGORY_LABEL` :42-48 → import)
- Modify: `apps/web/src/lib/practice-setup.ts` (`PlaybookStep` :8-19), `apps/web/src/app/(dashboard)/playbooks/[id]/QuickFlowCanvas.tsx` (step editor :113-130)
- Modify: `apps/web/src/lib/api.ts` (`addTaskComment` :3028, `createTask` payload type, `resumeTaskFromOnHold` unchanged)

**Interfaces:**
- Consumes: `canDelegateTask`, `isEligibleReviewer` (Task 2); `CreateTaskDto.requiresAttachment` (Task 3); `CreateTaskCommentDto.mentionedUserIds`, hold upsert + notices (Task 5); `StepDto.side/requiresAttachment` (Task 8); `api.getWorkloadSummary` (existing).
- Produces:
  - `workloadLabel(w: Pick<WorkloadSummary, 'leadCount' | 'buddyCount' | 'nearDeadlineCount'> | undefined): string`
  - `getMentionContext(text: string, cursor: number): { startIdx: number; query: string } | null`, `mentionedIdsIn(body: string, picked: { id: string; firstName: string; lastName: string }[]): string[]`
  - `ON_HOLD_CATEGORY_LABEL: Record<string, string>` (now also `OTHER: 'อื่น ๆ'`)
  - `api.addTaskComment(token, taskId, body, mentionedUserIds?: string[])`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/task-form.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workloadLabel } from './workload-label.ts';
import { getMentionContext, mentionedIdsIn } from './mentions.ts';

test('workload hint reads like the case create form', () => {
  assert.equal(workloadLabel({ leadCount: 3, buddyCount: 1, nearDeadlineCount: 2 }), ' (หลัก 3, ผู้ช่วย 1, ใกล้ deadline 2)');
  assert.equal(workloadLabel(undefined), '');
});

test('mention context is the word after the last @ up to the cursor', () => {
  assert.deepEqual(getMentionContext('ฝาก @สม', 7), { startIdx: 5, query: 'สม' });
  assert.equal(getMentionContext('ฝาก @สม ชาย', 11), null);
  assert.equal(getMentionContext('ไม่มี', 5), null);
});

test('only people still named in the body count as mentioned', () => {
  const picked = [{ id: 'a', firstName: 'สมชาย', lastName: 'ใจดี' }, { id: 'b', firstName: 'สมหญิง', lastName: 'รักงาน' }];
  assert.deepEqual(mentionedIdsIn('@สมชาย ช่วยดูข้อ 3', picked), ['a']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test --experimental-strip-types src/lib/task-form.test.ts; cd ../..`
Expected: FAIL — modules not found.

- [ ] **Step 3: Small libs**

`apps/web/src/lib/workload-label.ts`:

```ts
import type { WorkloadSummary } from './api';

/** Same hint as the case create form's lead-lawyer picker. */
export function workloadLabel(w: Pick<WorkloadSummary, 'leadCount' | 'buddyCount' | 'nearDeadlineCount'> | undefined): string {
  return w ? ` (หลัก ${w.leadCount}, ผู้ช่วย ${w.buddyCount}, ใกล้ deadline ${w.nearDeadlineCount})` : '';
}
```

In `cases/new/page.tsx` replace the local `workloadLabel` body with `workloadLabel(workload.find((x) => x.userId === userId))` (keep the call sites; import as `workloadHint` if the name clashes).

`apps/web/src/lib/mentions.ts` (moved from `CaseCommentsPanel`):

```ts
/** The `@query` being typed at the cursor, or null. Names may be Thai; a space ends the query. */
export function getMentionContext(text: string, cursorPos: number): { startIdx: number; query: string } | null {
  const beforeCursor = text.substring(0, cursorPos);
  const lastAt = beforeCursor.lastIndexOf('@');
  if (lastAt === -1) return null;
  const afterLastAt = beforeCursor.substring(lastAt + 1);
  if (!/^[^\s@]*$/.test(afterLastAt)) return null;
  return { startIdx: lastAt + 1, query: afterLastAt.toLowerCase() };
}

/** Picked people whose "@FirstName" is still in the body (a deleted mention does not notify). */
export function mentionedIdsIn(body: string, picked: { id: string; firstName: string; lastName: string }[]): string[] {
  return [...new Set(picked.filter((p) => body.includes(`@${p.firstName}`)).map((p) => p.id))];
}
```

`CaseCommentsPanel.tsx`: delete its inline `getMentionContext` and import it from `@/lib/mentions`.

`apps/web/src/lib/on-hold.ts`:

```ts
export const ON_HOLD_CATEGORY_LABEL: Record<string, string> = {
  WAITING_CLIENT: 'รอลูกความ',
  WAITING_COURT: 'รอศาล',
  WAITING_DOCUMENT: 'รอเอกสาร',
  WAITING_INTERNAL_REVIEW: 'รอรีวิวภายใน',
  WAITING_EXTERNAL: 'รอบุคคลภายนอก',
  OTHER: 'อื่น ๆ',
};
```

and `operations/page.tsx` imports it instead of its local constant.

`api.ts`: `addTaskComment: (token: string, taskId: string, body: string, mentionedUserIds?: string[]) => request<TaskCommentItem>(`/tasks/${taskId}/comments`, { method: 'POST', token, body: JSON.stringify({ body, mentionedUserIds }) }),`; add `requiresAttachment?: boolean; description?: string;` to the `createTask` payload type if not present.

- [ ] **Step 4: Case task form**

In `CaseTasksPanel.tsx`:

1. State: `const [newDescription, setNewDescription] = useState('');`, `const [newRequiresAttachment, setNewRequiresAttachment] = useState(false);`, `const [workload, setWorkload] = useState<WorkloadSummary[]>([]);` and load it once next to the users load: `api.getWorkloadSummary(token).then(setWorkload).catch(() => setWorkload([]));`.
2. Assignee options — only people the viewer may delegate to (the API refuses the rest):

```ts
  const canGive = (member: UserItem) => member.id === user?.id || (!!user && member.firmRole != null && canDelegateTask(user.firmRole, member.firmRole));
  const caseTeam = users.filter((member) => caseTeamIds.has(member.id) && canGive(member));
  const others = users.filter((member) => !caseTeamIds.has(member.id) && canGive(member));
```

   and render both `<AssigneeOptions … nameOf={(u) => `${u.firstName} ${u.lastName ?? ''}${workloadLabel(workload.find((w) => w.userId === u.id))}`} />`.
3. Reviewers — exactly the eligible people:

```ts
  const reviewers = users.filter((member) => isEligibleReviewer({
    role: member.firmRole, userId: member.id, caseLeadId: caseDetail?.leadLawyer?.id, assigneeId: newAssigneeId || user?.id,
  }));
```

   and change the empty hint to `ต้องมี Owner ทนายอาวุโส หรือทนายหลักของคดีเป็นผู้ตรวจ (ไม่ใช่ผู้ทำงาน)`.
4. Form fields — after the title input:

```tsx
                <div>
                  <label htmlFor="case-task-description" className="text-sm font-medium">{d.taskDetail.description}</label>
                  <textarea id="case-task-description" rows={3} maxLength={5000} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-card p-2 text-sm" placeholder={d.taskDetail.descriptionPlaceholder} />
                </div>
```

   and inside the `<details>`, after the review checkbox:

```tsx
                  <label className="mt-3 flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" checked={newRequiresAttachment} onChange={(e) => setNewRequiresAttachment(e.target.checked)} />
                    ต้องแนบไฟล์ผลงานก่อนส่งตรวจ
                  </label>
```

5. `handleCreate(e, keepOpen = false)`: include `description: newDescription.trim() || undefined, requiresAttachment: newRequiresAttachment || undefined`; after success reset all fields **including** `newDescription`/`newRequiresAttachment`; then `if (keepOpen) { loadTasks(); document.getElementById('case-task-title')?.focus(); return; }` before `setShowForm(false)` / `taskParam.open(created.id)`.
6. Footer: add, between Cancel and Create,

```tsx
              <Button variant="outline" disabled={creating || !newTitle.trim()} onClick={(e) => void handleCreate(e as unknown as React.FormEvent, true)}>บันทึกแล้วสร้างต่อ</Button>
```

- [ ] **Step 5: Drawer — delegation, attachment flag, พักงาน, @mentions**

In `TaskDetailDrawer.tsx`:

1. Replace the three `canAssignFirmRole(user.firmRole, u.firmRole)` calls (:362, :454, :616) with `canDelegateTask(user.firmRole, u.firmRole)`; same in `todos/page.tsx` `assignableUsers` (:82).
2. In the edit tab, next to the review fields, a checkbox bound to `task.requiresAttachment` that calls `patch({ requiresAttachment: e.target.checked })`.
3. A "พักงาน" section for case tasks (`task.caseId` set), visible to the assignee, the case lead and `runOperations` roles:

```tsx
              {task.caseId && (
                <section className="space-y-2 border-t pt-3">
                  <h3 className="text-sm font-semibold">พักงาน</h3>
                  {isHeld(task) ? (
                    <>
                      <p className="text-sm">⏸️ {ON_HOLD_CATEGORY_LABEL[task.onHold!.category ?? 'OTHER']} · {task.onHold!.reason}</p>
                      {task.onHold!.nextFollowUpAt && <p className="text-xs text-muted-foreground">ติดตามครั้งถัดไป {formatDate(task.onHold!.nextFollowUpAt)}</p>}
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => api.resumeTaskFromOnHold(token!, task.caseId!, task.id), 'กลับมาทำต่อแล้ว')}>กลับมาทำต่อ</Button>
                    </>
                  ) : (
                    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.startTaskOnHold(token!, task.caseId!, task.id, { reason: holdReason.trim(), category: holdCategory, nextFollowUpAt: holdFollowUp || undefined }); setHoldReason(''); setHoldFollowUp(''); }, 'พักงานแล้ว'); }}>
                      <TextareaField label="เหตุผลที่พัก *" value={holdReason} required rows={2} maxLength={1500} disabled={busy} onChange={(e) => setHoldReason(e.target.value)} />
                      <SelectField label="ประเภท" value={holdCategory} onChange={(e) => setHoldCategory(e.target.value)}>
                        {Object.entries(ON_HOLD_CATEGORY_LABEL).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                      </SelectField>
                      <DateField label="ติดตามครั้งถัดไป" value={holdFollowUp} disabled={busy} onChange={(e) => setHoldFollowUp(e.target.value)} />
                      <Button size="sm" type="submit" disabled={busy || !holdReason.trim()}>พักงาน</Button>
                    </form>
                  )}
                </section>
              )}
```

   with state `holdReason`, `holdCategory` (default `'WAITING_CLIENT'`), `holdFollowUp`. Make sure `TaskDetail.onHold` in `api.ts` carries `category` and `nextFollowUpAt` (the API detail include is `onHold: true`, so they are there). Show the `heldBadge` pill in the drawer header when `isHeld(task)`.
4. @mentions in the comment box: keep `const [mentionPicked, setMentionPicked] = useState<UserItem[]>([])` and a picker under the textarea driven by `getMentionContext(comment, cursor)` listing `users` whose first/last name contains the query; choosing one replaces the query with `firstName + ' '` (same behaviour as `CaseCommentsPanel`) and appends to `mentionPicked`. Submit with `api.addTaskComment(token!, task.id, body, mentionedIdsIn(body, mentionPicked))` and reset `mentionPicked`. Render comment bodies unchanged (the `@ชื่อ` text is the visible mention, as on case comments).

- [ ] **Step 6: SOP step options**

`apps/web/src/lib/practice-setup.ts` `PlaybookStep`: add

```ts
  /** Only for cases where our client is on this side; both when unknown. */
  side?: 'PLAINTIFF' | 'DEFENDANT';
  /** Handing the task in requires an attachment. */
  requiresAttachment?: boolean;
```

`QuickFlowCanvas.tsx`, after the "ให้ใครทำ" label in the step editor grid:

```tsx
                  <label className="block text-sm">{th ? 'ใช้เมื่อเราเป็นฝ่าย' : 'Only when we act for'}
                    <select className="mt-1 h-9 w-full rounded-lg border bg-background px-2" value={step.side ?? ''} onChange={e => editStep(index, { side: (e.target.value || undefined) as PlaybookStep['side'] })}>
                      <option value="">{th ? 'ทุกฝ่าย' : 'Either side'}</option>
                      <option value="PLAINTIFF">{th ? 'โจทก์ / ผู้ร้อง' : 'Plaintiff / petitioner'}</option>
                      <option value="DEFENDANT">{th ? 'จำเลย / ผู้คัดค้าน' : 'Defendant / respondent'}</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!step.requiresAttachment} onChange={e => editStep(index, { requiresAttachment: e.target.checked || undefined })} />
                    {th ? 'ต้องแนบไฟล์ก่อนส่งตรวจ' : 'Attachment required before review'}
                  </label>
```

and in the collapsed step summary chips (:105-110) add `{step.side && <span className="rounded-sm bg-accent px-2 py-1 text-accent-foreground">{step.side === 'PLAINTIFF' ? (th ? 'ฝ่ายโจทก์' : 'Plaintiff') : (th ? 'ฝ่ายจำเลย' : 'Defendant')}</span>}` and `{step.requiresAttachment && <span …>📎</span>}`. In `sops/page.tsx` read-only list (:216-219) add the same two hints to the joined summary.

- [ ] **Step 7: Verify**

Run:
```bash
cd apps/web && node --test --experimental-strip-types src/lib/task-form.test.ts src/lib/task-review-view.test.ts && cd ../..
pnpm --filter web exec tsc --noEmit
```
Expected: PASS / no type errors. In the browser (case tasks tab): a LAWYER sees only assistants/office manager (and self) in the assignee list with "(หลัก n, ผู้ช่วย n, ใกล้ deadline n)" hints; the reviewer list is owner/senior/lead minus the assignee; "บันทึกแล้วสร้างต่อ" keeps the drawer open with an empty title; พักงาน → badge "พักอยู่" on the board → กลับมาทำต่อ clears it; "@" in a task comment opens the picker.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/web/src
/usr/bin/git commit -m "feat(web): richer case-task form, delegation pickers, hold in drawer, task @mentions, SOP side/attachment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Mobile — review lists, handoff note, priority/observers, delegation, พักงาน

**Files:**
- Modify: `apps/mobile/src/workflow.ts` (`canReviewTask` :5-9)
- Modify: `apps/mobile/app/(tabs)/tasks.tsx` (`VIEWS` :18-24, row sort :53-54, `renderItem` :91-125)
- Modify: `apps/mobile/src/components/TaskWorkView.tsx` (state :40-50, `transition` :83-92, primary action label :94-96, new hold card)
- Modify: `apps/mobile/app/task/new.tsx` (state :50-60, `reviewers`/`candidates` :79-81, create body :130-140, form :240-252)
- Modify: `apps/mobile/src/api/types.ts` (`TaskItem.onHold`, `case.leadLawyerId`)

**Interfaces:**
- Consumes: `awaitsReviewBy`, `isEligibleReviewer`, `canDelegateTask`, `visibleTaskLabels`, `taskStageChip`, `TASK_HANDOFF_NOTE_MIN` (Task 2); `/todos?view=review` (Task 4); handoff note + `requiresAttachment` (Task 3); hold endpoints `PATCH /cases/:caseId/tasks/:taskId/hold`, `POST …/hold/resume` (Task 5); `TaskItem.reviewer`, `submittedAt`, `requiresAttachment` (Task 1).
- Produces: `canReviewTask(task, user, leadLawyerId?)` = `awaitsReviewBy(task, user.id, lead)` OR (OWNER and reviewer-less case task) — the same rule the API's `assertReviewer` enforces.

- [ ] **Step 1: Reviewer rule in `workflow.ts`**

```ts
import { awaitsReviewBy, hasFirmCapability } from '@lawfirm/shared';

/** Mirrors the API: the named reviewer, else the case lead; OWNER may close a reviewer-less case task. */
export function canReviewTask(task: TaskItem, user: { id: string; firmRole?: string | null }, leadLawyerId = task.case?.leadLawyerId) {
  if (awaitsReviewBy(task, user.id, leadLawyerId)) return true;
  return task.status === 'PENDING_REVIEW' && !!task.caseId && !task.reviewerId && user.firmRole === 'OWNER';
}
```

In `apps/mobile/src/api/types.ts` add to `TaskItem`: `onHold?: { reason: string; category?: string; nextFollowUpAt?: string | null; endedAt: string | null } | null;` and make `case` carry `leadLawyerId?: string`.

- [ ] **Step 2: Tasks tab**

`app/(tabs)/tasks.tsx`:
1. `VIEWS`: `{ value: 'review', label: 'รอฉันตรวจ' }` (the server already filters by the reviewer rule).
2. In the `mine` view, my handed-in work sorts after open work and gets a group header. Replace the sort with:

```ts
  const submitted = (t: TaskItem) => view === 'mine' && t.status === 'PENDING_REVIEW' && t.assigneeId === user?.id;
  rows.sort((a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE') || Number(submitted(a)) - Number(submitted(b)) ||
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.id.localeCompare(b.id));
```

   and at the top of `renderItem` (it receives `{ item, index }`):

```tsx
        const header = submitted(item) && (index === 0 || !submitted(rows[index - 1]))
          ? <Text style={[styles.meta, { fontWeight: '700', marginBottom: spacing.xs }]}>รอตรวจ</Text> : null;
```

   rendered just before the `<Card>` (wrap both in a fragment).
3. Inside the card, under the status tag:

```tsx
              {(taskStageChip(item.labels) || (item.onHold && !item.onHold.endedAt)) && <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
                {taskStageChip(item.labels) && <Tag tone="plain">{taskStageChip(item.labels)!}</Tag>}
                {item.onHold && !item.onHold.endedAt && <Tag tone="due">พักอยู่</Tag>}
              </View>}
              {item.status === 'PENDING_REVIEW' && item.reviewer && <Text style={styles.meta}>ผู้ตรวจ: {item.reviewer.firstName} {item.reviewer.lastName}</Text>}
```

   If the card renders `item.labels` anywhere, render `visibleTaskLabels(item.labels)` instead.

- [ ] **Step 3: Task work view — note, attachment gate, reviewer name, พักงาน**

`src/components/TaskWorkView.tsx`:
1. State `const [handoffNote, setHandoffNote] = useState('');` (add it to `draftValue`, `dirty` and the draft restore list like `note`).
2. `reviewerLabel`: prefer `task.reviewer` → `${task.reviewer.firstName} ${task.reviewer.lastName}`, else the existing member lookup.
3. Standalone reviewer picker (where `reviewerId` is chosen for a todo): options = `members.data` filtered by `isEligibleReviewer({ role: p.firmRole, userId: p.id, assigneeId: task.assigneeId })`.
4. In `transition`, for `handoff`:

```ts
      if (handoffNote.trim().length < TASK_HANDOFF_NOTE_MIN) throw new Error(`เขียนหมายเหตุถึงผู้ตรวจอย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร`);
      if (task.requiresAttachment && !(task.attachments ?? []).length) throw new Error('งานนี้ต้องแนบไฟล์ผลงานก่อนส่งตรวจ');
```

   and send `body: … action === 'handoff' ? (task.caseId ? { note: handoffNote.trim() } : { reviewerId: targetReviewer, note: handoffNote.trim() }) : …`; clear `handoffNote` after success.
5. Render, above the primary button when `primary?.action` is the handoff:

```tsx
      {worker && (task.requiresReview || routine || task.caseId) && <FormField label={`หมายเหตุถึงผู้ตรวจ * (อย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร)`} value={handoffNote} onChange={setHandoffNote} multiline disabled={busy} />}
```

6. A พักงาน card for case tasks, shown to the worker, the case lead and `runOperations` roles:

```tsx
      {task.caseId && (worker || legalCase.data?.leadLawyer?.id === user?.id || hasFirmCapability(user?.firmRole, 'runOperations')) && <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>พักงาน</Text>
        {task.onHold && !task.onHold.endedAt ? <>
          <Text style={{ color: colors.text }}>⏸️ {task.onHold.reason}</Text>
          {task.onHold.nextFollowUpAt && <Text style={{ color: colors.muted }}>ติดตามครั้งถัดไป {thDate(task.onHold.nextFollowUpAt)}</Text>}
          <Button title="กลับมาทำต่อ" ghost disabled={busy} onPress={() => perform(() => api(`/cases/${task.caseId}/tasks/${task.id}/hold/resume`, { method: 'POST' }))} />
        </> : <>
          <FormField label="เหตุผลที่พัก *" value={holdReason} onChange={setHoldReason} multiline disabled={busy} />
          <Dropdown label="ประเภท" value={holdCategory} onChange={setHoldCategory} options={[
            { value: 'WAITING_CLIENT', label: 'รอลูกความ' }, { value: 'WAITING_COURT', label: 'รอศาล' }, { value: 'WAITING_DOCUMENT', label: 'รอเอกสาร' },
            { value: 'WAITING_INTERNAL_REVIEW', label: 'รอรีวิวภายใน' }, { value: 'WAITING_EXTERNAL', label: 'รอบุคคลภายนอก' }, { value: 'OTHER', label: 'อื่น ๆ' },
          ]} disabled={busy} />
          <DatePicker value={holdFollowUp} onChange={setHoldFollowUp} />
          <Button title="พักงาน" ghost disabled={busy || !holdReason.trim()} onPress={() => perform(async () => {
            await api(`/cases/${task.caseId}/tasks/${task.id}/hold`, { method: 'PATCH', body: { reason: holdReason.trim(), category: holdCategory, nextFollowUpAt: holdFollowUp || undefined } });
            setHoldReason(''); setHoldFollowUp('');
          })} />
        </>}
      </Card>}
```

   with state `holdReason` (''), `holdCategory` ('WAITING_CLIENT'), `holdFollowUp` (''), and imports `Dropdown`, `DatePicker`, `FormField` from the same component modules `app/task/new.tsx` uses. `refresh()` already reloads the task so `onHold` updates.

- [ ] **Step 4: New-task form — priority, observers, delegation, reviewer list**

`app/task/new.tsx`:
1. State `const [priority, setPriority] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');`, `const [observerIds, setObserverIds] = useState<string[]>([]);`, `const [requiresAttachment, setRequiresAttachment] = useState(false);` — add them to `draftValue` and the draft restore (arrays/booleans restored with `Array.isArray` / `typeof === 'boolean'` guards).
2. `candidates` (:80-81): `person.id === user?.id || (!!user?.firmRole && !!person.firmRole && canDelegateTask(user.firmRole as FirmRole, person.firmRole))` — for case tasks too (drop the `!!caseId ||` bypass; the API now enforces it on case tasks as well).
3. `reviewers` (:79): `(members.data ?? []).filter(person => isEligibleReviewer({ role: person.firmRole, userId: person.id, caseLeadId: legalCase.data?.leadLawyer?.id ?? selectedCase?.leadLawyerId, assigneeId: assigneeId || user?.id }))`, and the error at :128 becomes `'เลือก Owner ทนายอาวุโส หรือทนายหลักของคดีเป็นผู้ตรวจ'`.
4. Create body (:130-140): add `priority, ...(observerIds.length ? { observerIds } : {}), ...(requiresAttachment ? { requiresAttachment: true } : {})` for new tasks.
5. Form, after the review switch block (:247-250), for new tasks:

```tsx
    {!id && <>
      <Dropdown label="ความสำคัญ" value={priority} onChange={value => setPriority(value as typeof priority)} disabled={busy || checkingPreviousSave}
        options={[{ value: 'HIGH', label: 'สำคัญมาก' }, { value: 'MEDIUM', label: 'ปกติ' }, { value: 'LOW', label: 'ไม่เร่ง' }]} />
      <SectionLabel>ผู้ติดตาม (ถ้ามี)</SectionLabel>
      {(members.data ?? []).filter(p => p.id !== user?.id && p.firmRole !== 'EXTERNAL').map(p => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ flex: 1, color: colors.text }}>{p.firstName} {p.lastName}</Text>
          <Switch accessibilityLabel={`ติดตามงานโดย ${p.firstName}`} trackColor={{ false: colors.line, true: colors.ink }} thumbColor={colors.surface}
            value={observerIds.includes(p.id)} onValueChange={on => setObserverIds(ids => on ? [...ids, p.id] : ids.filter(x => x !== p.id))} disabled={busy || checkingPreviousSave} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Text style={{ flex: 1 }}>ต้องแนบไฟล์ก่อนส่งตรวจ</Text><Switch accessibilityLabel="ต้องแนบไฟล์ก่อนส่งตรวจ" trackColor={{ false: colors.line, true: colors.ink }} thumbColor={colors.surface} value={requiresAttachment} onValueChange={setRequiresAttachment} disabled={busy || checkingPreviousSave} /></View>
    </>}
```

6. The existing handoff button on this screen (:273-276) must also send the note: add a `FormField` "หมายเหตุถึงผู้ตรวจ *" bound to a `handoffNote` state, disable the button while `handoffNote.trim().length < TASK_HANDOFF_NOTE_MIN`, and pass `{ note: handoffNote.trim() }` / `{ reviewerId, note: handoffNote.trim() }` to `handoff(...)`.

- [ ] **Step 5: Verify**

Run:
```bash
pnpm --filter @lawfirm/shared build
pnpm --filter @lawfirm/mobile typecheck
node apps/mobile/scripts/check-routine-workflow.cjs
```
Expected: no type errors; check passes. In the iOS simulator (Expo): a lawyer creates a task with priority + an observer for an assistant (a lawyer colleague is not offered); the assistant opens it, cannot send for review with a 3-character note, sends with a longer note; the reviewer finds it under "รอฉันตรวจ" with "ผู้ตรวจ: …"; the worker sees it under "รอตรวจ" in งานของฉัน; พักงาน shows "พักอยู่" on the card and กลับมาทำต่อ clears it.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/mobile
/usr/bin/git commit -m "feat(mobile): review lists, handoff note, priority/observers, delegation and hold on tasks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
