# Delete client, case and task from the web

Why: test data in prod (clients, cases, tasks) had no way to be removed from the UI.
User decisions: a client with live cases cannot be deleted (delete its cases first); cases stay soft-deleted.

Tasks (hard delete):
- tasks.service.ts `assertCanDelete(id, user, caseId | null)`: assertAccess, task must sit in the URL's case (null = todo route), creator or OWNER/SENIOR_LAWYER. `remove()` only deletes now. Used by case-task and todo DELETE routes. Closes audit item "ลบงานในคดี ไม่เช็คว่าเห็นงานนั้น"; todo assignees who did not create the task can no longer delete it. Intake task delete unchanged.
- TaskDetailDrawer: trash button (manager or creator).

Cases (soft delete, existing `DELETE /cases/:id`, owner only):
- Case page: owner-only "ลบคดี" button → /cases.
- escalation.scheduler (overdue tasks + on-hold follow-ups) and reminder.scheduler (calendar events) now skip soft-deleted cases; they were still sending LINE alerts. Calendar, agenda and daily digest already filtered.

Clients (hard delete, new `DELETE /clients/:id`, owner only):
- 409 while the client has a live case (primary, additional client or customer role) or a SENT/PAID invoice not on a deleted case. Otherwise deletes (contacts, portal rows, roles cascade; deleted cases, intakes and draft invoices lose the link) and writes AuditLog CLIENT_DELETED.
- Clients page: owner-only "ลบลูกความ" button; refusal message shown inline.
- Known ceiling: PortalIntakeAttachment bytes in storage are not removed with the client.

Verified: API jest 1224/1227 (3 failures in leave.service.spec are a hard-coded past date, unrelated; chip spawned); api + web tsc clean. Local preview as seeded owner: todo trash → DELETE 200; client with live case → 409, lawyer → 403; case "ลบคดี" → DELETE 200, gone from /cases; then "ลบลูกความ" → DELETE 200, gone from /clients.
