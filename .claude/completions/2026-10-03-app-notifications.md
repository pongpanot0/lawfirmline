# Staff notifications in the mobile app — 2026-10-03

Branch: `claude/app-notifications-system-775b93`

- `AssignmentNotifierService.notifyAssigned` is the single hub: it writes a `Notification` inbox row for every recipient, then sends Expo push (per-recipient `notificationId`, unread `badge`, `url` = mobile route) and the LINE DM. Push and LINE are gated per `NotificationCategory` (TASK, CASE, COMMENT, CALENDAR, CLIENT, BILLING, LEAVE) by `UserNotificationPreference`; no row means on. The inbox row is always written. `category` is required, so tsc lists every call site.
- Migration `20261003120000_staff_notifications` (additive: enum + 2 tables).
- API: `GET /notifications?cursor=`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET /notifications/preferences`, `PATCH /notifications/preferences/:category {push?, line?}`. Rows are scoped by user + current firm. Rows older than 90 days are pruned at 03:15 Bangkok.
- `toAppRoute(webPath)` (server side) maps web paths to Expo routes, so route fixes ship without an app release. Task notifications pass `appPath: /task/new?id=` explicitly.
- Rerouted through the hub (they were LINE-only or used their own push): court-date creation (actor now excluded), client portal messages, event reminders, and leave (request/decision/sick/cancel; leave keeps its own LINE send with `line: false` but honours the LEAVE LINE switch). New: an event reschedule notifies attendees and the lead lawyer.
- Mobile: notifications screen has two tabs, "ล่าสุด" (inbox) and "รอจัดการ" (the old queue). Home bell and app-icon badge show the unread count. Tapping a push marks it read and navigates, cold start included (`useLastNotificationResponse`). The settings screen has App/LINE switches per category. Logout unregisters the push token.
- Verified on a scratch Postgres with seed data: inbox, cross-user read guard, preferences validation, pagination, leave/court-date flows, and a real Expo round trip with dead-token pruning.
- Not done: a web bell/inbox, quiet hours, and digests (daily email and leave digests stay as they were).

## LINE buttons and chat questions (same day)

- Notification buttons: postbacks in `notifications/line-actions.ts`, handled by `LineQuickActionsService` through the same service methods the web uses (the tapper is the actor). Covered: task acknowledge and done (assignee only; not tasks that need review or follow an SOP routine), claim approve/reject (owner), event acknowledge carrying the `updatedAt` revision, and leave (moved here). Attached through the hub's `lineActions(userId)`, only for the recipient who can act.
- Chat questions (`LineQueryService`): "งานค้างของฉัน", plus "คดี <ref | black/red number | title>" (search within case access; several matches become pick buttons). Answers asked in a group go to the asker's private chat.
- Not done: client replies over LINE and client court reminders were dropped by the user.

## Workflow handoff (สายงานส่งต่อ) + freelancers (same day)

Plan: `docs/superpowers/plans/2026-10-03-workflow-handoff.md`.
- `FirmRole.EXTERNAL` (freelancer) is deny-by-default. `JwtAuthGuard.canActivate` rejects it on any route without `@AllowExternal()`. Case/task/intake filters match nothing, and every staff picker or assignee check excludes it (`assertFirmRefs` excludes EXTERNAL unless `excludeRoles: []`).
- `WorkflowTemplate` / `WorkflowRun`. A run is a chain of Tasks (`blockedById`, `workflowRunId`, `workflowStep`, `workflowDurationDays`), with due dates in business days (holidays respected). Each step's assignee is the least-loaded person in its role. `WorkflowsService.onStepCompleted` (called lazily from `TasksService.onTaskCompleted` via ModuleRef) re-plans the remaining steps or closes the run. There is also send-back to a step, cancel, a pipeline with lateness against the promised date, and per-step files.
- `/external/*` is the only freelancer surface: own steps, earlier-step inputs once unblocked, upload/delete own files, hand in.
- Web: `/workflows` (pipeline + templates), a case-page section with a start drawer, `/work` for freelancers (minimal shell), and an EXTERNAL invite option. Mobile: workflow info on the task screen; EXTERNAL accounts are told to use the web.
- Verified in a browser on a scratch DB: full chain, re-plan, notifications, freelancer 403 on staff routes.
- Microsoft 365 (Outlook + OneDrive) design is waiting on firm input: `docs/superpowers/specs/2026-10-03-microsoft365-cases-design.md`.
