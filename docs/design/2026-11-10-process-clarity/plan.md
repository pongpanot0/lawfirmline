# Process clarity — implementation plan

Decisions: [decisions.md](decisions.md). Mockups: `mockups/`. No schema change, no migration.

## Contracts

### API A — `GET /cases/progress` (new, Sol)
Same access filter as `GET /cases` (`caseAccess.getCaseFilterForUser`), non-deleted cases. Returns `CaseProgress[]`:

```ts
type CaseBucket = 'TODO' | 'WAITING_CLIENT' | 'WAITING_COURT' | 'CLOSED';
interface CaseProgress {
  caseId: string;
  bucket: CaseBucket;
  stepIndex: number;      // 0-based index of the current stage in the journey steps
  stepTotal: number;      // journey steps length (8, or 9 with APPEAL/SUPREME)
  stepLabel: string;      // CASE_STAGE_LABELS_TH of journeyStage(case.stage)
  done: number;           // current-stage tasks done or skipped (+ pre-lit checks when in PRE_LITIGATION)
  total: number;
  next: {
    kind: 'INFO' | 'PRELIT' | 'TASK' | 'ADVANCE' | 'SET_NEXT';
    text: string;         // Thai, short: "ตรวจสอบผลประโยชน์ขัดกัน", "ยื่นคำให้การ", "ไปขั้นไกล่เกลี่ย", "กำหนดขั้นถัดไป"
    taskId?: string;
    dueDate?: string;     // ISO
    assigneeName?: string;
  } | null;               // null only when bucket = CLOSED
  nextCourtDate: string | null; // nearest COURT_DATE CalendarEvent startAt >= now
}
```

Bucket, first rule that matches:
1. `status` CLOSED or ARCHIVED → `CLOSED`
2. journey has a pending item (INFO gap, pre-lit check other than documents, or open current-stage task) → `TODO`
3. a required `IntakeDocumentRequest` (case or its intake) is REQUESTED or MISSING → `WAITING_CLIENT`
4. `nextCourtDate` exists → `WAITING_COURT`
5. otherwise → `TODO` (next = ADVANCE "ไปขั้น X" when there is a next stage, else SET_NEXT "กำหนดขั้นถัดไป")

`next` priority: INFO gap → pre-lit check → first pending task (dueDate asc, nulls last, then createdAt) → ADVANCE / SET_NEXT.
Batched: one query each for cases, tasks, applied playbooks, conflict checks, document requests, court events, case types — never per-case `journeyState`. Reuse `caseJourney` / `preLitChecklist` (pure).

### API B — case-info gate in the journey (Sol)
`caseJourney` gains an INFO check: the case type's required `fieldSchema` fields (same rules as web `missingRequiredMessage`: `opposingParty` satisfied by an opposing participant, `chargeSection` from the case column, others from `customFields`) plus, when the stage is past PRE_LITIGATION, `courtName` and `blackCaseNumber` (unless marked unknown the same way create allows).
Missing → blocker `ข้อมูลคดียังไม่ครบ: <labels>`, `canAdvance=false`, and `next = { kind: 'INFO', text: 'เติมข้อมูลคดีให้ครบ (<labels>)' }` ahead of everything else. Expose on `GET /cases/:id/journey` as `infoMissing: string[]` (labels). Create no longer blocks on required case-type fields (web stops sending the check; API never enforced it).

### Web (Terra) — shared components in `apps/web/src/components/process/`
- `WhoActsTabs` — primary tabs with count pills (Shopee "my purchases"), URL-synced `?tab=`.
- `FilterChips` — secondary chip row with counts.
- `StepTracker` — one-line N-step tracker (`full` with labels / `mini` segments); done = navy check, current = ring, rest muted.
- `NextActionCard` — "สิ่งที่ต้องทำตอนนี้ (x จาก y)": one big primary action, collapsed "งานอื่นในขั้นนี้", footer line.
All Thai copy per decisions.md "Copy rules".

## Slices (one writer at a time, low RAM)
1. **Sol** — API A + B + jest specs. Files: `apps/api/src/cases/**` (+ shared label helpers if needed). Verify: targeted jest `--runInBand`, `tsc --noEmit` for api.
2. **Terra T1** — components/process, case list (`cases/page.tsx`), create form (`cases/new/page.tsx` + `lib/case-create.ts`), success page `cases/[id]/opened/page.tsx`, `lib/api.ts` types.
3. **Terra T2** — case page focus layout (`cases/[id]/page.tsx`, `components/journey/*`), my tasks (`todos/page.tsx`).
4. **Terra T3** — round 2: `expenses/*`, `admin/reimbursements`, `invoices`, `leaves` — who-acts tabs + mini tracker per row.
5. Claude diff review + gates → Terra E2E click-through → Cursor review → fixes → one PR.
