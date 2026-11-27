# Lawyer workflow gaps — contract (2026-11-28)

Approved mockup: `index.html` in this folder (scenes A–F). Source requirements: the firm's
"การทำงานทนาย" and "ข้อมูลการจัดทำข้อมูลคดี" documents.

Ownership: **Sol** = Prisma schema + one migration, API (services, DTOs, controllers), `packages/shared`
(enums, labels, constants, pure helpers), API tests. **Astra** = `apps/web` only, consuming this contract.
Neither edits the other's files. `apps/web/src/lib/api.ts` (client types + request fns) belongs to **Astra**.

## 1. Schema (one migration, `apps/api/prisma/migrations/20261128000000_lawyer_workflow_gaps/`)

```prisma
enum ServiceMethod { PERSONAL  POSTED  POSTED_ABROAD }          // + POSTED_ABROAD ("ปิดหมายตัวแทน (ส่งต่างประเทศ)")
enum IntakeDecision { ... NOT_WORTH_FILING }                     // + "ไม่คุ้มค่าที่จะฟ้อง (ให้ลูกความตัดสินใจ)"

enum CourtFollowUpKind { ACCEPTANCE  SERVICE  ANSWER }
model CourtFollowUp {
  id              String            @id @default(uuid())
  caseId          String
  kind            CourtFollowUpKind
  dueAt           DateTime          // Bangkok court-close time of the due day
  doneAt          DateTime?
  lastResult      String?           @db.Text   // latest call result, shown under the row
  attempts        Int               @default(0)
  calendarEventId String?           @unique    // DEADLINE event the system keeps in sync (reminders)
  createdById     String
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  case Case @relation(fields: [caseId], references: [id], onDelete: Cascade)
  @@unique([caseId, kind])
}

enum AnswerExtensionStatus { PENDING  GRANTED  DENIED }
model AnswerExtension {
  id             String                @id @default(uuid())
  caseId         String
  filedAt        DateTime              // วันที่ยื่นคำร้อง
  requestedUntil DateTime              // ขอขยายถึง
  status         AnswerExtensionStatus @default(PENDING)
  grantedUntil   DateTime?             // required when GRANTED
  createdById    String
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt
  case Case @relation(fields: [caseId], references: [id], onDelete: Cascade)
  @@index([caseId])
}

// Case: + answerDueAt DateTime?  (legal answer deadline, defendant side)
//       + answerDeadlineEventId String?  (system-kept "ครบกำหนดยื่นคำให้การ" event; no FK, like limitationEventId)
// InsuranceClaim: + assuredName String?  + policyType String?  + claimAmount Decimal? @db.Decimal(15,2)  + claimCurrency String @default("THB")
```

Migration data steps (global rules only, `"firmId" IS NULL`; firm overrides untouched):
- INSERT global rules: COURT_DATE + WITNESS_HEARING `เริ่มเตรียมพยาน: นัดประชุมลูกความ เลือกพยาน เก็บข้อเท็จจริง` −30 CALENDAR;
  COURT_DATE + WITNESS_HEARING `ยื่นบันทึกถ้อยคำพยานต่อศาลและส่งคู่ความ` −7 CALENDAR (ป.วิ.พ. ม.120/1).
- Set `isActive=false` on the global COMPLAINT_SERVED rules `ครบกำหนดยื่นคำให้การ`, `ครบกำหนดยื่นคำให้การ (ปิดหมาย)`
  and `ตรวจขาดนัดยื่นคำให้การ / ขอให้พิพากษาโดยขาดนัด`: from now on the plaintiff side gets the ANSWER follow-up and the
  defendant side gets the managed answer deadline (below), both from the same service record, so the old suggestion
  cards would duplicate them. Remove them from `DEFAULT_DEADLINE_RULES` and add the two witness rules there, in sync.
- Idempotent (`WHERE NOT EXISTS`), enum `ALTER TYPE … ADD VALUE` statements first.

## 2. Shared (`packages/shared`)
- `ServiceMethod.POSTED_ABROAD`, label `ปิดหมายตัวแทน (ส่งต่างประเทศ)` in `SERVICE_METHOD_LABELS`.
- `answerDaysFor(method)`: PERSONAL 15, POSTED 30, POSTED_ABROAD 60. `answerDueDate(servedAt, method)` = servedAt + days (calendar days, Bangkok day).
- `IntakeDecision.NOT_WORTH_FILING`; `CLIENT_DECISIONS = ['PENDING','FILE','DROP']` with labels
  `รอคำตอบลูกความ` / `ฟ้องต่อ` / `ไม่ฟ้อง ปิดเรื่อง`; `effectiveIntakeDecision(decision, clientDecision)`:
  NOT_WORTH_FILING + FILE → SEND_NOTICE (notice first, then suit), + DROP → DO_NOT_FILE, otherwise NOT_WORTH_FILING → PENDING; any other decision unchanged.
- `COURT_FOLLOW_UP_LABELS` (kind → Thai text from the mockup; ANSWER text: `โทรถามศาล: จำเลยยื่นคำให้การหรือยัง (ถ้ายังไม่ยื่น ขอให้พิพากษาโดยขาดนัด)`).
- `POLICY_TYPES` (value = English, label shown as `Marine Cargo (ขนส่งสินค้าทางทะเล)` etc.): Marine Cargo, Motor, Fire / Property, Liability, Engineering, Health / PA, Other.
- `EXPENSE_CATEGORIES` add `ค่านำหมาย`, `ค่าพยาน`, `ค่าใช้จ่ายในการดำเนินคดี` (after `ค่าธรรมเนียมศาล`; existing values unchanged).

## 3. Behaviour
**Follow-ups (plaintiff side = case.partyRole not DEFENDANT/RESPONDENT, trial level only):**
- `recordFiling` → upsert ACCEPTANCE (filedAt+7) and SERVICE (filedAt+14); a re-recorded filing date moves undone ones.
- `recordService` → mark SERVICE done (lastResult `ส่งหมายแล้ว (<method label>)`) and upsert ANSWER (servedAt + answerDaysFor(method)).
- Each follow-up keeps one DEADLINE CalendarEvent (title = label, assignee = lead lawyer) in sync: created with the row,
  moved when dueAt moves, deleted when done. Pattern: `common/limitation-reminder.ts`.
- `POST /cases/:id/follow-ups/:kind/result` body `{ result: string (1–2000), done: boolean, retryInDays?: 1–60 (default 7) }`
  → attempts+1, lastResult=result, done ? doneAt=now : dueAt = today+retryInDays; logs a CaseActivity (DEADLINE type) "โทรถามศาล: …".
- `GET /cases/:id/follow-ups` → `CourtFollowUpItem[]` `{ kind, dueAt, doneAt, lastResult, attempts }` ordered ACCEPTANCE, SERVICE, ANSWER.

**Answer deadline (defendant side = partyRole DEFENDANT/RESPONDENT):**
- `recordService` on such a case sets `answerDueAt = answerDueDate(servedAt, method)` and syncs the managed event.
- `PUT /cases/:id/answer-deadline` `{ answerDueAt }` lets the lawyer set/correct the legal date by hand.
- `POST /cases/:id/answer-extensions` `{ filedAt, requestedUntil }`; `PATCH /cases/:id/answer-extensions/:extId` `{ status, grantedUntil? }`
  (GRANTED needs grantedUntil ≥ the previous effective date; DENIED/PENDING clear it).
- Effective deadline = latest `grantedUntil` among GRANTED, else `answerDueAt`. File-by date = effective − 1 day.
- Managed event: DEADLINE `ครบกำหนดยื่นคำให้การ` at the effective date (description says ยื่นไม่เกิน <file-by>), assignee lead; moved on every change.
- `GET /cases/:id/answer-deadline` → `{ answerDueAt, effectiveDueAt, fileBy, extensions: AnswerExtensionItem[] }` (extensions oldest first, numbered in UI).

**Intake:** `decide` accepts NOT_WORTH_FILING and `clientDecision` ∈ CLIENT_DECISIONS (validate only when decision is NOT_WORTH_FILING;
other decisions keep today's free-text). Branching uses `effectiveIntakeDecision`. The stored `decision` stays NOT_WORTH_FILING.
Intake status mapping and any `Record<IntakeDecision,…>` maps get the new value.

**Insurance claim:** create/update DTOs accept `assuredName`, `policyType` (∈ POLICY_TYPES), `claimAmount` (≥0), `claimCurrency` (THB/USD/EUR).

All new endpoints: firm-scoped via the case (same guard pattern as proceedings), closed cases read-only, body ids via `assertFirmRefs` where relevant.

## 4. UI (Astra) — match the approved mockup 1:1
- A: `PreLitigationIntake` decide modal: new option + client-decision segmented control + hint; `ACCEPT_DECISIONS` logic uses `effectiveIntakeDecision`.
- B: `CaseProceedingsCard`: third service method + computed answer line; new "ติดตามหลังยื่นฟ้อง" section (plaintiff side) with record-call inline form.
- C: `CaseProceedingsCard`: "กำหนดยื่นคำให้การ" timeline block (defendant side) with record-extension form and court-order update.
- D: nothing to build beyond copy — the new rules flow through the existing RULE suggestions panel.
- E: render `CaseInsurancePanel` in the case info grid (replace the lone Policy Ref cell), with the 3 new fields.
- F: expense category list picks up the new categories from shared; check the category select in `/expenses/new`, `CaseBillingPanel`, `CourtDayPanel`.
