# Workflow handoff (สายงานส่งต่อ) — design + plan

Branch: `claude/app-notifications-system-775b93` (PR #83). Repo conventions: NestJS + Prisma in `apps/api`, Next.js staff app in `apps/web`, shared types in `packages/shared` (rebuild with `pnpm --filter @lawfirm/shared build` after editing). Tests: `cd apps/api && npx jest <path>`; types: `npx tsc --noEmit -p tsconfig.json` (api) and `cd apps/web && npx tsc --noEmit`. Never run `prisma migrate dev` — write migration SQL by hand under `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql` and run `npx prisma generate`. Follow the security rules in `apps/api/src/common/firm-refs.ts` (`assertFirmRefs` for every id a body names). Commit after each task with a conventional message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use `/usr/bin/git` (hook quirk).

## What the owner gets

A work package moves through people in order, e.g. **แปลเอกสาร (freelancer, 2 วัน) → ทำใบเบิกความ (ทนาย, 3 วัน) → เขียนคำฟ้อง (ทนายอาวุโส, 2 วัน)**:

1. **แม่แบบสายงาน** (WorkflowTemplate): owner/senior defines steps once — title, instructions, role, duration in business days.
2. **เริ่มสายงานในคดี**: one click on a case creates a *run*: one Task per step, chained with the existing `Task.blockedById` (step N+1 blocked by step N), assignees auto-picked by role with the lightest open load (overridable per step), due dates computed in business days (public holidays respected). A case can have several runs (one per witness/document).
3. **ส่งไม้พร้อมของ**: files a step attaches (existing `TaskAttachment`) are that step's output; the next steps see and download them as "ไฟล์จากขั้นก่อน". Completing a step re-plans the remaining due dates from the actual finish and notifies the next assignee (existing unblock notification + hub).
4. **ตีกลับเฉพาะขั้น**: someone on a later step (or the run creator / case lead / owner) sends the run back to an earlier step with a reason; that step reopens, steps after it wait again.
5. **สายพาน (pipeline)**: owner sees every active run: current step, who holds it, days overdue, projected finish vs the date promised to the client.
6. **Freelancer ภายนอก**: new firm role `EXTERNAL`. They log in to the same web app but see ONLY their own workflow steps: instructions, due date, files from earlier steps, upload their output, mark done. No cases, clients, other tasks, or names of parties (case shown by Own Ref only).

## Data model (Task 1)

```prisma
enum FirmRole { OWNER SENIOR_LAWYER LAWYER ASSISTANT EXTERNAL }   // add EXTERNAL

enum WorkflowRunStatus { ACTIVE DONE CANCELLED }

model WorkflowTemplate {
  id          String   @id @default(uuid())
  firmId      String
  name        String
  description String?
  /// WorkflowStepDefinition[] (packages/shared): { title, instructions?, role: FirmRole, durationDays: number (1-60), requiresReview?: boolean }
  steps       Json
  isActive    Boolean  @default(true)
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  firm  Firm  @relation(fields: [firmId], references: [id], onDelete: Cascade)
  runs  WorkflowRun[]
  @@index([firmId, isActive])
}

model WorkflowRun {
  id          String            @id @default(uuid())
  firmId      String
  caseId      String
  templateId  String?
  name        String            /// e.g. "แปลคำให้การพยาน — นาย ก."
  status      WorkflowRunStatus @default(ACTIVE)
  promisedAt  DateTime?         /// date promised to the client, for "late by N days"
  createdById String
  createdAt   DateTime          @default(now())
  completedAt DateTime?
  firm     Firm              @relation(fields: [firmId], references: [id], onDelete: Cascade)
  case     Case              @relation(fields: [caseId], references: [id], onDelete: Cascade)
  template WorkflowTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  tasks    Task[]
  @@index([firmId, status])
  @@index([caseId])
}

// Task: add
//   workflowRunId String?
//   workflowStep  Int?          /// 0-based order in the run
//   workflowDurationDays Int?   /// planned business days, for re-planning
//   workflowRun WorkflowRun? @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)
//   @@index([workflowRunId, workflowStep])
```

Shared (`packages/shared/src`): `WorkflowStepDefinition`, `FirmRole.EXTERNAL` (+ Thai label "ผู้รับงานภายนอก (ฟรีแลนซ์)" wherever role labels live — let `tsc` find every `Record<FirmRole, …>`).

## Security for EXTERNAL (Task 1 — must ship with the role)

- **Deny by default**: a global guard `ExternalScopeGuard` (registered as APP_GUARD after auth resolution — note global guards run before controller `JwtAuthGuard`, so implement it as a check inside `JwtStrategy.validate` or as a guard that is also added at controller level; simplest correct: in `common/guards/jwt-auth.guard.ts` `handleRequest`/`canActivate`, after the user is set, if `user.firmRole === 'EXTERNAL'` and the handler/class lacks `@AllowExternal()` metadata → `ForbiddenException`). Every staff route is therefore closed to externals without touching each controller.
- `@AllowExternal()` only on: `GET /auth/me`, `POST /auth/logout`, `POST /auth/refresh` (if guarded), notifications inbox/preferences/devices routes, and the new `/external/*` controller (Task 3).
- `CaseAccessService.getCaseFilterForUser` / task filters: for EXTERNAL return a filter that matches nothing (`{ id: '__external_has_no_case_access__' }`) — defense in depth.
- `assertCanAssign`/assignee pickers: EXTERNAL may be the assignee of a **workflow step task only** (Task 2 sets it directly); existing task-assign, case lead/team, reviewer, observer and leave/expense flows must reject EXTERNAL users (check `firmMember.role !== 'EXTERNAL'` where those validate membership; `tsc` + grep `firmMember.findFirst`/`assertCanAssignTodo`/`validateObservers`/`validateReview`/`resolveAssigneeIds`).
- Member lists for pickers (`/users/members`, `/users/lawyers`, workload) exclude EXTERNAL, except the workflow assignee picker (Task 2 endpoint).
- Invitations accept `role: EXTERNAL`; external seats count toward `maxUsers` like others (no special pricing now).
- Tests: an EXTERNAL token gets 403 on a representative staff route (e.g. `GET /cases`) and 200 on an `@AllowExternal` route; case filter for EXTERNAL matches nothing.

## API (Task 2 — staff side)

Controller `apps/api/src/workflows/` (new module, imported in AppModule; NotificationsModule via forwardRef for the notifier).

- `GET /workflows/templates` (any staff), `POST /workflows/templates`, `PATCH /workflows/templates/:id`, `DELETE /workflows/templates/:id` (soft: isActive=false) — OWNER or SENIOR_LAWYER (`FirmRoleGuard` + `@FirmRoles`). Validate steps: 1–20 steps, title required, role in FirmRole, durationDays 1–60.
- `GET /workflows/assignees?role=X` — firm members with that role and their open-task count (lowest first); this is the only picker that lists EXTERNAL.
- `POST /cases/:caseId/workflows` (CaseAccessGuard) body `{ templateId?: uuid, steps?: WorkflowStepDefinition[] (ad-hoc), name, promisedAt?, assignees?: Record<stepIndex, userId> }` → in one transaction: create run; for each step create a Task: `caseId`, `firmId`, title, description=instructions, `assigneeId` (given — validated with `assertFirmRefs` userIds AND role match — else auto: member with that role and fewest open tasks; if none → 400 "ไม่มีสมาชิกบทบาท X"), `blockedById` = previous step's task, `dueDate` = business-day cumulative from today (use `DeadlineRulesService.computeDueDate` with holidays, dayBasis BUSINESS), `workflowRunId`, `workflowStep`, `workflowDurationDays`, `requiresReview`+`reviewerId` when the step says so (reviewer = case lead, or an OWNER/SENIOR not the assignee), labels `[workflow:<runId>]`, `assignedAt`. After commit notify step-0 assignee via `AssignmentNotifierService` (category TASK, entityPath `/work` for EXTERNAL assignees else `/cases/:id`, appPath `taskAppRoute`). Audit log `WORKFLOW_STARTED`.
- `GET /cases/:caseId/workflows` — runs of the case with steps (task id, title, assignee name, status, dueDate, completedAt, attachments count).
- `GET /workflows/runs?status=ACTIVE` — pipeline for OWNER/SENIOR (others: runs where they are assignee/creator): `{ id, name, case: {id, ownRef, title}, status, promisedAt, currentStep: { index, title, assignee, dueDate, overdueDays }, stepsDone, stepsTotal, projectedFinish, lateByDays }`. projectedFinish = current step due (or today if overdue) + remaining steps' durationDays in business days; lateByDays = max(0, projectedFinish − promisedAt).
- `POST /workflows/runs/:id/send-back` `{ toStep: number, reason: string }` — allowed for: assignee of the current step, run creator, case lead, OWNER/SENIOR. Target step must be < current step. Effect (transaction): target task → status `TODO`, `completedAt: null`, comment with reason (TaskComment), steps after target and up to current → status `TODO`, `completedAt: null`; re-plan due dates from today; notify target assignee ("🔁 สายงานถูกส่งกลับมาที่ขั้นของคุณ\nเหตุผล: …"). Audit log.
- `POST /workflows/runs/:id/cancel` (creator/lead/owner) → status CANCELLED, open tasks of the run → DONE? No: set them to `CANCELLED`? TaskStatus has no CANCELLED — delete undone run tasks instead, keep done ones. Notify nobody.
- **Completion hook**: in `TasksService.onTaskCompleted` (tasks.service.ts ~801) — if the task has `workflowRunId`: re-plan due dates of the following undone steps from now (business days, cumulative); if every task of the run is DONE → run DONE + `completedAt`, notify run creator + case lead ("✅ สายงาน … เสร็จครบทุกขั้น"). The existing "unblocked" notification already tells the next assignee; make its entityPath `/work` when the recipient is EXTERNAL (check membership role) so the LINE link opens the right page.
- Files between steps: `GET /workflows/runs/:id/files` → attachments of all run tasks grouped by step (staff with case access).

Tests (jest, mocked Prisma like neighbouring specs): chain creation (blockedById, due dates skip weekends/holidays, auto-assign lowest load, role mismatch rejected, cross-firm assignee rejected), completion re-plans + finishes run, send-back reopens target and later steps, pipeline lateness math, permission checks.

## API (Task 3 — external side)

Controller `apps/api/src/workflows/external.controller.ts`, class-level `@AllowExternal()` + JwtAuthGuard; every handler also requires `user.firmRole === 'EXTERNAL'` OR internal user (internal staff may use it too — harmless) but data is always restricted to `assigneeId = user.id`.

- `GET /external/steps` → my workflow tasks (`workflowRunId != null`, assigneeId = me, firmId = my firm): `{ taskId, title, instructions, status, dueDate, blocked: boolean (previous step not DONE), run: { name, caseRef: case.ownRef } , inputs: [{ attachmentId, filename, size, step }] (attachments of EARLIER steps of the same run, only when not blocked), outputs: [my attachments] }`. Never return client names, case titles, other people's names beyond first name of the previous step holder.
- `GET /external/files/:attachmentId` → stream the file if it belongs to my task, or to an earlier step of a run where I hold a later, unblocked step. Reuse `FileStorageService`.
- `POST /external/steps/:taskId/files` (multipart, same limits/sanitizing as task attachments) → my task only, not DONE.
- `DELETE /external/files/:attachmentId` → my own upload on a not-DONE task.
- `POST /external/steps/:taskId/done` → my task, not blocked; goes through `TasksService.update(id, { status: DONE }, user, caseId)` — BUT that path checks case access/firm role; implement via a dedicated `TasksService.completeWorkflowStep(taskId, user)` that verifies assignee + not blocked + `requiresReview` handling (if requiresReview → move to PENDING_REVIEW with reviewer notified, mirroring the existing submit-for-review path) and then runs `onTaskCompleted`.
- Tests: another external / another firm cannot list/download/upload/complete; blocked step cannot download inputs or complete; inputs only from earlier steps of the same run.

## Web (Task 4 — staff)

- **Templates**: page `/workflows` (sidebar item "สายงาน" for OWNER/SENIOR; read-only list for others): list templates, create/edit (steps editor: title, role select incl. "ฟรีแลนซ์ภายนอก", days, instructions, requires review toggle; reorder up/down), deactivate.
- **Pipeline** on the same page (tab "กำลังเดิน"): table/cards of active runs — case ref, run name, current step + holder, due, overdue badge, projected finish vs promised (red when late), progress "2/3".
- **Case page**: section "สายงาน" in the case tasks tab: list runs with a horizontal step strip (done ✓ / current ● / waiting ○, holder, due), files per step, actions: "ส่งกลับไปขั้น…" (select + reason), "ยกเลิกสายงาน". Button "เริ่มสายงาน" → dialog: template select (or ad-hoc steps), name, promised date, per-step assignee select prefilled from `/workflows/assignees` (lowest load first), confirm.
- **Team page / invite**: role option "ผู้รับงานภายนอก (ฟรีแลนซ์)" with helper text that they only see their assigned steps.
- Follow existing UI components/patterns in `apps/web/src` (find how playbooks page and case tasks tab are built and mirror them); Thai copy; `npx tsc --noEmit` clean.

## Web (Task 5 — external freelancer)

- After login, if `firmRole === 'EXTERNAL'` the app routes to `/work` and the dashboard layout shows only "งานของฉัน" (hide sidebar items, block other pages client-side — server already denies).
- `/work`: cards per step: title, Own Ref, due (overdue red), status, instructions, "ไฟล์จากขั้นก่อน" (download), "ไฟล์งานของฉัน" (upload, delete), button "ส่งงาน / เสร็จแล้ว" (disabled while blocked, with "รอขั้นก่อนหน้า"). Mobile-friendly.

## Mobile (Task 6 — small)

- Task detail: when the task has `workflowRunId`, show "สายงาน: <name> · ขั้น 2/3", the previous step holder, and "ไฟล์จากขั้นก่อน" (download via existing attachment route for staff). Extend the API task detail include with `workflowRun { id, name }`, `workflowStep`, and previous-step attachments if not already present. Mobile is staff-only; EXTERNAL users logging into mobile see a message "ใช้งานผ่านเว็บ" (block in auth after login).

## Order

1 → 2 → 3 → (4, 5, 6). Each task: tests pass, tsc clean, commit. Final: full `npx jest` in apps/api, web + mobile tsc, review.
