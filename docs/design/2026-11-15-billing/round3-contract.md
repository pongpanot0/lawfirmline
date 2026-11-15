# Billing round 3: fee packages, case fee, milestones, mobile

Mockups: `06-fee-table.png` (settings), `07-case-billing.png` (case finance tab). Builds on rounds 1–2.

## Decisions (user, 2026-11-15)
- Firm fee table per **case type** (existing `CaseType`) × **tiers the firm names itself** (default ง่าย / ปานกลาง / ยาก).
- A package is a sum of **components**: FIXED, PERCENT_CLAIM (rate, optional min/max), TIERED_CLAIM (brackets), PERCENT_RECOVERY (rate, optional min — UI warns: outcome-based shares may be void, ฎ.3331/2556), PER_UNIT (amount × a named unit, e.g. นัดสืบพยาน), HOURLY (billed from time entries; contributes 0 to the package price). Only the inputs a package uses are asked (mediation has no claim amount).
- Package carries a fee tax class (default LITIGATION_EXEMPT) and **milestones tied to case stages** (label, stage, percent; percents sum to 100).
- Edit fee table = owner (`manageSubscription`). Case price can be changed by `manageInvoices` holders **with a mandatory reason**, logged (AuditLog + case feed).
- When a case reaches a milestone's stage the system **notifies** (owners + lead lawyer, once) and shows "ออกใบแจ้งหนี้งวดนี้" — it never issues invoices by itself.
- Case closing early: per remaining milestone choose เก็บเต็ม / เก็บบางส่วน (amount) / ยกเว้น (reason).
- `Case.estimatedFee` keeps working: set to the agreed price whenever the case fee is saved.
- No deposits ledger, no advance-cost float, no client-money ledger this round (decisions 23–25). Packages are optional; old cases unaffected.

## Shared (`packages/shared`)
```ts
type FeeComponent =
  | { type: 'FIXED'; label?: string; amount: number }
  | { type: 'PERCENT_CLAIM'; rate: number; min?: number; max?: number }
  | { type: 'TIERED_CLAIM'; brackets: { upTo: number | null; rate: number }[] }   // marginal, last upTo null
  | { type: 'PERCENT_RECOVERY'; rate: number; min?: number }
  | { type: 'PER_UNIT'; amount: number; unitKey: string; unitLabel: string }
  | { type: 'HOURLY' };
interface FeeMilestone { id: string; label: string; stage: CaseStage; percent: number }
interface FeeInputs { claimAmount?: number; recoveryAmount?: number; units?: Record<string, number> }
computeFeePackage(components, inputs) → { total, parts: { label, amount }[], requiredInputs: ('claimAmount'|'recoveryAmount'|`unit:${key}`)[] }
splitMilestones(total, milestones) → amounts (2dp, last absorbs rounding)
validateFeePackage({ components, milestones }) → Thai errors (≥1 component, rates 0–100, money ≤ MONEY_MAX, percents sum 100, stages valid, ≤ 12 milestones)
```

## Schema (additive)
```prisma
model FeePackage { id, firmId, caseTypeId, name, sortOrder Int, components Json, milestones Json,
  feeTaxClass TaxClass @default(LITIGATION_EXEMPT), version Int @default(1), archivedAt?, createdById, timestamps
  @@index([firmId, caseTypeId]) }
model CaseFee { id, firmId, caseId @unique, packageId?, packageSnapshot Json?  // {name, version, components, milestones}
  inputs Json?, standardAmount Float, agreedAmount Float, overrideReason String?, feeTaxClass TaxClass, updatedById, timestamps }
enum MilestoneStatus { PENDING INVOICED PARTIAL WAIVED }
model CaseFeeMilestone { id, firmId, caseId, caseFeeId, label, stage CaseStage, percent Float, amount Float, sortOrder Int,
  status MilestoneStatus @default(PENDING), invoiceId String?, reachedAt DateTime?, notifiedAt DateTime?,
  closeAmount Float?, closeReason String?, @@index([firmId, status]) @@index([caseId]) }
```
FKs: firm Cascade, case Cascade, package SetNull, invoice SetNull.

## API
| Method | Path | Notes |
|---|---|---|
| GET | `fee-packages?caseTypeId=` | manageInvoices |
| POST/PATCH | `fee-packages`, `fee-packages/:id` | owner; validate; version++ |
| POST | `fee-packages/:id/archive` | owner |
| POST | `fee-packages/preview` | `{ components, milestones?, inputs }` → computeFeePackage + split (used by the settings "ทดลองคำนวณ" and the case form) |
| GET | `cases/:id/fee` | case fee + milestones (each with `reached` = stage index ≤ case stage index, by CASE_STAGE_ORDER) |
| PUT | `cases/:id/fee` | `{ packageId?, inputs, agreedAmount?, overrideReason? }`; computes standard; `agreedAmount ≠ standard` requires reason; regenerates PENDING milestones only (INVOICED/PARTIAL/WAIVED keep); writes AuditLog `CASE_FEE_CHANGED` {from,to,reason} + case feed entry; sets Case.estimatedFee |
| POST | `cases/:id/fee/close-out` | `{ items: [{ milestoneId, action: 'FULL'|'PARTIAL'|'WAIVE', amount?, reason? }] }` — FULL/PARTIAL then billable via composer (amount), WAIVE needs reason |
| GET | `billing/milestones-due` | firm-wide reached + PENDING (or PARTIAL not yet invoiced) milestones with case info — for the hub tab "ต้องออกใบแจ้งหนี้" |
| — | create invoice | accept `milestoneLines?: { id, description?, sortOrder? }[]` → one line per milestone (amount = closeAmount ?? amount, taxClass = case fee taxClass), mark INVOICED + invoiceId in the same tx; reject milestones of another case / already invoiced / waived |

Stage hook: after a successful stage change in `cases.service` call `feeMilestones.onStageChanged(caseId)` (outside the stage tx, failures logged not thrown): set `reachedAt` on newly reached PENDING milestones; notify firm owners + lead lawyer once (`notifiedAt`), message "ถึงงวด {label} ของคดี {ref} · ฿{amount} — ออกใบแจ้งหนี้ได้".

## Web
- `/settings/fee-packages` per mockup 06 (case-type list, tier tabs incl. "+ เพิ่มระดับ", component cards with add-menu, warning on PERCENT_RECOVERY, tax class, milestones with stage select + 100% bar, sticky "ทดลองคำนวณ" using preview). Owner edits; others read-only.
- Case billing tab per mockup 07: brass banner for reached milestones ("ออกใบแจ้งหนี้งวดนี้" → composer with that milestone preselected), package card (choose package, inputs, standard vs agreed price, "แก้ราคา (ต้องระบุเหตุผล)", audit line), milestones table with status + action, "ถ้าคดีจบก่อนกำหนด" close-out drawer.
- Composer: new left tab "งวดค่าวิชาชีพ" (reached first, chip ถึงขั้นตอนแล้ว / ยังไม่ถึง), sends `milestoneLines`.
- Hub: tab "ต้องออกใบแจ้งหนี้" (first tab) from `billing/milestones-due`.

## Mobile (apps/mobile, Expo)
Case screen: fee package summary + milestones list; reached milestone → "ออกใบแจ้งหนี้งวดนี้" (creates the invoice with that milestone line, then shows it). Invoice screen: record payment incl. WHT 3%/1% and cheque pending, shows the receipt number; receipts list per invoice. No fee-table editing on mobile; no PDF share (later).
