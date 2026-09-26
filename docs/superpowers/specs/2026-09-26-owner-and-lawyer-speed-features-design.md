# Owner control and lawyer speed features: design

Date: 2026-09-26. Source: the deep-research report (this session) plus approved UI mockups ("ทำเลยทุกหน้า").
Scope is seven features. Each one reuses the module that already owns the data.

## Global rules
- AI runs only when a user presses a button. Its output is a draft and must be confirmed before it is saved (memory: project-ai-user-invoked-only).
- Owner-only actions use the existing guards. For firm-level views, `FirmRoleGuard` + `@OwnerOnly()`. For money mutations, `RolesGuard` + `@Roles(Role.ADMIN)`, which OWNER passes.
- Scope every query by `user.firmId`. Case-scoped reads use `CaseAccessService` filters.
- UI copy is in Thai, written inline the way the invoices and reports pages already do.
- There is one Prisma migration for the whole feature set: `20260926100000_owner_lawyer_speed`. Generate it with `prisma migrate diff` between the old and new schema files. Never run `migrate dev` or `migrate reset` against the shared DB.
- Money stays `Float`, to match the existing `Invoice.totalAmount`.

## 1. Collections (ติดตามเก็บเงิน)
- New `InvoicePayment` (amount, method TRANSFER|CHEQUE|CASH|OTHER, receivedAt, note, recordedById). New `Invoice.lastReminderAt`.
- Status flow: DRAFT→SENT is a manual action; it stamps `issuedAt`, and `dueAt` defaults to issuedAt+30d. SENT→PAID happens automatically once the sum of payments ≥ totalAmount. Partial payment keeps the invoice SENT. No new enum value.
- A payment is rejected if the invoice is DRAFT, if amount ≤ 0, or if amount > outstanding.
- Receivables list: SENT invoices with outstanding > 0. `daysOverdue = max(0, today − dueAt)`. Buckets are 0-30 (includes not yet due), 31-60, 61-90 and 90+.
- LINE reminder: push to the bill-to client's `ClientContact`s that have `lineUserId` and the LINE channel enabled. Throttled to one per invoice per 24h. Reports how many were sent (0 is allowed; the UI says nobody is linked).

## 2. Drafted time capture + timesheet
- Suggestions are computed on read and not stored. `GET time-entries/suggestions?date=` looks at the current user's activity that day:
  - COURT_DATE and CLIENT_MEETING events they are responsible for. Hours = endAt−startAt, else null.
  - Tasks they completed.
  - Review decisions they made.
  - Staff case messages, grouped per case.
- Each suggestion has a stable `sourceKey` (e.g. `event:<id>`, `messages:<caseId>:<date>`).
- `TimeEntry.sourceKey` is new, with `@@unique([userId, sourceKey])`. Suggestions already converted are hidden.
- Confirm = bulk create. Case access is checked per entry, and hours must be 0.25-24.
- Firm timesheet: `GET time-entries?from&to&userId`. OWNER sees everyone; other users see only themselves. Returns totals per user.
- 18:00 Mon-Fri Bangkok: a LINE push to each user with ≥1 pending suggestion, linking `/timesheet`.
- Mobile screen `timesheet` for confirming drafts. Web `/timesheet` for drafts plus the firm table.
- Out of scope: an approval workflow. Timesheet entries do not gate invoices.

## 3. Owner KPIs
`GET operations/owner-kpis?month=YYYY-MM` (OwnerOnly):
- `unbilled`: amount + caseCount of billable time entries and billable APPROVED/PAID expenses with no invoice.
- `collectionRate`: of invoices issued in the trailing 12 months (status ≠ DRAFT), payments ÷ total. `target: 0.95`.
- `avgDaysOutstanding`: mean days since issuedAt across open invoices.
- `revenue`: payments received in the month, plus the previous month for comparison.
- `byLawyer`: per case leadLawyer: open case count, billed (issued in trailing 12m), collected, rate.
- `stuckByStage`: open cases whose `now − stageChangedAt` exceeds the firm's `sla.stuckStatusDays`, grouped by stage, with count and oldestDays.

Web `/reports` shows these at the top. The mobile reports screen gets four stat cards.

## 4. Stage change → proposed tasks
- `PlaybookStep` gains optional `stage: CaseStage`, `offsetDays: int`, and `dayBasis: CALENDAR|BUSINESS`, editable in the playbook editor.
- `GET practice-setup/cases/:caseId/stage-tasks?stage=`: steps whose `stage` matches, taken from the releases applied to the case, plus the latest version of each release whose caseTypeId matches the case. Deduped by title. Each step gets `dueDate = computeDueDate(today, offsetDays, dayBasis, holidays)` (null if offsetDays is absent) and `assigneeId = resolveAssignee(...)`.
- `POST .../stage-tasks {tasks[]}` creates tasks with label `stage:<STAGE>` and notifies assignees.
- Web: when the stage changes, fetch the proposals first. If there are any, show a dialog with "ย้ายขั้นอย่างเดียว" and "ย้ายและสร้าง N งาน". Tasks can be unticked and their date or assignee edited.

## 5. Template → .docx
- Add variables: blackCaseNumber, redCaseNumber, plaintiffNames, defendantNames, lawyerName, and lawyerLicenseNo if the user model has one.
- `render` also returns `missingFields`: template keys whose value is empty or unknown.
- `POST cases/:caseId/document-templates/:templateId/generate` builds a .docx with the `docx` package (TH Sarabun New 16pt, one paragraph per line). It saves the file as a case Document using the existing upload steps and returns the document.
- Four built-in templates (firmId null), shipped as skeleton forms the firm edits: หนังสือแต่งทนายความ, หนังสือบอกกล่าวทวงถาม, คำร้องขอเลื่อนคดี, บัญชีระบุพยาน.
- Web: the template picker shows the variables, marks missing ones in red, and has a "สร้าง .docx" button.

## 6. AI pleading draft (user-invoked)
- New `PleadingDraft` (kind, instructions, bodyText, citations Json, status DRAFT|APPROVED, documentId).
- `POST cases/:caseId/pleading-drafts` requires credits (`AI_CREDIT_COST.DRAFT_PLEADING = 10`). It retrieves case chunks through a `RagService.retrieve` extracted from `ask`. The prompt makes every paragraph cite `[N]`. The response parses citations into `{n, documentId, filename, pageStart, snippet}` and returns `unsupportedParagraphs` (paragraph indexes with no `[N]`). The run is logged to `AiRun`, operation `pleading_draft`.
- `PATCH :id {bodyText}` works while the draft is DRAFT. `POST :id/approve` builds a .docx (shared builder from §5), creates the Document, and sets APPROVED. Edits after approval are refused.
- Web: a "✦ AI ร่างคำคู่ความ" button in the case documents panel opens a drawer (kind, instructions, generate). It shows the draft with citation chips, highlights unsupported paragraphs in red, and offers edit and "ตรวจแล้ว บันทึกเป็นเอกสาร".

## 7. Leave approval
- `LeaveStatus` PENDING|APPROVED|REJECTED, plus decidedById and decidedAt. Existing rows migrate to APPROVED.
- New SICK leave, and leave filed by an OWNER, is created APPROVED. Other new leave is created PENDING.
- On PENDING create, each OWNER with LINE gets a push (deduped via `LeaveNoticeLog` `approve-req:<id>:<ownerId>`) listing any court-date conflicts, with postback quick replies `leave:approve:<id>` and `leave:reject:<id>`.
- `PATCH leaves/:id/decision {decision}` (OwnerOnly, PENDING only) notifies the requester. The LINE router handles the `leave:` postbacks right after auth and calls the same service method.
- The overlap check ignores REJECTED leave. The notice cron and calendar/agenda leave display only use APPROVED.
- `GET leaves` items include `status` and, for PENDING, `courtConflicts`.
- Web `/leaves`: a create form, my requests, and for OWNER a pending queue with approve/reject and conflicts.
- Out of scope: "find a substitute for court".
