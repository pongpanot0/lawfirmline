# Office Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship F1–F7 from the spec: drafted time capture (restored + Outlook email source + manual entry), firm utilization/realization/collection dashboard, WIP write-off + invoice discount, lawyer licence tracking, closing-checklist gaps, cash-advance settlement + court receipt numbers, paper-file QR check-out.

**Architecture:** NestJS services per feature in `apps/api/src`, one Prisma migration up front, pure helpers (metrics, milestones, hour rounding, unbilled filters) in their own files with Jest specs; Next.js pages/components in `apps/web`; mobile only where the spec says (timesheet restore, close form, notification prefs, expense receipt no).

**Tech Stack:** NestJS 10, Prisma (client generated to `apps/api/src/generated/prisma`), Jest with hand-mocked Prisma, Next.js app router, Expo, `@lawfirm/shared`, new dep `qrcode` (web only).

**Spec:** `docs/superpowers/specs/2026-10-31-office-operations-design.md` — read it; every task's details (copy, rules, numbers) come from there.

## Global Constraints

- Tenant isolation: every query filters `firmId` or `case: { firmId }`; any user/case/client id from a request body goes through `assertFirmRefs` (`apps/api/src/common/firm-refs.ts`).
- Permissions via capabilities (`@UseGuards(FirmRoleGuard)` + `@RequireCapability(...)` or `hasFirmCapability()`), never legacy `User.role`.
- Audit every write-off, undo, discount, advance return/settle, paper-file movement and licence edit: `prisma.auditLog.create({ data: { firmId, userId, action: 'UPPER_SNAKE', metadata } })`.
- New enums exist in both Prisma and `@lawfirm/shared` with a parity spec.
- Crons: `@Cron(expr, { timeZone: 'Asia/Bangkok' })`, idempotent via a unique log table.
- Notifications only through `AssignmentNotifierService` (`notifyAssigned` / `notifyFirmOwners`).
- Never run `prisma migrate dev|deploy` (shared DB carries other branches' migrations). Write SQL by hand / `prisma migrate diff`, then `pnpm --filter api exec prisma generate`.
- Rebuild shared after changing it: `pnpm --filter @lawfirm/shared build`.
- No AI calls anywhere in this plan.
- Run git as `/usr/bin/git ...` single commands (hook quirk in this worktree). Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- UI copy is Thai, short, matching surrounding screens.

## Review Focus

1. Write-off racing invoice creation — an entry written off between draft and create must not be claimed: `createInvoice`'s `updateMany` claim filters `writtenOffAt: null` (test in Task 2).
2. Bangkok day boundary — an email sent 23:30 Bangkok (16:30Z) belongs to that Bangkok date, one sent 00:10 Bangkok to the next (test in Task 4).
3. Cross-firm ids — target member / holder user from another firm is rejected with 403/404 (tests in Tasks 7, 8, 13).
4. Licence renewed after reminders went out — new expiry restarts milestones; a missed cron day sends only the latest due milestone (test in Task 8).
5. Settling an advance while an expense consumes it — `consume` rejects a settled advance and settle requires `remaining = 0` read inside the transaction (test in Task 11).

---

### Task 1: Migration, schema and shared enums

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261031100000_office_operations/migration.sql`
- Modify: `packages/shared/src/index.ts` (or a new `packages/shared/src/office-operations.ts` re-exported from index)
- Test: `apps/api/src/common/office-operations-enums.spec.ts`

**Interfaces — Produces (Prisma fields, exact names):**
- `TimeEntry`, `Expense`: `writtenOffAt DateTime?`, `writtenOffById String?` (FK User, SetNull), `writeOffReason String?`
- `Expense`: `officialReceiptNo String?`
- `Invoice`: `discountAmount Float @default(0)`, `discountReason String?`, `splitGroupId String?` + `@@index([firmId, splitGroupId])`
- `FirmMember`: `monthlyBillableTargetHours Float?`, `defaultHourlyRate Float?`
- `User`: `lawyerLicenseNo String?`, `lawyerLicenseType LawyerLicenseType?`, `lawyerLicenseExpiresAt DateTime? @db.Date`
- `enum LawyerLicenseType { TWO_YEAR LIFETIME }`
- `model LawyerLicenseReminderLog { id, userId (FK cascade), expiresAt DateTime @db.Date, milestone String, sentAt DateTime @default(now()); @@unique([userId, expiresAt, milestone]) }`
- `NotificationCategory` gains `LICENSE`
- `CashAdvance`: `settledAt DateTime?`, `settledById String?`, `returnedAmount Float @default(0)`, `settlementNote String?`
- `Case`: `paperFileHolderId String?` (FK User SetNull), `paperFileLocation String?`
- `enum PaperFileAction { CHECK_OUT CHECK_IN MOVE }`
- `model PaperFileMovement { id String @id @default(uuid()), firmId, caseId (FK cascade), action PaperFileAction, holderUserId String?, location String?, note String?, createdById, createdAt DateTime @default(now()); @@index([firmId, caseId, createdAt]) }`
- Shared exports: `LawyerLicenseType`, `PaperFileAction`, `LICENSE_MILESTONES = ['OPEN_90','DUE_30','DUE_7','EXPIRED','LATE_45'] as const` with offsets `{OPEN_90:-90, DUE_30:-30, DUE_7:-7, EXPIRED:0, LATE_45:45}` (days relative to expiry).

- [ ] **Step 1:** Write the parity spec: shared `LawyerLicenseType` / `PaperFileAction` values equal Prisma's `$Enums` values; `NotificationCategory` from Prisma includes `'LICENSE'`.
- [ ] **Step 2:** Run `pnpm --filter api test -- office-operations-enums` → FAIL.
- [ ] **Step 3:** Edit schema + write migration SQL (ALTER TYPE … ADD VALUE, ALTER TABLE … ADD COLUMN, CREATE TABLE, indexes, FKs — follow `20261029100000_date_suggestion_email_source/migration.sql` style). Add shared enums/constants. Build shared, `prisma generate`.
- [ ] **Step 4:** Apply to local DB only this migration: `psql "$DATABASE_URL" -f <migration.sql>` then `pnpm --filter api exec prisma migrate resolve --applied 20261031100000_office_operations` (skip if no local DB env; note it in the report). Run the spec → PASS; `pnpm --filter api exec tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(db): office-operations schema`.

### Task 2: F3 API — write-off, discount, split groups, shared unbilled filters

**Files:**
- Create: `apps/api/src/billing/unbilled.ts`, `apps/api/src/billing/write-off.spec.ts`
- Modify: `apps/api/src/billing/billing.service.ts` (`getInvoiceDraft` ~978, `createInvoice` ~1053/~1214), `billing.controller.ts`, `dto/billing.dto.ts`, `apps/api/src/operations/operations.service.ts` (`getOwnerKpis` ~442), `apps/api/src/billing/collections.service.ts` (`ownerWorklist` ~64)

**Interfaces — Produces:**
- `unbilledTimeWhere(): Prisma.TimeEntryWhereInput` = `{ billable: true, invoiceId: null, writtenOffAt: null }`
- `unbilledExpenseWhere(): Prisma.ExpenseWhereInput` = `{ billable: true, invoiceId: null, writtenOffAt: null, status: { in: [APPROVED, PAID] } }`
- `BillingService.writeOffTimeEntry(user, caseId, entryId, reason: string)`, `undoTimeEntryWriteOff(user, caseId, entryId)`, `writeOffExpense(user, expenseId, reason)`, `undoExpenseWriteOff(user, expenseId)`, `setInvoiceDiscount(user, invoiceId, { discountAmount: number; discountReason?: string })`
- Routes (capability `manageInvoices`): `PATCH cases/:caseId/billing/time-entries/:entryId/write-off` `{reason}`, `DELETE` same path; `PATCH expenses/:expenseId/write-off` `{reason}`, `DELETE` same; `PATCH invoices/:id/discount`
- `CreateInvoiceDto` gains optional `discountAmount`, `discountReason`; time-entry list responses include `writtenOffAt, writtenOffBy {id, firstName, lastName}, writeOffReason`; invoice responses include `discountAmount, discountReason`.

- [ ] **Step 1: Failing tests** in `write-off.spec.ts`:
  - `writes off an unbilled entry with reason and audit` → update sets the 3 fields; auditLog action `TIME_ENTRY_WRITTEN_OFF`.
  - `rejects write-off of an invoiced entry` (invoiceId set) → ConflictException; `rejects reason shorter than 5 chars` → BadRequest.
  - `undo clears the 3 fields only while unbilled`.
  - `getInvoiceDraft excludes written-off time and expenses`.
  - `createInvoice claim updateMany filters writtenOffAt: null` (Review Focus 1) and `split invoices share one splitGroupId; single invoice gets none`.
  - `createInvoice totalAmount = lines − discountAmount; rejects discount > subtotal; requires reason when discount > 0`.
  - `setInvoiceDiscount only on DRAFT`.
  - `getOwnerKpis / ownerWorklist unbilled totals ignore written-off rows`.
- [ ] **Step 2:** Run `pnpm --filter api test -- write-off` → FAIL.
- [ ] **Step 3:** Implement. Replace every inline unbilled filter in the listed functions with the helpers. Generate `splitGroupId` (`randomUUID()`) only when `createInvoice` creates >1 invoice.
- [ ] **Step 4:** Run the spec plus `billing collections operations invoice-split receivables` specs → PASS.
- [ ] **Step 5:** Commit `feat(billing): WIP write-off and invoice discount`.

### Task 3: F3 web — write-off and discount UI

**Files:**
- Modify: `apps/web/src/components/cases/CaseBillingPanel.tsx`, `apps/web/src/components/billing/InvoicePanel.tsx`, `apps/web/src/lib/api.ts`, i18n file used by those components

**Interfaces — Consumes:** Task 2 routes and response fields.

- [ ] **Step 1:** Add api.ts functions `writeOffTimeEntry(caseId, entryId, reason, token)`, `undoTimeEntryWriteOff`, `writeOffExpense`, `undoExpenseWriteOff`, `setInvoiceDiscount(invoiceId, body, token)`.
- [ ] **Step 2:** Unbilled rows (time + expense) show "ตัดทิ้ง (write-off)" for users with `manageInvoices` (use the existing capability check pattern in web) → inline reason input (min 5 chars) → confirm. Written-off rows: strikethrough, "ตัดโดย {name}: {reason}", "ยกเลิก" button.
- [ ] **Step 3:** Invoice create/draft view: discount amount + reason fields; shows subtotal, ส่วนลด, total. Issued invoice/PDF view shows the discount line (find the invoice document renderer in api/web and add the line).
- [ ] **Step 4:** `pnpm --filter web exec tsc --noEmit` clean; `pnpm --filter web test` passes.
- [ ] **Step 5:** Commit `feat(web): write-off and invoice discount UI`.

### Task 4: F1 — restore drafted time capture + Outlook email source

**Files:**
- Restore from `0506bf10^` (use `/usr/bin/git show 0506bf10^:<path>`), then adapt to current code: `apps/api/src/billing/time-suggestions.service.ts` (+ `.spec.ts`), registration in `billing.module.ts`, routes + DTOs removed in that commit, `apps/web/src/app/(dashboard)/timesheet/page.tsx`, sidebar item in `SamnuanSidebar.tsx`, timesheet i18n blocks in `apps/web/src/lib/i18n/dashboard.ts`, api.ts functions/types, `apps/mobile/app/timesheet.tsx`, its `Stack.Screen` in `_layout.tsx`, More-tab link, mobile hooks/types.
- Create: `apps/api/src/billing/email-time.ts`

**Interfaces — Produces:**
- `TimeSuggestion.source` union gains `'email'`; email suggestion `sourceKey = \`email:${caseId}:${date}\``, description `ส่งอีเมลคดี ${n} ฉบับ`.
- `emailSuggestionHours(count: number): number` = `Math.ceil((count * 0.1) / 0.25) * 0.25` (1–2 → 0.25, 3–5 → 0.5, 6–7 → 0.75); 0 → 0.
- Routes as restored: `GET time-entries/suggestions?date=`, `POST time-entries/confirm`, `GET time-entries` (firm timesheet).

- [ ] **Step 1:** Restore the files with `git show` (do NOT `git revert` — 27 later commits touch these files; merge by hand). Adapt imports/names to today's code until `tsc` is clean and the restored spec passes.
- [ ] **Step 2: Failing tests** added to `time-suggestions.service.spec.ts`:
  - `email source: one suggestion per case per Bangkok day with hours from emailSuggestionHours` (3 OUTBOUND messages → 0.5).
  - `email source: only messages whose fromAddress matches (case-insensitive) a mailboxAddress of the user's own MailboxConnection` — a message in a thread filed from a colleague's mailbox but sent by the user counts for the user; the colleague's sent message in the user's thread does not.
  - `email source: ignores INBOUND, threads with caseId null, and cases outside CaseAccessService filter`.
  - `email source: 23:30 Bangkok counts on that date, 00:10 Bangkok on the next` (Review Focus 2).
  - `confirm uses FirmMember.defaultHourlyRate as rate when the item has no rate` (defaults 0 when null).
  - Pure spec for `emailSuggestionHours` (0,1,2,3,5,6).
- [ ] **Step 3:** Run `pnpm --filter api test -- time-suggestions email-time` → FAIL; implement; → PASS.
- [ ] **Step 4:** Web + mobile restored screens show the `email` source label ("อีเมล"). `pnpm --filter web exec tsc --noEmit`, `pnpm --filter mobile typecheck` clean.
- [ ] **Step 5:** Commit `feat(billing): restore drafted time capture, add Outlook email source`.

### Task 5: F1 — manual time entry, edit/delete, default rate

**Files:**
- Modify: `apps/api/src/billing/billing.service.ts` (`createTimeEntry` ~301), `billing.controller.ts`, `dto/billing.dto.ts`, `apps/web/src/app/(dashboard)/timesheet/page.tsx`, `apps/web/src/components/cases/CaseBillingPanel.tsx`, `apps/web/src/lib/api.ts`, `apps/mobile/app/timesheet.tsx`
- Test: `apps/api/src/billing/time-entry-edit.spec.ts`

**Interfaces — Produces:**
- `BillingService.resolveDefaultRate(firmId: string, userId: string): Promise<number>` (FirmMember.defaultHourlyRate ?? 0) — used by `createTimeEntry` when `rate` is undefined and by Task 4's confirm.
- `UpdateTimeEntryDto { hours?, date?, description?, rate? }` (no `billable` — spec F3)
- `BillingService.updateTimeEntry(user, caseId, entryId, dto)`, `deleteTimeEntry(user, caseId, entryId)`; routes `PATCH|DELETE cases/:caseId/billing/time-entries/:entryId` (`CaseAccessGuard`).
- Rule: allowed when entry `invoiceId = null` and `writtenOffAt = null` AND (entry.userId = user.id OR user has `manageInvoices`); otherwise 403/409.

- [ ] **Step 1: Failing tests:** owner edits own unbilled entry; other lawyer → Forbidden; office manager (manageInvoices) → allowed; invoiced → Conflict; written-off → Conflict; delete writes audit `TIME_ENTRY_DELETED`; createTimeEntry without rate uses member default.
- [ ] **Step 2:** Run → FAIL; implement; run → PASS.
- [ ] **Step 3:** Web: "เพิ่มเวลา" form (case picker on /timesheet, fixed case in CaseBillingPanel; date, hours, description, billable toggle at creation, rate prefilled from member default via existing user/me data or a small `GET time-entries/default-rate`); edit/delete actions on own unbilled rows. Mobile timesheet: add-entry sheet with the same fields.
- [ ] **Step 4:** tsc web + mobile typecheck clean.
- [ ] **Step 5:** Commit `feat(billing): manual time entry, edit and delete`.

### Task 6: F2 — firm metrics API

**Files:**
- Create: `apps/api/src/operations/firm-metrics.ts`, `firm-metrics.spec.ts`
- Modify: `apps/api/src/reports/reports.service.ts`, `reports.controller.ts`, `reports.module.ts` (inject TimeSuggestionsService for pending counts — export it from BillingModule)

**Interfaces — Produces:**
- `type MetricsPeriod = 'this_month' | 'last_month' | 'quarter' | 'year'`; `periodRange(period, now): { from: Date; to: Date; months: number }` (Bangkok; `months` is proportional by days for the target).
- `computeMemberMetrics(input: { workedHours; workedAmount; invoicedHours; invoicedAmount; collectedHours; collectedAmount; targetMonthly: number | null; months: number }): { utilization: number | null; realization: number | null; collection: number | null }` — null when the denominator is 0 or no target.
- `groupCollectedRatio(groupPaid: number, groupTotal: number): number` (0 when total 0, capped at 1).
- `GET reports/firm-metrics?period=` (capability `viewFirmReports`) → `{ period, from, to, timeBasedBilling: boolean, firm: Totals, members: Array<{ userId, name, targetMonthly, workedHours, workedAmount, invoicedHours, collectedHours, utilization, realization, collection, pendingDrafts7d }> }`. Totals = same numeric fields summed + ratios recomputed. `timeBasedBilling = invoicedHours > 0` for the firm in the period.

- [ ] **Step 1: Failing pure tests:** spec example 12 worked / 10 invoiced / 2 written off → realization 0.8333; no target → utilization null; zero invoiced → collection null; split group 60% paid of group total → collected = 0.6 × entry hours; `periodRange('quarter', 2026-11-15)` = Oct 1 – Dec 31 Bangkok.
- [ ] **Step 2: Failing service test:** written-off entries count in workedHours but not invoicedHours; DRAFT-invoice entries are not invoiced; invoices without `splitGroupId` are single groups; other firm's entries excluded.
- [ ] **Step 3:** Run → FAIL; implement (aggregate in SQL/Prisma per user, then pure functions); pendingDrafts7d = count of `suggest()` results across the last 7 Bangkok days per member (members ≤ firm size; fine — `ponytail:` comment noting N×7 calls, cache if slow) → PASS.
- [ ] **Step 4:** Commit `feat(reports): firm utilization, realization and collection metrics`.

### Task 7: F2 + F1 settings — team page targets/rate and reports UI

**Files:**
- Modify: the firm-members controller/service that backs `/team` (find via `apps/web/src/app/(dashboard)/team/page.tsx` api calls), `apps/web/src/app/(dashboard)/team/page.tsx`, `apps/web/src/app/(dashboard)/reports/page.tsx`, create `apps/web/src/components/reports/FirmMetricsSection.tsx`, `apps/web/src/lib/api.ts`
- Test: spec next to the members service (e.g. `firm-member-work-settings.spec.ts`)

**Interfaces — Produces:** `PATCH firm-members/:userId/work-settings` body `{ monthlyBillableTargetHours?: number | null; defaultHourlyRate?: number | null }` (capability `runOperations`, both ≥ 0, target ≤ 400).

- [ ] **Step 1: Failing tests:** office manager updates a member of the same firm; member of another firm → NotFound (Review Focus 3); lawyer → Forbidden; negative → BadRequest; audit `MEMBER_WORK_SETTINGS_UPDATED`.
- [ ] **Step 2:** Run → FAIL; implement → PASS.
- [ ] **Step 3:** Team page: per-member editable "เป้าชั่วโมง/เดือน" and "อัตรา/ชม." for `runOperations` roles.
- [ ] **Step 4:** Reports page: `FirmMetricsSection` after `OwnerKpiSection` — period selector, firm row, member table (columns per spec F2), percentages, "—" + "ตั้งเป้า" link when no target, hides realization/collection columns with the copy "สำนักงานไม่ได้วางบิลจากเวลา" when `timeBasedBilling` is false, separate "ร่างรอยืนยัน (7 วัน)" column.
- [ ] **Step 5:** tsc clean; commit `feat(web): firm metrics section and member targets`.

### Task 8: F4 — lawyer licence API, reminders, template placeholder

**Files:**
- Create: `apps/api/src/lawyer-license/lawyer-license.module.ts`, `lawyer-license.service.ts`, `lawyer-license.controller.ts`, `license-milestones.ts`, `license-milestones.spec.ts`, `lawyer-license.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/templates/templates.service.ts` (~100, fill `{{lawyerLicenseNo}}`), Notification category handling wherever categories are enumerated (preferences defaults)

**Interfaces — Produces:**
- `dueMilestone(expiresAt: Date, today: Date, sent: ReadonlySet<string>): LicenseMilestone | null` — the latest milestone whose offset day ≤ today and not in `sent`; null if none or if an even later milestone was already sent.
- `UpdateLicenseDto { lawyerLicenseNo?: string | null; lawyerLicenseType?: LawyerLicenseType | null; lawyerLicenseExpiresAt?: string | null (YYYY-MM-DD) }`; LIFETIME forces expiresAt null; TWO_YEAR requires expiresAt.
- Routes: `PATCH users/me/license` (self); `PATCH firm-members/:userId/license` (`runOperations`, same-firm check). `GET users/me` / members list responses include the 3 fields.
- Cron `0 8 * * *` Bangkok `sendLicenseReminders()`: for each user with TWO_YEAR + expiresAt, compute `dueMilestone`, insert `LawyerLicenseReminderLog` (unique claim; skip on conflict), notify the user + OWNER/OFFICE_MANAGER of every firm they belong to, category `LICENSE`, path `/team`.

- [ ] **Step 1: Failing pure tests:** expiry 2027-01-31: today 2026-11-02 → OPEN_90; today 2027-01-24 with nothing sent → DUE_7 only (Review Focus 4, missed days); DUE_30 sent and today = DUE_7 day → DUE_7; today before OPEN_90 → null; LATE_45 day → LATE_45; after LATE_45 sent → null.
- [ ] **Step 2: Failing service tests:** renewal (new expiresAt) → logs keyed by old date ignored, OPEN_90 for new date when due; LIFETIME users skipped; duplicate log insert (P2002) → no second notification; recipients = user + office roles of each firm; other-firm target on `firm-members/:userId/license` → NotFound; audit `LAWYER_LICENSE_UPDATED`; template renders the user's licence number.
- [ ] **Step 3:** Run → FAIL; implement → PASS.
- [ ] **Step 4:** Commit `feat(api): lawyer licence tracking and reminders`.

### Task 9: F4 UI — profile, team column, mobile notification prefs

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx` (profile view), `apps/web/src/app/(dashboard)/team/page.tsx`, `apps/web/src/lib/api.ts`, mobile notification-preferences screen (find via `src/api/hooks.ts:624`), mobile types

- [ ] **Step 1:** Settings → profile: licence no, type (2 ปี / ตลอดชีพ), expiry date (hidden for ตลอดชีพ).
- [ ] **Step 2:** Team page: licence column with badge "ใกล้หมด" when ≤ 90 days, red "หมดอายุ" when past; edit dialog for `runOperations` roles. Badge logic as pure `licenseBadge(expiresAt, today)` in a web `*.ts` with a `node --test` file.
- [ ] **Step 3:** Mobile notification preferences list includes LICENSE ("ใบอนุญาตทนาย").
- [ ] **Step 4:** web test + tsc, mobile typecheck clean; commit `feat(web,mobile): lawyer licence UI`.

### Task 10: F5 — closing checklist gaps

**Files:**
- Modify: `apps/api/src/cases/cases.service.ts` (`outstanding` ~798, `close` ~829), `apps/api/src/cases/dto/close-case.dto.ts`, `apps/api/src/notifications/reminder.scheduler.ts` (~43), `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` (~451, ~1071-1130), `apps/web/src/lib/api.ts`, `apps/mobile/app/case/[id]/close.tsx`
- Test: `apps/api/src/cases/cases-close-gate.spec.ts`, `apps/api/src/notifications/reminder.scheduler.spec.ts`

**Interfaces — Consumes:** `unbilledTimeWhere`, `unbilledExpenseWhere` (Task 2). **Produces:** `outstanding` payload adds `unbilledTime: { hours, amount }`, `unbilledExpenses: { count, amount }`, `unpaidInvoices: { count, outstandingAmount }`, `draftInvoices: { count }`; `CloseCaseDto.removeFutureEvents?: boolean`.

- [ ] **Step 1: Failing tests:** outstanding includes the 4 new groups and blocks close without `acknowledgeOutstanding`; nothing outstanding → close passes; `removeFutureEvents: true` deletes only events with `startAt >= now` of that case via the calendar service's normal delete method (so Outlook copies are removed — find the method used by the calendar controller's DELETE); `false`/absent leaves them; reminder scheduler query excludes cases with status CLOSED or ARCHIVED.
- [ ] **Step 2:** Run → FAIL; implement → PASS.
- [ ] **Step 3:** Web + mobile close forms show the new outstanding groups and a checkbox "ลบนัดในอนาคต {n} รายการ" with note "เปิดคดีใหม่จะไม่กู้นัดที่ลบ".
- [ ] **Step 4:** tsc/typecheck clean; commit `feat(cases): closing checklist covers billing, optional future-event removal`.

### Task 11: F6 API — advance settlement and receipt numbers

**Files:**
- Modify: `apps/api/src/billing/cash-advance.service.ts`, `billing.controller.ts`, `dto/billing.dto.ts`, `billing.service.ts` (expense create/standalone accept `officialReceiptNo`)
- Test: `apps/api/src/billing/cash-advance.service.spec.ts`

**Interfaces — Produces:**
- `CashAdvanceService.recordReturn(user, advanceId, amount: number, note?: string)`, `settle(user, advanceId, note?: string)`, `reconciliation(user, { status?: 'open' | 'settled' })` → rows `{ id, user, issuedAt, amount, spent, returnedAmount, remaining, missingReceiptFiles, courtFeesMissingReceiptNo, settledAt }`; `consume` rejects settled advances.
- Routes (capability `issueCashAdvance`): `POST cash-advances/:id/return` `{amount, note?}`, `POST cash-advances/:id/settle` `{note?}`, `GET cash-advances/reconciliation`; `GET cash-advances/:id/expenses`; `PATCH expenses/:expenseId/receipt-no` `{officialReceiptNo}` (expense owner or `approveExpenses`).
- Court fee = `category === 'ค่าธรรมเนียมศาล'` (from `EXPENSE_CATEGORIES`).

- [ ] **Step 1: Failing tests:** return > remaining → BadRequest; return reduces remaining and adds returnedAmount in one transaction; settle with remaining > 0 → Conflict; settle sets settledAt/settledById + audit `CASH_ADVANCE_SETTLED`; consume on settled → Conflict (Review Focus 5); reconciliation counts missing receipt files and court fees without receipt no, scoped to firm; staff see only their own via existing `listMineWithBalance`.
- [ ] **Step 2:** Run → FAIL; implement → PASS.
- [ ] **Step 3:** Commit `feat(billing): cash advance return, settlement and reconciliation`.

### Task 12: F6 UI — reconciliation tab and receipt number fields

**Files:**
- Modify: `apps/web/src/app/(dashboard)/admin/reimbursements/page.tsx`, `apps/web/src/app/(dashboard)/expenses/new/page.tsx`, `apps/web/src/lib/api.ts`, `apps/mobile/app/expenses/new.tsx`, `apps/api/src/notifications/line-conversation/flows/line-expense-flow.service.ts`

- [ ] **Step 1:** Reimbursements page: new tab "เงินทดรอง" — table per spec F6, filter ค้าง/ปิดแล้ว, row → expenses list with editable เลขที่ใบเสร็จศาล, buttons "บันทึกเงินคืน" (amount input) and "ปิดยอด" (enabled when remaining = 0).
- [ ] **Step 2:** Expense forms (web, mobile): when category is ค่าธรรมเนียมศาล show optional "เลขที่ใบเสร็จศาล".
- [ ] **Step 3:** LINE expense flow: after the category step, if court fee, ask for the receipt no with a skip reply; update its spec (`line-expense-flow.service.spec.ts`) for both answer and skip.
- [ ] **Step 4:** api tests for the LINE flow pass; web tsc, mobile typecheck clean; commit `feat: advance reconciliation UI and court receipt numbers`.

### Task 13: F7 API — paper files

**Files:**
- Create: `apps/api/src/paper-files/paper-files.module.ts`, `paper-files.service.ts`, `paper-files.controller.ts`, `paper-files.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces — Produces:**
- `checkOut(user, caseId, { holderUserId?: string; note?: string })` (holder defaults to user; `assertFirmRefs` on holderUserId), `checkIn(user, caseId, { location: string; note?: string })`, `move(user, caseId, { location: string; note?: string })`, `history(user, caseId, limit = 10)`, `resolveFolder(user, folderId): { caseId }` (case filter for user, 404 otherwise), `listCheckedOut(user, { page, pageSize = 50 })` ordered by checkout age desc with `daysOut`.
- Routes: `GET|POST cases/:caseId/paper-file` (GET = state + history; POST body `{ action: PaperFileAction, holderUserId?, location?, note? }`, `CaseAccessGuard`), `GET paper-files/by-folder/:folderId`, `GET paper-files/checked-out?page=` (capability `runOperations`).
- Each action updates `Case.paperFileHolderId/paperFileLocation` and inserts `PaperFileMovement` in one transaction + audit `PAPER_FILE_<ACTION>`.

- [ ] **Step 1: Failing tests:** check-out sets holder and writes movement; holder from another firm → rejected (Review Focus 3); check-in requires location and clears holder; move keeps holder null and changes location; resolveFolder for another firm's folderId → NotFound; listCheckedOut paginates and orders by oldest checkout.
- [ ] **Step 2:** Run → FAIL; implement → PASS.
- [ ] **Step 3:** Commit `feat(api): paper file check-out tracking`.

### Task 14: F7 web — case card, QR label, scan landing, checked-out list

**Files:**
- Create: `apps/web/src/components/cases/PaperFileCard.tsx`, `apps/web/src/app/(dashboard)/f/[folderId]/page.tsx`, `apps/web/src/app/(dashboard)/cases/[id]/paper-label/page.tsx`, `apps/web/src/app/(dashboard)/operations/paper-files/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`, `apps/web/src/lib/api.ts`, `apps/web/package.json` (`qrcode` + `@types/qrcode`), operations nav

- [ ] **Step 1:** `pnpm --filter web add qrcode @types/qrcode` (check lockfile change is limited to these).
- [ ] **Step 2:** `PaperFileCard` on the case page: holder/location, buttons เบิก / คืน / ย้ายที่เก็บ (dialogs), last 10 movements, "พิมพ์ฉลาก" → `paper-label` page (print CSS: QR of `${window.location.origin}/f/${folderId}`, folderId, case number, short title).
- [ ] **Step 3:** `/f/[folderId]`: resolve → large เบิก/คืน buttons usable at phone width; unauthenticated users go through the existing login redirect and come back (verify the auth layout preserves the return path; add it if not).
- [ ] **Step 4:** `/operations/paper-files`: paginated checked-out list (case, holder, days out).
- [ ] **Step 5:** web tsc + test clean; commit `feat(web): paper file card, QR labels and checked-out list`.

### Task 15: Whole-branch verification

- [ ] **Step 1:** `pnpm --filter @lawfirm/shared build && pnpm --filter api exec tsc --noEmit && pnpm --filter api test` — all green (rebuild shared first if TS2305 appears).
- [ ] **Step 2:** `pnpm --filter web exec tsc --noEmit && pnpm --filter web test`; `pnpm --filter mobile typecheck`.
- [ ] **Step 3:** Browser check on worktree preview ports (see memory: own launch.json entries, api `.env` copy): /timesheet, case billing write-off, reports firm metrics, team targets/licence, close case dialog, reimbursements advance tab, paper file card + `/f/<folderId>`. Screenshot proof. Revert launch.json before committing.
