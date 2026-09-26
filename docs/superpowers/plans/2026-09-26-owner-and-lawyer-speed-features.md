# Owner Control and Lawyer Speed Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the seven features in the spec: collections, drafted time capture, owner KPIs, stage-driven tasks, docx templates, AI pleading drafts, and leave approval.

**Architecture:** Each feature extends the module that already owns its data (`billing`, `operations`, `leave`, `practice-setup`, `templates`, `rag`). One Prisma migration lands first. API tasks are test-first with the mocked-Prisma pattern. Web tasks follow the existing `useEffect` + `api.*` page pattern. Mobile uses react-query hooks.

**Tech Stack:** NestJS + Prisma (apps/api), Next.js + shadcn-style ui (apps/web), Expo router + react-query (apps/mobile), LINE Messaging API, OpenAI via fetch, new dep `docx`.

**Spec:** `docs/superpowers/specs/2026-09-26-owner-and-lawyer-speed-features-design.md`

## Global Constraints

- AI is user-invoked only. Drafts must be confirmed before saving. Never add auto-run hooks.
- Every query is scoped by `user.firmId`. Case reads go through `CaseAccessService` (`getCaseFilterForUser` / `getCaseFilterForFinancials` / `canAccessCase`) or `CaseAccessGuard`.
- For an owner-only view, use `@UseGuards(FirmRoleGuard) @OwnerOnly()` (see `apps/api/src/operations/operations.controller.ts:11-12`). For money mutations, use `@UseGuards(RolesGuard) @Roles(Role.ADMIN)`. OWNER passes both.
- DTOs use class-validator. Error messages are Thai, matching `apps/api/src/billing/dto/billing.dto.ts`.
- Web copy is Thai and inline. Sidebar entries go in `apps/web/src/components/layout/SamnuanSidebar.tsx` with a matching `labelKey` in `apps/web/src/lib/i18n/dashboard.ts` (th and en).
- Do not run `prisma migrate dev`, `migrate deploy` or `migrate reset` against the shared DB (port 5433). Only Task 1 touches migrations.
- API test command: `cd apps/api && npx jest --config jest.config.js <path-under-src>`. Before trusting a failure, run `pnpm --filter @lawfirm/shared build` if `@lawfirm/shared` exports look stale.
- Typecheck: `cd apps/api && npx tsc --noEmit -p tsconfig.json`; `cd apps/web && npx tsc --noEmit`; `cd apps/mobile && npx tsc --noEmit`.
- Commit after each task with a conventional message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- LINE sends must never throw into the request. Wrap them in try/catch and log, like `cases/case-message.service.ts:195`.

---

### Task 1: Schema + migration for all features

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260926100000_owner_lawyer_speed/migration.sql`
- Modify: `packages/shared/src/ai-credits.ts` (add `DRAFT_PLEADING: 10`)

**Produces (Prisma types used by later tasks):**
```prisma
enum PaymentMethod { TRANSFER CHEQUE CASH OTHER }
model InvoicePayment {
  id           String        @id @default(uuid())
  firmId       String
  invoiceId    String
  amount       Float
  method       PaymentMethod @default(TRANSFER)
  receivedAt   DateTime      @db.Date
  note         String?
  recordedById String
  createdAt    DateTime      @default(now())
  firm       Firm    @relation(fields: [firmId], references: [id], onDelete: Cascade)
  invoice    Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  recordedBy User    @relation("InvoicePaymentRecorder", fields: [recordedById], references: [id])
  @@index([invoiceId])
  @@index([firmId, receivedAt])
}
// Invoice: + lastReminderAt DateTime?  + payments InvoicePayment[]
// TimeEntry: + sourceKey String?  + @@unique([userId, sourceKey])
enum LeaveStatus { PENDING APPROVED REJECTED }
// LeaveRequest: + status LeaveStatus @default(PENDING), decidedById String?, decidedAt DateTime?,
//               decidedBy User? @relation("LeaveDecider", fields:[decidedById], references:[id], onDelete: SetNull)
enum PleadingDraftStatus { DRAFT APPROVED }
model PleadingDraft {
  id           String              @id @default(uuid())
  firmId       String
  caseId       String
  kind         String
  instructions String?
  bodyText     String              @db.Text
  citations    Json                @default("[]")
  status       PleadingDraftStatus @default(DRAFT)
  documentId   String?
  createdById  String
  approvedById String?
  approvedAt   DateTime?
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  firm      Firm  @relation(fields: [firmId], references: [id], onDelete: Cascade)
  case      Case  @relation(fields: [caseId], references: [id], onDelete: Cascade)
  createdBy User  @relation("PleadingDraftCreator", fields: [createdById], references: [id])
  @@index([caseId, createdAt])
}
```
Add the back-relations Prisma requires on `Firm`, `User` (the `InvoicePaymentRecorder`, `LeaveDecider` and `PleadingDraftCreator` lists), `Case` and `Invoice`.

- [ ] **Step 1:** Save the old schema: `git show HEAD:apps/api/prisma/schema.prisma > /tmp/old-schema.prisma` (use the session scratchpad if /tmp is blocked).
- [ ] **Step 2:** Edit `schema.prisma` as above, then run `cd apps/api && npx prisma format && npx prisma validate`.
- [ ] **Step 3:** Generate the SQL: `npx prisma migrate diff --from-schema-datamodel /tmp/old-schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20260926100000_owner_lawyer_speed/migration.sql`.
- [ ] **Step 4:** Hand-edit the SQL so existing leave stays visible. The `ADD COLUMN "status" ... DEFAULT 'PENDING'` must be followed by `UPDATE "LeaveRequest" SET "status" = 'APPROVED';`. Adding with default PENDING and then updating is correct: new rows get PENDING and old rows become APPROVED.
- [ ] **Step 5:** `npx prisma generate`, then `npx tsc --noEmit -p tsconfig.json`. Expected: no new errors.
- [ ] **Step 6:** Add `DRAFT_PLEADING: 10,` with the comment `/** ร่างคำคู่ความจากสำนวน (AI, ผู้ใช้กดเอง) */` to `AI_CREDIT_COST`, then `pnpm --filter @lawfirm/shared build`.
- [ ] **Step 7:** Commit `feat(db): schema for collections, time drafts, leave approval, pleading drafts`.

---

### Task 2: Invoice status + payments + receivables API

**Files:**
- Create: `apps/api/src/billing/receivables.ts`, `apps/api/src/billing/receivables.spec.ts`
- Create: `apps/api/src/billing/collections.service.ts`, `apps/api/src/billing/collections.service.spec.ts`
- Modify: `apps/api/src/billing/billing.controller.ts`, `apps/api/src/billing/billing.module.ts`, `apps/api/src/billing/dto/billing.dto.ts`

**Interfaces (Produces):**
```ts
// receivables.ts (pure)
export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';
export function daysOverdue(dueAt: Date | null, today: Date): number; // max(0, whole days today-dueAt); null dueAt → 0
export function agingBucket(days: number): AgingBucket;               // ≤30,'31-60','61-90',>90
export function summarizeBuckets(rows: { outstanding: number; bucket: AgingBucket }[]): Record<AgingBucket, number>;
// CollectionsService
markSent(user: AuthUser, invoiceId: string): Promise<Invoice>
recordPayment(user: AuthUser, invoiceId: string, dto: RecordPaymentDto): Promise<{ invoice: Invoice; payment: InvoicePayment; outstanding: number }>
listPayments(user: AuthUser, invoiceId: string): Promise<InvoicePayment[]>
getReceivables(user: AuthUser, today?: Date): Promise<{
  buckets: Record<AgingBucket, number>;
  rows: { id: string; invoiceNumber: string; customerName: string | null; caseId: string | null; caseRef: string | null;
          totalAmount: number; paidAmount: number; outstanding: number; issuedAt: string | null; dueAt: string | null;
          daysOverdue: number; bucket: AgingBucket; lastReminderAt: string | null }[] }>
// DTO
class RecordPaymentDto { amount!: number; method?: PaymentMethod; receivedAt!: string /* YYYY-MM-DD */; note?: string }
```
Routes (class already has `JwtAuthGuard`; add `@UseGuards(RolesGuard) @Roles(Role.ADMIN)` per route):
- `PATCH invoices/:invoiceId/send` → markSent
- `POST invoices/:invoiceId/payments` → recordPayment
- `GET invoices/:invoiceId/payments` → listPayments
- `GET invoices/receivables` → getReceivables. **Declare it before any `invoices/:invoiceId` GET route** so `receivables` isn't captured as an id.

Rules:
- `markSent`: the invoice must belong to `user.firmId`, else NotFound. It must be DRAFT, else BadRequest `'ส่งได้เฉพาะใบแจ้งหนี้ฉบับร่าง'`. Sets `status SENT, issuedAt now`, and `dueAt ?? issuedAt+30d`.
- `recordPayment`: run inside `$transaction`, and load the invoice with its payments. DRAFT → BadRequest `'ต้องส่งใบแจ้งหนี้ก่อนบันทึกรับเงิน'`. PAID → BadRequest `'ใบแจ้งหนี้นี้ชำระครบแล้ว'`. `amount > outstanding + 0.005` → BadRequest `'ยอดรับเกินยอดค้าง'`. Create the payment. If the new outstanding ≤ 0.005, set status PAID. Round money with `Math.round(x*100)/100`.
- `customerName` = `billToCustomer.name ?? case.client.name ?? null` (check the actual Client relation names in the schema). `caseRef` = `case.ownRef`.

- [ ] **Step 1:** Write `receivables.spec.ts`:
```ts
import { agingBucket, daysOverdue, summarizeBuckets } from './receivables';
const d = (s: string) => new Date(s + 'T00:00:00+07:00');
it('not yet due counts as 0 days', () => expect(daysOverdue(d('2026-10-10'), d('2026-09-26'))).toBe(0));
it('counts whole days past due', () => expect(daysOverdue(d('2026-06-24'), d('2026-09-26'))).toBe(94));
it('null due date is 0', () => expect(daysOverdue(null, d('2026-09-26'))).toBe(0));
it.each([[0,'0-30'],[30,'0-30'],[31,'31-60'],[60,'31-60'],[61,'61-90'],[90,'61-90'],[91,'90+']])('bucket %i → %s', (n, b) => expect(agingBucket(n as number)).toBe(b));
it('sums per bucket', () => expect(summarizeBuckets([{outstanding:100,bucket:'0-30'},{outstanding:50,bucket:'0-30'},{outstanding:7,bucket:'90+'}])).toEqual({'0-30':150,'31-60':0,'61-90':0,'90+':7}));
```
- [ ] **Step 2:** Run it and confirm it fails (module not found). Then implement `receivables.ts`. Use `Math.floor((today - due)/86400000)` on UTC-midnight-normalised dates, then run it again and confirm it passes.
- [ ] **Step 3:** Write `collections.service.spec.ts`, using the mocked-Prisma pattern from `billing/billing.notify.spec.ts:16-45`. Cases:
  - markSent on DRAFT sets SENT, issuedAt and dueAt+30.
  - markSent on SENT throws BadRequest.
  - markSent on another firm's invoice throws NotFound.
  - recordPayment partial keeps SENT and returns outstanding.
  - recordPayment exact flips to PAID.
  - recordPayment over outstanding throws.
  - recordPayment on DRAFT throws.
  - getReceivables excludes zero-outstanding invoices and computes buckets.
- [ ] **Step 4:** Implement `CollectionsService` and the DTO, register it in `billing.module.ts`, and add the routes. Run the spec and confirm it passes. Run `npx tsc --noEmit -p tsconfig.json`.
- [ ] **Step 5:** Commit `feat(billing): invoice send, client payments and receivables aging`.

---

### Task 3: LINE payment reminder API

**Files:**
- Modify: `apps/api/src/billing/collections.service.ts` and its spec, `billing.controller.ts`

**Interfaces (Produces):** `sendReminder(user: AuthUser, invoiceId: string, now?: Date): Promise<{ sent: number; linkedContacts: number }>` and route `POST invoices/:invoiceId/remind` (ADMIN).

Rules:
- The invoice must be SENT with outstanding > 0, else BadRequest.
- If `lastReminderAt` is within 24h → BadRequest `'ทวงใบนี้ไปแล้วภายใน 24 ชม.'`.
- Recipients: `clientContact.findMany({ where: { clientId: invoice.billToCustomerId ?? case.clientId, lineUserId: { not: null } } })`, filtered by `ContactNotificationPreferenceService.isChannelEnabled(contact.id, 'LINE')`. Check the real channel enum value in that service.
- Text: `แจ้งเตือนยอดค้างชำระ\nใบแจ้งหนี้ ${invoiceNumber}\nยอดค้าง ${outstanding.toLocaleString('th-TH')} บาท\nครบกำหนด ${dueAt th-TH date}\nหากชำระแล้วขออภัยและขอบคุณครับ/ค่ะ`.
- `pushTo` each recipient in try/catch and count the trues. Set `lastReminderAt = now` only if sent > 0.

- [ ] **Step 1:** Add failing spec cases:
  - sends to 2 linked contacts and returns `{sent:2, linkedContacts:2}`, updating lastReminderAt.
  - throttled within 24h.
  - 0 linked contacts returns `{sent:0, linkedContacts:0}` without updating lastReminderAt.
  - a pushTo rejection counts as not sent and does not throw.
- [ ] **Step 2:** Implement it, inject `LineMessagingService` and `ContactNotificationPreferenceService` (check module exports and import the owning module if needed), and add the route. Run the tests and tsc.
- [ ] **Step 3:** Commit `feat(billing): remind client of overdue invoice via LINE`.

---

### Task 4: Web receivables UI on /invoices

**Files:**
- Modify: `apps/web/src/lib/api.ts` (add `markInvoiceSent`, `recordInvoicePayment`, `getInvoicePayments`, `getReceivables`, `remindInvoice` plus types), `apps/web/src/app/(dashboard)/invoices/page.tsx`
- Create: `apps/web/src/components/billing/ReceivablesPanel.tsx`, `apps/web/src/components/billing/RecordPaymentForm.tsx`

**Consumes:** the Task 2 and Task 3 routes and response shapes above.

Behaviour (matches mockup 1):
- Four bucket cards: 61-90 in the warning tint, 90+ in the danger tint.
- A table with checkboxes: invoice number / customer, case ref, outstanding, an overdue pill ("เกิน N วัน", or "ส่งแล้ว" when 0), and a "บันทึกรับเงิน" button that toggles the inline `RecordPaymentForm` (amount prefilled with outstanding, method select, `ThaiDateInput` or date input defaulting to today).
- Header button "ทวงที่เลือกผ่าน LINE" calls `remindInvoice` for each selected row sequentially and shows a summary toast: `ส่งแล้ว X ใบ · ไม่มีผู้ติดต่อที่เชื่อม LINE Y ใบ · ข้ามเพราะเพิ่งทวง Z ใบ`.
- In the existing invoice list, DRAFT rows get a "ส่งใบแจ้งหนี้" button that calls `markInvoiceSent` and then reloads.
- Use `components/ui` Button, Card, Table and Badge, and `formatCurrency` from `lib/utils`. Put `ReceivablesPanel` above the existing list. Errors use `LoadFailed`.

- [ ] **Step 1:** Add the api functions and types.
- [ ] **Step 2:** Build the components and wire them into the page.
- [ ] **Step 3:** Run `cd apps/web && npx tsc --noEmit` and `npx next lint --dir src/components/billing` (skip the lint if the repo has no lint script).
- [ ] **Step 4:** Commit `feat(web): receivables aging, payments and LINE reminders on invoices`.

---

### Task 5: Owner KPIs API

**Files:**
- Create: `apps/api/src/operations/owner-kpis.ts` (pure), `apps/api/src/operations/owner-kpis.spec.ts`
- Modify: `apps/api/src/operations/operations.service.ts` (add `getOwnerKpis`), `operations.controller.ts`, `operations.service.spec.ts`

**Interfaces (Produces):**
```ts
// owner-kpis.ts
export function collectionRate(billed: number, collected: number): number | null; // null when billed==0; round 3dp
export function stuckByStage(cases: { stage: string; stageChangedAt: Date | null; createdAt: Date }[], thresholdDays: number, now: Date): { stage: string; count: number; oldestDays: number }[]; // sorted by count desc; uses stageChangedAt ?? createdAt
export function monthRange(month: string /* YYYY-MM */): { start: Date; end: Date; prevStart: Date }; // Bangkok month boundaries
// OperationsService
getOwnerKpis(user: AuthUser, month?: string): Promise<{
  month: string;
  unbilled: { amount: number; caseCount: number };
  collectionRate: { value: number | null; target: 0.95; billed: number; collected: number };
  avgDaysOutstanding: number | null;
  revenue: { month: number; previousMonth: number };
  byLawyer: { userId: string; name: string; openCases: number; billed: number; collected: number; rate: number | null }[];
  stuckByStage: { stage: string; count: number; oldestDays: number }[];
}>
```
Route: `GET operations/owner-kpis?month=` under the controller's existing OwnerOnly guard. Validate `month` with `/^\d{4}-\d{2}$/` and default to the current Bangkok month.

Data rules:
- `unbilled`: `timeEntry` with billable, invoiceId null, case.firmId, case.deletedAt null → Σ hours*rate. Plus `expense` with billable, invoiceId null, status in [APPROVED, PAID], same firm (read `getInvoiceDraft` in billing.service.ts:993 for the exact expense filter and reuse it). caseCount = distinct caseIds.
- `billed`/`collected`: invoices with status ≠ DRAFT and issuedAt ≥ now−365d. collected = Σ their payments.
- `avgDaysOutstanding`: SENT invoices with outstanding > 0 → mean days since issuedAt, rounded.
- `revenue`: Σ `invoicePayment.amount` with receivedAt in the month / previous month.
- `byLawyer`: group by `case.leadLawyerId`. openCases = cases with status not in [CLOSED, ARCHIVED] and deletedAt null.
- `stuckByStage`: open cases, threshold `(await this.getSlaConfig(firmId)).stuckStatusDays` (see operations.service.ts:48).

- [ ] **Step 1:** Write the pure-function spec:
  - `collectionRate(0,0)` → null.
  - `collectionRate(1000,930)` → 0.93.
  - `stuckByStage` with a threshold of 30 counts only cases older than 30 days, groups them, and computes oldestDays.
  - `monthRange('2026-09')` start = 2026-08-31T17:00Z.
- [ ] **Step 2:** Run it and confirm it fails. Implement, then confirm it passes.
- [ ] **Step 3:** Add a `getOwnerKpis` spec in `operations.service.spec.ts` with a mocked Prisma returning fixed rows, and assert on the shape and sums. Implement it and add the route. Run the tests and tsc.
- [ ] **Step 4:** Commit `feat(operations): owner KPI summary (unbilled, collection, aging, stuck stages)`.

---

### Task 6: KPI UI on web /reports + mobile reports

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`getOwnerKpis(token, month?)` + `OwnerKpis` type), `apps/web/src/app/(dashboard)/reports/page.tsx`
- Create: `apps/web/src/components/reports/OwnerKpiSection.tsx`
- Modify: `apps/mobile/src/api/types.ts`, `apps/mobile/src/api/hooks.ts` (`useOwnerKpis()` with queryKey `['owner-kpis']`, path `/operations/owner-kpis`), `apps/mobile/app/reports.tsx`

Web (mockup 3):
- A month select (current month and the previous 5).
- Four stat cards:
  - ถึงงวดแต่ยังไม่วางบิล: amount, with "N คดี" under it.
  - อัตราเก็บเงินได้: %. When below target, show "ต่ำกว่าเป้า 95%" in the danger color. Show "—" when null.
  - หนี้ค้างเฉลี่ย: N วัน.
  - รายได้เดือนนี้: with the % change versus the previous month (success color if up, danger if down, nothing if previousMonth is 0).
- A stuck-by-stage bar list. Map stage labels to Thai using the existing stage label map; grep `FACT_GATHERING` in apps/web/src to find it.
- A byLawyer table: ทนาย / คดีที่ถือ / วางบิล / เก็บได้ / %. Show the rate in danger when < 0.9.
- Render only when `user.firmRole === 'OWNER'` (see how the page already gates). On a 403, hide the section.

Mobile:
- Four `StatCard`s at the top of `reports.tsx`, shown only if the query succeeds. A 403 is hidden silently (`retry: false`).

- [ ] **Step 1:** Add the api, type and hook.
- [ ] **Step 2:** Build the web section and add the mobile cards.
- [ ] **Step 3:** Run tsc for web and mobile.
- [ ] **Step 4:** Commit `feat(reports): owner KPI section on web and mobile`.

---

### Task 7: Leave approval API + LINE postback

**Files:**
- Modify: `apps/api/src/leave/leave.service.ts`, `leave.controller.ts`, `leave.module.ts`, the leave spec (create `leave.service.spec.ts` if absent)
- Modify: `apps/api/src/notifications/line-conversation/line-bot-router.service.ts` (+ its module imports), plus its spec if one exists
- Modify: any agenda/calendar reader of `leaveRequest` (grep `leaveRequest.` under apps/api/src) to add `status: 'APPROVED'`

**Interfaces (Produces):**
```ts
LeaveService.decide(user: AuthUser, leaveId: string, decision: 'APPROVED' | 'REJECTED'): Promise<LeaveRequest>
LeaveService.findCourtConflicts(firmId: string, userId: string, start: Date, end: Date): Promise<{ eventId: string; caseId: string; caseRef: string | null; title: string; courtName: string | null; startAt: Date }[]>
// GET leaves items gain: status, decidedAt, and courtConflicts (only for PENDING)
// PATCH leaves/:id/decision  body { decision: 'APPROVED'|'REJECTED' }  (FirmRoleGuard + OwnerOnly)
```

Rules:
- Status on create: `type === 'SICK' || user.firmRole === 'OWNER' ? 'APPROVED' : 'PENDING'`.
- The overlap check at leave.service.ts:61-64 adds `status: { not: 'REJECTED' }`.
- After a PENDING create, for each owner, `sendOnce('approve-req:'+id+':'+ownerId, lineUserId, text, quickReply)`. Extend `sendOnce` with an optional quickReply param passed through to `pushTo`. Owners come from `prisma.firmMember.findMany({ where: { firmId, role: 'OWNER', user: { lineUserId: { not: null } } }, select: { userId: true, user: { select: { lineUserId: true } } } })`.
  - Text: `คำขอลา · รออนุมัติ\n${name} · ${typeTh}\n${range th}` plus a line per conflict: `⚠ ชนนัดศาล: ${caseRef} ${date time} ${courtName}`.
  - Quick replies: `[{label:'อนุมัติ', text:'อนุมัติลา', data:'leave:approve:'+id}, {label:'ไม่อนุมัติ', text:'ไม่อนุมัติลา', data:'leave:reject:'+id}]`.
- `decide`: must be the same firm, else NotFound. Must be PENDING, else BadRequest `'คำขอนี้ตัดสินไปแล้ว'`. Only an OWNER may decide, else Forbidden; this is checked in the service because LINE bypasses the guard. Update status/decidedById/decidedAt. Push to the requester if they have `lineUserId`: `คำขอลา ${range} ได้รับการ${decision==='APPROVED'?'อนุมัติ':'ปฏิเสธ'}แล้ว`.
- Cron `sendNotices` and `cancel`: notices only consider APPROVED. Cancel stays as it is.
- Router: right after auth resolves (around line-bot-router.service.ts:72), `if (/^leave:(approve|reject):/.test(text))` → parse the id, call `leaveService.decide(authUser, id, …)` in try/catch, and reply with the success text or the error message. Return before the menu and flow handling.
- `findCourtConflicts`: the query from the spec (§7), with `lt: end + 1 day`.

- [ ] **Step 1:** Write failing specs:
  - create SICK → APPROVED, and no approval push.
  - create VACATION by LAWYER → PENDING, and pushes to 2 owners with quickReply data `leave:approve:<id>`.
  - create by OWNER → APPROVED.
  - decide by non-owner → Forbidden.
  - decide twice → BadRequest.
  - decide notifies the requester.
  - findCourtConflicts builds the where with assignee OR lead lawyer.
- [ ] **Step 2:** Implement, then run the specs.
- [ ] **Step 3:** Add a router spec: postback `leave:approve:abc` calls decide and replies; unknown text is unaffected. Implement it and resolve module DI (LeaveModule exports LeaveService; line-conversation module imports LeaveModule, and it probably already does for the leave flow).
- [ ] **Step 4:** Grep other `leaveRequest.findMany` readers and add the APPROVED filter. Run the full `leave` + `notifications` specs and tsc.
- [ ] **Step 5:** Commit `feat(leave): owner approval with court-conflict warning via LINE and API`.

---

### Task 8: Web /leaves page

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`createLeave`, `decideLeave`; extend `LeaveItem` with `status`, `courtConflicts?`)
- Create: `apps/web/src/app/(dashboard)/leaves/page.tsx`
- Modify: `SamnuanSidebar.tsx` (an item `/leaves`, icon `CalendarOff` from lucide, not ownerOnly), `lib/i18n/dashboard.ts`, `components/calendar/CalendarWorkspace.tsx` (show only APPROVED, or style PENDING as dashed; pick hiding PENDING)

Page:
1. "ยื่นลา" form: type select (ลาป่วย / ลากิจ / ลาพักร้อน), start and end date, submit → `createLeave`, showing the API error text on failure.
2. "คำขอของฉัน": list with a status badge (รออนุมัติ / อนุมัติ / ไม่อนุมัติ) and cancel for PENDING or future leave.
3. For OWNER only, "รออนุมัติ": cards like mockup 7. Conflicts appear in a warning box. Buttons อนุมัติ / ไม่อนุมัติ call `decideLeave` and reload.

Data: `getLeaves(from = today−30d, to = today+180d)`.

- [ ] **Step 1:** Add the api functions and build the page, sidebar entry and i18n keys.
- [ ] **Step 2:** Run `npx tsc --noEmit`.
- [ ] **Step 3:** Commit `feat(web): leave requests page with owner approval queue`.

---

### Task 9: Time suggestions + bulk confirm + firm timesheet API + 18:00 digest

**Files:**
- Create: `apps/api/src/billing/time-suggestions.service.ts`, `apps/api/src/billing/time-suggestions.service.spec.ts`
- Modify: `billing.controller.ts`, `billing.module.ts`, `dto/billing.dto.ts`

**Interfaces (Produces):**
```ts
type TimeSuggestion = { sourceKey: string; source: 'event' | 'task' | 'review' | 'messages'; caseId: string; caseRef: string | null;
  description: string; hours: number | null; date: string /* YYYY-MM-DD */ };
TimeSuggestionsService.suggest(user: AuthUser, date: string): Promise<TimeSuggestion[]>
TimeSuggestionsService.confirm(user: AuthUser, entries: ConfirmTimeEntryDto[]): Promise<{ created: number }>
TimeSuggestionsService.timesheet(user: AuthUser, q: { from: string; to: string; userId?: string }): Promise<{
  entries: { id: string; date: string; hours: number; description: string | null; billable: boolean; caseId: string; caseRef: string | null; userId: string; userName: string; invoiced: boolean }[];
  totals: { userId: string; userName: string; hours: number; billableHours: number }[] }>
TimeSuggestionsService.sendDailyDigest(now?: Date): Promise<number> // @Cron('0 18 * * 1-5', { timeZone: 'Asia/Bangkok' })
class ConfirmTimeEntryDto { caseId!: string; hours!: number /* 0.25..24 */; description!: string; date!: string; sourceKey?: string; billable?: boolean }
```
Routes: `GET time-entries/suggestions?date=`, `POST time-entries/confirm {entries: ConfirmTimeEntryDto[]}` (ValidateNested, ArrayMaxSize 50), `GET time-entries?from&to&userId`.

Rules for `suggest` (Bangkok day window `[date 00:00+07, next day 00:00+07)`):
- Events: `calendarEvent` of type in [COURT_DATE, CLIENT_MEETING], with startAt in the window, `OR [{assigneeId: uid}, {assigneeId: null, case: {leadLawyerId: uid}}]`, `case.deletedAt null`. Description `ไปศาล: ${title}` or `ประชุมลูกความ: ${title}`. hours = endAt ? round((endAt−startAt)/36e5 to 0.25) : null.
- Tasks: `task` with assigneeId uid, status DONE, completedAt in the window, caseId not null → `ปิดงาน: ${title}`, hours null.
- Reviews: `reviewDecision` with reviewerId uid and decidedAt in the window, including round→version→document(caseId, filename) → `ตรวจเอกสาร: ${filename}`, hours null. Skip it if there is no caseId.
- Messages: `caseMessage` with senderUserId uid and createdAt in the window, grouped by caseId → `ตอบลูกความ (${n} ข้อความ)`, hours null, sourceKey `messages:${caseId}:${date}`.
- Remove any with an existing `timeEntry { userId, sourceKey in keys }`. Also filter to cases the user can access (`getCaseFilterForUser`).
- `confirm`: for each entry, check `caseAccess.canAccessCase(user, caseId)` (throw Forbidden if denied). `createMany` with `skipDuplicates: true`, userId = user.id, rate = the default rate that `createTimeEntry` uses (billing.service.ts:303; reuse its rate resolution). Return the count.
- `timesheet`: a non-OWNER is forced to `userId = user.id`. The range is limited to 93 days (BadRequest otherwise).
- Digest: for each firm member with `lineUserId`, if `suggest(...)` for today returns >0 items, pushTo `มี ${n} รายการเวลาทำงานวันนี้รอยืนยัน\n${firmLink.linkFor(firmId,'/timesheet')}`. Build AuthUser the way other crons do (grep `firmRole:` in the notifications schedulers for how they construct one), or refactor `suggest` into `suggestFor(firmId, userId, date)` with an internal access filter. Wrap each user in try/catch.
  - `// ponytail: no send-once ledger; fine for a single api instance, add LeaveNoticeLog-style key if we scale out`

- [ ] **Step 1:** Write failing specs:
  - an event with endAt 3h → hours 3.
  - no endAt → null.
  - messages are grouped per case.
  - already-confirmed sourceKey is excluded.
  - confirm rejects an inaccessible case.
  - confirm skips duplicates.
  - timesheet forces own userId for LAWYER.
  - range > 93 days throws.
  - digest skips users with 0 suggestions.
- [ ] **Step 2:** Implement, register, add the routes. Run the specs and tsc.
- [ ] **Step 3:** Commit `feat(billing): drafted time entries from daily activity, firm timesheet, 18:00 LINE nudge`.

---

### Task 10: Web /timesheet + mobile timesheet screen

**Files:**
- Modify: `apps/web/src/lib/api.ts`, `SamnuanSidebar.tsx` (item `/timesheet`, icon `Clock`), `lib/i18n/dashboard.ts`
- Create: `apps/web/src/app/(dashboard)/timesheet/page.tsx`
- Modify: `apps/mobile/src/api/types.ts`, `apps/mobile/src/api/hooks.ts` (`useTimeSuggestions(date)`, `useConfirmTime()` mutation that invalidates `['time-suggestions']`)
- Create: `apps/mobile/app/timesheet.tsx`; register it in `apps/mobile/app/_layout.tsx` (`title: 'ยืนยันเวลา'`) and link it from `app/more.tsx`

Web page:
- Section "ยืนยันเวลาวันนี้" (date picker, default today): rows with a checkbox, pre-checked when hours ≠ null. There is an editable hours input (step 0.25) and an editable description. The button "ยืนยัน N รายการ" is disabled-with-reason if a checked row has no hours; show inline text `กรอกชั่วโมงก่อน`.
- Section "บันทึกเวลา": from/to (default the current month), user select (OWNER only). Show the totals table and the entries table.

Mobile (mockup 2):
- Same confirm list: `FlatList` rows with a checkbox and a hours `TextInput` (numeric), with the bottom button "ยืนยัน N รายการ". Show a toast or Alert on success.

- [ ] **Step 1:** Implement the web page, the mobile screen and the hooks.
- [ ] **Step 2:** Run tsc for web and mobile.
- [ ] **Step 3:** Commit `feat(timesheet): confirm drafted time on web and mobile, firm timesheet view`.

---

### Task 11: Stage-driven task proposals API

**Files:**
- Modify: `apps/api/src/practice-setup/practice-setup.service.ts` (PlaybookStep interface, new methods), `practice-setup.controller.ts` (StepDto + routes), `practice-setup.service.spec.ts` (create it if absent)
- Modify: `apps/api/src/deadlines/deadline-rules.service.ts` (make `loadHolidays` public; no behaviour change)

**Interfaces (Produces):**
```ts
interface PlaybookStep { title: string; instructions: string; primaryRole?: ...; secondaryRole?: ...; stage?: CaseStage; offsetDays?: number; dayBasis?: 'CALENDAR' | 'BUSINESS' }
PracticeSetupService.proposeStageTasks(user: AuthUser, caseId: string, stage: CaseStage, today?: Date): Promise<{
  title: string; description: string; dueDate: string | null; assigneeId: string | null; releaseName: string }[]>
PracticeSetupService.createStageTasks(user: AuthUser, caseId: string, stage: CaseStage, tasks: { title: string; description?: string; dueDate?: string | null; assigneeId?: string | null }[]): Promise<{ created: number; taskIds: string[] }>
// GET  practice-setup/cases/:caseId/stage-tasks?stage=
// POST practice-setup/cases/:caseId/stage-tasks  { stage, tasks: [...] }   (CaseAccessGuard)
```
StepDto gains `@IsOptional() @IsEnum(CaseStage) stage`, `@IsOptional() @IsInt() @Min(0) @Max(365) offsetDays`, and `@IsOptional() @IsIn(['CALENDAR','BUSINESS']) dayBasis`.

Rules:
- Releases: those with an `AppliedPlaybook` for the case, plus, for each `name` among releases with `caseTypeId = case.caseTypeId`, the max version. Dedupe steps by title.
- Due date: `computeDueDate(today, offsetDays, dayBasis ?? 'CALENDAR', await loadHolidays(today, offsetDays, prisma))`.
- Assignee: `resolveAssignee` with the case team (reuse how `applyPlaybook` gathers `firmMembers`/`teamIds`/`ownerId`).
- `createStageTasks`: verify each assigneeId is a firm member (else BadRequest). Create tasks with `labels: ['stage:'+stage]`, `dueDate`, `caseId`, `createdById`. Afterwards, call `assignmentNotifier.notifyAssigned({ firmId, userIds, actorUserId: user.id, summaryText: \`งานใหม่จากขั้น ${stage}: ${n} งาน\`, entityPath: \`/cases/${caseId}?tab=tasks\` })` in try/catch. Log via `caseFeed.log({ type: ActivityType.TASK, title: \`สร้าง ${n} งานจากขั้นคดี\` })` if that fits the existing CaseFeed API.

- [ ] **Step 1:** Write failing specs:
  - only steps with a matching stage are returned.
  - the dueDate uses computeDueDate with holidays (mock `loadHolidays` to return a Set containing the naive due date, and expect a rolled date).
  - null offsetDays → dueDate null.
  - createStageTasks rejects a non-member assignee.
  - createStageTasks creates labelled tasks and notifies.
- [ ] **Step 2:** Implement and run the specs and tsc.
- [ ] **Step 3:** Commit `feat(playbooks): propose and create tasks when a case changes stage`.

---

### Task 12: Web stage-change dialog + playbook step fields

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`getStageTaskProposals`, `createStageTasks`), `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` (`handleStageChange` ~line 387)
- Create: `apps/web/src/components/cases/StageTasksDialog.tsx`
- Modify: the playbook step editor. Find it with `grep -rn "primaryRole" apps/web/src --include=*.tsx`. Add a stage select (Thai stage labels), an offsetDays number input, and a dayBasis select (วันปฏิทิน / วันทำการ).

Behaviour (mockup 4):
- `handleStageChange(newStage)` first calls `getStageTaskProposals`. If the list is empty, or the call errors, it proceeds with the existing update.
- Otherwise it opens `StageTasksDialog`: title `ย้ายไป "${label}"?`, and rows with a checkbox, title, date input and assignee select (firm members; reuse the list the page already loads for assignment if there is one). Footer buttons are "ย้ายขั้นอย่างเดียว" and "ย้ายและสร้าง N งาน".
- The confirm path runs `updateCase`, then `createStageTasks`, then reloads the tasks. If task creation fails after the stage update, show an error but keep the stage change.

- [ ] **Step 1:** Implement and run `npx tsc --noEmit`.
- [ ] **Step 2:** Commit `feat(web): stage change proposes playbook tasks; playbook steps take stage and due offset`.

---

### Task 13: Template variables, missing fields, .docx generation API

**Files:**
- Modify: `apps/api/package.json` (add `docx`), then `pnpm install` from the repo root
- Create: `apps/api/src/templates/docx-builder.ts`, `apps/api/src/templates/docx-builder.spec.ts`
- Modify: `apps/api/src/templates/templates.service.ts`, `templates.controller.ts`, `templates.service.spec.ts` (create it if absent)
- Modify: `apps/api/src/documents/documents.service.ts` (add `createFromBuffer`)
- Create: `apps/api/prisma/migrations/20260926100100_builtin_thai_templates/migration.sql` (INSERT of 4 built-in templates with fixed uuids, `ON CONFLICT DO NOTHING`)

**Interfaces (Produces):**
```ts
// docx-builder.ts
export async function buildDocx(title: string, body: string): Promise<Buffer>; // TH Sarabun New 16pt, title bold centered, one Paragraph per line
// TemplatesService
render(firmId, templateId, caseId): Promise<{ name: string; content: string; variables: Record<string,string>; missingFields: string[] }>
generate(user: AuthUser, caseId: string, templateId: string): Promise<{ documentId: string; filename: string }>
// DocumentsService
createFromBuffer(user: AuthUser, caseId: string, args: { filename: string; buffer: Buffer; mimeType: string; category?: DocumentCategory }): Promise<Document>
// POST cases/:caseId/document-templates/:templateId/generate  (CaseAccessGuard)
```

Rules:
- Variables added in `render`:
  - `blackCaseNumber` and `redCaseNumber` (check the Case field names).
  - `plaintiffNames` and `defendantNames`: `CaseParticipant` names joined by `, `, filtered by side/role. Inspect the enum values for plaintiff and defendant.
  - `lawyerName` = leadLawyer name.
  - `lawyerLicenseNo`, only if a license field exists on User/FirmMember.
- `missingFields` = distinct keys matched by `/\{\{(\w+)\}\}/g` in the template body where the value is `''` or the key is unknown.
- `createFromBuffer` follows the upload steps in documents.service.ts:214 (create → audit → key → put → update storagePath → documentVersion → caseFeed). Refactor `upload` to delegate to it, so there is one code path.
- The filename is `${templateName}-${ownRef ?? caseId.slice(0,8)}.docx`. The mime type is `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- Built-in template bodies are short skeletons using the variables above, with a first line `(แบบฟอร์มตัวอย่าง — สำนักงานควรตรวจแก้ก่อนใช้)`. Check how built-ins are listed (firmId null) so they appear.

- [ ] **Step 1:** docx-builder spec: `buildDocx('ทดสอบ','บรรทัด1\nบรรทัด2')` returns a Buffer starting with `PK`. Unzip it (use JSZip if it is already a transitive dep of docx, otherwise check `buffer.includes('บรรทัด1')` after inflating via `docx`'s own Packer is not possible — simply assert the `PK` magic and length > 1000).
- [ ] **Step 2:** templates spec:
  - render fills plaintiffNames and defendantNames.
  - missingFields lists `courtName` when it is empty and `foo` when unknown.
  - generate calls createFromBuffer with a .docx filename.
- [ ] **Step 3:** Implement, write the built-ins migration SQL (do not apply it to the shared DB), and run the specs and tsc.
- [ ] **Step 4:** Commit `feat(templates): case variables, missing-field check and .docx generation`.

---

### Task 14: Web template picker → .docx

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`renderTemplate` return type gains `variables` and `missingFields`; add `generateTemplateDocx`), `apps/web/src/components/cases/CaseDocumentsPanel.tsx` (~line 199)
- Create: `apps/web/src/components/cases/TemplateGenerateDrawer.tsx` (uses `components/ui/SideDrawer.tsx`)

Behaviour (mockup 5):
- Left side: a search box and a template list. Right side: the variables table (label ↔ value) for the selected template, with missing fields shown in red as `ยังไม่มีข้อมูล`. Map labels to Thai: ตัวความ, ศาล, ทนาย, เลขคดีดำ, and so on.
- Buttons: "ดูตัวอย่าง" (show the rendered text in a `<pre>`) and "สร้าง .docx". The latter calls `generateTemplateDocx`, then refreshes the documents list and shows a toast `สร้างเอกสารแล้ว`.
- Replace the existing render flow entry point with this drawer. Keep the existing behaviour if it copies text somewhere; read the file first.

- [ ] **Step 1:** Implement and run tsc.
- [ ] **Step 2:** Commit `feat(web): generate .docx from templates with missing-field hints`.

---

### Task 15: AI pleading drafts API (user-invoked)

**Files:**
- Modify: `apps/api/src/rag/rag.service.ts` (extract `retrieve`, make `logRun` usable, or record via prisma)
- Create: `apps/api/src/rag/pleading-draft.service.ts`, `apps/api/src/rag/pleading-draft.service.spec.ts`, `apps/api/src/rag/pleading-draft.controller.ts`, `apps/api/src/rag/pleading-citations.ts`, `apps/api/src/rag/pleading-citations.spec.ts`
- Modify: `apps/api/src/rag/rag.module.ts` (import TemplatesModule/DocumentsModule for `buildDocx` and `createFromBuffer`; `buildDocx` is a plain import)

**Interfaces (Produces):**
```ts
// rag.service.ts
retrieve(caseId: string, firmId: string, query: string, documentIds?: string[]): Promise<{ documentId: string; filename: string; pageStart: number | null; pageEnd: number | null; content: string }[]>
// ask() must call retrieve() — behaviour unchanged (existing rag specs stay green)
// pleading-citations.ts (pure)
export function parseCitations(body: string, sources: { documentId: string; filename: string; pageStart: number | null; content: string }[]): {
  citations: { n: number; documentId: string; filename: string; pageStart: number | null; snippet: string }[];
  unsupportedParagraphs: number[] }; // paragraphs = body.split(/\n\s*\n/); unsupported = no /\[\d+\]/ and trimmed length > 40; citations only for n within 1..sources.length; snippet = first 160 chars of source content
// PleadingDraftService
generate(user: AuthUser, caseId: string, dto: { kind: 'ANSWER'|'COMPLAINT'|'MOTION'|'LETTER'; instructions?: string; documentIds?: string[] }): Promise<PleadingDraftView>
list(user, caseId): Promise<PleadingDraftView[]>
update(user, caseId, id, bodyText: string): Promise<PleadingDraftView>   // DRAFT only
approve(user, caseId, id): Promise<PleadingDraftView & { documentId: string }> // builds docx, createFromBuffer, APPROVED
type PleadingDraftView = { id; kind; instructions; bodyText; citations; unsupportedParagraphs: number[]; status; documentId; createdAt }
// routes under cases/:caseId/pleading-drafts with JwtAuthGuard + CaseAccessGuard; POST (generate) has @RequireCredits(AI_CREDIT_COST.DRAFT_PLEADING)
```

Rules:
- Query for retrieval: `${kindTh} ${instructions ?? ''} ${case.title}`. With zero sources → BadRequest `'ยังไม่มีเอกสารในสำนวนที่ระบบอ่านได้ — อัปโหลดเอกสารก่อน'`. Call `ensureCaseIndexed` first, as `ask` does.
- Prompt: the system prompt is Thai. Draft `${kindTh}` in formal Thai court style. Use ONLY the facts in the sources. End every paragraph that states a fact with `[N]` referencing the source number. Where a fact is unknown, write `[ต้องระบุ: ...]` rather than inventing it. The user content is the numbered sources `[N] filename หน้า X\n${content}` plus the instructions.
- The model is `this.rag.chatModel()`, via fetch in the same style as `ask`. Record an `aiRun` with operation `'pleading_draft'`, with tokens from the usage and a failed status on error (mirror `logRun`).
- `unsupportedParagraphs` is recomputed on every read/update from bodyText using the stored citations' source list. Store the sources' minimal info in `citations` (all numbered sources, not just those used) so it can be recomputed.
- `approve`: `buildDocx(kindTh + ' — ' + case.ownRef, bodyText)`, filename `ร่าง${kindTh}-${ownRef}.docx`, `createFromBuffer`, then set status APPROVED, approvedById/approvedAt and documentId. It is refused if already APPROVED.

- [ ] **Step 1:** Write the `pleading-citations.spec.ts` cases:
  - Two paragraphs with `[1]`/`[2]` give 2 citations and unsupported [].
  - A long paragraph without a marker is unsupported.
  - A short heading line is not flagged.
  - `[9]` out of range is ignored.
- [ ] **Step 2:** Implement the pure function and confirm it passes.
- [ ] **Step 3:** Extract `retrieve` from `ask`, then run the existing `rag` specs and confirm they still pass.
- [ ] **Step 4:** Write `pleading-draft.service.spec.ts` with a mocked `global.fetch` and mocked Prisma:
  - generate stores the draft with citations and logs aiRun.
  - no sources → BadRequest.
  - update after APPROVED → BadRequest.
  - approve calls createFromBuffer and sets APPROVED.
  - fetch failure logs aiRun FAILED and throws.
- [ ] **Step 5:** Implement the service, controller and module wiring. Run the specs and tsc.
- [ ] **Step 6:** Commit `feat(ai): user-invoked pleading drafts grounded in case documents with citations`.

---

### Task 16: Web AI draft drawer

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`generatePleadingDraft`, `getPleadingDrafts`, `updatePleadingDraft`, `approvePleadingDraft` + types)
- Create: `apps/web/src/components/cases/PleadingDraftDrawer.tsx`
- Modify: `apps/web/src/components/cases/CaseDocumentsPanel.tsx` (button "✦ AI ร่างคำคู่ความ" opening the drawer)

Behaviour (mockup 6):
- Form: kind select (คำให้การ / คำฟ้อง / คำร้อง / หนังสือ), an instructions textarea, and "สร้างร่าง" with a credit note `ใช้ 10 เครดิต`. Generation starts only when the button is clicked.
- While running, show a spinner and "AI กำลังร่าง…".
- Result:
  - A badge "ร่าง AI · ยังไม่บันทึก".
  - Paragraphs rendered with `[N]` turned into accent chips; hovering or clicking a chip shows the filename, page and snippet in the right column.
  - Unsupported paragraphs get a danger chip "ไม่พบแหล่งอ้างอิง".
  - Count text: `${k} ข้อความไม่มีแหล่งอ้างอิง ต้องตรวจก่อนบันทึก`.
- Buttons: "ร่างใหม่" (generate again), "แก้ไข" (toggles a textarea; save → `updatePleadingDraft`), and "ตรวจแล้ว บันทึกเป็นเอกสาร". The last one confirms with `window.confirm` when k > 0, then calls `approvePleadingDraft`, refreshes the documents list and shows the toast `บันทึกเป็นเอกสารแล้ว`.
- Show previous drafts in a small list at the top, and let the user open one.
- A 402/insufficient-credits error shows the API message.

- [ ] **Step 1:** Implement and run tsc.
- [ ] **Step 2:** Commit `feat(web): AI pleading draft drawer with citation review before saving`.

---

## Self-review notes
- Spec §1→T2-4, §2→T9-10, §3→T5-6, §4→T11-12, §5→T13-14, §6→T15-16 (T13's `buildDocx`/`createFromBuffer` are consumed by T15), §7→T7-8. Schema→T1.
- Order constraints: T1 comes first. T13 must come before T15. Everything else follows the API → web pairs.
