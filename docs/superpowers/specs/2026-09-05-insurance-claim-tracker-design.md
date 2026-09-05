# Insurance Claim Tracker — Design Spec

**Date:** 2026-09-05
**Status:** Approved, pending implementation plan

Comes out of the deep-research reports on Thai lawyer workflow and Thai insurance civil litigation (transport & health/accident) done earlier this session. The research found that pre-filing evidence/deadline tracking is the slowest part of an insurance case, and that ปพพ. ม.882 gives a hard 2-year limitation period from the date of loss — a date firms currently have to track manually via the generic `Case.limitationDeadline` field.

## Goal

Give a case handling an insurance claim (cargo/transport or health/accident) a structured stage tracker bolted onto the existing `Case`, so that entering the incident date auto-calculates the statute-of-limitations deadline, and moving the claim to its next stage auto-creates the task and deadline that stage requires — instead of a lawyer remembering to do both by hand.

## Scope (MVP)

**In scope:**
- One `InsuranceClaim` record per `Case` (opt-in — a case only gets one if the handler adds it), covering both transport and health/accident claims with a single flexible schema (per user decision — not two separate field sets).
- A single linear `stage` field: `CLAIM_FILED → DENIED_OR_PARTIAL (optional) → DEMAND_SENT → OIC_COMPLAINT → SUIT_FILED`. A stage can be skipped forward (e.g. claim delayed but never formally denied) — the tracker does not force every case through every stage.
- Auto-calculation: setting/editing `incidentDate` sets `Case.limitationDeadline = incidentDate + 2 years` and creates/updates a `CalendarEvent` (type `DEADLINE`) so it shows up on the firm calendar with reminders.
- Auto-task-creation on specific stage transitions (see Automation below).
- Every stage transition is logged to the existing `CaseActivity` feed — no new audit table.
- New tab on the case detail page: `cases/[id]/insurance`.

**Out of scope (later / separate features):**
- Configurable stage lists or task templates per firm — v1 hardcodes one stage list and one task-template map in code, matching how `DEFAULT_CASE_TYPES` is hardcoded today. Admin configurability is a separate feature if firms ask for it.
- OIC e-Complaint API integration — `oicComplaintNumber`/`oicComplaintDate` are freeform fields the lawyer fills in by hand; there's no public OIC API to integrate against.
- Subrogation tracking, settlement/negotiation ledgers, or multi-insurer split-liability tracking — the research's own adversarial verification rejected the subrogation case-law claims as unconfirmed, so nothing normative is being encoded about them here.
- A dedicated insurance dashboard/report (e.g. "claims nearing limitation deadline across all cases") — worth a follow-up feature once the tracker has real data in it, not part of this spec.
- Editable/relaxed stage sequencing rules beyond "forward only, skips allowed" (e.g. going back a stage) — not needed for MVP; can be added if lawyers hit it in practice.

## Architecture

**Extension of `Case`, not a parallel case-management system.** The codebase already has the generic scaffolding this needs — `CaseType.fieldSchema` for ad hoc custom fields, `Task`/`CalendarEvent`/`CaseActivity` for the operational primitives, `CaseParticipant.opposingInsurer` for the counterparty. `InsuranceClaim` is a 1:1 sidecar table (same pattern as `Intake` 1:1 with `Case`), not a new subsystem, because the workflow being modeled is specific structured automation (deadline math, stage-triggered tasks) that a generic JSON field schema can't drive — everything else reuses what's there.

```
Lawyer opens Case → "Insurance" tab (new)
  → no InsuranceClaim yet → "Start insurance claim tracking" form
     (insurer, policy #, claim #, incident date)
  → InsuranceClaimsService.create()
       - creates InsuranceClaim row, stage = CLAIM_FILED
       - LimitationDeadlineService: incidentDate + 2y → Case.limitationDeadline
       - creates CalendarEvent (type DEADLINE, reminders at 90/30/7 days)
       - logs CaseActivity (type DEADLINE, "อายุความฟ้องคดี ครบกำหนด <date>")
  → lawyer clicks "advance to next stage" (e.g. → DEMAND_SENT)
  → InsuranceClaimsService.advanceStage()
       - validates target stage is reachable (forward-only, current allowed set)
       - updates InsuranceClaim.stage
       - StageAutomationMap[stage] → creates Task(s) per template, if any
       - logs CaseActivity (type FILING, "เปลี่ยนสถานะเป็น <stage>")
```

`StageAutomationMap` is a plain TS object (`apps/api/src/insurance-claims/stage-automation.ts`), keyed by target stage, listing the `Task` templates (title, description, days-from-now due date) to create on entry. This mirrors how `DEFAULT_CASE_TYPES` is a hardcoded array in `packages/shared/src/index.ts` — same "data as code" pattern already used in this codebase, not a new configuration mechanism.

## Data model changes

Additive only, no breaking changes to existing tables:

```prisma
enum InsuranceClaimStage {
  CLAIM_FILED
  DENIED_OR_PARTIAL
  DEMAND_SENT
  OIC_COMPLAINT
  SUIT_FILED
}

model InsuranceClaim {
  id                   String              @id @default(uuid())
  caseId               String              @unique
  insurerName          String
  policyNumber         String?
  claimNumber          String?
  incidentDate         DateTime
  claimedDate          DateTime?
  denialReason         String?             @db.Text
  stage                InsuranceClaimStage @default(CLAIM_FILED)
  demandLetterSentAt   DateTime?
  demandLetterDeadline DateTime?
  oicComplaintNumber   String?
  oicComplaintDate     DateTime?
  oicOutcome           String?             @db.Text
  limitationEventId    String?             // FK to the auto-created CalendarEvent, so recalculation updates it instead of duplicating
  createdById          String
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  case      Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  createdBy User     @relation(fields: [createdById], references: [id])

  @@index([caseId])
}
```

`Case` gains one relation field (`insuranceClaim InsuranceClaim?`), no other changes — `limitationDeadline`, `claimedAmount` already exist on `Case` and are reused as-is.

## API surface

New `InsuranceClaimsModule`, following the `CaseTypesModule` pattern (controller/service/dto), nested under case:

- `GET /cases/:caseId/insurance-claim` — returns the claim or 404 if none started
- `POST /cases/:caseId/insurance-claim` — create (the "start tracking" form); triggers limitation-deadline calc
- `PATCH /cases/:caseId/insurance-claim` — edit non-stage fields (insurer, policy #, denial reason, OIC fields); editing `incidentDate` recalculates the deadline
- `POST /cases/:caseId/insurance-claim/advance-stage` — body `{ stage: InsuranceClaimStage }`; runs the automation described above, rejects a stage that isn't in the allowed forward set from the current stage

All endpoints go through the existing `JwtAuthGuard` + firm-scoping already applied to `/cases/*` — no new authorization model needed, this is firm-internal case data like everything else under `Case`.

## Frontend changes

- New tab `apps/web/src/app/(dashboard)/cases/[id]/insurance/page.tsx`, added to the same tab bar as `tasks`/`calendar`/`documents`/`billing`.
- Empty state: "เริ่มติดตามเคลมประกัน" form (insurer, policy #, claim #, incident date).
- Populated state: stage stepper (5 stages, current stage highlighted, DENIED_OR_PARTIAL shown only if reached), a key-dates card (incident date, limitation deadline, demand deadline, OIC complaint date), and an "advance stage" action that opens a confirm dialog naming what will be auto-created (task/deadline) before submitting — so the automation isn't a surprise.
- `apps/web/src/lib/api.ts` gains the four calls above, following the existing per-resource function grouping already in that file.

## Error handling

- `advance-stage` to a non-forward or unreachable stage → 400 with the current stage and the allowed next stages, surfaced as a toast on the client.
- Creating a second `InsuranceClaim` for a case that already has one → 409 (the unique `caseId` constraint backs this).
- Deleting a `Case` cascades to its `InsuranceClaim` (`onDelete: Cascade`), consistent with how `Task`/`Document`/`CalendarEvent` already cascade from `Case`.
- If `LimitationDeadlineService` recalculates and a `CalendarEvent` already exists (`limitationEventId` set), it updates that event's `startAt` in place rather than creating a duplicate.

## Testing

- Unit: `LimitationDeadlineService` date math (incident date → +2 years, timezone edge cases around DST-less Thai time — should be a simple day-granularity add, no time-zone arithmetic needed since Thailand has no DST).
- Unit: stage-transition validation (forward-only, DENIED_OR_PARTIAL skip-forward allowed, rejects backward/invalid targets).
- Unit: `StageAutomationMap` — each stage transition creates the expected `Task`(s) with correct due dates.
- Integration: `POST .../insurance-claim` → verify `Case.limitationDeadline` and a `CalendarEvent` are created; `PATCH` changing `incidentDate` → verify the same `CalendarEvent` is updated, not duplicated.
- Integration: `advance-stage` end-to-end → correct `CaseActivity` entry + `Task` rows.
- Manual: run the case detail page in the browser, walk a case through all 5 stages, confirm the stepper UI and confirm-dialog copy match what actually gets created.
