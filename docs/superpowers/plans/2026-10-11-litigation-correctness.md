# Litigation Correctness (Part L) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deadline engine, case stages, court proceedings, limitation reminders, parties, conflict checks and court-fee/interest calculators legally correct for Thai civil litigation (spec Part L, L1–L7).

**Architecture:** Schema changes land first in one migration (new enums, `CaseProceeding`, rule filters, participant links). The deadline engine stays a deterministic, suggestion-only service (`DeadlineRulesService`) but learns month counting, before-trigger offsets, a 16:30 due time, rule filters and per-firm overrides. New behaviour is small, focused units: `proceeding-mirror.ts`, `party-sync.ts`, `limitation-reminder.ts` (plain functions over a Prisma client, so every caller — cases, intake, insurance, proceedings — reuses them without new DI edges), `CaseProceedingsService`, and a conflict "gate" on `ConflictCheckService`. Web and mobile get the matching forms.

**Tech Stack:** NestJS 10 + Prisma (Postgres) in `apps/api` (jest, `*.spec.ts` beside sources), Next.js 15 in `apps/web` (`node --test` on `src/**/*.test.ts`), Expo in `apps/mobile` (typecheck only), shared enums/pure functions in `packages/shared`.

**Spec:** `docs/superpowers/specs/2026-10-11-litigation-and-task-flow-fixes.md` — Part L only (L1–L7). Part T is a separate plan.

## Global Constraints

- Plan A (`docs/superpowers/plans/2026-10-11-office-manager-role.md`) is already implemented on this branch: `FirmRole.OFFICE_MANAGER`, `hasFirmCapability(role, cap)` (`@lawfirm/shared`), `@RequireCapability(cap)` (`apps/api/src/saas/decorators/saas.decorators.ts`, enforced by `FirmRoleGuard` in `apps/api/src/saas/guards/firm-role.guard.ts`) and migration `20261011120000_office_manager_role`. Firm deadline-rule editing uses capability `manageFirmContent` (OWNER + OFFICE_MANAGER). Line numbers below were taken before Plan A landed; locate code by the named function when a line has shifted by a few rows.
- Prisma migrations: write SQL by hand in `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`; apply locally with `psql "$DATABASE_URL" -f …` then `pnpm --filter api exec prisma migrate resolve --applied <folder>` and `pnpm --filter api exec prisma generate`. **Never run `migrate dev` or `migrate deploy` against the shared local DB.** Timestamps used here: `20261011130000` … `20261011130400`.
- Enum values added with `ALTER TYPE … ADD VALUE` live in the schema migration only; any SQL that *uses* a new enum value goes in a later migration file (Postgres cannot use a new enum value in the transaction that added it).
- After editing `packages/shared`, run `pnpm --filter @lawfirm/shared build` (the api and web import the built `dist`).
- All new UI text in Thai, with English in `apps/web/src/lib/i18n/dashboard.ts` where the page already reads a dictionary (`d.deadlineRules`, `d.calendar`, `d.dateSuggestions`).
- In this worktree call git as `/usr/bin/git`.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Spec decisions are final; do not re-open them (day-basis rules, default rule table, 16:30 due time, conflict-override min 10 chars, etc.).

Commands used throughout (run from the worktree root):

```bash
# api tests (one file)
pnpm --filter api exec jest --config jest.config.js src/<path>.spec.ts
# api typecheck
pnpm --filter api exec tsc --noEmit -p tsconfig.json
# web tests / typecheck
pnpm --filter web test
pnpm --filter web exec tsc --noEmit
# mobile typecheck
pnpm --filter @lawfirm/mobile typecheck
# apply one migration locally (from apps/api)
cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/<folder>/migration.sql && pnpm exec prisma migrate resolve --applied <folder> && pnpm exec prisma generate && cd ../..
```

## Review Focus

1. **A trigger entered late in the Bangkok evening** (UTC date is the previous day) must count months from the Bangkok day, not the UTC day — pinned in Task 2 (`2026-10-11T18:00Z` + 1 month = `2026-11-12`).
2. **A firm switches a global rule off** by saving an inactive override — the global rule must stop firing for that firm only and keep firing for other firms — pinned in Task 3 (`effectiveDeadlineRules` + `deadlineRuleApplies` test).
3. **A lawyer double-submits "บันทึกคำพิพากษา"** — must not create a second TRIAL proceeding or a second set of PENDING appeal suggestions — pinned in Task 10.
4. **Reopening a case that was closed before this release** (no stage log row exists) must restore `PRE_LITIGATION`, not leave it in `CLOSING` — pinned in Task 7.
5. **Conflict check with names shorter than 3 characters or the "tmp" placeholder client** must not throw the search's 400 "ต้องมีคำค้นอย่างน้อยหนึ่งคำ" and must open the case as CLEAR — pinned in Task 13.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` | New enums (`CourtEventKind`, `ServiceMethod`, `JudgmentOutcome`), enum values (`MONTHS`, `FILED`, `APPEAL_SERVED`, `PETITIONER`, `RESPONDENT`), `CaseProceeding`, rule filter columns, `CalendarEvent.courtEventKind`, `CaseStatusLog` stage columns, participant links, `ConflictCheck.caseId`, `Case.limitationEventId` |
| `apps/api/prisma/migrations/20261011130000_litigation_schema/` | DDL only |
| `apps/api/prisma/migrations/20261011130100_deadline_defaults_holidays_2570/` | Default rules (global) + 2570 holidays |
| `apps/api/prisma/migrations/20261011130200_limitation_reminders/` | Backfill `Case.limitationEventId` + reminder events |
| `apps/api/prisma/migrations/20261011130300_case_proceedings_backfill/` | TRIAL/current-level proceeding per numbered case |
| `apps/api/prisma/migrations/20261011130400_parties_single_source/` | `customFields.opposingParty` → participants, our-side client participants, case-type field cleanup |
| `packages/shared/src/agenda.ts` | Deadline enums, `CourtEventKind`, `ServiceMethod`, `DeadlineRuleItem`, `effectiveDeadlineRules`, `deadlineRuleApplies` |
| `packages/shared/src/litigation.ts` (new) | `PartyRole`, `JudgmentOutcome`, label maps, party-role mapping, `courtFee`, `simpleInterest` |
| `packages/shared/src/index.ts` | `CASE_STAGE_ORDER`, stage labels, `caseStageIndex`, export `litigation.ts`, default case types |
| `apps/api/src/common/utils/bangkok-time.ts` | `addBangkokMonths`, `courtCloseAt` |
| `apps/api/src/deadlines/*` | Engine math, rule matching, firm overrides, lead notification, firm CRUD |
| `apps/api/src/calendar/calendar.service.ts`, `dto/calendar.dto.ts`, `event-responsibility.service.ts` | `courtEventKind`, 16:30 reschedule times |
| `apps/api/src/common/services/case-feed.service.ts` | Stage transitions into `CaseStatusLog` |
| `apps/api/src/common/limitation-reminder.ts` (new) | One "ครบอายุความ" event per case |
| `apps/api/src/cases/cases.service.ts`, `dto/case.dto.ts`, `dto/close-case.dto.ts` | Stage moves, closing rules, parties, limitation, conflict gate, proceedings mirror |
| `apps/api/src/cases/proceeding-mirror.ts` (new) | Proceeding ⇄ case mirror helpers |
| `apps/api/src/cases/case-proceedings.service.ts`, `case-proceedings.controller.ts`, `dto/proceeding.dto.ts` (new) | Filing / service / judgment / appeal-served actions |
| `apps/api/src/cases/party-sync.ts` (new) | Our-side client participant + opponent rows |
| `apps/api/src/cases/case-participants.service.ts` | Activity + audit on participant changes, link validation |
| `apps/api/src/conflict-check/conflict-check.service.ts` | Extended search, `opponentConflicts`, `gateNewCase`, `recordForCase`, intake stage move |
| `apps/api/src/intake/intake.service.ts`, `client-portal/client-portal-intake.service.ts` | Conflict gate, parties and limitation on conversion |
| `apps/api/src/insurance-claims/limitation-deadline.service.ts` | Delegates to `syncLimitationReminder` |
| `apps/api/src/templates/templates.service.ts` | `{{trialBlackCaseNumber}}` etc. |
| `apps/api/src/holidays/holiday-coverage.ts` (new) | `incompleteHolidayYears` — fewer than 10 holidays configured for a year |
| `apps/api/src/intelligence/date-suggestions.service.ts` | `holidayDataIncomplete` / `dueYear` on rule suggestions |
| `apps/api/src/client-portal/client-portal-intake.service.ts` | Records (never blocks) a conflict check on client-opened cases |
| `apps/web/src/lib/stage-labels.ts` (+test), `lib/deadline-rules.ts` (+test), `lib/proceedings.ts` (+test), `lib/conflict.ts` (+test), `lib/case-print-forms.ts` (+test), `lib/api.ts`, `lib/i18n/dashboard.ts` | Web helpers and API client |
| `apps/web/src/components/cases/CaseProceedingsCard.tsx`, `LitigationCalculatorsCard.tsx`, `CourtSelect.tsx`, `components/ConflictOverrideDialog.tsx` (new) | New UI |
| `apps/web/src/lib/case-create.ts`, `lib/participants.ts` (+tests, new) | Create-form payload; participant payload rules |
| `apps/web/src/components/court-day/CourtDayPanel.tsx`, `lib/court-day.ts`, `lib/court-day-draft.ts` | Next-hearing court event kind |
| `apps/web/src/app/(dashboard)/intake/portal-submissions/page.tsx`, `settings/page.tsx` | Conflict prompt on portal convert; deadline-rules link capability |
| `apps/web/src/components/cases/CaseCalendarPanel.tsx`, `DateSuggestionsPanel.tsx`, `CaseOverviewForm.tsx`, `CaseParticipantsSection.tsx`, `components/calendar/CalendarEventDialog.tsx` | Edited UI |
| `apps/web/src/app/(dashboard)/cases/new/page.tsx`, `cases/[id]/page.tsx`, `admin/deadline-rules/page.tsx`, `intake/[id]/page.tsx` | Edited pages |
| `apps/mobile/app/case/new.tsx`, `app/case/[id].tsx`, `app/case/[id]/close.tsx`, `app/case/[id]/party.tsx` (new), `app/event/new.tsx`, `src/components/ClientPicker.tsx` (new), `src/api/client.ts`, `src/api/types.ts` | Mobile |

---

### Task 1: Schema, migration and shared enums

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enums `PartyRole` :86, `DeadlineTrigger` :278, `DeadlineDayBasis` :285; models `Firm` :390, `Case` :874-958, `Client` :765-794, `ConflictCheck` :1167-1186, `CaseParticipant` :1233-1255, `CalendarEvent` :1609-1639, `DeadlineRule` :1920-1935, `CaseStatusLog` :2590-2602)
- Create: `apps/api/prisma/migrations/20261011130000_litigation_schema/migration.sql`
- Modify: `packages/shared/src/agenda.ts:104-130`
- Create: `packages/shared/src/litigation.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './litigation';` next to `export * from './agenda';`)
- Test: `apps/api/src/common/litigation-enums.spec.ts`

**Interfaces:**
- Produces (shared): `DeadlineDayBasis.MONTHS`; `DeadlineTrigger.FILED`, `DeadlineTrigger.APPEAL_SERVED`; `enum CourtEventKind { PRELIMINARY, MEDIATION, WITNESS_HEARING, JUDGMENT_READING, OTHER }` + `COURT_EVENT_KIND_LABELS: Record<CourtEventKind, string>`; `enum ServiceMethod { PERSONAL, POSTED }` + `SERVICE_METHOD_LABELS`; `enum PartyRole { PLAINTIFF, DEFENDANT, PETITIONER, RESPONDENT }` + `PARTY_ROLE_LABELS`; `enum JudgmentOutcome { WON, LOST, PARTIAL, DISMISSED, SETTLED }` + `JUDGMENT_OUTCOME_LABELS`; `ourParticipantRole(partyRole: PartyRole | string): ParticipantRole`; `opponentParticipantRole(partyRole: PartyRole | string | null | undefined): ParticipantRole`; `DeadlineRuleItem` gains `firmId: string | null`, `adjustDays`, `courtEventKind`, `courtLevel`, `partySide`, `serviceMethod`, `canEdit?`.
- Produces (DB/Prisma): model `CaseProceeding` (unique `caseId_courtLevel`), `DeadlineRule.{firmId, adjustDays, courtEventKind, courtLevel, partySide, serviceMethod}`, `CalendarEvent.courtEventKind`, `CaseStatusLog.{fromStage, toStage, note}`, `Case.limitationEventId`, `Case.proceedings`, `Case.conflictChecks`, `CaseParticipant.{clientId, representedByParticipantId}`, `ConflictCheck.caseId`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/litigation-enums.spec.ts`:

```ts
import * as Db from '../generated/prisma';
import {
  CourtEventKind,
  DeadlineDayBasis,
  DeadlineTrigger,
  JudgmentOutcome,
  ParticipantRole,
  PartyRole,
  ServiceMethod,
  opponentParticipantRole,
  ourParticipantRole,
} from '@lawfirm/shared';

/** The shared enums are what DTOs validate against; the DB enums are what Prisma writes. They must not drift. */
describe('litigation enums match the database', () => {
  it.each([
    ['CourtEventKind', CourtEventKind],
    ['ServiceMethod', ServiceMethod],
    ['JudgmentOutcome', JudgmentOutcome],
    ['PartyRole', PartyRole],
    ['DeadlineTrigger', DeadlineTrigger],
    ['DeadlineDayBasis', DeadlineDayBasis],
  ])('%s', (name, shared) => {
    const db = (Db as unknown as Record<string, Record<string, string>>)[name];
    expect(Object.values(db).sort()).toEqual(Object.values(shared).sort());
  });
});

describe('party role mapping', () => {
  it('puts our client on our role and the opponent on the opposite one', () => {
    expect(ourParticipantRole(PartyRole.PLAINTIFF)).toBe(ParticipantRole.PLAINTIFF);
    expect(ourParticipantRole(PartyRole.RESPONDENT)).toBe(ParticipantRole.RESPONDENT);
    expect(opponentParticipantRole(PartyRole.PLAINTIFF)).toBe(ParticipantRole.DEFENDANT);
    expect(opponentParticipantRole(PartyRole.DEFENDANT)).toBe(ParticipantRole.PLAINTIFF);
    expect(opponentParticipantRole(PartyRole.PETITIONER)).toBe(ParticipantRole.RESPONDENT);
    expect(opponentParticipantRole(PartyRole.RESPONDENT)).toBe(ParticipantRole.PETITIONER);
    expect(opponentParticipantRole(null)).toBe(ParticipantRole.OTHER);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api exec jest --config jest.config.js src/common/litigation-enums.spec.ts`
Expected: FAIL — TS error `Module '"@lawfirm/shared"' has no exported member 'CourtEventKind'`.

- [ ] **Step 3: Shared enums**

In `packages/shared/src/agenda.ts` replace the `DeadlineTrigger`, `DeadlineDayBasis` enums and `DeadlineRuleItem` interface with:

```ts
/** The event that starts a procedural clock running. */
export enum DeadlineTrigger {
  COURT_DATE = 'COURT_DATE',
  JUDGMENT = 'JUDGMENT',
  ORDER_RECEIVED = 'ORDER_RECEIVED',
  COMPLAINT_SERVED = 'COMPLAINT_SERVED',
  /** ยื่นฟ้อง */
  FILED = 'FILED',
  /** ได้รับสำเนาอุทธรณ์ */
  APPEAL_SERVED = 'APPEAL_SERVED',
}

/** How the offset is counted from the trigger date. */
export enum DeadlineDayBasis {
  /** Every day counts. */
  CALENDAR = 'CALENDAR',
  /** Weekends and public holidays are skipped while counting. */
  BUSINESS = 'BUSINESS',
  /** Same day-of-month N months later; a missing day becomes the month's last day (ป.พ.พ. ม.193/3, ม.193/5). */
  MONTHS = 'MONTHS',
}

/** What kind of court sitting a COURT_DATE event is. */
export enum CourtEventKind {
  PRELIMINARY = 'PRELIMINARY',
  MEDIATION = 'MEDIATION',
  WITNESS_HEARING = 'WITNESS_HEARING',
  JUDGMENT_READING = 'JUDGMENT_READING',
  OTHER = 'OTHER',
}

export const COURT_EVENT_KIND_LABELS: Record<CourtEventKind, string> = {
  [CourtEventKind.PRELIMINARY]: 'นัดพร้อม / ชี้สองสถาน',
  [CourtEventKind.MEDIATION]: 'ไกล่เกลี่ย',
  [CourtEventKind.WITNESS_HEARING]: 'สืบพยาน',
  [CourtEventKind.JUDGMENT_READING]: 'ฟังคำพิพากษา',
  [CourtEventKind.OTHER]: 'อื่น ๆ',
};

/** How the summons and complaint reached the defendant. */
export enum ServiceMethod {
  /** รับเอง */
  PERSONAL = 'PERSONAL',
  /** ปิดหมาย — ม.79: service takes effect 15 days later */
  POSTED = 'POSTED',
}

export const SERVICE_METHOD_LABELS: Record<ServiceMethod, string> = {
  [ServiceMethod.PERSONAL]: 'รับเอง',
  [ServiceMethod.POSTED]: 'ปิดหมาย',
};

export interface DeadlineRuleItem {
  id: string;
  /** null = platform default shared by every firm; set = this firm's own rule or override. */
  firmId: string | null;
  caseTypeId: string | null;
  trigger: DeadlineTrigger;
  label: string;
  /** Days, or months for MONTHS; negative = before the trigger. */
  offsetDays: number;
  dayBasis: DeadlineDayBasis;
  /** Calendar days added after the offset (e.g. −90 for "10 years − 90 days"). */
  adjustDays: number;
  courtEventKind: CourtEventKind | null;
  courtLevel: 'TRIAL' | 'APPEAL' | 'SUPREME' | null;
  partySide: 'PLAINTIFF' | 'DEFENDANT' | 'PETITIONER' | 'RESPONDENT' | null;
  serviceMethod: ServiceMethod | null;
  isActive: boolean;
  /** Set by GET /deadline-rules: may the caller edit this row in place. */
  canEdit?: boolean;
}
```

Create `packages/shared/src/litigation.ts`:

```ts
import type { ParticipantRole } from './index';

/** ฝ่ายที่สำนักงานเป็นทนายให้ (Case.partyRole). */
export enum PartyRole {
  PLAINTIFF = 'PLAINTIFF',
  DEFENDANT = 'DEFENDANT',
  /** ผู้ร้อง */
  PETITIONER = 'PETITIONER',
  /** ผู้คัดค้าน */
  RESPONDENT = 'RESPONDENT',
}

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  [PartyRole.PLAINTIFF]: 'โจทก์',
  [PartyRole.DEFENDANT]: 'จำเลย',
  [PartyRole.PETITIONER]: 'ผู้ร้อง',
  [PartyRole.RESPONDENT]: 'ผู้คัดค้าน',
};

export enum JudgmentOutcome {
  WON = 'WON',
  LOST = 'LOST',
  PARTIAL = 'PARTIAL',
  DISMISSED = 'DISMISSED',
  SETTLED = 'SETTLED',
}

export const JUDGMENT_OUTCOME_LABELS: Record<JudgmentOutcome, string> = {
  [JudgmentOutcome.WON]: 'ชนะคดี',
  [JudgmentOutcome.LOST]: 'แพ้คดี',
  [JudgmentOutcome.PARTIAL]: 'ชนะบางส่วน',
  [JudgmentOutcome.DISMISSED]: 'ยกฟ้อง',
  [JudgmentOutcome.SETTLED]: 'พิพากษาตามยอม',
};

const OPPOSITE: Record<PartyRole, string> = {
  [PartyRole.PLAINTIFF]: 'DEFENDANT',
  [PartyRole.DEFENDANT]: 'PLAINTIFF',
  [PartyRole.PETITIONER]: 'RESPONDENT',
  [PartyRole.RESPONDENT]: 'PETITIONER',
};

/** Our client's participant role: the PartyRole values are also ParticipantRole values. */
export function ourParticipantRole(partyRole: PartyRole | string): ParticipantRole {
  return partyRole as ParticipantRole;
}

/** The role an opponent takes when we are `partyRole`; OTHER when our side is unknown. */
export function opponentParticipantRole(partyRole: PartyRole | string | null | undefined): ParticipantRole {
  return (OPPOSITE[partyRole as PartyRole] ?? 'OTHER') as ParticipantRole;
}
```

(`import type` is erased at compile time, so there is no runtime cycle with `index.ts`.)

In `packages/shared/src/index.ts`, after `export * from './agenda';` add `export * from './litigation';`.

- [ ] **Step 4: Schema**

Edit `apps/api/prisma/schema.prisma`:

```prisma
enum PartyRole {
  PLAINTIFF
  DEFENDANT
  PETITIONER
  RESPONDENT
}

enum DeadlineTrigger {
  COURT_DATE
  JUDGMENT
  ORDER_RECEIVED
  COMPLAINT_SERVED
  FILED
  APPEAL_SERVED
}

enum DeadlineDayBasis {
  CALENDAR
  BUSINESS
  MONTHS
}

enum CourtEventKind {
  PRELIMINARY
  MEDIATION
  WITNESS_HEARING
  JUDGMENT_READING
  OTHER
}

enum ServiceMethod {
  PERSONAL
  POSTED
}

enum JudgmentOutcome {
  WON
  LOST
  PARTIAL
  DISMISSED
  SETTLED
}
```

`model Firm` — add the relation line `deadlineRules DeadlineRule[]` next to its other relations.

`model Case` — add after `limitationDeadline DateTime?`:

```prisma
  /// event "ครบอายุความ" ที่ระบบดูแลให้ (ดู common/limitation-reminder.ts)
  limitationEventId    String?
```

and in its relation list add:

```prisma
  proceedings            CaseProceeding[]
  conflictChecks         ConflictCheck[]
```

`model Client` — add `caseParticipants CaseParticipant[]` to its relation list.

`model ConflictCheck` — add `caseId String?`, relation `case Case? @relation(fields: [caseId], references: [id], onDelete: Cascade)` and `@@index([caseId])`.

`model CaseParticipant` — add fields and relations:

```prisma
  /// ลูกความในทะเบียน (ฝ่ายเรา) ที่คู่ความรายนี้คือคนเดียวกัน
  clientId                   String?
  /// ทนาย/ผู้แทนฝ่ายตรงข้าม → คู่ความที่เขาเป็นตัวแทน
  representedByParticipantId String?

  client         Client?           @relation(fields: [clientId], references: [id], onDelete: SetNull)
  representedBy  CaseParticipant?  @relation("ParticipantRepresentation", fields: [representedByParticipantId], references: [id], onDelete: SetNull)
  represents     CaseParticipant[] @relation("ParticipantRepresentation")

  @@index([clientId])
```

`model CalendarEvent` — after `type EventType @default(OTHER)` add:

```prisma
  /// ใช้เฉพาะ type = COURT_DATE — กฎวันครบกำหนดบางข้อเลือกนัดตามชนิด
  courtEventKind  CourtEventKind?
```

`model DeadlineRule` — replace with:

```prisma
model DeadlineRule {
  id             String           @id @default(uuid())
  /// null = ค่าตั้งต้นส่วนกลาง; มีค่า = กฎของสำนักงาน (ทับกฎกลางที่ trigger + label ตรงกัน)
  firmId         String?
  caseTypeId     String?
  trigger        DeadlineTrigger
  label          String
  /// จำนวนวัน (หรือเดือนเมื่อ dayBasis = MONTHS); ติดลบ = ก่อนเหตุตั้งต้น
  offsetDays     Int
  dayBasis       DeadlineDayBasis @default(CALENDAR)
  /// บวก/ลบวันตามปฏิทินหลังนับ offset แล้ว เช่น 10 ปี − 90 วัน
  adjustDays     Int              @default(0)
  courtEventKind CourtEventKind?
  courtLevel     CourtLevel?
  partySide      PartyRole?
  serviceMethod  ServiceMethod?
  isActive       Boolean          @default(true)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  firm        Firm?                    @relation(fields: [firmId], references: [id], onDelete: Cascade)
  caseType    CaseType?                @relation(fields: [caseTypeId], references: [id], onDelete: Cascade)
  suggestions DocumentDateSuggestion[]

  @@index([trigger, isActive])
  @@index([firmId, trigger])
}
```

`model CaseStatusLog` — add after `toStatus`:

```prisma
  /// มีค่าเมื่อแถวนี้บันทึกการย้ายขั้นตอนคดี (fromStatus = toStatus เมื่อสถานะไม่เปลี่ยน)
  fromStage   CaseStage?
  toStage     CaseStage?
  note        String?
```

New model (place after `CaseParticipant`):

```prisma
/// ศาลแต่ละชั้นของคดี — Case.blackCaseNumber/redCaseNumber/courtName/courtLevel เป็นสำเนาของชั้นปัจจุบัน
model CaseProceeding {
  id              String           @id @default(uuid())
  caseId          String
  courtLevel      CourtLevel
  courtName       String?
  blackCaseNumber String?
  redCaseNumber   String?
  filedAt         DateTime?
  judgmentAt      DateTime?
  judgmentOutcome JudgmentOutcome?
  judgmentAmount  Decimal?         @db.Decimal(15, 2)
  judgmentNote    String?          @db.Text
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  case Case @relation(fields: [caseId], references: [id], onDelete: Cascade)

  @@unique([caseId, courtLevel])
}
```

- [ ] **Step 5: Migration SQL**

Create `apps/api/prisma/migrations/20261011130000_litigation_schema/migration.sql`:

```sql
-- Litigation correctness (spec Part L): schema only. Data that uses the new
-- enum values lives in later migrations (a new enum value cannot be used in
-- the transaction that adds it).

ALTER TYPE "PartyRole" ADD VALUE IF NOT EXISTS 'PETITIONER';
ALTER TYPE "PartyRole" ADD VALUE IF NOT EXISTS 'RESPONDENT';
ALTER TYPE "DeadlineTrigger" ADD VALUE IF NOT EXISTS 'FILED';
ALTER TYPE "DeadlineTrigger" ADD VALUE IF NOT EXISTS 'APPEAL_SERVED';
ALTER TYPE "DeadlineDayBasis" ADD VALUE IF NOT EXISTS 'MONTHS';

CREATE TYPE "CourtEventKind" AS ENUM ('PRELIMINARY', 'MEDIATION', 'WITNESS_HEARING', 'JUDGMENT_READING', 'OTHER');
CREATE TYPE "ServiceMethod" AS ENUM ('PERSONAL', 'POSTED');
CREATE TYPE "JudgmentOutcome" AS ENUM ('WON', 'LOST', 'PARTIAL', 'DISMISSED', 'SETTLED');

ALTER TABLE "DeadlineRule"
    ADD COLUMN "firmId" TEXT,
    ADD COLUMN "adjustDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "courtEventKind" "CourtEventKind",
    ADD COLUMN "courtLevel" "CourtLevel",
    ADD COLUMN "partySide" "PartyRole",
    ADD COLUMN "serviceMethod" "ServiceMethod";
CREATE INDEX "DeadlineRule_firmId_trigger_idx" ON "DeadlineRule"("firmId", "trigger");
ALTER TABLE "DeadlineRule" ADD CONSTRAINT "DeadlineRule_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent" ADD COLUMN "courtEventKind" "CourtEventKind";

ALTER TABLE "CaseStatusLog"
    ADD COLUMN "fromStage" "CaseStage",
    ADD COLUMN "toStage" "CaseStage",
    ADD COLUMN "note" TEXT;

ALTER TABLE "Case" ADD COLUMN "limitationEventId" TEXT;

CREATE TABLE "CaseProceeding" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "courtLevel" "CourtLevel" NOT NULL,
    "courtName" TEXT,
    "blackCaseNumber" TEXT,
    "redCaseNumber" TEXT,
    "filedAt" TIMESTAMP(3),
    "judgmentAt" TIMESTAMP(3),
    "judgmentOutcome" "JudgmentOutcome",
    "judgmentAmount" DECIMAL(15,2),
    "judgmentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CaseProceeding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CaseProceeding_caseId_courtLevel_key" ON "CaseProceeding"("caseId", "courtLevel");
ALTER TABLE "CaseProceeding" ADD CONSTRAINT "CaseProceeding_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CaseParticipant"
    ADD COLUMN "clientId" TEXT,
    ADD COLUMN "representedByParticipantId" TEXT;
CREATE INDEX "CaseParticipant_clientId_idx" ON "CaseParticipant"("clientId");
ALTER TABLE "CaseParticipant" ADD CONSTRAINT "CaseParticipant_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CaseParticipant" ADD CONSTRAINT "CaseParticipant_representedByParticipantId_fkey"
    FOREIGN KEY ("representedByParticipantId") REFERENCES "CaseParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConflictCheck" ADD COLUMN "caseId" TEXT;
CREATE INDEX "ConflictCheck_caseId_idx" ON "ConflictCheck"("caseId");
ALTER TABLE "ConflictCheck" ADD CONSTRAINT "ConflictCheck_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 6: Apply, generate, build shared, verify the DB matches the schema**

```bash
pnpm --filter api exec prisma validate
cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261011130000_litigation_schema/migration.sql && pnpm exec prisma migrate resolve --applied 20261011130000_litigation_schema && pnpm exec prisma generate
pnpm exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code; echo "diff exit: $?"
cd ../.. && pnpm --filter @lawfirm/shared build
```

Expected: `validate` OK; `diff exit: 0` (empty diff — the hand-written SQL matches the datamodel). If the exit code is 2, print the diff (drop `--exit-code`, add `--script`), fix the SQL file to match, and re-apply only the missing statements.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter api exec jest --config jest.config.js src/common/litigation-enums.spec.ts`
Expected: PASS (7 tests).

Run: `pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: errors only where code passes `'PLAINTIFF' | 'DEFENDANT'` into the now wider `PartyRole` — there should be none (widening is compatible). The web dictionaries keyed by `DeadlineTrigger`/`DeadlineDayBasis` gain their new keys in Task 4; `apps/web` typecheck is not run until then.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261011130000_litigation_schema packages/shared/src/agenda.ts packages/shared/src/litigation.ts packages/shared/src/index.ts apps/api/src/common/litigation-enums.spec.ts
/usr/bin/git commit -m "feat(litigation): schema for proceedings, rule filters, court event kind, party links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Deadline math — months, before-trigger offsets, 16:30 due time

**Files:**
- Modify: `apps/api/src/common/utils/bangkok-time.ts` (append two functions)
- Modify: `apps/api/src/deadlines/deadline-rules.service.ts:20-23, 185-201, 245-289`
- Modify: `apps/api/src/deadlines/dto/deadline-rule.dto.ts`
- Modify: `apps/api/src/calendar/event-responsibility.service.ts:75`
- Test: `apps/api/src/common/utils/bangkok-time.spec.ts`, `apps/api/src/deadlines/deadline-rules.service.spec.ts`

**Interfaces:**
- Consumes: `DeadlineDayBasis.MONTHS` (Task 1).
- Produces: `addBangkokMonths(date: Date, months: number): Date` (Bangkok 00:00 instant); `courtCloseAt(dayKey: string): Date` (16:30 Asia/Bangkok on `YYYY-MM-DD`); `DeadlineRulesService.computeDueDate(triggerDate: Date, offset: number, dayBasis: DeadlineDayBasis, holidays: Set<string>, adjustDays = 0): string`; exported `ruleSpanDays(rule: { offsetDays: number; dayBasis: string; adjustDays?: number }): number`; `loadHolidays(from, spanDays, client)` now loads `[from − span, from + span]`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/common/utils/bangkok-time.spec.ts` (and add `addBangkokMonths, courtCloseAt` to its import list):

```ts
describe('addBangkokMonths', () => {
  const at = (day: string) => new Date(`${day}T03:00:00Z`);

  it('keeps the day of month', () => {
    expect(bangkokDayKey(addBangkokMonths(at('2026-10-11'), 1))).toBe('2026-11-11');
    expect(bangkokDayKey(addBangkokMonths(at('2027-02-15'), 1))).toBe('2027-03-15');
  });

  it('falls back to the last day of a shorter month (ม.193/5)', () => {
    expect(bangkokDayKey(addBangkokMonths(at('2027-01-31'), 1))).toBe('2027-02-28');
    expect(bangkokDayKey(addBangkokMonths(at('2028-01-31'), 1))).toBe('2028-02-29');
    expect(bangkokDayKey(addBangkokMonths(at('2027-03-31'), -1))).toBe('2027-02-28');
  });

  it('returns 00:00 Bangkok of the target day', () => {
    expect(addBangkokMonths(at('2026-10-11'), 1).toISOString()).toBe('2026-11-10T17:00:00.000Z');
  });
});

describe('courtCloseAt', () => {
  it('is 16:30 Bangkok on the given day', () => {
    expect(courtCloseAt('2026-11-11').toISOString()).toBe('2026-11-11T09:30:00.000Z');
  });
});
```

In `apps/api/src/deadlines/deadline-rules.service.spec.ts`, inside `describe('computeDueDate', …)` add:

```ts
    it('counts MONTHS to the same day of month (11 Oct → 11 Nov)', () => {
      expect(
        service.computeDueDate(new Date('2026-10-11T03:00:00Z'), 1, DeadlineDayBasis.MONTHS, new Set()),
      ).toBe('2026-11-11');
    });

    it('counts MONTHS from the Bangkok day of a late-evening trigger', () => {
      // 18:00Z on 11 Oct is already Mon 12 Oct in Bangkok.
      expect(
        service.computeDueDate(new Date('2026-10-11T18:00:00Z'), 1, DeadlineDayBasis.MONTHS, new Set()),
      ).toBe('2026-11-12');
    });

    it('clamps MONTHS to month end, then rolls a weekend forward', () => {
      // 31 Jan 2027 + 1 month = Sun 28 Feb → Mon 1 Mar.
      expect(
        service.computeDueDate(new Date('2027-01-31T03:00:00Z'), 1, DeadlineDayBasis.MONTHS, new Set()),
      ).toBe('2027-03-01');
    });

    it('rolls a before-trigger deadline BACK off a holiday', () => {
      // Hearing Tue 20 Apr 2027 − 7 = Tue 13 Apr (Songkran) → Mon 12 Apr.
      expect(
        service.computeDueDate(
          new Date('2027-04-20T03:00:00Z'),
          -7,
          DeadlineDayBasis.CALENDAR,
          new Set(['2027-04-13', '2027-04-14', '2027-04-15']),
        ),
      ).toBe('2027-04-12');
    });

    it('rolls a before-trigger deadline BACK off a weekend', () => {
      // Fri 11 Sep 2026 − 6 = Sat 5 Sep → Fri 4 Sep.
      expect(
        service.computeDueDate(new Date('2026-09-11T03:00:00Z'), -6, DeadlineDayBasis.CALENDAR, new Set()),
      ).toBe('2026-09-04');
    });

    it('applies adjustDays after the months and rolls back (10 years − 90 days)', () => {
      expect(
        service.computeDueDate(new Date('2026-10-12T03:00:00Z'), 120, DeadlineDayBasis.MONTHS, new Set(), -90),
      ).toBe('2036-07-14');
      // 11 Oct 2036 − 90 = Sun 13 Jul → Fri 11 Jul.
      expect(
        service.computeDueDate(new Date('2026-10-11T03:00:00Z'), 120, DeadlineDayBasis.MONTHS, new Set(), -90),
      ).toBe('2036-07-11');
    });
```

In the existing `applyTrigger` test `raises a suggestion per matching rule instead of writing the calendar`, change the last expectation to:

```ts
      // 2026-10-04 is a Sunday, so the deadline rolls to Mon 5 Oct, due at 16:30 Bangkok.
      expect(data[0].suggestedDate.toISOString()).toBe('2026-10-05T09:30:00.000Z');
```

Add a DTO test at the end of the same spec file:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDeadlineRuleDto } from './dto/deadline-rule.dto';

describe('CreateDeadlineRuleDto', () => {
  it('accepts a negative offset (N days before the trigger)', async () => {
    const dto = plainToInstance(CreateDeadlineRuleDto, {
      trigger: 'COURT_DATE', label: 'ยื่นบัญชีระบุพยาน', offsetDays: -7, dayBasis: 'CALENDAR',
    });
    expect(await validate(dto)).toEqual([]);
  });
});
```

(Put the two new imports at the top of the file with the other imports.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/common/utils/bangkok-time.spec.ts src/deadlines/deadline-rules.service.spec.ts`
Expected: FAIL — `addBangkokMonths is not a function`, MONTHS cases return the trigger day, negative offsets return the trigger day (clamped to 0), DTO reports `offsetDays must not be less than 0`, suggestedDate is `…T00:00:00.000Z`.

- [ ] **Step 3: Implement**

Append to `apps/api/src/common/utils/bangkok-time.ts`:

```ts
/**
 * The Bangkok day `months` later (negative = earlier) with the same day of
 * month; a day the target month lacks becomes its last day (ป.พ.พ. ม.193/5).
 * Returns 00:00 Bangkok of that day.
 */
export function addBangkokMonths(date: Date, months: number): Date {
  const [year, month, day] = bangkokDayKey(date).split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay)) - BANGKOK_OFFSET_MS,
  );
}

/** Rule deadlines fall due when the court counter closes: 16:30 Bangkok on `dayKey` (`YYYY-MM-DD`). */
export function courtCloseAt(dayKey: string): Date {
  return new Date(`${dayKey}T16:30:00+07:00`);
}
```

In `apps/api/src/deadlines/deadline-rules.service.ts`:

1. Import `addBangkokMonths, courtCloseAt` from `../common/utils/bangkok-time` alongside the existing helpers.
2. Below `HOLIDAY_PADDING_DAYS`, add:

```ts
/** How far from the trigger a rule can reach, in days — sizes the holiday window. */
export function ruleSpanDays(rule: { offsetDays: number; dayBasis: string; adjustDays?: number }): number {
  const reach = rule.dayBasis === DeadlineDayBasis.MONTHS ? Math.abs(rule.offsetDays) * 31 : Math.abs(rule.offsetDays);
  return reach + Math.abs(rule.adjustDays ?? 0);
}
```

3. In `applyTrigger`, replace the `loadHolidays(...)` call and the `suggestedDate` expression with:

```ts
    const holidays = await this.loadHolidays(
      context.triggerDate,
      Math.max(...openRules.map(ruleSpanDays)),
      client,
    );

    const data = openRules.map((rule) => ({
      caseId: context.caseId,
      label: rule.label,
      suggestedDate: courtCloseAt(
        this.computeDueDate(
          context.triggerDate,
          rule.offsetDays,
          rule.dayBasis as DeadlineDayBasis,
          holidays,
          rule.adjustDays ?? 0,
        ),
      ),
```

(keep the remaining fields of the object unchanged).

4. Replace `computeDueDate` and `loadHolidays` with:

```ts
  /**
   * @param offset days (CALENDAR/BUSINESS) or months (MONTHS); negative = before the trigger.
   * @param adjustDays calendar days added after the offset (e.g. −90).
   * @returns the due date as a `YYYY-MM-DD` Bangkok day, always a working day.
   *   A period after the trigger that ends on a weekend/holiday runs to the next
   *   working day (ม.193/8); a deadline *before* the trigger moves back to the
   *   previous working day so it is never missed.
   */
  computeDueDate(
    triggerDate: Date,
    offset: number,
    dayBasis: DeadlineDayBasis,
    holidays: Set<string>,
    adjustDays = 0,
  ): string {
    const amount = Math.max(-MAX_OFFSET_DAYS, Math.min(offset, MAX_OFFSET_DAYS));
    const backward = amount < 0 || adjustDays < 0;
    let cursor = bangkokDayStart(triggerDate);

    if (dayBasis === DeadlineDayBasis.BUSINESS) {
      const step = amount < 0 ? -1 : 1;
      let remaining = Math.abs(amount);
      while (remaining > 0) {
        cursor = addBangkokDays(cursor, step);
        if (this.isWorkingDay(cursor, holidays)) remaining--;
      }
    } else if (dayBasis === DeadlineDayBasis.MONTHS) {
      cursor = addBangkokMonths(cursor, amount);
    } else {
      cursor = addBangkokDays(cursor, amount);
    }
    cursor = addBangkokDays(cursor, adjustDays);

    const roll = backward ? -1 : 1;
    while (!this.isWorkingDay(cursor, holidays)) {
      cursor = addBangkokDays(cursor, roll);
    }
    return bangkokDayKey(cursor);
  }

  private isWorkingDay(date: Date, holidays: Set<string>): boolean {
    return !isBangkokWeekend(date) && !holidays.has(bangkokDayKey(date));
  }

  /** Loads holidays on both sides of `from` — rules may count backwards. */
  async loadHolidays(from: Date, spanDays: number, client: PrismaClientLike = this.prisma): Promise<Set<string>> {
    const start = bangkokDayStart(from);
    // Business-day counting can run well past the nominal offset, so load a
    // generous window rather than risk missing a holiday mid-count.
    const span = Math.min(spanDays, MAX_OFFSET_DAYS) * 2 + HOLIDAY_PADDING_DAYS;
    const rows = await client.publicHoliday.findMany({
      where: { date: { gte: addBangkokDays(start, -span), lte: addBangkokDays(start, span) } },
      select: { date: true },
    });
    return new Set(rows.map((row) => bangkokDayKey(row.date)));
  }
```

5. `apps/api/src/deadlines/dto/deadline-rule.dto.ts`: in both DTOs change `@Min(0)` on `offsetDays` to `@Min(-3650)`.

6. `apps/api/src/calendar/event-responsibility.service.ts:75` — import `courtCloseAt` from `../common/utils/bangkok-time` and replace the `newAt` expression with:

```ts
newAt: s.deadlineRule ? courtCloseAt(this.deadlines.computeDueDate(next, s.deadlineRule.offsetDays, s.deadlineRule.dayBasis as DeadlineDayBasis, holidays, s.deadlineRule.adjustDays)).toISOString() : null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/common/utils/bangkok-time.spec.ts src/deadlines src/calendar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add apps/api/src/common/utils/bangkok-time.ts apps/api/src/common/utils/bangkok-time.spec.ts apps/api/src/deadlines apps/api/src/calendar/event-responsibility.service.ts
/usr/bin/git commit -m "feat(deadlines): month counting, before-trigger offsets, 16:30 due time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rule filters, firm overrides and lead-lawyer notification in the engine

**Files:**
- Modify: `packages/shared/src/agenda.ts` (append after `DeadlineRuleItem`)
- Modify: `apps/api/src/deadlines/deadline-rules.service.ts` (`DeadlineTriggerContext`, constructor, `applyTrigger`)
- Modify: `apps/api/src/deadlines/deadlines.module.ts`
- Test: `apps/api/src/deadlines/deadline-rule-matching.spec.ts` (new), `apps/api/src/deadlines/deadline-rules.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 `DeadlineRuleItem` fields, `CourtEventKind`, `ServiceMethod`; Task 2 `ruleSpanDays`, `courtCloseAt`, new `computeDueDate` signature.
- Produces (shared): `interface DeadlineRuleContext { courtEventKind?: CourtEventKind | null; courtLevel?: 'TRIAL' | 'APPEAL' | 'SUPREME' | null; partyRole?: string | null; serviceMethod?: ServiceMethod | null }`; `effectiveDeadlineRules<T extends DeadlineRuleKey>(rules: T[], firmId: string): T[]`; `deadlineRuleApplies(rule: DeadlineRuleFilter, ctx: DeadlineRuleContext): boolean`; `deadlineRuleKey(rule: { trigger: string; label: string }): string`.
- Produces (api): `DeadlineTriggerContext` gains optional `courtEventKind?: CourtEventKind | null`, `courtLevel?: CourtLevel | null` (the level that ruled, for JUDGMENT), `serviceMethod?: ServiceMethod | null`. `applyTrigger` reads `Case.partyRole/courtLevel/leadLawyerId/ownRef` itself, so callers only pass event facts. `DeadlineRulesService` now injects `AssignmentNotifierService`.

Filter semantics (decided here, the spec leaves the "unknown" case open):
- `courtEventKind` set on a rule → fires only for a COURT_DATE event of exactly that kind (an event with no kind does not match).
- `courtLevel` set → compared with the context level, falling back to `Case.courtLevel`, then `TRIAL`.
- `partySide` set → skipped only when `Case.partyRole` is known and different (unknown side still gets the suggestion — it is only a suggestion, and a missed default judgment is worse than a dismissed card).
- `serviceMethod` set → compared with the context method; no method means `PERSONAL` (รับเอง), so the +15 rule is the default.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/deadlines/deadline-rule-matching.spec.ts`:

```ts
import {
  CourtEventKind,
  DeadlineDayBasis,
  DeadlineRuleItem,
  DeadlineTrigger,
  ServiceMethod,
  deadlineRuleApplies,
  effectiveDeadlineRules,
} from '@lawfirm/shared';

const rule = (over: Partial<DeadlineRuleItem>): DeadlineRuleItem => ({
  id: 'r',
  firmId: null,
  caseTypeId: null,
  trigger: DeadlineTrigger.COURT_DATE,
  label: 'สรุปผลนัดและรายงานลูกความ',
  offsetDays: 3,
  dayBasis: DeadlineDayBasis.BUSINESS,
  adjustDays: 0,
  courtEventKind: null,
  courtLevel: null,
  partySide: null,
  serviceMethod: null,
  isActive: true,
  ...over,
});

describe('effectiveDeadlineRules', () => {
  const global = rule({ id: 'g' });
  const other = rule({ id: 'g2', label: 'ยื่นบัญชีระบุพยาน', offsetDays: -7 });

  it('lets a firm rule with the same trigger + label replace the global one for that firm only', () => {
    const override = rule({ id: 'f1', firmId: 'firm-1', offsetDays: 5 });
    const all = [global, other, override];
    expect(effectiveDeadlineRules(all, 'firm-1').map((r) => r.id).sort()).toEqual(['f1', 'g2']);
    expect(effectiveDeadlineRules(all, 'firm-2').map((r) => r.id).sort()).toEqual(['g', 'g2']);
  });

  it('a firm switches a global rule off with an inactive override; other firms keep it', () => {
    const off = rule({ id: 'f1', firmId: 'firm-1', isActive: false });
    const forFirm1 = effectiveDeadlineRules([global, off], 'firm-1').filter((r) => deadlineRuleApplies(r, {}));
    const forFirm2 = effectiveDeadlineRules([global, off], 'firm-2').filter((r) => deadlineRuleApplies(r, {}));
    expect(forFirm1).toEqual([]);
    expect(forFirm2.map((r) => r.id)).toEqual(['g']);
  });

  it('ignores another firm’s rules and whitespace differences in the label', () => {
    const foreign = rule({ id: 'x', firmId: 'firm-2', label: ' สรุปผลนัดและรายงานลูกความ ' });
    expect(effectiveDeadlineRules([global, foreign], 'firm-1').map((r) => r.id)).toEqual(['g']);
    expect(effectiveDeadlineRules([global, foreign], 'firm-2').map((r) => r.id)).toEqual(['x']);
  });
});

describe('deadlineRuleApplies', () => {
  it('a kind-filtered rule fires only for that kind of sitting', () => {
    const witnessList = rule({ courtEventKind: CourtEventKind.WITNESS_HEARING });
    expect(deadlineRuleApplies(witnessList, { courtEventKind: CourtEventKind.WITNESS_HEARING })).toBe(true);
    expect(deadlineRuleApplies(witnessList, { courtEventKind: CourtEventKind.PRELIMINARY })).toBe(false);
    expect(deadlineRuleApplies(witnessList, {})).toBe(false);
    expect(deadlineRuleApplies(rule({}), { courtEventKind: CourtEventKind.PRELIMINARY })).toBe(true);
  });

  it('court level defaults to TRIAL', () => {
    const appeal = rule({ trigger: DeadlineTrigger.JUDGMENT, courtLevel: 'TRIAL' });
    const dika = rule({ trigger: DeadlineTrigger.JUDGMENT, courtLevel: 'APPEAL' });
    expect(deadlineRuleApplies(appeal, {})).toBe(true);
    expect(deadlineRuleApplies(dika, {})).toBe(false);
    expect(deadlineRuleApplies(dika, { courtLevel: 'APPEAL' })).toBe(true);
    expect(deadlineRuleApplies(appeal, { courtLevel: 'APPEAL' })).toBe(false);
  });

  it('a plaintiff-only rule is skipped for a defendant case but kept when the side is unknown', () => {
    const defaultJudgment = rule({ partySide: 'PLAINTIFF' });
    expect(deadlineRuleApplies(defaultJudgment, { partyRole: 'PLAINTIFF' })).toBe(true);
    expect(deadlineRuleApplies(defaultJudgment, { partyRole: 'DEFENDANT' })).toBe(false);
    expect(deadlineRuleApplies(defaultJudgment, { partyRole: null })).toBe(true);
  });

  it('service method: no method means รับเอง', () => {
    const personal = rule({ serviceMethod: ServiceMethod.PERSONAL });
    const posted = rule({ serviceMethod: ServiceMethod.POSTED });
    expect(deadlineRuleApplies(personal, {})).toBe(true);
    expect(deadlineRuleApplies(posted, {})).toBe(false);
    expect(deadlineRuleApplies(posted, { serviceMethod: ServiceMethod.POSTED })).toBe(true);
    expect(deadlineRuleApplies(personal, { serviceMethod: ServiceMethod.POSTED })).toBe(false);
  });

  it('an inactive rule never applies', () => {
    expect(deadlineRuleApplies(rule({ isActive: false }), {})).toBe(false);
  });
});
```

In `apps/api/src/deadlines/deadline-rules.service.spec.ts`:

1. Add imports: `import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';` and add `CourtEventKind, ServiceMethod` to the `@lawfirm/shared` import.
2. Add to `mockPrisma`: `case: { findUnique: jest.fn() },`. Add `const mockNotifier = { notifyAssigned: jest.fn() };`.
3. In `beforeEach` add `mockPrisma.case.findUnique.mockResolvedValue({ partyRole: null, courtLevel: null, leadLawyerId: 'lead-1', ownRef: 'C-001' });` and register `{ provide: AssignmentNotifierService, useValue: mockNotifier }` in `providers`.
4. Give the shared `rule` fixture the new columns: `firmId: null, adjustDays: 0, courtEventKind: null, courtLevel: null, partySide: null, serviceMethod: null,` (replace the existing `firmId: 'firm-1'`).
5. Replace the test `matches global platform rules for the trigger` with:

```ts
    it('loads global rules plus the firm’s own rules for the trigger', async () => {
      await service.applyTrigger(context);

      expect(mockPrisma.deadlineRule.findMany).toHaveBeenCalledWith({
        where: {
          trigger: DeadlineTrigger.JUDGMENT,
          caseTypeId: null,
          OR: [{ firmId: null }, { firmId: 'firm-1' }],
        },
      });
    });

    it('uses the firm override instead of the global rule', async () => {
      mockPrisma.deadlineRule.findMany.mockResolvedValue([
        rule,
        { ...rule, id: 'rule-firm', firmId: 'firm-1', offsetDays: 45 },
      ]);
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 1 });

      await service.applyTrigger(context);

      const { data } = mockPrisma.documentDateSuggestion.createMany.mock.calls[0][0];
      expect(data.map((d: { deadlineRuleId: string }) => d.deadlineRuleId)).toEqual(['rule-firm']);
    });

    it('fires the ม.88 witness-list rule only for a witness hearing', async () => {
      const witnessList = {
        ...rule, id: 'rule-88', trigger: DeadlineTrigger.COURT_DATE, label: 'ยื่นบัญชีระบุพยาน',
        offsetDays: -7, courtEventKind: CourtEventKind.WITNESS_HEARING,
      };
      mockPrisma.deadlineRule.findMany.mockResolvedValue([witnessList]);

      const none = await service.applyTrigger({
        ...context, trigger: DeadlineTrigger.COURT_DATE, courtEventKind: CourtEventKind.PRELIMINARY,
      });
      expect(none).toBe(0);
      expect(mockPrisma.documentDateSuggestion.createMany).not.toHaveBeenCalled();

      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 1 });
      await service.applyTrigger({
        ...context, trigger: DeadlineTrigger.COURT_DATE, courtEventKind: CourtEventKind.WITNESS_HEARING,
      });
      expect(mockPrisma.documentDateSuggestion.createMany).toHaveBeenCalledTimes(1);
    });

    it('skips a plaintiff-only rule on a defendant case', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        partyRole: 'DEFENDANT', courtLevel: null, leadLawyerId: 'lead-1', ownRef: 'C-001',
      });
      mockPrisma.deadlineRule.findMany.mockResolvedValue([{ ...rule, partySide: 'PLAINTIFF' }]);

      expect(await service.applyTrigger(context)).toBe(0);
    });

    it('uses the posted-service rule only when the summons was posted', async () => {
      const personal = { ...rule, id: 'r15', trigger: DeadlineTrigger.COMPLAINT_SERVED, offsetDays: 15, serviceMethod: ServiceMethod.PERSONAL };
      const posted = { ...rule, id: 'r30', trigger: DeadlineTrigger.COMPLAINT_SERVED, label: 'ครบกำหนดยื่นคำให้การ (ปิดหมาย)', offsetDays: 30, serviceMethod: ServiceMethod.POSTED };
      mockPrisma.deadlineRule.findMany.mockResolvedValue([personal, posted]);
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 1 });

      await service.applyTrigger({ ...context, trigger: DeadlineTrigger.COMPLAINT_SERVED, serviceMethod: ServiceMethod.POSTED });

      const { data } = mockPrisma.documentDateSuggestion.createMany.mock.calls[0][0];
      expect(data.map((d: { deadlineRuleId: string }) => d.deadlineRuleId)).toEqual(['r30']);
    });

    it('tells the lead lawyer how many suggestions wait for confirmation', async () => {
      mockPrisma.deadlineRule.findMany.mockResolvedValue([rule]);
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 1 });

      await service.applyTrigger(context);

      expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith(
        expect.objectContaining({
          firmId: 'firm-1',
          userIds: ['lead-1'],
          actorUserId: '',
          category: 'CALENDAR',
          entityPath: '/cases/case-1?tab=calendar',
          summaryText: expect.stringContaining('วันครบกำหนดรอยืนยัน 1 รายการ — คดี C-001'),
        }),
      );
    });

    it('does not notify when nothing new was created', async () => {
      mockPrisma.deadlineRule.findMany.mockResolvedValue([rule]);
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 0 });

      await service.applyTrigger(context);

      expect(mockNotifier.notifyAssigned).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/deadlines`
Expected: FAIL — `deadlineRuleApplies is not a function` / `effectiveDeadlineRules is not a function`, `Nest can't resolve dependencies` is NOT expected (the mock is registered), the `findMany` where-clause test fails on the missing `OR`.

- [ ] **Step 3: Shared helpers**

Append to `packages/shared/src/agenda.ts` (after `DeadlineRuleItem`):

```ts
/** What the engine knows about the case and the event when a trigger fires. */
export interface DeadlineRuleContext {
  courtEventKind?: CourtEventKind | null;
  /** The court level that ruled (JUDGMENT) or the case's level; unknown = TRIAL. */
  courtLevel?: 'TRIAL' | 'APPEAL' | 'SUPREME' | null;
  /** Case.partyRole — the side we act for; unknown = every side's rules apply. */
  partyRole?: string | null;
  /** How the summons was served; unknown = PERSONAL (รับเอง). */
  serviceMethod?: ServiceMethod | null;
}

/**
 * Structural (string-typed) so both DeadlineRuleItem and raw Prisma rows fit —
 * Prisma's enum columns are string-literal unions, which TS will not assign to these TS enums.
 */
export interface DeadlineRuleKey {
  firmId: string | null;
  trigger: string;
  label: string;
}
export interface DeadlineRuleFilter {
  isActive: boolean;
  courtEventKind: string | null;
  courtLevel: string | null;
  partySide: string | null;
  serviceMethod: string | null;
}

/** A firm rule overrides the global rule with the same trigger + label. */
export function deadlineRuleKey(rule: { trigger: string; label: string }): string {
  return `${rule.trigger}|${rule.label.trim()}`;
}

/**
 * The rules one firm runs: its own rules, plus every global rule it has not
 * overridden. Inactive rows are kept — an inactive override is how a firm
 * switches a global rule off — so filter with {@link deadlineRuleApplies}.
 */
export function effectiveDeadlineRules<T extends DeadlineRuleKey>(rules: T[], firmId: string): T[] {
  const own = rules.filter((rule) => rule.firmId === firmId);
  const overridden = new Set(own.map(deadlineRuleKey));
  return [
    ...rules.filter((rule) => rule.firmId === null && !overridden.has(deadlineRuleKey(rule))),
    ...own,
  ];
}

export function deadlineRuleApplies(rule: DeadlineRuleFilter, ctx: DeadlineRuleContext): boolean {
  if (!rule.isActive) return false;
  if (rule.courtEventKind && rule.courtEventKind !== ctx.courtEventKind) return false;
  if (rule.courtLevel && rule.courtLevel !== (ctx.courtLevel ?? 'TRIAL')) return false;
  if (rule.partySide && ctx.partyRole && rule.partySide !== ctx.partyRole) return false;
  if (rule.serviceMethod && rule.serviceMethod !== (ctx.serviceMethod ?? ServiceMethod.PERSONAL)) {
    return false;
  }
  return true;
}
```

Run `pnpm --filter @lawfirm/shared build`.

- [ ] **Step 4: Engine**

`apps/api/src/deadlines/deadlines.module.ts`:

```ts
import { forwardRef, Module } from '@nestjs/common';
import { DeadlineRulesService } from './deadline-rules.service';
import { CaseDeadlinesController, DeadlineRulesController } from './deadlines.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [DeadlineRulesController, CaseDeadlinesController],
  providers: [DeadlineRulesService],
  exports: [DeadlineRulesService],
})
export class DeadlinesModule {}
```

In `apps/api/src/deadlines/deadline-rules.service.ts`:

1. Imports — add to the `@lawfirm/shared` import: `CourtEventKind, CourtLevel, ServiceMethod, deadlineRuleApplies, effectiveDeadlineRules`; add `formatBangkokDateThai` to the bangkok-time import; add:

```ts
import { forwardRef, Inject } from '@nestjs/common';
import { NotificationCategory } from '../generated/prisma';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
```

(merge `forwardRef, Inject` into the existing `@nestjs/common` import line).

2. Extend the context:

```ts
export interface DeadlineTriggerContext {
  caseId: string;
  firmId: string;
  caseTypeId: string | null;
  trigger: DeadlineTrigger;
  triggerDate: Date;
  triggerEventId: string | null;
  createdById: string;
  /** COURT_DATE: what kind of sitting the event is. */
  courtEventKind?: CourtEventKind | null;
  /** JUDGMENT: the level of the court that ruled; defaults to Case.courtLevel. */
  courtLevel?: CourtLevel | null;
  /** COMPLAINT_SERVED: รับเอง or ปิดหมาย. */
  serviceMethod?: ServiceMethod | null;
}
```

3. Constructor:

```ts
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => AssignmentNotifierService))
    private notifier: AssignmentNotifierService,
  ) {}
```

4. Replace the whole `applyTrigger` method (Task 2's version) with:

```ts
  async applyTrigger(context: DeadlineTriggerContext, client: PrismaClientLike = this.prisma): Promise<number> {
    const legalCase = await client.case.findUnique({
      where: { id: context.caseId },
      select: { partyRole: true, courtLevel: true, leadLawyerId: true, ownRef: true },
    });
    const candidates = await client.deadlineRule.findMany({
      where: {
        trigger: context.trigger,
        // Case-type-specific rules are not offered in this pass.
        caseTypeId: null,
        OR: [{ firmId: null }, { firmId: context.firmId }],
      },
    });
    const rules = effectiveDeadlineRules(candidates, context.firmId).filter((rule) =>
      deadlineRuleApplies(rule, {
        courtEventKind: context.courtEventKind ?? null,
        courtLevel: context.courtLevel ?? legalCase?.courtLevel ?? null,
        partyRole: legalCase?.partyRole ?? null,
        serviceMethod: context.serviceMethod ?? null,
      }),
    );
    if (rules.length === 0) return 0;

    const openRules = await this.rulesWithoutPendingSuggestion(context.caseId, rules, context.triggerEventId, client);
    if (openRules.length === 0) return 0;

    const holidays = await this.loadHolidays(
      context.triggerDate,
      Math.max(...openRules.map(ruleSpanDays)),
      client,
    );

    const data = openRules.map((rule) => ({
      caseId: context.caseId,
      label: rule.label,
      suggestedDate: courtCloseAt(
        this.computeDueDate(
          context.triggerDate,
          rule.offsetDays,
          rule.dayBasis as DeadlineDayBasis,
          holidays,
          rule.adjustDays ?? 0,
        ),
      ),
      eventType: EventType.DEADLINE,
      sourceExcerpt: null,
      source: DateSuggestionSource.RULE,
      status: DateSuggestionStatus.PENDING,
      deadlineRuleId: rule.id,
      triggerEventId: context.triggerEventId,
      createdById: context.createdById,
    }));

    const result = await client.documentDateSuggestion.createMany({
      data: data as never,
      skipDuplicates: true,
    });

    if (result.count > 0 && legalCase) {
      // System notice (actor ''): the lead hears about it even when they entered the trigger.
      // ponytail: inside a caller's transaction the inbox row is written outside it — a rolled-back
      // trigger can leave one stale notice; move to an outbox if that ever matters.
      await this.notifier.notifyAssigned({
        firmId: context.firmId,
        userIds: [legalCase.leadLawyerId],
        actorUserId: '',
        category: NotificationCategory.CALENDAR,
        summaryText: [
          `วันครบกำหนดรอยืนยัน ${result.count} รายการ — คดี ${legalCase.ownRef}`,
          ...data.map((row) => `${row.label}: ${formatBangkokDateThai(row.suggestedDate)}`),
        ].join('\n'),
        entityPath: `/cases/${context.caseId}?tab=calendar`,
      });
    }
    return result.count;
  }
```

(`notifyAssigned` logs and swallows its own failures, so no try/catch is needed here.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/deadlines src/calendar src/practice-setup src/workflows src/saas/password-recovery.spec.ts src/app.module.spec.ts`
Expected: PASS. (`calendar.service.spec`/`court-day.service.spec` mock `DeadlineRulesService` wholesale, so the new constructor dependency does not reach them; `app.module.spec` proves the `DeadlinesModule → NotificationsModule` forwardRef resolves.)

Run: `pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add packages/shared/src/agenda.ts apps/api/src/deadlines
/usr/bin/git commit -m "feat(deadlines): firm overrides, rule filters by court kind/level/side/service, notify lead lawyer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Court event kind on calendar events (API, web, mobile, court day)

**Files:**
- Modify: `apps/api/src/calendar/dto/calendar.dto.ts`, `apps/api/src/calendar/calendar.service.ts` (`createInternal` both paths, `update`, `updateInternal`)
- Modify: `apps/api/src/calendar/dto/court-day.dto.ts` (`CourtDayStateDto`), `apps/api/src/calendar/court-day.service.ts` (next-hearing create ~:277-305)
- Modify: `apps/web/src/lib/api.ts` (`CalendarEventItem`), `apps/web/src/components/calendar/CalendarEventDialog.tsx`, `apps/web/src/lib/court-day.ts`, `apps/web/src/lib/court-day-draft.ts`, `apps/web/src/components/court-day/CourtDayPanel.tsx`, `apps/web/src/lib/i18n/dashboard.ts` (`calendar` TH + EN)
- Modify: `apps/mobile/app/event/new.tsx`, `apps/mobile/src/api/types.ts` (`CalendarEventItem`)
- Test: `apps/api/src/calendar/calendar.service.spec.ts`, `apps/web/src/lib/court-day-draft.test.ts`

**Interfaces:**
- Consumes: Task 1 `CourtEventKind`, `COURT_EVENT_KIND_LABELS`, `CalendarEvent.courtEventKind`; Task 3 `DeadlineTriggerContext.courtEventKind`.
- Produces: `CreateEventDto.courtEventKind?: CourtEventKind | null`, `UpdateEventDto.courtEventKind?: CourtEventKind | null`; `CourtDayStateDto.nextKind?: CourtEventKind`; web/mobile `CalendarEventItem.courtEventKind?: CourtEventKind | null`; web `CourtDayState.nextKind?: CourtEventKind`. A non-court event always stores `courtEventKind = null`. Setting a kind on an existing court date re-runs the COURT_DATE trigger (deduped per event + rule), so the ม.88 witness-list rule appears when the kind is filled in later.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('CalendarService case authorization', …)` in `apps/api/src/calendar/calendar.service.spec.ts` (add `CourtEventKind` to the `@lawfirm/shared` import):

```ts
  it('stores the court event kind and hands it to the deadline engine', async () => {
    mockCaseAccess.canAccessCase.mockResolvedValue(true);
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1', firmId: 'firm-1', caseTypeId: null, ownRef: 'C-1', title: 'Case',
      courtName: 'ศาลแพ่ง', leadLawyerId: 'lead-1', leadLawyer: { firstName: 'A', lastName: 'B' },
    });
    mockTravel.getOfficeAddress.mockResolvedValue('office');
    mockTravel.calculateTravel.mockResolvedValue({});
    mockPrisma.travelLog.findFirst.mockResolvedValue(null);
    const startAt = new Date('2027-04-20T02:00:00.000Z');
    mockPrisma.calendarEvent.create.mockResolvedValue({
      id: 'event-9', startAt, assigneeId: null, updatedAt: new Date(), courtEventKind: CourtEventKind.WITNESS_HEARING,
    });

    await service.create(user, {
      caseId: 'case-1', title: 'สืบพยานโจทก์', startAt: startAt.toISOString(),
      type: EventType.COURT_DATE, courtEventKind: CourtEventKind.WITNESS_HEARING,
    });

    expect(mockPrisma.calendarEvent.create.mock.calls[0][0].data.courtEventKind).toBe(CourtEventKind.WITNESS_HEARING);
    expect(mockDeadlineRules.applyTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ triggerEventId: 'event-9', courtEventKind: CourtEventKind.WITNESS_HEARING }),
    );
  });

  it('drops a court event kind sent with a non-court event', async () => {
    mockCaseAccess.canAccessCase.mockResolvedValue(true);
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1', firmId: 'firm-1', caseTypeId: null, ownRef: 'C-1', title: 'Case',
      courtName: null, leadLawyer: { firstName: 'A', lastName: 'B' },
    });
    mockPrisma.calendarEvent.create.mockResolvedValue({ id: 'event-10', startAt: new Date() });

    await service.create(user, {
      caseId: 'case-1', title: 'พบลูกความ', startAt: '2026-11-02T02:00:00.000Z',
      type: EventType.CLIENT_MEETING, courtEventKind: CourtEventKind.MEDIATION,
    });

    expect(mockPrisma.calendarEvent.create.mock.calls[0][0].data.courtEventKind).toBeNull();
  });

  it('re-runs the court-date rules when a kind is set on an existing court date', async () => {
    mockCaseAccess.canAccessCase.mockResolvedValue(true);
    const startAt = new Date('2027-04-20T02:00:00.000Z');
    mockPrisma.calendarEvent.findUnique.mockResolvedValue({
      id: 'event-1', caseId: 'case-1', type: 'COURT_DATE', startAt, case: { id: 'case-1', firmId: 'firm-1' },
    });
    mockPrisma.calendarEvent.update.mockResolvedValue({
      id: 'event-1', caseId: 'case-1', type: 'COURT_DATE', startAt, courtEventKind: CourtEventKind.WITNESS_HEARING,
    });

    await service.update(user, 'event-1', { courtEventKind: CourtEventKind.WITNESS_HEARING });

    expect(mockDeadlineRules.applyTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'case-1', firmId: 'firm-1', triggerEventId: 'event-1', triggerDate: startAt,
        courtEventKind: CourtEventKind.WITNESS_HEARING, createdById: 'user-1',
      }),
    );
  });
```

Append to `apps/web/src/lib/court-day-draft.test.ts`:

```ts
test('court drafts keep a valid next-hearing kind and reject an unknown one', () => {
  const now = 100000000;
  const encode = (patch = {}) =>
    JSON.stringify({ version: 2, savedAt: now, state: { ...state, ...patch } });
  assert.equal(parseCourtDayDraft(encode({ nextKind: 'WITNESS_HEARING' }), now)?.state.nextKind, 'WITNESS_HEARING');
  assert.equal(parseCourtDayDraft(encode({ nextKind: 'PICNIC' }), now), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/calendar/calendar.service.spec.ts`
Expected: FAIL — `courtEventKind` is `undefined` in the create data, `applyTrigger` not called from `update`.

Run: `pnpm --filter web test`
Expected: FAIL — the `PICNIC` draft is accepted.

- [ ] **Step 3: API**

`apps/api/src/calendar/dto/calendar.dto.ts` — import `CourtEventKind` from `@lawfirm/shared` and add to **both** `CreateEventDto` and `UpdateEventDto`:

```ts
  /** COURT_DATE only: นัดพร้อม / ไกล่เกลี่ย / สืบพยาน / ฟังคำพิพากษา — some deadline rules depend on it. */
  @IsOptional()
  @IsEnum(CourtEventKind)
  courtEventKind?: CourtEventKind | null;
```

`apps/api/src/calendar/calendar.service.ts`:

1. Import `CourtEventKind` from `@lawfirm/shared` and add above the class:

```ts
/**
 * The kind only means something on a court date; anything else stores null.
 * Takes plain strings because Prisma rows carry string-literal enums.
 */
function kindFor(type: string | undefined, kind: string | null | undefined): CourtEventKind | null {
  return type === EventType.COURT_DATE ? ((kind ?? null) as CourtEventKind | null) : null;
}
```

2. `createInternal`, transaction path: in the `tx.calendarEvent.create` data add `courtEventKind: kindFor(dto.type, dto.courtEventKind),` after `...eventData,`; in its `applyTrigger` call add `courtEventKind: event.courtEventKind as CourtEventKind | null,`.
3. `createInternal`, non-transaction path: in `this.prisma.calendarEvent.create` data add `courtEventKind: kindFor(dto.type, dto.courtEventKind),` after `type: dto.type,`; in its `applyTrigger` call add `courtEventKind: event.courtEventKind as CourtEventKind | null,`.
4. `updateInternal`: after `const { assigneeId: …, ...eventData } = dto;` add

```ts
    const nextType = dto.type ?? existing.type;
    if (dto.type !== undefined || dto.courtEventKind !== undefined) {
      eventData.courtEventKind = kindFor(nextType, dto.courtEventKind ?? existing.courtEventKind);
    }
```

5. Replace `update` with:

```ts
  async update(user: AuthUser, id: string, dto: UpdateEventDto) {
    const existing = await this.findOne(user, id);
    const updated = await this.updateInternal(id, dto);
    if (dto.courtEventKind && updated.type === EventType.COURT_DATE) {
      // A kind filled in later can unlock a kind-specific rule (ม.88 witness list).
      // applyTrigger dedupes per (event, rule), so rules already raised are not repeated.
      try {
        await this.deadlineRules.applyTrigger({
          caseId: updated.caseId,
          firmId: existing.case.firmId,
          caseTypeId: null,
          trigger: DeadlineTrigger.COURT_DATE,
          triggerDate: updated.startAt,
          triggerEventId: updated.id,
          createdById: user.id,
          courtEventKind: updated.courtEventKind as CourtEventKind | null,
        });
      } catch (err) {
        this.logger.error(`Deadline rules failed for event ${id}: ${(err as Error).message}`);
      }
    }
    return updated;
  }
```

(`findOne` already returns the event with `case.firmId`; if its select lacks `firmId`, add it to `eventInclude.case.select` — it is already there.)

`apps/api/src/calendar/dto/court-day.dto.ts` — import `IsEnum` and `CourtEventKind`; in `CourtDayStateDto` after `nextAt`:

```ts
  @IsOptional() @IsEnum(CourtEventKind) nextKind?: CourtEventKind;
```

`apps/api/src/calendar/court-day.service.ts` — in the next-hearing `db.calendarEvent.create` data add `courtEventKind: state.nextKind ?? null,` and in the following `applyTrigger` context add `courtEventKind: state.nextKind ?? null,`.

- [ ] **Step 4: Web**

`apps/web/src/lib/api.ts` — in `CalendarEventItem` add `courtEventKind?: import('@lawfirm/shared').CourtEventKind | null;`.

`apps/web/src/lib/i18n/dashboard.ts` — in the TH `calendar` block add `courtEventKind: 'ชนิดนัดศาล', courtEventKindNone: 'ไม่ระบุ',`; in the EN `calendar` block add `courtEventKind: 'Court sitting', courtEventKindNone: 'Not specified',`. Task 1 widened `DeadlineTrigger`/`DeadlineDayBasis`, so the dictionaries indexed by them must grow too (otherwise `d.deadlineRules.triggers[s.deadlineRule.trigger]` fails `tsc`): in TH `deadlineRules.triggers` add `FILED: 'วันยื่นฟ้อง', APPEAL_SERVED: 'วันได้รับสำเนาอุทธรณ์',` and in TH `deadlineRules.bases` add `MONTHS: 'เดือน (วันที่เดียวกัน)',`; in EN add `FILED: 'Complaint filed', APPEAL_SERVED: 'Appeal copy received',` and `MONTHS: 'Months (same day)',`.

`apps/web/src/components/calendar/CalendarEventDialog.tsx`:

1. `import { COURT_EVENT_KIND_LABELS, CourtEventKind } from '@lawfirm/shared';`
2. In the form initialiser (bottom of file) add `courtEventKind: (event.courtEventKind ?? '') as CourtEventKind | '',` to the edit branch and `courtEventKind: '' as CourtEventKind | '',` to the new-event branch.
3. In `handleSubmit`'s `payload` add `courtEventKind: form.type === 'COURT_DATE' ? form.courtEventKind || null : null,`.
4. Inside the `{form.type === 'COURT_DATE' && (…)}` block, after the court-name label, wrap both in a fragment and add:

```tsx
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{d.calendar.courtEventKind}</span>
              <select
                value={form.courtEventKind}
                onChange={(e) => setForm({ ...form, courtEventKind: e.target.value as CourtEventKind | '' })}
                className={SELECT_CLASS}
              >
                <option value="">{d.calendar.courtEventKindNone}</option>
                {Object.values(CourtEventKind).map((kind) => (
                  <option key={kind} value={kind}>{COURT_EVENT_KIND_LABELS[kind]}</option>
                ))}
              </select>
            </label>
```

5. In the view-mode detail list, after the event-type row add
   `...(event.type === 'COURT_DATE' && event.courtEventKind ? [{ label: d.calendar.courtEventKind, value: COURT_EVENT_KIND_LABELS[event.courtEventKind] }] : []),`.

`apps/web/src/lib/court-day.ts` — import `type { CourtEventKind } from '@lawfirm/shared'` and add `nextKind?: CourtEventKind;` after `nextAt` in `CourtDayState`; add `nextKind: 'ชนิดนัดครั้งหน้า',` next to `nextAt` in the TH labels object (and `nextKind: 'Next sitting',` in the EN one if the file has one).

`apps/web/src/lib/court-day-draft.ts` — import `{ CourtEventKind } from '@lawfirm/shared'` and add before the `draftRecipientKind` check:

```ts
    if (s.nextKind !== undefined && !(Object.values(CourtEventKind) as string[]).includes(s.nextKind))
      return null;
```

`apps/web/src/components/court-day/CourtDayPanel.tsx` — import `COURT_EVENT_KIND_LABELS, CourtEventKind` from `@lawfirm/shared`; after the `nextTitle` `<label>` add:

```tsx
                  <label className="block text-sm">
                    {t.nextKind}
                    <select
                      className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={state.nextKind ?? ''}
                      onChange={(e) => edit({ nextKind: (e.target.value || undefined) as CourtEventKind | undefined })}
                    >
                      <option value="">—</option>
                      {Object.values(CourtEventKind).map((kind) => (
                        <option key={kind} value={kind}>{COURT_EVENT_KIND_LABELS[kind]}</option>
                      ))}
                    </select>
                  </label>
```

- [ ] **Step 5: Mobile**

`apps/mobile/src/api/types.ts` — in `CalendarEventItem` add `courtEventKind?: import('@lawfirm/shared').CourtEventKind | null;`.

`apps/mobile/app/event/new.tsx`:

1. `import { COURT_EVENT_KIND_LABELS, CourtEventKind } from '@lawfirm/shared';`
2. State: `const [courtEventKind, setCourtEventKind] = useState<CourtEventKind | ''>('');`; in the edit-seeding effect add `setCourtEventKind(event.courtEventKind ?? '');`.
3. In `body` add `courtEventKind: type === 'COURT_DATE' ? courtEventKind || null : null,`.
4. Inside the `type === 'COURT_DATE'` fragment, after the court `Dropdown`/`ErrorNote`:

```tsx
              <SectionLabel>ชนิดนัด</SectionLabel>
              <Dropdown label="ชนิดนัดศาล" value={courtEventKind} onChange={value => setCourtEventKind(value as CourtEventKind | '')} disabled={busy}
                options={[{ value: '', label: 'ไม่ระบุ' }, ...Object.values(CourtEventKind).map(kind => ({ value: kind, label: COURT_EVENT_KIND_LABELS[kind] }))]} />
```

- [ ] **Step 6: Run tests and typechecks**

Run: `pnpm --filter api exec jest --config jest.config.js src/calendar`
Expected: PASS.

Run: `pnpm --filter web test && pnpm --filter web exec tsc --noEmit && pnpm --filter @lawfirm/mobile typecheck && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS / no errors.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/api/src/calendar apps/web/src/lib/api.ts apps/web/src/components/calendar/CalendarEventDialog.tsx apps/web/src/lib/court-day.ts apps/web/src/lib/court-day-draft.ts apps/web/src/lib/court-day-draft.test.ts apps/web/src/components/court-day/CourtDayPanel.tsx apps/web/src/lib/i18n/dashboard.ts apps/mobile/app/event/new.tsx apps/mobile/src/api/types.ts
/usr/bin/git commit -m "feat(calendar): court event kind on court dates (web, mobile, court day)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Default rule table, 2570 holidays and the "holiday data incomplete" warning

**Files:**
- Modify: `packages/shared/src/agenda.ts` (append `DEFAULT_DEADLINE_RULES`)
- Modify: `apps/api/src/deadlines/deadline-rules.service.ts` (drop the local `DEFAULT_RULES`, use the shared list)
- Modify: `apps/api/prisma/seed.ts:151-161`
- Create: `apps/api/prisma/migrations/20261011130100_deadline_defaults_holidays_2570/migration.sql`
- Create: `apps/api/src/holidays/holiday-coverage.ts`
- Modify: `apps/api/src/intelligence/date-suggestions.service.ts` (`listForCase`)
- Modify: `apps/web/src/lib/api.ts` (`DateSuggestionItem`), `apps/web/src/components/cases/DateSuggestionsPanel.tsx`, `apps/web/src/lib/i18n/dashboard.ts` (`dateSuggestions` TH + EN)
- Test: `apps/api/src/holidays/holiday-coverage.spec.ts` (new), `apps/api/src/intelligence/date-suggestions.service.spec.ts`, `apps/api/src/deadlines/deadline-rules.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 columns/enums; Task 3 filter semantics.
- Produces: `DEFAULT_DEADLINE_RULES: ReadonlyArray<DefaultDeadlineRule>` (shared) where `DefaultDeadlineRule = Omit<DeadlineRuleItem, 'id' | 'firmId' | 'caseTypeId' | 'isActive' | 'canEdit'>`; `MIN_HOLIDAYS_PER_YEAR = 10`; `incompleteHolidayYears(client: HolidayClient, years: number[]): Promise<Set<number>>` (Gregorian years, Bangkok calendar); `GET /cases/:caseId/date-suggestions` rows gain `holidayDataIncomplete: boolean` and `dueYear: number` (Gregorian). Later tasks (proceeding actions) rely on the defaults' exact labels below.

Default rules (global, `firmId = null`) — the spec table, as data:

| trigger | label | offset | basis | adjust | filter |
|---|---|---|---|---|---|
| FILED | ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง | 7 | CALENDAR | 0 | — |
| COMPLAINT_SERVED | ครบกำหนดยื่นคำให้การ | 15 | CALENDAR | 0 | serviceMethod PERSONAL |
| COMPLAINT_SERVED | ครบกำหนดยื่นคำให้การ (ปิดหมาย) | 30 | CALENDAR | 0 | serviceMethod POSTED |
| COMPLAINT_SERVED | ตรวจขาดนัดยื่นคำให้การ / ขอให้พิพากษาโดยขาดนัด | 30 | CALENDAR | 0 | partySide PLAINTIFF |
| COURT_DATE | ยื่นบัญชีระบุพยาน | −7 | CALENDAR | 0 | courtEventKind WITNESS_HEARING |
| COURT_DATE | สรุปผลนัดและรายงานลูกความ | 3 | BUSINESS | 0 | — |
| JUDGMENT | ครบกำหนดยื่นอุทธรณ์ | 1 | MONTHS | 0 | courtLevel TRIAL |
| JUDGMENT | ครบกำหนดยื่นคำร้องขออนุญาตฎีกาและฎีกา | 1 | MONTHS | 0 | courtLevel APPEAL |
| APPEAL_SERVED | ครบกำหนดยื่นคำแก้อุทธรณ์ | 15 | CALENDAR | 0 | — |
| ORDER_RECEIVED | โต้แย้งคำสั่งศาล | 15 | CALENDAR | 0 | — |
| JUDGMENT | ใกล้ครบระยะบังคับคดี 10 ปี | 120 | MONTHS | −90 | — (any level) |

The two old global rows (`ยื่นคำให้การ` +15, `ยื่นอุทธรณ์` +30 days) are **updated in place** to rows 2 and 7, so PENDING suggestions that point at them keep their rule.

2570 holidays — sources (cite in the migration comment, already written below):
- Fixed-date government holidays: the recurring annual list approved by the Cabinet (the same set this repo seeded for 2569 in `20260907190000_seed_thai_public_holidays_2569`), with the standing Cabinet rule that a holiday falling on Saturday/Sunday is compensated on the next working day (→ Mon 25 Oct 2027 for วันปิยมหาราช, Mon 6 Dec 2027 for 5 ธ.ค.).
- Lunar holidays (มาฆบูชา, วิสาขบูชา, อาสาฬหบูชา, เข้าพรรษา) and วันพืชมงคล: **not seeded**. As of 2026-10-12 no Cabinet resolution or Royal Gazette notice fixing the 2570 government holiday calendar was found (searched soc.go.th / ratchakitcha.soc.go.th / thaigov.go.th). The Bank of Thailand has issued ประกาศ ธปท. ที่ สนส. 37/2569 (27 ส.ค. 2569) on 2570 financial-institution holidays (https://www.bot.or.th/th/financial-institutions-holiday.html), but that is not the court/government calendar, and the dates circulating for the lunar days come only from calendar/news sites. Per spec, they are left for admin entry at `/admin/holidays`.
- Weekdays were checked with `date -j -f %Y-%m-%d <day> +%a` (2027-10-23 Sat, 2027-12-05 Sun; every other seeded day is Mon–Fri).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/holidays/holiday-coverage.spec.ts`:

```ts
import { MIN_HOLIDAYS_PER_YEAR, incompleteHolidayYears } from './holiday-coverage';

describe('incompleteHolidayYears', () => {
  const days = (year: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(year, 0, i + 1)) }));

  it('flags years with fewer than 10 holidays and ignores years not asked about', async () => {
    const findMany = jest.fn().mockResolvedValue([...days(2026, 21), ...days(2027, 9)]);
    const result = await incompleteHolidayYears({ publicHoliday: { findMany } } as never, [2026, 2027, 2027]);
    expect([...result]).toEqual([2027]);
    expect(findMany).toHaveBeenCalledWith({
      where: { date: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2027-12-31T00:00:00.000Z') } },
      select: { date: true },
    });
  });

  it('treats a year with no rows as incomplete and skips the query for no years', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    expect([...(await incompleteHolidayYears({ publicHoliday: { findMany } } as never, [2028]))]).toEqual([2028]);
    expect([...(await incompleteHolidayYears({ publicHoliday: { findMany } } as never, []))]).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(MIN_HOLIDAYS_PER_YEAR).toBe(10);
  });
});
```

In `apps/api/src/intelligence/date-suggestions.service.spec.ts`:
- add `publicHoliday: { findMany: jest.fn() },` to `mockPrisma`;
- inside `describe('listForCase', …)` add:

```ts
    it('marks rule suggestions whose year has too few holidays configured', async () => {
      mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([
        { id: 'a', source: 'RULE', suggestedDate: new Date('2027-11-11T09:30:00.000Z') },
        { id: 'b', source: 'RULE', suggestedDate: new Date('2026-11-11T09:30:00.000Z') },
        { id: 'c', source: 'DOCUMENT', suggestedDate: new Date('2028-01-05T02:00:00.000Z') },
      ]);
      mockPrisma.publicHoliday.findMany.mockResolvedValue(
        Array.from({ length: 21 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1)) })),
      );

      const rows = await service.listForCase('case-1');

      expect(rows.map((r) => [r.id, r.holidayDataIncomplete, r.dueYear])).toEqual([
        ['a', true, 2027],
        ['b', false, 2026],
        ['c', false, 2028],
      ]);
    });
```

In `apps/api/src/deadlines/deadline-rules.service.spec.ts`, replace the body of `seeds starter rules when the catalog is empty` with:

```ts
      await service.provisionDefaults();

      const { data } = mockPrisma.deadlineRule.createMany.mock.calls[0][0];
      expect(data).toHaveLength(11);
      expect(data.every((r: { firmId?: string }) => r.firmId === undefined)).toBe(true);
      expect(data).toContainEqual(
        expect.objectContaining({
          trigger: DeadlineTrigger.JUDGMENT, label: 'ครบกำหนดยื่นอุทธรณ์',
          offsetDays: 1, dayBasis: DeadlineDayBasis.MONTHS, courtLevel: 'TRIAL',
        }),
      );
      expect(data).toContainEqual(
        expect.objectContaining({ label: 'ใกล้ครบระยะบังคับคดี 10 ปี', offsetDays: 120, adjustDays: -90 }),
      );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/holidays/holiday-coverage.spec.ts src/intelligence/date-suggestions.service.spec.ts src/deadlines/deadline-rules.service.spec.ts`
Expected: FAIL — `Cannot find module './holiday-coverage'`, `holidayDataIncomplete` undefined, `data` has length 4.

- [ ] **Step 3: Shared default list**

Append to `packages/shared/src/agenda.ts`:

```ts
export type DefaultDeadlineRule = Omit<DeadlineRuleItem, 'id' | 'firmId' | 'caseTypeId' | 'isActive' | 'canEdit'>;

const rule = (
  trigger: DeadlineTrigger,
  label: string,
  offsetDays: number,
  dayBasis: DeadlineDayBasis,
  filters: Partial<Pick<DefaultDeadlineRule, 'adjustDays' | 'courtEventKind' | 'courtLevel' | 'partySide' | 'serviceMethod'>> = {},
): DefaultDeadlineRule => ({
  trigger, label, offsetDays, dayBasis,
  adjustDays: 0, courtEventKind: null, courtLevel: null, partySide: null, serviceMethod: null,
  ...filters,
});

/** Platform defaults (spec L1). Every firm runs them unless it overrides one in /admin/deadline-rules. */
export const DEFAULT_DEADLINE_RULES: ReadonlyArray<DefaultDeadlineRule> = [
  rule(DeadlineTrigger.FILED, 'ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง', 7, DeadlineDayBasis.CALENDAR), // ม.173
  rule(DeadlineTrigger.COMPLAINT_SERVED, 'ครบกำหนดยื่นคำให้การ', 15, DeadlineDayBasis.CALENDAR, { serviceMethod: ServiceMethod.PERSONAL }), // ม.177
  rule(DeadlineTrigger.COMPLAINT_SERVED, 'ครบกำหนดยื่นคำให้การ (ปิดหมาย)', 30, DeadlineDayBasis.CALENDAR, { serviceMethod: ServiceMethod.POSTED }), // ม.79 + ม.177
  rule(DeadlineTrigger.COMPLAINT_SERVED, 'ตรวจขาดนัดยื่นคำให้การ / ขอให้พิพากษาโดยขาดนัด', 30, DeadlineDayBasis.CALENDAR, { partySide: 'PLAINTIFF' }), // ม.197–198
  rule(DeadlineTrigger.COURT_DATE, 'ยื่นบัญชีระบุพยาน', -7, DeadlineDayBasis.CALENDAR, { courtEventKind: CourtEventKind.WITNESS_HEARING }), // ม.88
  rule(DeadlineTrigger.COURT_DATE, 'สรุปผลนัดและรายงานลูกความ', 3, DeadlineDayBasis.BUSINESS),
  rule(DeadlineTrigger.JUDGMENT, 'ครบกำหนดยื่นอุทธรณ์', 1, DeadlineDayBasis.MONTHS, { courtLevel: 'TRIAL' }), // ม.229
  rule(DeadlineTrigger.JUDGMENT, 'ครบกำหนดยื่นคำร้องขออนุญาตฎีกาและฎีกา', 1, DeadlineDayBasis.MONTHS, { courtLevel: 'APPEAL' }), // ม.247
  rule(DeadlineTrigger.APPEAL_SERVED, 'ครบกำหนดยื่นคำแก้อุทธรณ์', 15, DeadlineDayBasis.CALENDAR), // ม.237
  rule(DeadlineTrigger.ORDER_RECEIVED, 'โต้แย้งคำสั่งศาล', 15, DeadlineDayBasis.CALENDAR),
  rule(DeadlineTrigger.JUDGMENT, 'ใกล้ครบระยะบังคับคดี 10 ปี', 120, DeadlineDayBasis.MONTHS, { adjustDays: -90 }), // ม.274
];
```

Run `pnpm --filter @lawfirm/shared build`.

`apps/api/src/deadlines/deadline-rules.service.ts` — delete the `DEFAULT_RULES` constant, import `DEFAULT_DEADLINE_RULES` from `@lawfirm/shared`, and in `provisionDefaults` use `data: DEFAULT_DEADLINE_RULES.map((rule) => ({ ...rule })),`.

`apps/api/prisma/seed.ts` — add `DEFAULT_DEADLINE_RULES` to the `@lawfirm/shared` import and replace the four inline rows with `data: DEFAULT_DEADLINE_RULES.map((rule) => ({ ...rule })),`.

- [ ] **Step 4: Holiday coverage helper and the suggestions list**

Create `apps/api/src/holidays/holiday-coverage.ts`:

```ts
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';

/** A Thai government year has ~19–24 holidays; fewer than this means the year was not entered. */
export const MIN_HOLIDAYS_PER_YEAR = 10;

type HolidayClient = Pick<PrismaService | Prisma.TransactionClient, 'publicHoliday'>;

/**
 * Of `years` (Gregorian), the ones whose holiday list looks unfilled — a
 * deadline computed into such a year may land on a day the court is closed.
 * PublicHoliday.date is a DATE column, so its UTC year is the Bangkok year.
 */
export async function incompleteHolidayYears(client: HolidayClient, years: number[]): Promise<Set<number>> {
  const wanted = [...new Set(years)].sort();
  if (wanted.length === 0) return new Set();
  const rows = await client.publicHoliday.findMany({
    where: {
      date: {
        gte: new Date(Date.UTC(wanted[0], 0, 1)),
        lte: new Date(Date.UTC(wanted[wanted.length - 1], 11, 31)),
      },
    },
    select: { date: true },
  });
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.date.getUTCFullYear(), (counts.get(row.date.getUTCFullYear()) ?? 0) + 1);
  return new Set(wanted.filter((year) => (counts.get(year) ?? 0) < MIN_HOLIDAYS_PER_YEAR));
}
```

`apps/api/src/intelligence/date-suggestions.service.ts` — import `incompleteHolidayYears` from `../holidays/holiday-coverage` and `bangkokDayKey` from `../common/utils/bangkok-time`; replace `listForCase` with:

```ts
  async listForCase(caseId: string, status: DateSuggestionStatus = DateSuggestionStatus.PENDING) {
    const rows = await this.prisma.documentDateSuggestion.findMany({
      where: { caseId, status },
      // A rule-derived suggestion has no source excerpt to show; the rule it
      // came from is what tells the lawyer where the date is from.
      include: { deadlineRule: { select: { label: true, trigger: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const yearOf = (date: Date) => Number(bangkokDayKey(date).slice(0, 4));
    // Only computed dates depend on the holiday table; a date read from a document does not.
    const incomplete = await incompleteHolidayYears(
      this.prisma,
      rows.filter((row) => row.source === 'RULE').map((row) => yearOf(row.suggestedDate)),
    );
    return rows.map((row) => ({
      ...row,
      dueYear: yearOf(row.suggestedDate),
      holidayDataIncomplete: row.source === 'RULE' && incomplete.has(yearOf(row.suggestedDate)),
    }));
  }
```

- [ ] **Step 5: Web warning**

`apps/web/src/lib/api.ts` — in `DateSuggestionItem` add:

```ts
  /** RULE only: the due year has fewer than 10 holidays configured — check the date by hand. */
  holidayDataIncomplete?: boolean;
  /** Gregorian year of the due date (Bangkok). */
  dueYear?: number;
```

`apps/web/src/lib/i18n/dashboard.ts` — TH `dateSuggestions`: `holidayIncomplete: 'ยังไม่มีข้อมูลวันหยุดครบสำหรับปี {year} — ตรวจวันครบกำหนดด้วยตนเอง',`; EN: `holidayIncomplete: 'Holiday data for {year} is incomplete — check this deadline by hand',`.

`apps/web/src/components/cases/DateSuggestionsPanel.tsx` — add `import { fmt } from '@/lib/i18n/dashboard';` (the helper `admin/holidays/page.tsx` uses), and directly below the `{s.source === 'RULE' ? … : …}` block add:

```tsx
                {s.holidayDataIncomplete && s.dueYear && (
                  <p role="alert" className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                    {fmt(d.dateSuggestions.holidayIncomplete, { year: s.dueYear + 543 })}
                  </p>
                )}
```

- [ ] **Step 6: Migration (defaults for every existing DB + 2570 holidays)**

Create `apps/api/prisma/migrations/20261011130100_deadline_defaults_holidays_2570/migration.sql`:

```sql
-- Spec L1: platform default deadline rules and the 2570 (2027) holiday calendar.
-- Runs after 20261011130000, so the new enum values are committed and usable.

-- 1. Upgrade the two old global rows in place (PENDING suggestions keep pointing at them).
UPDATE "DeadlineRule"
   SET "label" = 'ครบกำหนดยื่นคำให้การ', "serviceMethod" = 'PERSONAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "firmId" IS NULL AND "caseTypeId" IS NULL AND "trigger" = 'COMPLAINT_SERVED' AND "label" = 'ยื่นคำให้การ';

UPDATE "DeadlineRule"
   SET "label" = 'ครบกำหนดยื่นอุทธรณ์', "offsetDays" = 1, "dayBasis" = 'MONTHS', "courtLevel" = 'TRIAL',
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "firmId" IS NULL AND "caseTypeId" IS NULL AND "trigger" = 'JUDGMENT' AND "label" = 'ยื่นอุทธรณ์';

-- 2. Insert every default that is not there yet (keyed by trigger + label, as firm overrides are).
INSERT INTO "DeadlineRule" ("id", "trigger", "label", "offsetDays", "dayBasis", "adjustDays",
                            "courtEventKind", "courtLevel", "partySide", "serviceMethod",
                            "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.trigger::"DeadlineTrigger", v.label, v.offset_days, v.basis::"DeadlineDayBasis",
       v.adjust, v.kind::"CourtEventKind", v.level::"CourtLevel", v.side::"PartyRole", v.method::"ServiceMethod",
       true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('FILED',            'ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง',                 7,   'CALENDAR', 0,   NULL::text,        NULL::text, NULL::text,  NULL::text),
  ('COMPLAINT_SERVED', 'ครบกำหนดยื่นคำให้การ',                            15,  'CALENDAR', 0,   NULL,              NULL,       NULL,        'PERSONAL'),
  ('COMPLAINT_SERVED', 'ครบกำหนดยื่นคำให้การ (ปิดหมาย)',                   30,  'CALENDAR', 0,   NULL,              NULL,       NULL,        'POSTED'),
  ('COMPLAINT_SERVED', 'ตรวจขาดนัดยื่นคำให้การ / ขอให้พิพากษาโดยขาดนัด',    30,  'CALENDAR', 0,   NULL,              NULL,       'PLAINTIFF', NULL),
  ('COURT_DATE',       'ยื่นบัญชีระบุพยาน',                                -7,  'CALENDAR', 0,   'WITNESS_HEARING', NULL,       NULL,        NULL),
  ('COURT_DATE',       'สรุปผลนัดและรายงานลูกความ',                         3,   'BUSINESS', 0,   NULL,              NULL,       NULL,        NULL),
  ('JUDGMENT',         'ครบกำหนดยื่นอุทธรณ์',                              1,   'MONTHS',   0,   NULL,              'TRIAL',    NULL,        NULL),
  ('JUDGMENT',         'ครบกำหนดยื่นคำร้องขออนุญาตฎีกาและฎีกา',             1,   'MONTHS',   0,   NULL,              'APPEAL',   NULL,        NULL),
  ('APPEAL_SERVED',    'ครบกำหนดยื่นคำแก้อุทธรณ์',                          15,  'CALENDAR', 0,   NULL,              NULL,       NULL,        NULL),
  ('ORDER_RECEIVED',   'โต้แย้งคำสั่งศาล',                                  15,  'CALENDAR', 0,   NULL,              NULL,       NULL,        NULL),
  ('JUDGMENT',         'ใกล้ครบระยะบังคับคดี 10 ปี',                        120, 'MONTHS',   -90, NULL,              NULL,       NULL,        NULL)
) AS v(trigger, label, offset_days, basis, adjust, kind, level, side, method)
WHERE NOT EXISTS (
  SELECT 1 FROM "DeadlineRule" r
   WHERE r."firmId" IS NULL AND r."trigger" = v.trigger::"DeadlineTrigger" AND r."label" = v.label
);

-- 3. Thai government holidays B.E. 2570 (2027) — fixed dates only.
-- Source: the recurring Cabinet-approved annual government holiday list (same set as
-- 20260907190000 for 2569); substitution days follow the standing Cabinet rule that a
-- holiday on Sat/Sun is compensated on the next working day (23 Oct 2027 = Sat → Mon 25 Oct;
-- 5 Dec 2027 = Sun → Mon 6 Dec).
-- NOT seeded: มาฆบูชา, วิสาขบูชา, อาสาฬหบูชา, เข้าพรรษา, พืชมงคล. As of 2026-10-12 no Cabinet
-- resolution / Royal Gazette notice fixing them for 2570 was found (soc.go.th, ratchakitcha.soc.go.th,
-- thaigov.go.th). BOT notice สนส. 37/2569 (27 Aug 2569) covers financial-institution holidays only.
-- Enter them at /admin/holidays once announced. 1 May (วันแรงงาน) is a private-sector holiday.
INSERT INTO "PublicHoliday" ("id", "date", "name") VALUES
  (gen_random_uuid()::text, DATE '2027-01-01', 'วันขึ้นปีใหม่'),
  (gen_random_uuid()::text, DATE '2027-04-06', 'วันจักรี'),
  (gen_random_uuid()::text, DATE '2027-04-13', 'วันสงกรานต์'),
  (gen_random_uuid()::text, DATE '2027-04-14', 'วันสงกรานต์'),
  (gen_random_uuid()::text, DATE '2027-04-15', 'วันสงกรานต์'),
  (gen_random_uuid()::text, DATE '2027-05-04', 'วันฉัตรมงคล'),
  (gen_random_uuid()::text, DATE '2027-06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'),
  (gen_random_uuid()::text, DATE '2027-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'),
  (gen_random_uuid()::text, DATE '2027-08-12', 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง'),
  (gen_random_uuid()::text, DATE '2027-10-13', 'วันคล้ายวันสวรรคตพระบาทสมเด็จพระบรมชนกาธิเบศรฯ'),
  (gen_random_uuid()::text, DATE '2027-10-23', 'วันปิยมหาราช'),
  (gen_random_uuid()::text, DATE '2027-10-25', 'ชดเชยวันปิยมหาราช'),
  (gen_random_uuid()::text, DATE '2027-12-05', 'วันคล้ายวันพระบรมราชสมภพพระบาทสมเด็จพระบรมชนกาธิเบศรฯ'),
  (gen_random_uuid()::text, DATE '2027-12-06', 'ชดเชยวันคล้ายวันพระบรมราชสมภพฯ'),
  (gen_random_uuid()::text, DATE '2027-12-10', 'วันรัฐธรรมนูญ'),
  (gen_random_uuid()::text, DATE '2027-12-31', 'วันสิ้นปี')
ON CONFLICT ("date") DO NOTHING;
```

Apply:

```bash
cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261011130100_deadline_defaults_holidays_2570/migration.sql && pnpm exec prisma migrate resolve --applied 20261011130100_deadline_defaults_holidays_2570 && cd ../..
psql "$DATABASE_URL" -c "SELECT trigger, label, \"offsetDays\", \"dayBasis\" FROM \"DeadlineRule\" WHERE \"firmId\" IS NULL ORDER BY trigger, label;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM \"PublicHoliday\" WHERE date BETWEEN '2027-01-01' AND '2027-12-31';"
```

Expected: 11 global rules (no duplicate `ครบกำหนดยื่นคำให้การ` / `ครบกำหนดยื่นอุทธรณ์`); 16 holidays for 2027. Re-running the SQL file changes nothing (idempotent).

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/holidays src/intelligence/date-suggestions.service.spec.ts src/deadlines`
Expected: PASS.

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add packages/shared/src/agenda.ts apps/api/src/deadlines apps/api/prisma/seed.ts apps/api/prisma/migrations/20261011130100_deadline_defaults_holidays_2570 apps/api/src/holidays/holiday-coverage.ts apps/api/src/holidays/holiday-coverage.spec.ts apps/api/src/intelligence/date-suggestions.service.ts apps/api/src/intelligence/date-suggestions.service.spec.ts apps/web/src/lib/api.ts apps/web/src/components/cases/DateSuggestionsPanel.tsx apps/web/src/lib/i18n/dashboard.ts
/usr/bin/git commit -m "feat(deadlines): statutory default rules, 2570 holidays, incomplete-holiday warning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Firm-editable deadline rules (API + `/admin/deadline-rules`)

**Files:**
- Modify: `apps/api/src/deadlines/deadline-rules.service.ts` (`list`, `create`, `update`, `remove`, new private `canEdit`/`assertCanEdit`/`findVisible`)
- Modify: `apps/api/src/deadlines/deadlines.controller.ts` (drop `PlatformAdminGuard` from POST/PATCH/DELETE)
- Modify: `apps/api/src/deadlines/dto/deadline-rule.dto.ts`
- Create: `apps/web/src/lib/deadline-rules.ts`, `apps/web/src/lib/deadline-rules.test.ts`
- Modify (rewrite): `apps/web/src/app/(dashboard)/admin/deadline-rules/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx:28` (link capability), `apps/web/src/lib/i18n/dashboard.ts` (`deadlineRules` TH + EN)
- Test: `apps/api/src/deadlines/deadline-rules.service.spec.ts`, `apps/api/src/deadlines/deadlines.controller.spec.ts`

**Interfaces:**
- Consumes: Task 1 columns, Task 3 `effectiveDeadlineRules`/`deadlineRuleKey`, Task 5 `DEFAULT_DEADLINE_RULES`, Plan A `hasFirmCapability(role, 'manageFirmContent')`, `platformAdminEmails()` (`apps/api/src/common/guards/platform-admin.guard.ts`).
- Produces:
  - `GET /deadline-rules` → `DeadlineRuleItem[]`: every global row plus the caller firm's rows (raw, not merged), each with `canEdit` (global: caller is a platform admin; firm row: caller has `manageFirmContent`).
  - `POST /deadline-rules` body `CreateDeadlineRuleDto` (+ `global?: boolean`, filters, `adjustDays`) → creates a firm rule (`firmId = caller firm`, needs `manageFirmContent`) or, with `global: true`, a platform rule (needs platform admin). A firm rule whose trigger + label equal a global rule **is** the override. `409` on a duplicate trigger + label within the same scope.
  - `PATCH /deadline-rules/:id`, `DELETE /deadline-rules/:id` → only rows the caller can see; `404` for another firm's row, `403` when `canEdit` would be false. Deleting an override brings the global rule back.
  - Web: `firmRuleRows(rules: DeadlineRuleItem[], firmId: string): { rule: DeadlineRuleItem; origin: 'GLOBAL' | 'FIRM' | 'OVERRIDE' }[]`, `offsetText(rule: Pick<DeadlineRuleItem, 'offsetDays' | 'dayBasis' | 'adjustDays'>, locale: 'th' | 'en'): string`.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/deadlines/deadline-rules.service.spec.ts`:
- add `findFirst: jest.fn(), update: jest.fn()` to `mockPrisma.deadlineRule`;
- replace the whole `describe('list', …)` and `describe('rule management', …)` blocks with:

```ts
  describe('list', () => {
    const owner = { ...user, email: 'owner@firm.test', firmRole: FirmRole.OWNER };
    const lawyer = { ...user, email: 'lawyer@firm.test', firmRole: FirmRole.LAWYER };

    beforeEach(() => {
      process.env.PLATFORM_ADMIN_EMAILS = 'ops@platform.test';
      mockPrisma.deadlineRule.count.mockResolvedValue(11);
      mockPrisma.deadlineRule.findMany.mockResolvedValue([
        { ...rule, id: 'g', firmId: null },
        { ...rule, id: 'f', firmId: 'firm-1' },
      ]);
    });

    it('returns global rows plus the caller firm rows, flagging what the caller may edit', async () => {
      const rows = await service.list(owner);

      expect(mockPrisma.deadlineRule.findMany).toHaveBeenCalledWith({
        where: { OR: [{ firmId: null }, { firmId: 'firm-1' }] },
        orderBy: [{ trigger: 'asc' }, { offsetDays: 'asc' }],
      });
      expect(rows.map((r) => [r.id, r.canEdit])).toEqual([['g', false], ['f', true]]);
      expect((await service.list(lawyer)).map((r) => r.canEdit)).toEqual([false, false]);
      expect((await service.list({ ...owner, email: 'OPS@platform.test' })).map((r) => r.canEdit)).toEqual([true, true]);
    });

    it('provisions the starter rules when the catalog is empty', async () => {
      mockPrisma.deadlineRule.count.mockResolvedValue(0);
      await service.list(owner);
      expect(mockPrisma.deadlineRule.createMany).toHaveBeenCalled();
    });
  });

  describe('rule management', () => {
    const owner = { ...user, email: 'owner@firm.test', firmRole: FirmRole.OWNER };
    const manager = { ...user, email: 'om@firm.test', firmRole: FirmRole.OFFICE_MANAGER };
    const lawyer = { ...user, email: 'lawyer@firm.test', firmRole: FirmRole.LAWYER };
    const admin = { ...user, email: 'ops@platform.test', firmRole: FirmRole.OWNER };
    const dto = { trigger: DeadlineTrigger.COURT_DATE, label: ' ยื่นบัญชีระบุพยาน ', offsetDays: -10, dayBasis: DeadlineDayBasis.CALENDAR };

    beforeEach(() => {
      process.env.PLATFORM_ADMIN_EMAILS = 'ops@platform.test';
      mockPrisma.deadlineRule.findFirst.mockResolvedValue(null);
      mockPrisma.deadlineRule.create.mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data }));
    });

    it('an office manager creates a firm rule (the override of a global rule with the same label)', async () => {
      await service.create(manager, dto);
      expect(mockPrisma.deadlineRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ firmId: 'firm-1', label: 'ยื่นบัญชีระบุพยาน', offsetDays: -10, adjustDays: 0, caseTypeId: null }),
      });
    });

    it('a lawyer cannot create firm rules', async () => {
      await expect(service.create(lawyer, dto)).rejects.toThrow('ไม่มีสิทธิ์แก้กฎวันครบกำหนดของสำนักงาน');
    });

    it('only a platform admin creates a global rule', async () => {
      await expect(service.create(owner, { ...dto, global: true })).rejects.toThrow('ข้อมูลส่วนกลางแก้ได้เฉพาะผู้ดูแลระบบ');
      await service.create(admin, { ...dto, global: true });
      expect(mockPrisma.deadlineRule.create).toHaveBeenCalledWith({ data: expect.objectContaining({ firmId: null }) });
    });

    it('rejects a duplicate trigger + label in the same scope', async () => {
      mockPrisma.deadlineRule.findFirst.mockResolvedValue({ id: 'dup' });
      await expect(service.create(owner, dto)).rejects.toThrow('มีกฎชื่อนี้สำหรับเหตุนี้อยู่แล้ว');
    });

    it('an owner edits their firm rule but not a global one', async () => {
      mockPrisma.deadlineRule.findFirst.mockResolvedValueOnce({ id: 'f', firmId: 'firm-1' });
      await service.update(owner, 'f', { offsetDays: 15 });
      expect(mockPrisma.deadlineRule.update).toHaveBeenCalledWith({ where: { id: 'f' }, data: { offsetDays: 15 } });

      mockPrisma.deadlineRule.findFirst.mockResolvedValueOnce({ id: 'g', firmId: null });
      await expect(service.update(owner, 'g', { offsetDays: 15 })).rejects.toThrow('ข้อมูลส่วนกลางแก้ได้เฉพาะผู้ดูแลระบบ');
    });

    it('never reaches another firm’s rule', async () => {
      mockPrisma.deadlineRule.findFirst.mockResolvedValue(null);
      await expect(service.update(owner, 'x', { offsetDays: 1 })).rejects.toThrow('Deadline rule not found');
      await expect(service.remove(owner, 'x')).rejects.toThrow('Deadline rule not found');
      expect(mockPrisma.deadlineRule.findFirst).toHaveBeenCalledWith({
        where: { id: 'x', OR: [{ firmId: null }, { firmId: 'firm-1' }] },
        select: { id: true, firmId: true },
      });
    });
  });
```

In `apps/api/src/deadlines/deadlines.controller.spec.ts` replace the test `lets any member read the rules but only a platform admin change them` with:

```ts
  it('leaves rule-write authorisation to the service (firm vs platform scope)', () => {
    expect(reflector.get(ROLES_KEY, rules.list)).toBeUndefined();
    for (const handler of [rules.create, rules.update, rules.remove]) {
      expect(reflector.get(GUARDS_METADATA, handler) ?? []).not.toContain(PlatformAdminGuard);
    }
  });
```

Create `apps/web/src/lib/deadline-rules.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeadlineDayBasis, DeadlineTrigger } from '@lawfirm/shared';
import { firmRuleRows, offsetText } from './deadline-rules.ts';

const base = {
  caseTypeId: null, trigger: DeadlineTrigger.COURT_DATE, label: 'สรุปผลนัด', offsetDays: 3,
  dayBasis: DeadlineDayBasis.BUSINESS, adjustDays: 0, courtEventKind: null, courtLevel: null,
  partySide: null, serviceMethod: null, isActive: true,
};

test('firm rows: global, own and override', () => {
  const rows = firmRuleRows(
    [
      { ...base, id: 'g1', firmId: null },
      { ...base, id: 'g2', firmId: null, label: 'ยื่นบัญชีระบุพยาน' },
      { ...base, id: 'f1', firmId: 'firm-1' },
      { ...base, id: 'f2', firmId: 'firm-1', label: 'โทรแจ้งลูกความ' },
    ],
    'firm-1',
  );
  assert.deepEqual(rows.map((r) => [r.rule.id, r.origin]), [['g2', 'GLOBAL'], ['f1', 'OVERRIDE'], ['f2', 'FIRM']]);
});

test('offset text reads naturally for before, months and adjustments', () => {
  assert.equal(offsetText({ offsetDays: -7, dayBasis: DeadlineDayBasis.CALENDAR, adjustDays: 0 }, 'th'), 'ก่อน 7 วัน');
  assert.equal(offsetText({ offsetDays: 3, dayBasis: DeadlineDayBasis.BUSINESS, adjustDays: 0 }, 'th'), '+3 วันทำการ');
  assert.equal(offsetText({ offsetDays: 120, dayBasis: DeadlineDayBasis.MONTHS, adjustDays: -90 }, 'th'), '+120 เดือน −90 วัน');
  assert.equal(offsetText({ offsetDays: 1, dayBasis: DeadlineDayBasis.MONTHS, adjustDays: 0 }, 'en'), '+1 month(s)');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/deadlines` → FAIL (`canEdit` undefined, create has no `firmId`, guard still present).
Run: `pnpm --filter web test` → FAIL (`Cannot find module './deadline-rules.ts'`).

- [ ] **Step 3: DTOs**

Replace `apps/api/src/deadlines/dto/deadline-rule.dto.ts` with:

```ts
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { CourtEventKind, CourtLevel, DeadlineDayBasis, DeadlineTrigger, PartyRole, ServiceMethod } from '@lawfirm/shared';

class DeadlineRuleFilterFields {
  /** Calendar days added after the offset (e.g. −90 for "10 years − 90 days"). */
  @IsOptional() @IsInt() @Min(-3650) @Max(3650)
  adjustDays?: number;

  @IsOptional() @IsEnum(CourtEventKind)
  courtEventKind?: CourtEventKind | null;

  @IsOptional() @IsEnum(CourtLevel)
  courtLevel?: CourtLevel | null;

  @IsOptional() @IsEnum(PartyRole)
  partySide?: PartyRole | null;

  @IsOptional() @IsEnum(ServiceMethod)
  serviceMethod?: ServiceMethod | null;
}

export class CreateDeadlineRuleDto extends DeadlineRuleFilterFields {
  /** Ignored in this pass — every rule applies to all case types. */
  @IsOptional() @IsUUID()
  caseTypeId?: string;

  @IsEnum(DeadlineTrigger)
  trigger!: DeadlineTrigger;

  @IsString() @MaxLength(200)
  label!: string;

  /** Days, or months for MONTHS; negative = before the trigger. */
  @IsInt() @Min(-3650) @Max(3650)
  offsetDays!: number;

  @IsOptional() @IsEnum(DeadlineDayBasis)
  dayBasis?: DeadlineDayBasis;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  /** Platform admins only: create a default every firm runs instead of a firm rule. */
  @IsOptional() @IsBoolean()
  global?: boolean;
}

export class UpdateDeadlineRuleDto extends DeadlineRuleFilterFields {
  @IsOptional() @IsString() @MaxLength(200)
  label?: string;

  @IsOptional() @IsInt() @Min(-3650) @Max(3650)
  offsetDays?: number;

  @IsOptional() @IsEnum(DeadlineDayBasis)
  dayBasis?: DeadlineDayBasis;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
```

(This supersedes Task 2's `@Min(-3650)` edit; Task 2's DTO test still passes.)

- [ ] **Step 4: Service and controller**

In `apps/api/src/deadlines/deadline-rules.service.ts` add imports `ConflictException, ForbiddenException` (from `@nestjs/common`), `hasFirmCapability` (from `@lawfirm/shared`), `platformAdminEmails` (from `../common/guards/platform-admin.guard`), and replace `list`, `create`, `update`, `remove` with:

```ts
  private canEdit(user: AuthUser, firmId: string | null): boolean {
    if (firmId === null) return platformAdminEmails().has((user.email ?? '').toLowerCase());
    return firmId === user.firmId && hasFirmCapability(user.firmRole, 'manageFirmContent');
  }

  private assertCanEdit(user: AuthUser, firmId: string | null): void {
    if (this.canEdit(user, firmId)) return;
    throw new ForbiddenException(
      firmId === null ? 'ข้อมูลส่วนกลางแก้ได้เฉพาะผู้ดูแลระบบ' : 'ไม่มีสิทธิ์แก้กฎวันครบกำหนดของสำนักงาน',
    );
  }

  /** A rule this caller can see: global, or their own firm's. */
  private async findVisible(user: AuthUser, id: string) {
    const rule = await this.prisma.deadlineRule.findFirst({
      where: { id, OR: [{ firmId: null }, { firmId: user.firmId }] },
      select: { id: true, firmId: true },
    });
    if (!rule) throw new NotFoundException('Deadline rule not found');
    return rule;
  }

  async list(user: AuthUser) {
    await this.provisionDefaults();
    const rows = await this.prisma.deadlineRule.findMany({
      where: { OR: [{ firmId: null }, { firmId: user.firmId }] },
      orderBy: [{ trigger: 'asc' }, { offsetDays: 'asc' }],
    });
    return rows.map((row) => ({ ...row, canEdit: this.canEdit(user, row.firmId) }));
  }

  async create(user: AuthUser, dto: CreateDeadlineRuleDto) {
    const firmId = dto.global ? null : user.firmId;
    this.assertCanEdit(user, firmId);
    const label = dto.label.trim();
    const clash = await this.prisma.deadlineRule.findFirst({
      where: { firmId, trigger: dto.trigger, label },
      select: { id: true },
    });
    if (clash) throw new ConflictException('มีกฎชื่อนี้สำหรับเหตุนี้อยู่แล้ว');
    return this.prisma.deadlineRule.create({
      data: {
        firmId,
        caseTypeId: null,
        trigger: dto.trigger,
        label,
        offsetDays: dto.offsetDays,
        dayBasis: dto.dayBasis ?? DeadlineDayBasis.CALENDAR,
        adjustDays: dto.adjustDays ?? 0,
        courtEventKind: dto.courtEventKind ?? null,
        courtLevel: dto.courtLevel ?? null,
        partySide: dto.partySide ?? null,
        serviceMethod: dto.serviceMethod ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateDeadlineRuleDto) {
    const rule = await this.findVisible(user, id);
    this.assertCanEdit(user, rule.firmId);
    const { caseTypeId: _ignored, ...data } = dto as UpdateDeadlineRuleDto & { caseTypeId?: string | null };
    if (data.label !== undefined) data.label = data.label.trim();
    await this.prisma.deadlineRule.update({ where: { id }, data });
    return { updated: true };
  }

  async remove(user: AuthUser, id: string) {
    const rule = await this.findVisible(user, id);
    this.assertCanEdit(user, rule.firmId);
    await this.prisma.deadlineRule.delete({ where: { id } });
    return { deleted: true };
  }
```

Add `delete: jest.fn()` to `mockPrisma.deadlineRule` in the spec (used by `remove`).

`apps/api/src/deadlines/deadlines.controller.ts` — remove `@UseGuards(PlatformAdminGuard)` from `create`, `update`, `remove` and the now-unused `PlatformAdminGuard` import. Keep the class-level `@UseGuards(JwtAuthGuard, RolesGuard)`.

- [ ] **Step 5: Web helper**

Create `apps/web/src/lib/deadline-rules.ts`:

```ts
import { DeadlineDayBasis, deadlineRuleKey, effectiveDeadlineRules } from '@lawfirm/shared';
import type { DeadlineRuleItem } from '@lawfirm/shared';

export type RuleOrigin = 'GLOBAL' | 'FIRM' | 'OVERRIDE';

/** What this firm actually runs, and where each row comes from. */
export function firmRuleRows(rules: DeadlineRuleItem[], firmId: string): { rule: DeadlineRuleItem; origin: RuleOrigin }[] {
  const globals = new Set(rules.filter((rule) => rule.firmId === null).map(deadlineRuleKey));
  return effectiveDeadlineRules(rules, firmId).map((rule) => ({
    rule,
    origin: rule.firmId === null ? 'GLOBAL' : globals.has(deadlineRuleKey(rule)) ? 'OVERRIDE' : 'FIRM',
  }));
}

const UNITS = {
  th: { [DeadlineDayBasis.CALENDAR]: 'วัน', [DeadlineDayBasis.BUSINESS]: 'วันทำการ', [DeadlineDayBasis.MONTHS]: 'เดือน', day: 'วัน', before: 'ก่อน' },
  en: { [DeadlineDayBasis.CALENDAR]: 'day(s)', [DeadlineDayBasis.BUSINESS]: 'business day(s)', [DeadlineDayBasis.MONTHS]: 'month(s)', day: 'day(s)', before: 'before:' },
} as const;

export function offsetText(
  rule: Pick<DeadlineRuleItem, 'offsetDays' | 'dayBasis' | 'adjustDays'>,
  locale: 'th' | 'en',
): string {
  const u = UNITS[locale];
  const main = rule.offsetDays < 0
    ? `${u.before} ${Math.abs(rule.offsetDays)} ${u[rule.dayBasis]}`
    : `+${rule.offsetDays} ${u[rule.dayBasis]}`;
  if (!rule.adjustDays) return main;
  return `${main} ${rule.adjustDays < 0 ? '−' : '+'}${Math.abs(rule.adjustDays)} ${u.day}`;
}
```

- [ ] **Step 6: i18n, settings link, page**

`apps/web/src/lib/i18n/dashboard.ts` — add to TH `deadlineRules`:

```ts
      adjustDays: 'บวก/ลบวันเพิ่ม (หลังนับแล้ว)',
      offsetHint: 'ติดลบ = ก่อนเหตุตั้งต้น เช่น −7',
      courtEventKind: 'เฉพาะนัดชนิด',
      courtLevel: 'เฉพาะศาลชั้น',
      partySide: 'เฉพาะเมื่อเราเป็น',
      serviceMethod: 'เฉพาะวิธีส่งหมาย',
      any: 'ทุกกรณี',
      global: 'เป็นค่าตั้งต้นส่วนกลาง (ทุกสำนักงาน)',
      origin: { GLOBAL: 'กฎกลาง', FIRM: 'กฎของสำนักงาน', OVERRIDE: 'ปรับจากกฎกลาง' },
      customize: 'ปรับใช้กับสำนักงาน',
      disableForFirm: 'ปิดสำหรับสำนักงาน',
      revert: 'กลับไปใช้กฎกลาง',
      globalSection: 'ค่าตั้งต้นส่วนกลาง (ผู้ดูแลระบบ)',
      save: 'บันทึกกฎ',
```

and to EN `deadlineRules`:

```ts
      adjustDays: 'Extra days after counting (+/−)',
      offsetHint: 'Negative = before the trigger, e.g. −7',
      courtEventKind: 'Only for sitting',
      courtLevel: 'Only at court level',
      partySide: 'Only when we act for',
      serviceMethod: 'Only for service by',
      any: 'Any',
      global: 'Platform default (every firm)',
      origin: { GLOBAL: 'Default', FIRM: 'Firm rule', OVERRIDE: 'Firm override' },
      customize: 'Customise for my firm',
      disableForFirm: 'Turn off for my firm',
      revert: 'Revert to default',
      globalSection: 'Platform defaults (admin)',
      save: 'Save rule',
```

`apps/web/src/app/(dashboard)/settings/page.tsx:28` — change the deadline-rules link's `capability: 'manageSubscription'` to `capability: 'manageFirmContent'`.

Replace `apps/web/src/app/(dashboard)/admin/deadline-rules/page.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  COURT_EVENT_KIND_LABELS,
  COURT_LEVEL_LABELS,
  CourtEventKind,
  CourtLevel,
  DeadlineDayBasis,
  DeadlineTrigger,
  PARTY_ROLE_LABELS,
  PartyRole,
  SERVICE_METHOD_LABELS,
  ServiceMethod,
  hasFirmCapability,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, DeadlineRuleItem } from '@/lib/api';
import { firmRuleRows, offsetText, RuleOrigin } from '@/lib/deadline-rules';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { InlineEmptyState } from '@/components/ui/misc';

const SELECT = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

type Form = {
  label: string;
  trigger: DeadlineTrigger;
  offsetDays: number;
  dayBasis: DeadlineDayBasis;
  adjustDays: number;
  courtEventKind: CourtEventKind | '';
  courtLevel: CourtLevel | '';
  partySide: PartyRole | '';
  serviceMethod: ServiceMethod | '';
  isActive: boolean;
  global: boolean;
  /** Set when customising a global rule: the label must stay equal to override it. */
  lockLabel: boolean;
};

const EMPTY: Form = {
  label: '', trigger: DeadlineTrigger.COURT_DATE, offsetDays: 30, dayBasis: DeadlineDayBasis.CALENDAR,
  adjustDays: 0, courtEventKind: '', courtLevel: '', partySide: '', serviceMethod: '',
  isActive: true, global: false, lockLabel: false,
};

const fromRule = (rule: DeadlineRuleItem, patch: Partial<Form> = {}): Form => ({
  label: rule.label, trigger: rule.trigger, offsetDays: rule.offsetDays, dayBasis: rule.dayBasis,
  adjustDays: rule.adjustDays, courtEventKind: rule.courtEventKind ?? '', courtLevel: (rule.courtLevel ?? '') as CourtLevel | '',
  partySide: (rule.partySide ?? '') as PartyRole | '', serviceMethod: rule.serviceMethod ?? '',
  isActive: rule.isActive, global: false, lockLabel: true, ...patch,
});

/** Filters only mean something for their own trigger; anything else is sent as null. */
const payload = (f: Form) => ({
  label: f.label,
  trigger: f.trigger,
  offsetDays: Number(f.offsetDays),
  dayBasis: f.dayBasis,
  adjustDays: Number(f.adjustDays),
  courtEventKind: f.trigger === DeadlineTrigger.COURT_DATE ? f.courtEventKind || null : null,
  courtLevel: f.trigger === DeadlineTrigger.JUDGMENT ? f.courtLevel || null : null,
  partySide: f.partySide || null,
  serviceMethod: f.trigger === DeadlineTrigger.COMPLAINT_SERVED ? f.serviceMethod || null : null,
  isActive: f.isActive,
  ...(f.global ? { global: true } : {}),
});

export default function DeadlineRulesPage() {
  const { token, user } = useAuth();
  const d = useDashboardT();
  const { locale } = useLocale();
  const t = d.deadlineRules;
  const [rules, setRules] = useState<DeadlineRuleItem[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    if (token) api.getDeadlineRules(token).then(setRules).catch(console.error);
  };
  useEffect(load, [token]);

  if (!hasFirmCapability(user?.firmRole, 'manageFirmContent')) {
    return <p className="text-destructive">{d.admin.accessDenied}</p>;
  }
  const isPlatformAdmin = rules.some((rule) => rule.firmId === null && rule.canEdit);
  const rows = firmRuleRows(rules, user!.firmId);

  const run = async (action: () => Promise<unknown>) => {
    if (!token) return;
    setError('');
    try {
      await action();
      setForm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed);
    }
  };

  const toggle = (rule: DeadlineRuleItem) =>
    run(() =>
      rule.canEdit
        ? api.updateDeadlineRule(token!, rule.id, { isActive: !rule.isActive })
        // A global rule this firm cannot edit is switched off by an inactive override.
        : api.createDeadlineRule(token!, payload(fromRule(rule, { isActive: false }))),
    );

  const remove = (rule: DeadlineRuleItem) => {
    if (window.confirm(t.confirmDelete)) run(() => api.deleteDeadlineRule(token!, rule.id));
  };

  const describe = (rule: DeadlineRuleItem) =>
    [
      `${t.triggers[rule.trigger]} ${offsetText(rule, locale)}`,
      rule.courtEventKind && COURT_EVENT_KIND_LABELS[rule.courtEventKind],
      rule.courtLevel && COURT_LEVEL_LABELS[rule.courtLevel as CourtLevel],
      rule.partySide && PARTY_ROLE_LABELS[rule.partySide as PartyRole],
      rule.serviceMethod && SERVICE_METHOD_LABELS[rule.serviceMethod],
    ].filter(Boolean).join(' · ');

  const row = (rule: DeadlineRuleItem, origin: RuleOrigin | null) => (
    <li key={rule.id} className="flex flex-wrap items-center gap-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {rule.label}
          {origin && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t.origin[origin]}</span>}
        </p>
        <p className="text-xs text-muted-foreground">{describe(rule)}</p>
      </div>
      {origin === 'GLOBAL' && (
        <Button type="button" size="sm" variant="outline" onClick={() => setForm(fromRule(rule))}>{t.customize}</Button>
      )}
      <Button type="button" size="sm" variant={rule.isActive ? 'secondary' : 'outline'} onClick={() => toggle(rule)}>
        {rule.isActive ? (rule.canEdit ? t.active : t.disableForFirm) : t.inactive}
      </Button>
      {rule.canEdit && (
        <Button type="button" size="sm" variant="ghost" aria-label={origin === 'OVERRIDE' ? t.revert : t.confirmDelete} onClick={() => remove(rule)}>
          {origin === 'OVERRIDE' ? t.revert : <Trash2 className="size-4" />}
        </Button>
      )}
    </li>
  );

  const field = (label: string, input: React.ReactNode, wide = false) => (
    <label className={`text-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {input}
    </label>
  );

  return (
    <div>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button size="sm" onClick={() => setForm(form ? null : EMPTY)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            {t.add}
          </Button>
        }
      />

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {form && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <form
              onSubmit={(e) => { e.preventDefault(); run(() => api.createDeadlineRule(token!, payload(form))); }}
              className="grid gap-3 sm:grid-cols-2"
            >
              {field(t.label, <Input required readOnly={form.lockLabel} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />)}
              {field(t.trigger, (
                <select className={SELECT} disabled={form.lockLabel} value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as DeadlineTrigger })}>
                  {Object.values(DeadlineTrigger).map((x) => <option key={x} value={x}>{t.triggers[x]}</option>)}
                </select>
              ))}
              {field(`${t.offsetDays} — ${t.offsetHint}`, (
                <Input type="number" min={-3650} max={3650} required value={form.offsetDays} onChange={(e) => setForm({ ...form, offsetDays: Number(e.target.value) })} />
              ))}
              {field(t.dayBasis, (
                <select className={SELECT} value={form.dayBasis} onChange={(e) => setForm({ ...form, dayBasis: e.target.value as DeadlineDayBasis })}>
                  {Object.values(DeadlineDayBasis).map((x) => <option key={x} value={x}>{t.bases[x]}</option>)}
                </select>
              ))}
              {field(t.adjustDays, (
                <Input type="number" min={-3650} max={3650} value={form.adjustDays} onChange={(e) => setForm({ ...form, adjustDays: Number(e.target.value) })} />
              ))}
              {field(t.partySide, (
                <select className={SELECT} value={form.partySide} onChange={(e) => setForm({ ...form, partySide: e.target.value as PartyRole | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(PartyRole).map((x) => <option key={x} value={x}>{PARTY_ROLE_LABELS[x]}</option>)}
                </select>
              ))}
              {form.trigger === DeadlineTrigger.COURT_DATE && field(t.courtEventKind, (
                <select className={SELECT} value={form.courtEventKind} onChange={(e) => setForm({ ...form, courtEventKind: e.target.value as CourtEventKind | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(CourtEventKind).map((x) => <option key={x} value={x}>{COURT_EVENT_KIND_LABELS[x]}</option>)}
                </select>
              ))}
              {form.trigger === DeadlineTrigger.JUDGMENT && field(t.courtLevel, (
                <select className={SELECT} value={form.courtLevel} onChange={(e) => setForm({ ...form, courtLevel: e.target.value as CourtLevel | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(CourtLevel).map((x) => <option key={x} value={x}>{COURT_LEVEL_LABELS[x]}</option>)}
                </select>
              ))}
              {form.trigger === DeadlineTrigger.COMPLAINT_SERVED && field(t.serviceMethod, (
                <select className={SELECT} value={form.serviceMethod} onChange={(e) => setForm({ ...form, serviceMethod: e.target.value as ServiceMethod | '' })}>
                  <option value="">{t.any}</option>
                  {Object.values(ServiceMethod).map((x) => <option key={x} value={x}>{SERVICE_METHOD_LABELS[x]}</option>)}
                </select>
              ))}
              {isPlatformAdmin && !form.lockLabel && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={form.global} onChange={(e) => setForm({ ...form, global: e.target.checked })} />
                  {t.global}
                </label>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" size="sm">{t.save}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <InlineEmptyState title={t.empty} description="เพิ่มกฎแรกเพื่อให้ระบบช่วยคำนวณกำหนดตามเหตุการณ์ของคดี" />
          ) : (
            <ul className="divide-y divide-border">{rows.map(({ rule, origin }) => row(rule, origin))}</ul>
          )}
        </CardContent>
      </Card>

      {isPlatformAdmin && (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <p className="mb-2 text-sm font-semibold">{t.globalSection}</p>
            <ul className="divide-y divide-border">{rules.filter((r) => r.firmId === null).map((r) => row(r, null))}</ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

(`useLocale()` returns `{ locale, t, d, setLocale }`.) The case-type picker is dropped: the API has always ignored `caseTypeId`, so the old select was misleading.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/deadlines && pnpm --filter web test && pnpm --filter web exec tsc --noEmit && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS / no errors.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/api/src/deadlines apps/web/src/lib/deadline-rules.ts apps/web/src/lib/deadline-rules.test.ts "apps/web/src/app/(dashboard)/admin/deadline-rules/page.tsx" "apps/web/src/app/(dashboard)/settings/page.tsx" apps/web/src/lib/i18n/dashboard.ts
/usr/bin/git commit -m "feat(deadlines): firms edit and override deadline rules; platform admin keeps the defaults

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Case stages — order, stage log, backward note, closing and reopen

**Files:**
- Modify: `packages/shared/src/index.ts:253-277` (`CASE_STAGE_ORDER`, `CASE_STAGE_LABELS_TH`, new `caseStageIndex`, `isBackwardStage`)
- Modify: `apps/web/src/lib/stage-labels.ts:5-33`, `apps/web/src/lib/stage-labels.test.ts`
- Modify: `apps/api/src/common/services/case-feed.service.ts` (`log` gains `stageTransition`)
- Modify: `apps/api/src/cases/dto/case.dto.ts` (`UpdateCaseDto`: `stageNote`), `apps/api/src/cases/dto/close-case.dto.ts` (`outcome` required)
- Modify: `apps/api/src/cases/cases.service.ts` (`update` ~:452-520, `close` ~:668-713, `reopen` ~:740-763)
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` (`applyStageChange` ~:440, close form outcome select ~:1023-1036)
- Modify: `apps/mobile/app/case/new.tsx:88-93` (status options), `apps/mobile/app/case/[id]/close.tsx:21-25, 80, 92`
- Test: `apps/api/src/cases/case-stages.spec.ts` (new), `apps/api/src/common/services/case-feed.service.spec.ts`, `apps/web/src/lib/stage-labels.test.ts`

**Interfaces:**
- Produces (shared): new `CASE_STAGE_ORDER` (FACT_GATHERING → PRE_LITIGATION → FILING → ANSWER → MEDIATION → HEARING → AWAITING_JUDGMENT → APPEAL → SUPREME → ENFORCEMENT → CLOSING); `caseStageIndex(stage: CaseStage | string | null | undefined): number` (−1 for INTAKE_REVIEW, the hidden alias that sorts before everything); `isBackwardStage(from, to): boolean`.
- Produces (api): `CaseFeedService.log({..., stageTransition?: { from: CaseStage | string; to: CaseStage | string; note?: string | null; status?: CaseStatus | string } })` — writes one `CaseStatusLog` row with `fromStage/toStage/note`; when `statusTransition` is absent, `fromStatus = toStatus = stageTransition.status`. `UpdateCaseDto.stageNote?: string`. `PATCH /cases/:id` → `400 'ใช้ปุ่มปิดคดี'` for `status` CLOSED/ARCHIVED; `400 'ย้ายขั้นตอนย้อนกลับต้องระบุเหตุผล'` for a backward move without `stageNote`. `POST /cases/:id/close` requires `outcome` (not IN_PROGRESS). `reopen` restores the stage before closing.
- Later tasks call `this.caseFeed.log({ ..., stageTransition })` for every stage they move (Task 9 court-level sync, Task 10 FILING/AWAITING_JUDGMENT).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/cases/case-stages.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CasesService } from './cases.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { CaseActivitiesService } from './case-activities.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CloseCaseDto } from './dto/close-case.dto';

describe('case stages', () => {
  const user = { id: 'u1', firmId: 'firm-1', firmRole: 'OWNER' } as any;
  let service: CasesService;
  let prisma: any;
  const feed = { log: jest.fn() };
  const base = { id: 'case-1', status: 'IN_PROGRESS', stage: 'HEARING', title: 'คดี', ownRef: 'C-1', leadLawyerId: 'lead-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }),
        findUnique: jest.fn().mockResolvedValue(base),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...base, ...data })),
      },
      caseStatusLog: { findFirst: jest.fn().mockResolvedValue(null) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      client: { count: jest.fn().mockResolvedValue(0) },
      caseType: { count: jest.fn().mockResolvedValue(0) },
      clientContact: { count: jest.fn().mockResolvedValue(0) },
    };
    const module = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: feed },
        {
          provide: CaseAccessService,
          useValue: {
            canAccessCase: jest.fn().mockResolvedValue(true),
            getCaseFilterForUser: jest.fn().mockReturnValue({}),
            getTaskFilterForUser: jest.fn().mockReturnValue({}),
          },
        },
        { provide: CaseActivitiesService, useValue: { create: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn() } },
      ],
    }).compile();
    service = module.get(CasesService);
  });

  it('logs a forward stage move with from/to stage', async () => {
    await service.update(user, 'case-1', { stage: 'AWAITING_JUDGMENT' } as any);

    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STAGE_CHANGE',
        stageTransition: { from: 'HEARING', to: 'AWAITING_JUDGMENT', note: null, status: 'IN_PROGRESS' },
      }),
    );
  });

  it('refuses a backward move without a note', async () => {
    await expect(service.update(user, 'case-1', { stage: 'FILING' } as any)).rejects.toThrow(
      'ย้ายขั้นตอนย้อนกลับต้องระบุเหตุผล',
    );
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('accepts a backward move with a note and keeps the note in the log, not on the case', async () => {
    await service.update(user, 'case-1', { stage: 'FILING', stageNote: 'ศาลให้แก้คำฟ้อง' } as any);

    expect(prisma.case.update.mock.calls[0][0].data.stageNote).toBeUndefined();
    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({ stageTransition: expect.objectContaining({ note: 'ศาลให้แก้คำฟ้อง' }) }),
    );
  });

  it.each(['CLOSED', 'ARCHIVED'])('PATCH cannot set status %s', async (status) => {
    await expect(service.update(user, 'case-1', { status } as any)).rejects.toThrow('ใช้ปุ่มปิดคดี');
  });

  it('closing records the stage it left', async () => {
    await service.close(user, 'case-1', { closingSummary: 'สรุปคดีอย่างน้อยสิบตัวอักษร', outcome: 'WON' } as any);

    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({
        statusTransition: { from: 'IN_PROGRESS', to: 'CLOSED' },
        stageTransition: { from: 'HEARING', to: 'CLOSING' },
      }),
    );
  });

  it('reopen restores the stage that was current before closing', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, status: 'CLOSED', stage: 'CLOSING' });
    prisma.caseStatusLog.findFirst.mockResolvedValue({ fromStage: 'APPEAL' });

    await service.reopen(user, 'case-1');

    expect(prisma.caseStatusLog.findFirst).toHaveBeenCalledWith({
      where: { caseId: 'case-1', toStage: 'CLOSING', fromStage: { not: 'CLOSING' } },
      orderBy: { createdAt: 'desc' },
      select: { fromStage: true },
    });
    expect(prisma.case.update.mock.calls[0][0].data).toMatchObject({ status: 'IN_PROGRESS', stage: 'APPEAL' });
  });

  it('reopening a case closed before stage logs existed falls back to PRE_LITIGATION', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, status: 'ARCHIVED', stage: 'CLOSING' });
    prisma.caseStatusLog.findFirst.mockResolvedValue(null);

    await service.reopen(user, 'case-1');

    expect(prisma.case.update.mock.calls[0][0].data).toMatchObject({ stage: 'PRE_LITIGATION' });
    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({ stageTransition: { from: 'CLOSING', to: 'PRE_LITIGATION' } }),
    );
  });

  it('close requires an outcome other than IN_PROGRESS', async () => {
    const errors = async (body: object) =>
      (await validate(plainToInstance(CloseCaseDto, { closingSummary: 'สรุปคดีอย่างน้อยสิบตัวอักษร', ...body }))).length;
    expect(await errors({})).toBeGreaterThan(0);
    expect(await errors({ outcome: 'IN_PROGRESS' })).toBeGreaterThan(0);
    expect(await errors({ outcome: 'SETTLED' })).toBe(0);
  });
});
```

Append to `apps/api/src/common/services/case-feed.service.spec.ts` (inside the `describe`):

```ts
  it('writes a stage-only move as one CaseStatusLog row with the unchanged status', async () => {
    await service.log({
      caseId: 'case-1', userId: 'u1', type: ActivityType.STAGE_CHANGE, title: 'ขั้นตอน',
      stageTransition: { from: 'HEARING', to: 'FILING', note: 'แก้คำฟ้อง', status: CaseStatus.IN_PROGRESS },
    });

    expect(prisma.caseStatusLog.create).toHaveBeenCalledWith({
      data: {
        caseId: 'case-1', fromStatus: 'IN_PROGRESS', toStatus: 'IN_PROGRESS',
        fromStage: 'HEARING', toStage: 'FILING', note: 'แก้คำฟ้อง', changedById: 'u1',
      },
    });
  });

  it('combines a status and a stage change into one row', async () => {
    await service.log({
      caseId: 'case-1', userId: 'u1', type: ActivityType.STATUS_CHANGE, title: 'ปิดคดี',
      statusTransition: { from: CaseStatus.IN_PROGRESS, to: CaseStatus.CLOSED },
      stageTransition: { from: 'HEARING', to: 'CLOSING' },
    });

    expect(prisma.caseStatusLog.create).toHaveBeenLastCalledWith({
      data: {
        caseId: 'case-1', fromStatus: 'IN_PROGRESS', toStatus: 'CLOSED',
        fromStage: 'HEARING', toStage: 'CLOSING', note: null, changedById: 'u1',
      },
    });
  });
```

Replace `apps/web/src/lib/stage-labels.test.ts` with:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBackwardStage } from '@lawfirm/shared';
import { caseStageLabel, caseStageOptions } from './stage-labels.ts';

test('case stages follow the litigation flow, closing last', () => {
  assert.deepEqual(
    caseStageOptions('th').map(({ label }) => label),
    ['รวบรวมข้อเท็จจริง', 'ก่อนฟ้อง', 'ยื่นฟ้อง', 'ยื่นคำให้การ', 'ไกล่เกลี่ย', 'สืบพยาน', 'รอคำพิพากษา', 'อุทธรณ์', 'ฎีกา', 'บังคับคดี', 'ปิดคดี'],
  );
});

test('the hidden intake-review alias has its own label', () => {
  assert.equal(caseStageLabel('INTAKE_REVIEW', 'th'), 'รับเรื่อง/ตรวจรับงาน');
  assert.equal(caseStageLabel('INTAKE_REVIEW', 'en'), 'Intake review');
});

test('backward means earlier in CASE_STAGE_ORDER; intake review sorts first', () => {
  assert.equal(isBackwardStage('HEARING', 'FILING'), true);
  assert.equal(isBackwardStage('FILING', 'HEARING'), false);
  assert.equal(isBackwardStage('INTAKE_REVIEW', 'FACT_GATHERING'), false);
  assert.equal(isBackwardStage('FACT_GATHERING', 'INTAKE_REVIEW'), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/cases/case-stages.spec.ts src/common/services/case-feed.service.spec.ts`
Expected: FAIL — no `stageTransition` passed, backward move accepted, reopen leaves the stage, `outcome` optional.

Run: `pnpm --filter web test`
Expected: FAIL — old order, `isBackwardStage` missing.

- [ ] **Step 3: Shared order and helpers**

In `packages/shared/src/index.ts` replace `CASE_STAGE_ORDER` with:

```ts
export const CASE_STAGE_ORDER: CaseStage[] = [
  CaseStage.FACT_GATHERING,
  CaseStage.PRE_LITIGATION,
  CaseStage.FILING,
  CaseStage.ANSWER,
  CaseStage.MEDIATION,
  CaseStage.HEARING,
  CaseStage.AWAITING_JUDGMENT,
  CaseStage.APPEAL,
  CaseStage.SUPREME,
  CaseStage.ENFORCEMENT,
  CaseStage.CLOSING,
];

/** Position in CASE_STAGE_ORDER; INTAKE_REVIEW (hidden alias) is −1, before everything. */
export function caseStageIndex(stage: CaseStage | string | null | undefined): number {
  return CASE_STAGE_ORDER.indexOf(stage as CaseStage);
}

/** Moving to an earlier stage — needs a note. */
export function isBackwardStage(from: CaseStage | string | null | undefined, to: CaseStage | string): boolean {
  return caseStageIndex(to) < caseStageIndex(from);
}
```

and in `CASE_STAGE_LABELS_TH` set `[CaseStage.INTAKE_REVIEW]: 'รับเรื่อง/ตรวจรับงาน',`. Run `pnpm --filter @lawfirm/shared build`.

In `apps/web/src/lib/stage-labels.ts` set `[CaseStage.INTAKE_REVIEW]: 'รับเรื่อง/ตรวจรับงาน'` in `CASE_STAGE_TH` and `[CaseStage.INTAKE_REVIEW]: 'Intake review'` in `CASE_STAGE_EN`.

- [ ] **Step 4: Case feed writes stage rows**

In `apps/api/src/common/services/case-feed.service.ts` add `CaseStage` to the `@lawfirm/shared` import, add to the `params` type:

```ts
    /** ขั้นตอนที่ย้าย — ลง `CaseStatusLog` (fromStage/toStage/note); status คงเดิมถ้าไม่ได้ส่ง statusTransition */
    stageTransition?: {
      from: CaseStage | string;
      to: CaseStage | string;
      note?: string | null;
      status?: CaseStatus | string;
    };
```

and replace the `if (params.statusTransition) { … }` block with:

```ts
      if (params.statusTransition || params.stageTransition) {
        const stage = params.stageTransition;
        const status = params.statusTransition;
        await db.caseStatusLog.create({
          data: {
            caseId: params.caseId,
            fromStatus: (status?.from ?? stage?.status) as never,
            toStatus: (status?.to ?? stage?.status) as never,
            ...(stage
              ? { fromStage: stage.from as never, toStage: stage.to as never, note: stage.note ?? null }
              : {}),
            changedById: params.userId,
          },
        });
      }
```

(The existing status-only test still sees exactly `{ caseId, fromStatus, toStatus, changedById }`.)

- [ ] **Step 5: DTOs**

`apps/api/src/cases/dto/case.dto.ts` — in `UpdateCaseDto`, after `stage?: CaseStage;`:

```ts
  /** เหตุผลเมื่อย้ายขั้นตอนย้อนกลับ — บังคับในกรณีนั้น เก็บใน CaseStatusLog.note */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  stageNote?: string;
```

(add `MaxLength` to the class-validator import if missing).

`apps/api/src/cases/dto/close-case.dto.ts` — replace the `outcome` field with:

```ts
  /** ผลของคดี — บังคับตอนปิด; IN_PROGRESS ไม่ใช่ผล */
  @IsIn(Object.values(CaseOutcome).filter((o) => o !== CaseOutcome.IN_PROGRESS), {
    message: 'เลือกผลคดีก่อนปิด',
  })
  outcome!: CaseOutcome;
```

and change the import to `import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';`.

- [ ] **Step 6: Service**

In `apps/api/src/cases/cases.service.ts` add `isBackwardStage` to the `@lawfirm/shared` import.

`update` — right after `const before = await this.findOne(user, id);` insert:

```ts
    if (dto.status === CaseStatus.CLOSED || dto.status === CaseStatus.ARCHIVED) {
      throw new BadRequestException('ใช้ปุ่มปิดคดี');
    }
    const stageChanged = !!dto.stage && dto.stage !== before.stage;
    const stageNote = dto.stageNote?.trim() || null;
    if (stageChanged && isBackwardStage(before.stage, dto.stage!) && !stageNote) {
      throw new BadRequestException('ย้ายขั้นตอนย้อนกลับต้องระบุเหตุผล');
    }
```

delete the later `const stageChanged = …` line, change `const { customFields, customers, ...rest } = dto;` to `const { customFields, customers, stageNote: _stageNote, ...rest } = dto;`, and replace the `if (stageChanged) { … }` feed call with:

```ts
    if (stageChanged) {
      await this.caseFeed.log({
        caseId: id,
        userId: user.id,
        type: ActivityType.STAGE_CHANGE,
        title: `ขั้นตอนคดี: ${before.stage} → ${dto.stage}`,
        description: stageNote ?? undefined,
        stageTransition: { from: before.stage, to: dto.stage!, note: stageNote, status: updated.status },
      });
    }
```

`close` — set `outcome: dto.outcome,` in the update data (was `dto.outcome ?? undefined`), and add to its `caseFeed.log` call: `stageTransition: { from: legalCase.stage, to: CaseStage.CLOSING },`.

`reopen` — replace the body after the status guard with:

```ts
    // The stage the case was in before it was closed; cases closed before stage logs existed
    // (or closed from CLOSING itself) have none, so they reopen at PRE_LITIGATION.
    const lastClose = await this.prisma.caseStatusLog.findFirst({
      where: { caseId: id, toStage: CaseStage.CLOSING, fromStage: { not: CaseStage.CLOSING } },
      orderBy: { createdAt: 'desc' },
      select: { fromStage: true },
    });
    const stage = (lastClose?.fromStage as CaseStage | null) ?? CaseStage.PRE_LITIGATION;

    const reopened = await this.prisma.case.update({
      where: { id },
      data: {
        status: CaseStatus.IN_PROGRESS,
        stage,
        stageChangedAt: new Date(),
        closedAt: null,
        outcome: CaseOutcome.IN_PROGRESS,
      },
      include: this.caseInclude,
    });
    await this.caseFeed.log({
      caseId: id,
      userId: user.id,
      type: ActivityType.STATUS_CHANGE,
      title: 'เปิดคดีขึ้นมาใหม่ / Reopened',
      statusTransition: { from: legalCase.status, to: CaseStatus.IN_PROGRESS },
      stageTransition: { from: legalCase.stage, to: stage },
    });
    return reopened;
```

Update `apps/api/src/cases/cases-close-gate.spec.ts` only if a test there closes without `outcome` through the DTO — the service tests pass `outcome: 'WON'` already, so no change is expected.

- [ ] **Step 7: Web — backward note and required outcome**

`apps/web/src/app/(dashboard)/cases/[id]/page.tsx`:

1. Add `import { isBackwardStage } from '@lawfirm/shared';` (merge into an existing `@lawfirm/shared` import if present).
2. Replace `applyStageChange` with:

```tsx
  const applyStageChange = async (stage: string) => {
    if (!token || !id) return;
    let stageNote: string | undefined;
    if (isBackwardStage(legalCase?.stage, stage)) {
      stageNote = window.prompt('ย้ายขั้นตอนย้อนกลับ — ระบุเหตุผล (จะบันทึกในประวัติคดี)')?.trim();
      if (!stageNote) return;
    }
    await api.updateCase(token, id, { stage, ...(stageNote ? { stageNote } : {}) });
    loadCase();
  };
```

3. In the close form `<select value={closingOutcome} …>` add `required`, change `<option value="">ไม่ระบุ</option>` to `<option value="" disabled>เลือกผลคดี</option>`, and add `!closingOutcome ||` at the start of the submit button's `disabled` expression. In the `closeCase` call change `outcome: closingOutcome || undefined,` to `outcome: closingOutcome,`.

- [ ] **Step 8: Mobile**

`apps/mobile/app/case/[id]/close.tsx`:
- change the first `outcomes` entry to `{ value: '', label: 'เลือกผลคดี' }`;
- in `submit`'s body use `{ closingSummary: summary.trim(), outcome, acknowledgeOutstanding: acknowledged }`;
- add `!outcome ||` at the start of the `disabled={action === 'close' && (…)}` condition.

`apps/mobile/app/case/new.tsx` — delete the line `...(['CLOSED', 'ARCHIVED'].includes(status) ? [{ value: status, label: … }] : [])]} />}` and close the options array after the PENDING entry (`{ value: 'PENDING', label: 'รอดำเนินการ' }]} />}`); keep the `disabled` guard so a closed case's status cannot be edited here (closing/reopening goes through `/case/[id]/close`).

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/cases src/common/services src/practice-setup src/operations`
Expected: PASS.

Run: `pnpm --filter web test && pnpm --filter web exec tsc --noEmit && pnpm --filter @lawfirm/mobile typecheck && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS / no errors.

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add packages/shared/src/index.ts apps/web/src/lib/stage-labels.ts apps/web/src/lib/stage-labels.test.ts apps/api/src/common/services/case-feed.service.ts apps/api/src/common/services/case-feed.service.spec.ts apps/api/src/cases "apps/web/src/app/(dashboard)/cases/[id]/page.tsx" apps/mobile/app/case/new.tsx "apps/mobile/app/case/[id]/close.tsx"
/usr/bin/git commit -m "feat(cases): litigation stage order, stage log with backward note, close requires outcome, reopen restores stage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Limitation reminder ("ครบอายุความ") for every case

**Files:**
- Create: `apps/api/src/common/limitation-reminder.ts`, `apps/api/src/common/limitation-reminder.spec.ts`
- Create: `apps/api/prisma/migrations/20261011130200_limitation_reminders/migration.sql`
- Modify: `apps/api/src/insurance-claims/limitation-deadline.service.ts` (delegate), `apps/api/src/insurance-claims/insurance-claims.service.ts` (accept `string | null`)
- Modify: `apps/api/src/cases/dto/case.dto.ts` (`limitationDeadline` on `CreateCaseDto` and `UpdateCaseDto`), `apps/api/src/cases/cases.service.ts` (`create`, `update`)
- Modify: `apps/api/src/intake/intake.service.ts` (`openCaseFromIntake` ~:1125, `attachToExistingCase` ~:1333)
- Test: `apps/api/src/common/limitation-reminder.spec.ts`

**Interfaces:**
- Consumes: Task 1 `Case.limitationEventId`, `CaseProceeding`; Task 2 `courtCloseAt`.
- Produces: `LIMITATION_EVENT_TITLE = 'ครบอายุความ'`; `LIMITATION_REMINDER_MINUTES = [129600, 43200, 10080, 1440]` (90/30/7/1 days); `syncLimitationReminder(db: LimitationDb, caseId: string): Promise<string | null>` — idempotent: creates, moves or deletes the one DEADLINE event so it matches `Case.limitationDeadline`; no event once the case is filed (a `CaseProceeding` with `filedAt`, `blackCaseNumber` **or** `judgmentAt`). Every writer of `limitationDeadline`, `filedAt` or a proceeding's black number calls it afterwards (Task 10 calls it from the proceedings service). `CreateCaseDto.limitationDeadline?: string` / `UpdateCaseDto.limitationDeadline?: string | null` (ISO date).

Decision: "a FILED proceeding exists" is read as "the case has a proceeding with `filedAt`, a black case number or a judgment" — a black number is only issued on filing, backfilled proceedings (Task 9) have numbers but no filing date, and spec L3 also clears the reminder when a judgment is recorded.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/limitation-reminder.spec.ts`:

```ts
import { LIMITATION_REMINDER_MINUTES, syncLimitationReminder } from './limitation-reminder';

describe('syncLimitationReminder', () => {
  const db = () => ({
    case: { findUnique: jest.fn(), update: jest.fn() },
    caseProceeding: { count: jest.fn().mockResolvedValue(0) },
    calendarEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'evt-new' }),
      update: jest.fn(),
      delete: jest.fn(),
    },
    reminderLog: { deleteMany: jest.fn() },
  });
  const caseRow = (over: object = {}) => ({
    limitationDeadline: new Date('2027-03-01T00:00:00.000Z'),
    limitationEventId: null,
    leadLawyerId: 'lead-1',
    ...over,
  });

  it('creates one DEADLINE event at 16:30 Bangkok with 90/30/7/1-day reminders and links it', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow());

    expect(await syncLimitationReminder(d as never, 'case-1')).toBe('evt-new');

    expect(d.calendarEvent.create).toHaveBeenCalledWith({
      data: {
        caseId: 'case-1',
        title: 'ครบอายุความ',
        type: 'DEADLINE',
        startAt: new Date('2027-03-01T09:30:00.000Z'),
        reminderMinutes: [129600, 43200, 10080, 1440],
        assigneeId: 'lead-1',
        assignees: { create: [{ userId: 'lead-1' }] },
      },
      select: { id: true },
    });
    expect(d.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { limitationEventId: 'evt-new' } });
    expect(LIMITATION_REMINDER_MINUTES).toEqual([90 * 1440, 30 * 1440, 7 * 1440, 1440]);
  });

  it('moves the existing event when the deadline changes and resets sent reminders', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationEventId: 'evt-1' }));
    d.calendarEvent.findUnique.mockResolvedValue({ id: 'evt-1', startAt: new Date('2027-01-01T09:30:00.000Z') });

    expect(await syncLimitationReminder(d as never, 'case-1')).toBe('evt-1');

    expect(d.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { startAt: new Date('2027-03-01T09:30:00.000Z'), title: 'ครบอายุความ', reminderMinutes: LIMITATION_REMINDER_MINUTES },
    });
    expect(d.reminderLog.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'evt-1' } });
    expect(d.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('is a no-op when the event already matches', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationEventId: 'evt-1' }));
    d.calendarEvent.findUnique.mockResolvedValue({ id: 'evt-1', startAt: new Date('2027-03-01T09:30:00.000Z') });

    await syncLimitationReminder(d as never, 'case-1');

    expect(d.calendarEvent.update).not.toHaveBeenCalled();
    expect(d.case.update).not.toHaveBeenCalled();
  });

  it('removes the event when the deadline is cleared', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationDeadline: null, limitationEventId: 'evt-1' }));
    d.calendarEvent.findUnique.mockResolvedValue({ id: 'evt-1', startAt: new Date() });

    expect(await syncLimitationReminder(d as never, 'case-1')).toBeNull();

    expect(d.calendarEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
    expect(d.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { limitationEventId: null } });
  });

  it('removes the event once the case is filed', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationEventId: 'evt-1' }));
    d.calendarEvent.findUnique.mockResolvedValue({ id: 'evt-1', startAt: new Date() });
    d.caseProceeding.count.mockResolvedValue(1);

    expect(await syncLimitationReminder(d as never, 'case-1')).toBeNull();

    expect(d.caseProceeding.count).toHaveBeenCalledWith({
      where: {
        caseId: 'case-1',
        OR: [{ filedAt: { not: null } }, { blackCaseNumber: { not: null } }, { judgmentAt: { not: null } }],
      },
    });
    expect(d.calendarEvent.delete).toHaveBeenCalled();
  });

  it('recreates the event when the linked one was deleted by hand', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationEventId: 'gone' }));
    d.calendarEvent.findUnique.mockResolvedValue(null);

    expect(await syncLimitationReminder(d as never, 'case-1')).toBe('evt-new');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api exec jest --config jest.config.js src/common/limitation-reminder.spec.ts`
Expected: FAIL — `Cannot find module './limitation-reminder'`.

- [ ] **Step 3: Implement the helper**

Create `apps/api/src/common/limitation-reminder.ts`:

```ts
import { EventType } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { bangkokDayKey, courtCloseAt } from './utils/bangkok-time';

export const LIMITATION_EVENT_TITLE = 'ครบอายุความ';
/** 90, 30, 7 and 1 day(s) before. */
export const LIMITATION_REMINDER_MINUTES = [90, 30, 7, 1].map((days) => days * 1440);

export type LimitationDb = Pick<
  PrismaService | Prisma.TransactionClient,
  'case' | 'caseProceeding' | 'calendarEvent' | 'reminderLog'
>;

/**
 * Keeps exactly one "ครบอายุความ" DEADLINE event per case in step with
 * Case.limitationDeadline. Plain function over a Prisma client so cases,
 * intake, insurance claims and proceedings can all call it (inside their
 * transaction when they have one) without new module edges.
 *
 * @returns the linked event id, or null when the case needs no reminder —
 *   no deadline, or already filed (a proceeding with a filing date, a black number or a judgment).
 */
export async function syncLimitationReminder(db: LimitationDb, caseId: string): Promise<string | null> {
  const legalCase = await db.case.findUnique({
    where: { id: caseId },
    select: { limitationDeadline: true, limitationEventId: true, leadLawyerId: true },
  });
  if (!legalCase) return null;

  const filed = await db.caseProceeding.count({
    where: {
      caseId,
      OR: [{ filedAt: { not: null } }, { blackCaseNumber: { not: null } }, { judgmentAt: { not: null } }],
    },
  });
  const existing = legalCase.limitationEventId
    ? await db.calendarEvent.findUnique({
        where: { id: legalCase.limitationEventId },
        select: { id: true, startAt: true },
      })
    : null;

  if (!legalCase.limitationDeadline || filed > 0) {
    if (existing) await db.calendarEvent.delete({ where: { id: existing.id } });
    if (legalCase.limitationEventId) {
      await db.case.update({ where: { id: caseId }, data: { limitationEventId: null } });
    }
    return null;
  }

  // The last day to file — due when the court counter closes.
  const startAt = courtCloseAt(bangkokDayKey(legalCase.limitationDeadline));
  if (existing) {
    if (existing.startAt.getTime() !== startAt.getTime()) {
      await db.calendarEvent.update({
        where: { id: existing.id },
        data: { startAt, title: LIMITATION_EVENT_TITLE, reminderMinutes: LIMITATION_REMINDER_MINUTES },
      });
      // Reminders already sent for the old date must fire again for the new one.
      await db.reminderLog.deleteMany({ where: { eventId: existing.id } });
    }
    return existing.id;
  }

  const event = await db.calendarEvent.create({
    data: {
      caseId,
      title: LIMITATION_EVENT_TITLE,
      type: EventType.DEADLINE,
      startAt,
      reminderMinutes: LIMITATION_REMINDER_MINUTES,
      assigneeId: legalCase.leadLawyerId,
      assignees: { create: [{ userId: legalCase.leadLawyerId }] },
    },
    select: { id: true },
  });
  await db.case.update({ where: { id: caseId }, data: { limitationEventId: event.id } });
  return event.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter api exec jest --config jest.config.js src/common/limitation-reminder.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire every writer of `limitationDeadline`**

`apps/api/src/cases/dto/case.dto.ts` — add to `CreateCaseDto` (after `claimedAmount`):

```ts
  /** วันครบอายุความ — ระบบตั้งเตือน "ครบอายุความ" ให้ 90/30/7/1 วันก่อน */
  @IsOptional()
  @IsDateString()
  limitationDeadline?: string;
```

and to `UpdateCaseDto`:

```ts
  /** null ล้างวันครบอายุความ (และลบการเตือน) */
  @IsOptional()
  @IsDateString()
  limitationDeadline?: string | null;
```

(add `IsDateString` to the class-validator import if missing).

`apps/api/src/cases/cases.service.ts`:
1. `import { syncLimitationReminder } from '../common/limitation-reminder';`
2. In `create`, add to the `insertCase` data: `limitationDeadline: dto.limitationDeadline ? new Date(dto.limitationDeadline) : undefined,`; right after the `caseFeed.log` "เปิดคดี" call add `if (dto.limitationDeadline) await syncLimitationReminder(this.prisma, created.id);`.
3. In `update`, add `limitationDeadline: dto.limitationDeadline === undefined ? undefined : dto.limitationDeadline ? new Date(dto.limitationDeadline) : null,` to the `case.update` data (after `...rest`), and after the update:

```ts
    if (dto.limitationDeadline !== undefined) {
      await syncLimitationReminder(this.prisma, id);
    }
```

`apps/api/src/intake/intake.service.ts`:
1. `import { syncLimitationReminder } from '../common/limitation-reminder';`
2. In `openCaseFromIntake`, after the `caseFeed.log` "เปิดคดี" call: `if (newCase.limitationDeadline) await syncLimitationReminder(this.prisma, newCase.id);`
3. In `attachToExistingCase`, after `const updatedCase = await this.prisma.case.update(…)`: `await syncLimitationReminder(this.prisma, relatedCase.id);`

`apps/api/src/insurance-claims/limitation-deadline.service.ts` — replace with:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { syncLimitationReminder } from '../common/limitation-reminder';

const LIMITATION_YEARS = 2;

/** Insurance claims: อายุความ 2 ปีนับแต่วันวินาศภัย (ป.พ.พ. ม.882); the reminder itself is the shared one. */
@Injectable()
export class LimitationDeadlineService {
  constructor(private prisma: PrismaService) {}

  computeDeadline(incidentDate: Date): Date {
    const deadline = new Date(incidentDate);
    deadline.setFullYear(deadline.getFullYear() + LIMITATION_YEARS);
    return deadline;
  }

  /** @returns the case's "ครบอายุความ" event id, or null once the case is filed. */
  async applyIncidentDate(caseId: string, incidentDate: Date, _existingEventId?: string | null): Promise<string | null> {
    await this.prisma.case.update({
      where: { id: caseId },
      data: { limitationDeadline: this.computeDeadline(incidentDate) },
    });
    return syncLimitationReminder(this.prisma, caseId);
  }
}
```

In `apps/api/src/insurance-claims/insurance-claims.service.ts` nothing else changes except the type: `limitationEventId` already accepts `string | null`. If `insurance-claims.module.ts` imports `CalendarModule` only for this service, leave the import (other providers may use it).

- [ ] **Step 6: Backfill migration**

Create `apps/api/prisma/migrations/20261011130200_limitation_reminders/migration.sql`:

```sql
-- Spec L4: one "ครบอายุความ" DEADLINE event per open, unfiled case with a limitationDeadline.
-- Reminders 90/30/7/1 days before; due 16:30 Bangkok (09:30 UTC) on the Bangkok day of the deadline.

-- 1. Insurance claims already created an event; adopt it as the case's.
UPDATE "Case" c
   SET "limitationEventId" = ic."limitationEventId"
  FROM "InsuranceClaim" ic
 WHERE ic."caseId" = c."id"
   AND ic."limitationEventId" IS NOT NULL
   AND c."limitationEventId" IS NULL
   AND EXISTS (SELECT 1 FROM "CalendarEvent" e WHERE e."id" = ic."limitationEventId");

-- 2. Create the missing events.
WITH targets AS (
  SELECT c."id" AS case_id, c."leadLawyerId" AS lead_id,
         (((c."limitationDeadline" + INTERVAL '7 hours')::date)::timestamp + INTERVAL '9 hours 30 minutes') AS start_at,
         gen_random_uuid()::text AS event_id
    FROM "Case" c
   WHERE c."limitationDeadline" IS NOT NULL
     AND c."limitationEventId" IS NULL
     AND c."blackCaseNumber" IS NULL
     AND c."deletedAt" IS NULL
     AND c."status" NOT IN ('CLOSED', 'ARCHIVED')
), created AS (
  INSERT INTO "CalendarEvent" ("id", "caseId", "assigneeId", "title", "startAt", "type", "reminderMinutes", "createdAt", "updatedAt")
  SELECT event_id, case_id, lead_id, 'ครบอายุความ', start_at, 'DEADLINE'::"EventType", ARRAY[129600, 43200, 10080, 1440],
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM targets
  RETURNING "id", "caseId", "assigneeId"
), people AS (
  INSERT INTO "CalendarEventAssignee" ("eventId", "userId")
  SELECT "id", "assigneeId" FROM created
)
UPDATE "Case" c SET "limitationEventId" = created."id" FROM created WHERE created."caseId" = c."id";

-- 3. Every linked event (adopted or new) gets the shared title, time and reminders.
UPDATE "CalendarEvent" e
   SET "title" = 'ครบอายุความ',
       "reminderMinutes" = ARRAY[129600, 43200, 10080, 1440],
       "startAt" = (((c."limitationDeadline" + INTERVAL '7 hours')::date)::timestamp + INTERVAL '9 hours 30 minutes'),
       "updatedAt" = CURRENT_TIMESTAMP
  FROM "Case" c
 WHERE c."limitationEventId" = e."id" AND c."limitationDeadline" IS NOT NULL;
```

Apply:

```bash
cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261011130200_limitation_reminders/migration.sql && pnpm exec prisma migrate resolve --applied 20261011130200_limitation_reminders && cd ../..
psql "$DATABASE_URL" -c "SELECT count(*) FILTER (WHERE \"limitationEventId\" IS NULL) AS missing FROM \"Case\" WHERE \"limitationDeadline\" IS NOT NULL AND \"blackCaseNumber\" IS NULL AND \"deletedAt\" IS NULL AND status NOT IN ('CLOSED','ARCHIVED');"
```

Expected: `missing = 0`.

- [ ] **Step 7: Run related suites and typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js src/common src/cases src/intake src/insurance-claims && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS / no errors. If an intake or cases spec mock lacks `caseProceeding`/`calendarEvent`, add `caseProceeding: { count: jest.fn().mockResolvedValue(0) }` and the `calendarEvent` mocks shown in Step 1 to that spec's prisma mock (the helper only runs when a deadline is present, so most specs are unaffected).

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/api/src/common/limitation-reminder.ts apps/api/src/common/limitation-reminder.spec.ts apps/api/prisma/migrations/20261011130200_limitation_reminders apps/api/src/insurance-claims apps/api/src/cases apps/api/src/intake/intake.service.ts
/usr/bin/git commit -m "feat(cases): limitation reminder event for every case with an อายุความ date

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Court proceedings — mirror, backfill, court-level sync, template fields

**Files:**
- Create: `apps/api/src/cases/proceeding-mirror.ts`, `apps/api/src/cases/proceeding-mirror.spec.ts`
- Create: `apps/api/prisma/migrations/20261011130300_case_proceedings_backfill/migration.sql`
- Modify: `apps/api/src/cases/cases.service.ts` (`caseInclude` gains `proceedings`; `update` writes numbers into the current proceeding and syncs the court level on APPEAL/SUPREME)
- Modify: `apps/api/src/templates/templates.service.ts` (`render`), `apps/api/src/templates/templates.service.spec.ts`
- Test: `apps/api/src/cases/case-stages.spec.ts` (append)

**Interfaces:**
- Consumes: Task 1 `CaseProceeding`; Task 7 `stageTransition` logging, `case-stages.spec.ts` harness; Task 8 `syncLimitationReminder`.
- Produces:
  - `type ProceedingDb = Pick<PrismaService | Prisma.TransactionClient, 'case' | 'caseProceeding'>`
  - `ensureProceeding(db: ProceedingDb, caseId: string, courtLevel: CourtLevel): Promise<CaseProceeding>` — upsert on `caseId_courtLevel`; a new APPEAL/SUPREME row gets `courtName = COURT_LEVEL_LABELS[level]`, a new TRIAL row copies `Case.courtName`.
  - `mirrorProceeding(db: ProceedingDb, caseId: string): Promise<void>` — copies `courtName/blackCaseNumber/redCaseNumber` of the proceeding at `Case.courtLevel ?? TRIAL` onto the case (no-op when there is none).
  - `saveCaseNumbers(db: ProceedingDb, caseId: string, level: CourtLevel, fields: { courtName?: string | null; blackCaseNumber?: string | null; redCaseNumber?: string | null }): Promise<void>` — writes edited numbers into that level's proceeding (creating it).
  - The current proceeding **is** the one at `Case.courtLevel` (TRIAL when null); `Case.blackCaseNumber/redCaseNumber/courtName/courtLevel` always mirror it.
  - `GET /cases/:id` (and every response using `caseInclude`) now includes `proceedings: CaseProceeding[]` ordered TRIAL → APPEAL → SUPREME (sorted in code by `COURT_LEVEL_ORDER`).
  - `COURT_LEVEL_ORDER: CourtLevel[] = [TRIAL, APPEAL, SUPREME]` exported from `proceeding-mirror.ts`.
  - Template variables `trialCourtName`, `trialBlackCaseNumber`, `trialRedCaseNumber`, `appealBlackCaseNumber`, `appealRedCaseNumber`, `supremeBlackCaseNumber`, `supremeRedCaseNumber`; `plaintiffNames`/`defendantNames` also count PETITIONER/RESPONDENT.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/cases/proceeding-mirror.spec.ts`:

```ts
import { CourtLevel } from '@lawfirm/shared';
import { ensureProceeding, mirrorProceeding, saveCaseNumbers } from './proceeding-mirror';

const fakeDb = () => ({
  case: { findUnique: jest.fn(), update: jest.fn() },
  caseProceeding: {
    upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'p', ...create })),
    findUnique: jest.fn(),
  },
});

describe('proceeding mirror', () => {
  it('a new appeal proceeding is named after the court level', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ courtName: 'ศาลแพ่ง' });

    await ensureProceeding(db as never, 'case-1', CourtLevel.APPEAL);

    expect(db.caseProceeding.upsert).toHaveBeenCalledWith({
      where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'APPEAL' } },
      create: { caseId: 'case-1', courtLevel: 'APPEAL', courtName: 'ศาลอุทธรณ์' },
      update: {},
    });
  });

  it('a new trial proceeding copies the case court', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ courtName: 'ศาลแพ่ง' });

    await ensureProceeding(db as never, 'case-1', CourtLevel.TRIAL);

    expect(db.caseProceeding.upsert.mock.calls[0][0].create.courtName).toBe('ศาลแพ่ง');
  });

  it('mirrors the proceeding at the case court level onto the case', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ courtLevel: 'APPEAL' });
    db.caseProceeding.findUnique.mockResolvedValue({
      courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'พ.123/2570', redCaseNumber: null,
    });

    await mirrorProceeding(db as never, 'case-1');

    expect(db.caseProceeding.findUnique).toHaveBeenCalledWith({
      where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'APPEAL' } },
    });
    expect(db.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'พ.123/2570', redCaseNumber: null },
    });
  });

  it('does not touch the case when the current level has no proceeding', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ courtLevel: null });
    db.caseProceeding.findUnique.mockResolvedValue(null);

    await mirrorProceeding(db as never, 'case-1');

    expect(db.case.update).not.toHaveBeenCalled();
  });

  it('saves edited numbers into that level’s proceeding, empty strings as null', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ courtName: 'ศาลแพ่ง' });

    await saveCaseNumbers(db as never, 'case-1', CourtLevel.TRIAL, { blackCaseNumber: 'พ.1/2569', redCaseNumber: '' });

    expect(db.caseProceeding.upsert).toHaveBeenCalledWith({
      where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'TRIAL' } },
      create: { caseId: 'case-1', courtLevel: 'TRIAL', courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569', redCaseNumber: null },
      update: { blackCaseNumber: 'พ.1/2569', redCaseNumber: null },
    });
  });
});
```

Append to `apps/api/src/cases/case-stages.spec.ts` (inside the `describe`; add `caseProceeding: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },` to the `prisma` object in `beforeEach`):

```ts
  it('entering APPEAL sets the court level and opens an appeal proceeding', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, stage: 'AWAITING_JUDGMENT', courtLevel: 'TRIAL' });

    await service.update(user, 'case-1', { stage: 'APPEAL' } as any);

    expect(prisma.caseProceeding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'APPEAL' } } }),
    );
    expect(prisma.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { courtLevel: 'APPEAL' } });
  });

  it('editing the black number on the overview writes it into the current proceeding', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, courtLevel: 'TRIAL', courtName: 'ศาลแพ่ง' });

    await service.update(user, 'case-1', { blackCaseNumber: 'พ.9/2569' } as any);

    expect(prisma.caseProceeding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'TRIAL' } },
        update: { blackCaseNumber: 'พ.9/2569' },
      }),
    );
  });
```

In `apps/api/src/templates/templates.service.spec.ts` add to the `legalCase` fixture:

```ts
  proceedings: [
    { courtLevel: 'TRIAL', courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569', redCaseNumber: 'พ.9/2570' },
    { courtLevel: 'APPEAL', courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'อ.5/2570', redCaseNumber: null },
  ],
```

and add a test inside `describe('render', …)`:

```ts
    it('fills per-level case numbers from the proceedings', async () => {
      mockPrisma.documentTemplate.findFirst.mockResolvedValue({
        name: 'อุทธรณ์',
        templateBody: '{{trialBlackCaseNumber}} {{trialRedCaseNumber}} {{appealBlackCaseNumber}} {{trialCourtName}}',
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);

      const result = await service.render('firm-1', 'tpl-1', 'case-1');

      expect(result?.content).toBe('พ.1/2569 พ.9/2570 อ.5/2570 ศาลแพ่ง');
      expect(mockPrisma.case.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ include: expect.objectContaining({ proceedings: true }) }),
      );
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/cases/proceeding-mirror.spec.ts src/cases/case-stages.spec.ts src/templates`
Expected: FAIL — module not found; no upsert on APPEAL; template vars empty.

- [ ] **Step 3: Mirror helpers**

Create `apps/api/src/cases/proceeding-mirror.ts`:

```ts
import { COURT_LEVEL_LABELS, CourtLevel } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';

export type ProceedingDb = Pick<PrismaService | Prisma.TransactionClient, 'case' | 'caseProceeding'>;

export const COURT_LEVEL_ORDER: CourtLevel[] = [CourtLevel.TRIAL, CourtLevel.APPEAL, CourtLevel.SUPREME];

const key = (caseId: string, courtLevel: CourtLevel) => ({ caseId_courtLevel: { caseId, courtLevel } });
const blankToNull = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() ? value.trim() : null;

/**
 * The case's proceeding at `courtLevel`, created when missing. A trial
 * proceeding starts with the case's court; a higher one with the court level's name.
 */
export async function ensureProceeding(db: ProceedingDb, caseId: string, courtLevel: CourtLevel) {
  const legalCase = await db.case.findUnique({ where: { id: caseId }, select: { courtName: true } });
  return db.caseProceeding.upsert({
    where: key(caseId, courtLevel),
    create: {
      caseId,
      courtLevel,
      courtName: courtLevel === CourtLevel.TRIAL ? legalCase?.courtName ?? null : COURT_LEVEL_LABELS[courtLevel],
    },
    update: {},
  });
}

/**
 * Case.courtName / blackCaseNumber / redCaseNumber mirror the proceeding at
 * Case.courtLevel (TRIAL when unset), so templates, print forms and lists that
 * read the case keep working.
 */
export async function mirrorProceeding(db: ProceedingDb, caseId: string): Promise<void> {
  const legalCase = await db.case.findUnique({ where: { id: caseId }, select: { courtLevel: true } });
  const level = (legalCase?.courtLevel as CourtLevel | null) ?? CourtLevel.TRIAL;
  const current = await db.caseProceeding.findUnique({ where: key(caseId, level) });
  if (!current) return;
  await db.case.update({
    where: { id: caseId },
    data: {
      courtName: current.courtName,
      blackCaseNumber: current.blackCaseNumber,
      redCaseNumber: current.redCaseNumber,
    },
  });
}

/** Numbers edited on the case itself belong to the proceeding at that level. */
export async function saveCaseNumbers(
  db: ProceedingDb,
  caseId: string,
  courtLevel: CourtLevel,
  fields: { courtName?: string | null; blackCaseNumber?: string | null; redCaseNumber?: string | null },
): Promise<void> {
  const update = Object.fromEntries(
    Object.entries({
      courtName: blankToNull(fields.courtName),
      blackCaseNumber: blankToNull(fields.blackCaseNumber),
      redCaseNumber: blankToNull(fields.redCaseNumber),
    }).filter(([, value]) => value !== undefined),
  );
  const legalCase = await db.case.findUnique({ where: { id: caseId }, select: { courtName: true } });
  await db.caseProceeding.upsert({
    where: key(caseId, courtLevel),
    create: {
      caseId,
      courtLevel,
      courtName: courtLevel === CourtLevel.TRIAL ? legalCase?.courtName ?? null : COURT_LEVEL_LABELS[courtLevel],
      ...update,
    },
    update,
  });
}

export function sortProceedings<T extends { courtLevel: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => COURT_LEVEL_ORDER.indexOf(a.courtLevel as CourtLevel) - COURT_LEVEL_ORDER.indexOf(b.courtLevel as CourtLevel),
  );
}
```

- [ ] **Step 4: Cases service**

In `apps/api/src/cases/cases.service.ts`:

1. `import { ensureProceeding, mirrorProceeding, saveCaseNumbers } from './proceeding-mirror';` and add `CourtLevel` to the `@lawfirm/shared` import.
2. Add to `caseInclude`: `proceedings: true,` (the web sorts with the same order; the API returns rows as stored).
3. In `update`, after the `caseFeed.log` blocks (before the lead-lawyer block), add:

```ts
    // Numbers typed on the overview belong to the proceeding the case is at.
    if (dto.blackCaseNumber !== undefined || dto.redCaseNumber !== undefined || dto.courtName !== undefined) {
      await saveCaseNumbers(
        this.prisma,
        id,
        (updated.courtLevel as CourtLevel | null) ?? CourtLevel.TRIAL,
        { courtName: dto.courtName, blackCaseNumber: dto.blackCaseNumber, redCaseNumber: dto.redCaseNumber },
      );
    }
    // Entering APPEAL / SUPREME moves the case to that court (spec L2).
    if (stageChanged && (dto.stage === CaseStage.APPEAL || dto.stage === CaseStage.SUPREME)) {
      const level = dto.stage === CaseStage.APPEAL ? CourtLevel.APPEAL : CourtLevel.SUPREME;
      await ensureProceeding(this.prisma, id, level);
      if (updated.courtLevel !== level) {
        await this.prisma.case.update({ where: { id }, data: { courtLevel: level } });
        await mirrorProceeding(this.prisma, id);
      }
      return this.findOne(user, id);
    }
```

(`findOne` re-reads so the response carries the new level and proceeding.)

- [ ] **Step 5: Templates**

In `apps/api/src/templates/templates.service.ts`:
1. `const PLAINTIFF_ROLES = ['PLAINTIFF', 'JOINT_PLAINTIFF', 'PETITIONER'];` and `const DEFENDANT_ROLES = ['DEFENDANT', 'JOINT_DEFENDANT', 'RESPONDENT'];`
2. In `render`, change the case `include` to `{ caseType: true, leadLawyer: true, participants: true, client: true, proceedings: true }`.
3. Before `const vars`, add:

```ts
    const atLevel = (level: string) => legalCase.proceedings.find((p) => p.courtLevel === level);
    const trial = atLevel('TRIAL');
    const appeal = atLevel('APPEAL');
    const supreme = atLevel('SUPREME');
```

4. Add to `vars`:

```ts
      trialCourtName: trial?.courtName ?? '',
      trialBlackCaseNumber: trial?.blackCaseNumber ?? '',
      trialRedCaseNumber: trial?.redCaseNumber ?? '',
      appealBlackCaseNumber: appeal?.blackCaseNumber ?? '',
      appealRedCaseNumber: appeal?.redCaseNumber ?? '',
      supremeBlackCaseNumber: supreme?.blackCaseNumber ?? '',
      supremeRedCaseNumber: supreme?.redCaseNumber ?? '',
```

Give the existing fixtures without `proceedings` an empty list: add `proceedings: []` to any `mockPrisma.case.findUnique.mockResolvedValue({...})` object in the spec that does not spread `legalCase` (the shared fixture now has the field).

- [ ] **Step 6: Backfill migration**

Create `apps/api/prisma/migrations/20261011130300_case_proceedings_backfill/migration.sql`:

```sql
-- Spec L3: one proceeding per case that already has a black or red number, at the
-- case's current court level (TRIAL when unset), copied from the case's own fields.
INSERT INTO "CaseProceeding" ("id", "caseId", "courtLevel", "courtName", "blackCaseNumber", "redCaseNumber", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       c."id",
       COALESCE(c."courtLevel", 'TRIAL'::"CourtLevel"),
       NULLIF(TRIM(c."courtName"), ''),
       NULLIF(TRIM(c."blackCaseNumber"), ''),
       NULLIF(TRIM(c."redCaseNumber"), ''),
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
  FROM "Case" c
 WHERE NULLIF(TRIM(c."blackCaseNumber"), '') IS NOT NULL
    OR NULLIF(TRIM(c."redCaseNumber"), '') IS NOT NULL
ON CONFLICT ("caseId", "courtLevel") DO NOTHING;
```

Apply:

```bash
cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261011130300_case_proceedings_backfill/migration.sql && pnpm exec prisma migrate resolve --applied 20261011130300_case_proceedings_backfill && cd ../..
psql "$DATABASE_URL" -c "SELECT (SELECT count(*) FROM \"Case\" WHERE NULLIF(TRIM(\"blackCaseNumber\"),'') IS NOT NULL OR NULLIF(TRIM(\"redCaseNumber\"),'') IS NOT NULL) AS numbered, (SELECT count(DISTINCT \"caseId\") FROM \"CaseProceeding\") AS with_proceeding;"
```

Expected: `numbered = with_proceeding`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/cases src/templates && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS / no errors.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/api/src/cases apps/api/src/templates apps/api/prisma/migrations/20261011130300_case_proceedings_backfill
/usr/bin/git commit -m "feat(cases): court proceedings per level, case fields mirror the current one, per-level template fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Proceeding actions — filing, service, judgment, appeal copy (API)

**Files:**
- Create: `apps/api/src/cases/dto/proceeding.dto.ts`, `apps/api/src/cases/case-proceedings.service.ts`, `apps/api/src/cases/case-proceedings.controller.ts`, `apps/api/src/cases/case-proceedings.service.spec.ts`
- Modify: `apps/api/src/cases/cases.module.ts` (register; import `forwardRef(() => DeadlinesModule)`)

**Interfaces:**
- Consumes: Task 3 `DeadlineRulesService.applyTrigger(context)` with `courtLevel`/`serviceMethod`; Task 5 default labels; Task 7 `caseStageIndex`, `CaseFeedService.log({ stageTransition })`; Task 8 `syncLimitationReminder`; Task 9 `ensureProceeding`, `mirrorProceeding`, `saveCaseNumbers`, `sortProceedings`.
- Produces (all under `cases/:caseId/proceedings`, guarded by `JwtAuthGuard, CaseAccessGuard`; `400 'คดีปิดแล้ว'` on a CLOSED/ARCHIVED case):
  - `GET /` → `CaseProceeding[]` (TRIAL → SUPREME).
  - `PATCH /:courtLevel` body `UpdateProceedingDto { courtName?, blackCaseNumber?, redCaseNumber? }` → the proceeding; mirrors onto the case when it is the current level.
  - `POST /filing` body `RecordFilingDto { filedAt: string; blackCaseNumber?: string; courtName?: string; courtLevel?: CourtLevel }` → fires FILED, stage → FILING if earlier, removes the limitation reminder.
  - `POST /service` body `RecordServiceDto { servedAt: string; method: ServiceMethod }` → fires COMPLAINT_SERVED with the method.
  - `POST /judgment` body `RecordJudgmentDto { courtLevel: CourtLevel; judgmentAt: string; outcome: JudgmentOutcome; amount?: number; redCaseNumber?: string; note?: string }` → saves the judgment, fires JUDGMENT with that level, stage → AWAITING_JUDGMENT only if earlier (a case already at APPEAL/SUPREME/ENFORCEMENT keeps its stage), clears the limitation reminder, notifies the lead "บันทึกคำพิพากษาแล้ว — ครบกำหนดอุทธรณ์ X" (ฎีกา for an APPEAL-level judgment). Re-sending the same judgment date for the same level is a no-op (no second trigger, no second notice).
  - `POST /appeal-served` body `RecordAppealServedDto { servedAt: string }` → fires APPEAL_SERVED.
  - Every action returns `{ proceeding: CaseProceeding | null; suggestions: number }` (`suggestions` = deadline suggestions created).
  - Every action writes a `CaseActivity` (type FILING for filing, COURT_DATE for judgment, DEADLINE for service/appeal copy).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/cases/case-proceedings.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { CaseProceedingsService } from './case-proceedings.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseFeedService } from '../common/services/case-feed.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('CaseProceedingsService', () => {
  const user = { id: 'u1', firmId: 'firm-1', firmRole: 'LAWYER' } as any;
  let service: CaseProceedingsService;
  let prisma: any;
  const feed = { log: jest.fn() };
  const deadlines = { applyTrigger: jest.fn().mockResolvedValue(2) };
  const notifier = { notifyAssigned: jest.fn() };
  const legalCase = {
    id: 'case-1', firmId: 'firm-1', caseTypeId: null, status: 'IN_PROGRESS', stage: 'PRE_LITIGATION',
    courtLevel: null, courtName: 'ศาลแพ่ง', ownRef: 'C-1', leadLawyerId: 'lead-1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue(legalCase),
        findUnique: jest.fn().mockResolvedValue({ ...legalCase, limitationDeadline: null, limitationEventId: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      caseProceeding: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create, update }) => Promise.resolve({ id: 'p1', ...create, ...update })),
        count: jest.fn().mockResolvedValue(1),
      },
      calendarEvent: { findUnique: jest.fn(), delete: jest.fn() },
      reminderLog: { deleteMany: jest.fn() },
      documentDateSuggestion: {
        findFirst: jest.fn().mockResolvedValue({ suggestedDate: new Date('2026-11-12T09:30:00.000Z') }),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        CaseProceedingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: feed },
        { provide: DeadlineRulesService, useValue: deadlines },
        { provide: AssignmentNotifierService, useValue: notifier },
      ],
    }).compile();
    service = module.get(CaseProceedingsService);
  });

  it('filing saves the black number, fires FILED and moves the stage to FILING', async () => {
    const result = await service.recordFiling(user, 'case-1', {
      filedAt: '2026-10-12T03:00:00.000Z', blackCaseNumber: ' พ.123/2569 ',
    });

    expect(prisma.caseProceeding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'TRIAL' } },
        update: { filedAt: new Date('2026-10-12T03:00:00.000Z'), blackCaseNumber: 'พ.123/2569' },
      }),
    );
    expect(deadlines.applyTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'case-1', trigger: 'FILED', triggerEventId: null, createdById: 'u1' }),
    );
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { stage: 'FILING', stageChangedAt: expect.any(Date) },
    });
    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({ stageTransition: { from: 'PRE_LITIGATION', to: 'FILING', status: 'IN_PROGRESS' } }),
    );
    expect(result.suggestions).toBe(2);
  });

  it('filing does not move a case that is already past FILING', async () => {
    prisma.case.findFirst.mockResolvedValue({ ...legalCase, stage: 'HEARING' });
    await service.recordFiling(user, 'case-1', { filedAt: '2026-10-12T03:00:00.000Z' });
    expect(prisma.case.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stage: 'FILING' }) }));
  });

  it('service passes the method to the engine', async () => {
    await service.recordService(user, 'case-1', { servedAt: '2026-10-20T03:00:00.000Z', method: 'POSTED' as any });
    expect(deadlines.applyTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'COMPLAINT_SERVED', serviceMethod: 'POSTED', triggerDate: new Date('2026-10-20T03:00:00.000Z') }),
    );
  });

  it('judgment saves the result, fires JUDGMENT at the level and tells the lead the appeal deadline', async () => {
    prisma.case.findFirst.mockResolvedValue({ ...legalCase, stage: 'HEARING' });

    await service.recordJudgment(user, 'case-1', {
      courtLevel: 'TRIAL' as any, judgmentAt: '2026-10-12T03:00:00.000Z', outcome: 'WON' as any,
      amount: 500000, redCaseNumber: 'พ.9/2569', note: 'ให้ชำระพร้อมดอกเบี้ย',
    });

    expect(prisma.caseProceeding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          judgmentAt: new Date('2026-10-12T03:00:00.000Z'), judgmentOutcome: 'WON', judgmentAmount: 500000,
          redCaseNumber: 'พ.9/2569', judgmentNote: 'ให้ชำระพร้อมดอกเบี้ย',
        }),
      }),
    );
    expect(deadlines.applyTrigger).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'JUDGMENT', courtLevel: 'TRIAL' }));
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { stage: 'AWAITING_JUDGMENT', stageChangedAt: expect.any(Date) },
    });
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['lead-1'],
        summaryText: expect.stringContaining('บันทึกคำพิพากษาแล้ว — ครบกำหนดอุทธรณ์ พฤ. 12 พ.ย. 2569'),
      }),
    );
  });

  it('a judgment re-sent with the same date (double submit) creates nothing new', async () => {
    prisma.caseProceeding.findUnique.mockResolvedValue({
      id: 'p1', courtLevel: 'TRIAL', judgmentAt: new Date('2026-10-12T03:00:00.000Z'),
    });

    const result = await service.recordJudgment(user, 'case-1', {
      courtLevel: 'TRIAL' as any, judgmentAt: '2026-10-12T03:00:00.000Z', outcome: 'WON' as any,
    });

    expect(result).toEqual({ proceeding: expect.objectContaining({ id: 'p1' }), suggestions: 0 });
    expect(prisma.caseProceeding.upsert).not.toHaveBeenCalled();
    expect(deadlines.applyTrigger).not.toHaveBeenCalled();
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it('an appeal-level judgment keeps an APPEAL stage and names ฎีกา in the notice', async () => {
    prisma.case.findFirst.mockResolvedValue({ ...legalCase, stage: 'APPEAL', courtLevel: 'APPEAL' });

    await service.recordJudgment(user, 'case-1', {
      courtLevel: 'APPEAL' as any, judgmentAt: '2027-03-01T03:00:00.000Z', outcome: 'LOST' as any,
    });

    expect(prisma.case.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stage: 'AWAITING_JUDGMENT' }) }));
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(
      expect.objectContaining({ summaryText: expect.stringContaining('ครบกำหนดฎีกา') }),
    );
  });

  it('appeal copy received fires APPEAL_SERVED', async () => {
    await service.recordAppealServed(user, 'case-1', { servedAt: '2026-12-01T03:00:00.000Z' });
    expect(deadlines.applyTrigger).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'APPEAL_SERVED' }));
  });

  it('refuses actions on a closed case', async () => {
    prisma.case.findFirst.mockResolvedValue({ ...legalCase, status: 'CLOSED' });
    await expect(service.recordAppealServed(user, 'case-1', { servedAt: '2026-12-01T03:00:00.000Z' })).rejects.toThrow('คดีปิดแล้ว');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api exec jest --config jest.config.js src/cases/case-proceedings.service.spec.ts`
Expected: FAIL — `Cannot find module './case-proceedings.service'`.

- [ ] **Step 3: DTOs**

Create `apps/api/src/cases/dto/proceeding.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from 'class-validator';
import { CASE_NUMBER_HINT, CASE_NUMBER_REGEX, CourtLevel, JudgmentOutcome, ServiceMethod } from '@lawfirm/shared';

const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class UpdateProceedingDto {
  @IsOptional() @Trim() @IsString() @MaxLength(200)
  courtName?: string;

  @IsOptional() @Trim() @IsString() @ValidateIf((_, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีดำ: ${CASE_NUMBER_HINT}` })
  blackCaseNumber?: string;

  @IsOptional() @Trim() @IsString() @ValidateIf((_, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีแดง: ${CASE_NUMBER_HINT}` })
  redCaseNumber?: string;
}

export class RecordFilingDto {
  @IsDateString()
  filedAt!: string;

  @IsOptional() @Trim() @IsString() @ValidateIf((_, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีดำ: ${CASE_NUMBER_HINT}` })
  blackCaseNumber?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(200)
  courtName?: string;

  /** Defaults to the case's current level (TRIAL when unset). */
  @IsOptional() @IsEnum(CourtLevel)
  courtLevel?: CourtLevel;
}

export class RecordServiceDto {
  @IsDateString()
  servedAt!: string;

  @IsEnum(ServiceMethod)
  method!: ServiceMethod;
}

export class RecordJudgmentDto {
  @IsEnum(CourtLevel)
  courtLevel!: CourtLevel;

  @IsDateString()
  judgmentAt!: string;

  @IsEnum(JudgmentOutcome)
  outcome!: JudgmentOutcome;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  amount?: number;

  @IsOptional() @Trim() @IsString() @ValidateIf((_, v) => v !== '')
  @Matches(CASE_NUMBER_REGEX, { message: `หมายเลขคดีแดง: ${CASE_NUMBER_HINT}` })
  redCaseNumber?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  note?: string;
}

export class RecordAppealServedDto {
  @IsDateString()
  servedAt!: string;
}
```

- [ ] **Step 4: Service**

Create `apps/api/src/cases/case-proceedings.service.ts`:

```ts
import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ActivityType,
  AuthUser,
  CaseStage,
  CaseStatus,
  CourtLevel,
  DeadlineTrigger,
  JUDGMENT_OUTCOME_LABELS,
  SERVICE_METHOD_LABELS,
  caseStageIndex,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationCategory } from '../generated/prisma';
import { CaseFeedService } from '../common/services/case-feed.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { syncLimitationReminder } from '../common/limitation-reminder';
import { formatBangkokDateThai } from '../common/utils/bangkok-time';
import { ensureProceeding, mirrorProceeding, saveCaseNumbers, sortProceedings } from './proceeding-mirror';
import {
  RecordAppealServedDto,
  RecordFilingDto,
  RecordJudgmentDto,
  RecordServiceDto,
  UpdateProceedingDto,
} from './dto/proceeding.dto';

const blank = (value?: string) => (value?.trim() ? value.trim() : undefined);

/**
 * The court-side facts of a case (filing, service, judgment, appeal copy). Each
 * one is a procedural clock: recording it fires the matching deadline trigger,
 * which only ever raises PENDING suggestions for the lead lawyer to confirm.
 */
@Injectable()
export class CaseProceedingsService {
  constructor(
    private prisma: PrismaService,
    private caseFeed: CaseFeedService,
    @Inject(forwardRef(() => DeadlineRulesService)) private deadlines: DeadlineRulesService,
    @Inject(forwardRef(() => AssignmentNotifierService)) private notifier: AssignmentNotifierService,
  ) {}

  private async openCase(user: AuthUser, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, firmId: user.firmId, deletedAt: null },
      select: {
        id: true, firmId: true, caseTypeId: true, status: true, stage: true,
        courtLevel: true, ownRef: true, leadLawyerId: true,
      },
    });
    if (!legalCase) throw new NotFoundException('Case not found');
    if (legalCase.status === CaseStatus.CLOSED || legalCase.status === CaseStatus.ARCHIVED) {
      throw new BadRequestException('คดีปิดแล้ว');
    }
    return legalCase;
  }

  private fire(
    user: AuthUser,
    legalCase: { id: string; firmId: string; caseTypeId: string | null },
    trigger: DeadlineTrigger,
    triggerDate: Date,
    extra: { courtLevel?: CourtLevel; serviceMethod?: RecordServiceDto['method'] } = {},
  ) {
    return this.deadlines.applyTrigger({
      caseId: legalCase.id,
      firmId: legalCase.firmId,
      caseTypeId: legalCase.caseTypeId,
      trigger,
      triggerDate,
      // No calendar event behind these; the engine dedupes on PENDING rows instead.
      triggerEventId: null,
      createdById: user.id,
      ...extra,
    });
  }

  /** Move forward to `to` only if the case is earlier; never backwards. */
  private async advanceStage(
    user: AuthUser,
    legalCase: { id: string; stage: string; status: string },
    to: CaseStage,
  ) {
    if (caseStageIndex(legalCase.stage) >= caseStageIndex(to)) return;
    await this.prisma.case.update({ where: { id: legalCase.id }, data: { stage: to, stageChangedAt: new Date() } });
    await this.caseFeed.log({
      caseId: legalCase.id,
      userId: user.id,
      type: ActivityType.STAGE_CHANGE,
      title: `ขั้นตอนคดี: ${legalCase.stage} → ${to}`,
      stageTransition: { from: legalCase.stage, to, status: legalCase.status },
    });
  }

  async list(user: AuthUser, caseId: string) {
    await this.openCase(user, caseId).catch((err) => {
      if (err instanceof BadRequestException) return; // closed cases are still readable
      throw err;
    });
    return sortProceedings(await this.prisma.caseProceeding.findMany({ where: { caseId } }));
  }

  async update(user: AuthUser, caseId: string, courtLevel: CourtLevel, dto: UpdateProceedingDto) {
    const legalCase = await this.openCase(user, caseId);
    await saveCaseNumbers(this.prisma, caseId, courtLevel, dto);
    if ((legalCase.courtLevel ?? CourtLevel.TRIAL) === courtLevel) await mirrorProceeding(this.prisma, caseId);
    await syncLimitationReminder(this.prisma, caseId);
    return this.prisma.caseProceeding.findUnique({ where: { caseId_courtLevel: { caseId, courtLevel } } });
  }

  async recordFiling(user: AuthUser, caseId: string, dto: RecordFilingDto) {
    const legalCase = await this.openCase(user, caseId);
    const level = dto.courtLevel ?? (legalCase.courtLevel as CourtLevel | null) ?? CourtLevel.TRIAL;
    const filedAt = new Date(dto.filedAt);
    await ensureProceeding(this.prisma, caseId, level);
    const proceeding = await this.prisma.caseProceeding.upsert({
      where: { caseId_courtLevel: { caseId, courtLevel: level } },
      create: { caseId, courtLevel: level, filedAt },
      update: {
        filedAt,
        ...(blank(dto.blackCaseNumber) ? { blackCaseNumber: blank(dto.blackCaseNumber) } : {}),
        ...(blank(dto.courtName) ? { courtName: blank(dto.courtName) } : {}),
      },
    });
    if ((legalCase.courtLevel ?? CourtLevel.TRIAL) === level) await mirrorProceeding(this.prisma, caseId);

    const suggestions = await this.fire(user, legalCase, DeadlineTrigger.FILED, filedAt);
    await this.caseFeed.log({
      caseId, userId: user.id, type: ActivityType.FILING,
      title: `ยื่นฟ้อง${proceeding.blackCaseNumber ? ` คดีหมายเลขดำที่ ${proceeding.blackCaseNumber}` : ''}`,
      at: filedAt,
    });
    await this.advanceStage(user, legalCase, CaseStage.FILING);
    await syncLimitationReminder(this.prisma, caseId);
    return { proceeding, suggestions };
  }

  async recordService(user: AuthUser, caseId: string, dto: RecordServiceDto) {
    const legalCase = await this.openCase(user, caseId);
    const servedAt = new Date(dto.servedAt);
    const suggestions = await this.fire(user, legalCase, DeadlineTrigger.COMPLAINT_SERVED, servedAt, {
      serviceMethod: dto.method,
    });
    await this.caseFeed.log({
      caseId, userId: user.id, type: ActivityType.DEADLINE,
      title: `ส่งหมายเรียกและสำเนาคำฟ้องแล้ว (${SERVICE_METHOD_LABELS[dto.method]})`,
      at: servedAt,
    });
    const proceeding = await this.prisma.caseProceeding.findUnique({
      where: { caseId_courtLevel: { caseId, courtLevel: (legalCase.courtLevel as CourtLevel | null) ?? CourtLevel.TRIAL } },
    });
    return { proceeding, suggestions };
  }

  async recordJudgment(user: AuthUser, caseId: string, dto: RecordJudgmentDto) {
    const legalCase = await this.openCase(user, caseId);
    const judgmentAt = new Date(dto.judgmentAt);
    const where = { caseId_courtLevel: { caseId, courtLevel: dto.courtLevel } };

    // A double-submitted form must not raise a second set of appeal deadlines.
    // ponytail: two truly simultaneous requests can both pass this read; the engine's
    // PENDING check still stops duplicate suggestions — add a row lock if that matters.
    const before = await this.prisma.caseProceeding.findUnique({ where });
    if (before?.judgmentAt && before.judgmentAt.getTime() === judgmentAt.getTime()) {
      return { proceeding: before, suggestions: 0 };
    }

    await ensureProceeding(this.prisma, caseId, dto.courtLevel);
    const proceeding = await this.prisma.caseProceeding.upsert({
      where,
      create: { caseId, courtLevel: dto.courtLevel, judgmentAt },
      update: {
        judgmentAt,
        judgmentOutcome: dto.outcome,
        judgmentAmount: dto.amount ?? null,
        judgmentNote: dto.note?.trim() || null,
        ...(blank(dto.redCaseNumber) ? { redCaseNumber: blank(dto.redCaseNumber) } : {}),
      },
    });
    if ((legalCase.courtLevel ?? CourtLevel.TRIAL) === dto.courtLevel) await mirrorProceeding(this.prisma, caseId);

    const suggestions = await this.fire(user, legalCase, DeadlineTrigger.JUDGMENT, judgmentAt, {
      courtLevel: dto.courtLevel,
    });
    await this.caseFeed.log({
      caseId, userId: user.id, type: ActivityType.COURT_DATE,
      title: `คำพิพากษา${dto.courtLevel === CourtLevel.TRIAL ? 'ศาลชั้นต้น' : dto.courtLevel === CourtLevel.APPEAL ? 'ศาลอุทธรณ์' : 'ศาลฎีกา'}: ${JUDGMENT_OUTCOME_LABELS[dto.outcome]}`,
      description: dto.note?.trim() || undefined,
      at: judgmentAt,
    });
    await this.advanceStage(user, legalCase, CaseStage.AWAITING_JUDGMENT);
    await syncLimitationReminder(this.prisma, caseId);

    // The deadline the lead must act on next: the earliest JUDGMENT suggestion now pending.
    const next = await this.prisma.documentDateSuggestion.findFirst({
      where: { caseId, status: 'PENDING', source: 'RULE', deadlineRule: { trigger: DeadlineTrigger.JUDGMENT } },
      orderBy: { suggestedDate: 'asc' },
      select: { suggestedDate: true },
    });
    const what = dto.courtLevel === CourtLevel.TRIAL ? 'ครบกำหนดอุทธรณ์' : 'ครบกำหนดฎีกา';
    await this.notifier.notifyAssigned({
      firmId: legalCase.firmId,
      userIds: [legalCase.leadLawyerId],
      actorUserId: '',
      category: NotificationCategory.CASE,
      summaryText: [
        `บันทึกคำพิพากษาแล้ว${next && dto.courtLevel !== CourtLevel.SUPREME ? ` — ${what} ${formatBangkokDateThai(next.suggestedDate)}` : ''}`,
        `คดี ${legalCase.ownRef} · ${JUDGMENT_OUTCOME_LABELS[dto.outcome]}`,
      ].join('\n'),
      entityPath: `/cases/${caseId}?tab=calendar`,
    });
    return { proceeding, suggestions };
  }

  async recordAppealServed(user: AuthUser, caseId: string, dto: RecordAppealServedDto) {
    const legalCase = await this.openCase(user, caseId);
    const servedAt = new Date(dto.servedAt);
    const suggestions = await this.fire(user, legalCase, DeadlineTrigger.APPEAL_SERVED, servedAt);
    await this.caseFeed.log({
      caseId, userId: user.id, type: ActivityType.DEADLINE, title: 'ได้รับสำเนาอุทธรณ์', at: servedAt,
    });
    return { proceeding: null, suggestions };
  }
}
```

Check against the test: `recordFiling` upserts twice when the row is new (once in `ensureProceeding`, once with the filing); the test asserts `toHaveBeenCalledWith` on the filing call, which matches. `prisma.case.findUnique` serves `ensureProceeding`/`mirrorProceeding`/`syncLimitationReminder`.

- [ ] **Step 5: Controller and module**

Create `apps/api/src/cases/case-proceedings.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser, CourtLevel } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CaseProceedingsService } from './case-proceedings.service';
import {
  RecordAppealServedDto,
  RecordFilingDto,
  RecordJudgmentDto,
  RecordServiceDto,
  UpdateProceedingDto,
} from './dto/proceeding.dto';

@Controller('cases/:caseId/proceedings')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CaseProceedingsController {
  constructor(private proceedings: CaseProceedingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.proceedings.list(user, caseId);
  }

  @Post('filing')
  filing(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: RecordFilingDto) {
    return this.proceedings.recordFiling(user, caseId, dto);
  }

  @Post('service')
  service(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: RecordServiceDto) {
    return this.proceedings.recordService(user, caseId, dto);
  }

  @Post('judgment')
  judgment(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: RecordJudgmentDto) {
    return this.proceedings.recordJudgment(user, caseId, dto);
  }

  @Post('appeal-served')
  appealServed(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: RecordAppealServedDto) {
    return this.proceedings.recordAppealServed(user, caseId, dto);
  }

  @Patch(':courtLevel')
  update(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('courtLevel', new ParseEnumPipe(CourtLevel)) courtLevel: CourtLevel,
    @Body() dto: UpdateProceedingDto,
  ) {
    return this.proceedings.update(user, caseId, courtLevel, dto);
  }
}
```

`apps/api/src/cases/cases.module.ts`: import `DeadlinesModule` and add `forwardRef(() => DeadlinesModule)` to `imports`; add `CaseProceedingsController` to `controllers` and `CaseProceedingsService` to `providers`. (`CaseFeedService` comes from the global `CommonModule`, as for `CasesService`.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/cases && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS / no errors.

Boot check (catches DI cycles the unit tests cannot): `pnpm --filter api exec jest --config jest.config.js src/app.module.spec.ts`
Expected: PASS (`resolves every provider without a dependency cycle`).

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/api/src/cases
/usr/bin/git commit -m "feat(cases): record filing, service, judgment and appeal copy — each fires its deadline clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Web — "ศาล / เลขคดี" card, ORDER_RECEIVED-only trigger box, timeline refresh

**Files:**
- Create: `apps/web/src/lib/proceedings.ts`, `apps/web/src/lib/proceedings.test.ts`
- Create: `apps/web/src/components/cases/CaseProceedingsCard.tsx`
- Modify: `apps/web/src/lib/api.ts` (`CaseProceedingItem`, `CaseItem.proceedings`, five client calls)
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` (render the card under "ข้อมูลคดี")
- Modify: `apps/web/src/components/cases/CaseCalendarPanel.tsx:20-29, 47, 100-122, 174-213` (ORDER_RECEIVED only; reload timeline on confirm)
- Modify: `apps/web/src/components/cases/DateSuggestionsPanel.tsx` (`onChanged` prop)
- Modify: `apps/web/src/lib/i18n/dashboard.ts` (`dateSuggestions.applyTrigger*` copy, TH + EN)

**Interfaces:**
- Consumes: Task 10 endpoints and response `{ proceeding, suggestions }`; Task 9 `proceedings` on the case payload.
- Produces: `CaseProceedingItem`; `api.recordFiling(token, caseId, { filedAt, blackCaseNumber? })`, `api.recordService(token, caseId, { servedAt, method })`, `api.recordJudgment(token, caseId, { courtLevel, judgmentAt, outcome, amount?, redCaseNumber?, note? })`, `api.recordAppealServed(token, caseId, { servedAt })`, `api.updateProceeding(token, caseId, courtLevel, { courtName?, blackCaseNumber?, redCaseNumber? })` — each returns `ProceedingActionResult = { proceeding: CaseProceedingItem | null; suggestions: number }`; web helpers `sortProceedings(rows)`, `proceedingNumbers(p): string`, `judgmentLine(p): string | null`; `<CaseProceedingsCard caseId proceedings currentLevel onChanged />`; `DateSuggestionsPanel` prop `onChanged?: () => void` (called after confirm or dismiss).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/proceedings.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgmentLine, proceedingNumbers, sortProceedings } from './proceedings.ts';

const row = (over: object) => ({
  id: 'p', caseId: 'c', courtLevel: 'TRIAL', courtName: null, blackCaseNumber: null, redCaseNumber: null,
  filedAt: null, judgmentAt: null, judgmentOutcome: null, judgmentAmount: null, judgmentNote: null, ...over,
}) as never;

test('proceedings sort trial → appeal → supreme', () => {
  const sorted = sortProceedings([row({ courtLevel: 'SUPREME' }), row({ courtLevel: 'TRIAL' }), row({ courtLevel: 'APPEAL' })]);
  assert.deepEqual(sorted.map((p: { courtLevel: string }) => p.courtLevel), ['TRIAL', 'APPEAL', 'SUPREME']);
});

test('numbers line shows what exists', () => {
  assert.equal(proceedingNumbers(row({ blackCaseNumber: 'พ.1/2569', redCaseNumber: 'พ.9/2570' })), 'ดำ พ.1/2569 · แดง พ.9/2570');
  assert.equal(proceedingNumbers(row({ blackCaseNumber: 'พ.1/2569' })), 'ดำ พ.1/2569');
  assert.equal(proceedingNumbers(row({})), 'ยังไม่มีเลขคดี');
});

test('judgment line reads outcome and amount (Decimal arrives as a string)', () => {
  assert.equal(judgmentLine(row({})), null);
  assert.equal(
    judgmentLine(row({ judgmentAt: '2026-10-12T03:00:00.000Z', judgmentOutcome: 'WON', judgmentAmount: '500000.00' })),
    'พิพากษา 12/10/2569 · ชนะคดี · 500,000.00 บาท',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `Cannot find module './proceedings.ts'`.

- [ ] **Step 3: Helpers and API client**

Create `apps/web/src/lib/proceedings.ts`:

```ts
import { JUDGMENT_OUTCOME_LABELS, type CourtLevel, type JudgmentOutcome } from '@lawfirm/shared';

export interface CaseProceedingItem {
  id: string;
  caseId: string;
  courtLevel: CourtLevel;
  courtName: string | null;
  blackCaseNumber: string | null;
  redCaseNumber: string | null;
  filedAt: string | null;
  judgmentAt: string | null;
  judgmentOutcome: JudgmentOutcome | null;
  /** Prisma Decimal — serialised as a string. */
  judgmentAmount: string | number | null;
  judgmentNote: string | null;
}

const ORDER = ['TRIAL', 'APPEAL', 'SUPREME'];

export function sortProceedings<T extends { courtLevel: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => ORDER.indexOf(a.courtLevel) - ORDER.indexOf(b.courtLevel));
}

export function proceedingNumbers(p: Pick<CaseProceedingItem, 'blackCaseNumber' | 'redCaseNumber'>): string {
  const parts = [p.blackCaseNumber && `ดำ ${p.blackCaseNumber}`, p.redCaseNumber && `แดง ${p.redCaseNumber}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'ยังไม่มีเลขคดี';
}

const thaiDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'numeric', year: 'numeric' });

export function judgmentLine(p: Pick<CaseProceedingItem, 'judgmentAt' | 'judgmentOutcome' | 'judgmentAmount'>): string | null {
  if (!p.judgmentAt) return null;
  const amount = p.judgmentAmount == null ? null : Number(p.judgmentAmount);
  return [
    `พิพากษา ${thaiDate(p.judgmentAt)}`,
    p.judgmentOutcome && JUDGMENT_OUTCOME_LABELS[p.judgmentOutcome],
    amount != null && `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`,
  ].filter(Boolean).join(' · ');
}
```

(`toLocaleDateString('th-TH', …numeric)` yields `12/10/2569` — Node ships full ICU, which the existing web tests already rely on; if a CI image lacks it, the assertion fails loudly rather than silently.)

`apps/web/src/lib/api.ts`:
- `export type { CaseProceedingItem } from './proceedings';` and `import type { CaseProceedingItem } from './proceedings';` near the top;
- in `CaseItem` add `proceedings?: CaseProceedingItem[];`;
- add `export interface ProceedingActionResult { proceeding: CaseProceedingItem | null; suggestions: number }`;
- in the `api` object (next to `applyDeadlineTrigger`) add:

```ts
  recordFiling: (token: string, caseId: string, data: { filedAt: string; blackCaseNumber?: string }) =>
    request<ProceedingActionResult>(`/cases/${caseId}/proceedings/filing`, { method: 'POST', token, body: JSON.stringify(data) }),

  recordService: (token: string, caseId: string, data: { servedAt: string; method: 'PERSONAL' | 'POSTED' }) =>
    request<ProceedingActionResult>(`/cases/${caseId}/proceedings/service`, { method: 'POST', token, body: JSON.stringify(data) }),

  recordJudgment: (
    token: string,
    caseId: string,
    data: { courtLevel: string; judgmentAt: string; outcome: string; amount?: number; redCaseNumber?: string; note?: string },
  ) =>
    request<ProceedingActionResult>(`/cases/${caseId}/proceedings/judgment`, { method: 'POST', token, body: JSON.stringify(data) }),

  recordAppealServed: (token: string, caseId: string, data: { servedAt: string }) =>
    request<ProceedingActionResult>(`/cases/${caseId}/proceedings/appeal-served`, { method: 'POST', token, body: JSON.stringify(data) }),

  updateProceeding: (
    token: string,
    caseId: string,
    courtLevel: string,
    data: { courtName?: string; blackCaseNumber?: string; redCaseNumber?: string },
  ) =>
    request<CaseProceedingItem>(`/cases/${caseId}/proceedings/${courtLevel}`, { method: 'PATCH', token, body: JSON.stringify(data) }),
```

- [ ] **Step 4: The card**

Create `apps/web/src/components/cases/CaseProceedingsCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  COURT_LEVEL_LABELS,
  CourtLevel,
  JUDGMENT_OUTCOME_LABELS,
  JudgmentOutcome,
  SERVICE_METHOD_LABELS,
  ServiceMethod,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ProceedingActionResult } from '@/lib/api';
import { CaseProceedingItem, judgmentLine, proceedingNumbers, sortProceedings } from '@/lib/proceedings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';

type Action = 'filing' | 'service' | 'judgment' | 'appeal';

const ACTIONS: { id: Action; label: string }[] = [
  { id: 'filing', label: 'บันทึกการยื่นฟ้อง' },
  { id: 'service', label: 'บันทึกการส่งหมาย' },
  { id: 'judgment', label: 'บันทึกคำพิพากษา' },
  { id: 'appeal', label: 'บันทึกการได้รับสำเนาอุทธรณ์' },
];

const SELECT = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
const toIso = (day: string) => new Date(`${day}T00:00:00+07:00`).toISOString();

/** ศาล / เลขคดี: one row per court level, plus the four facts that start procedural clocks. */
export function CaseProceedingsCard({
  caseId,
  proceedings,
  currentLevel,
  onChanged,
}: {
  caseId: string;
  proceedings: CaseProceedingItem[];
  currentLevel: CourtLevel | null;
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [action, setAction] = useState<Action | null>(null);
  const [date, setDate] = useState('');
  const [number, setNumber] = useState('');
  const [method, setMethod] = useState<ServiceMethod>(ServiceMethod.PERSONAL);
  const [level, setLevel] = useState<CourtLevel>(currentLevel ?? CourtLevel.TRIAL);
  const [outcome, setOutcome] = useState<JudgmentOutcome | ''>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const open = (next: Action) => {
    setAction(action === next ? null : next);
    setDate(''); setNumber(''); setOutcome(''); setAmount(''); setNote(''); setError('');
    setLevel(currentLevel ?? CourtLevel.TRIAL);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !action || !date) return;
    setBusy(true);
    setError('');
    try {
      let result: ProceedingActionResult;
      if (action === 'filing') {
        result = await api.recordFiling(token, caseId, { filedAt: toIso(date), ...(number.trim() ? { blackCaseNumber: number.trim() } : {}) });
      } else if (action === 'service') {
        result = await api.recordService(token, caseId, { servedAt: toIso(date), method });
      } else if (action === 'judgment') {
        if (!outcome) { setError('เลือกผลคำพิพากษา'); return; }
        result = await api.recordJudgment(token, caseId, {
          courtLevel: level, judgmentAt: toIso(date), outcome,
          ...(amount.trim() ? { amount: Number(amount) } : {}),
          ...(number.trim() ? { redCaseNumber: number.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      } else {
        result = await api.recordAppealServed(token, caseId, { servedAt: toIso(date) });
      }
      setMessage(
        result.suggestions > 0
          ? `บันทึกแล้ว — เสนอวันครบกำหนด ${result.suggestions} รายการ ตรวจและยืนยันที่แท็บไทม์ไลน์`
          : 'บันทึกแล้ว',
      );
      setAction(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const rows = sortProceedings(proceedings);

  return (
    <Card data-testid="case-proceedings">
      <CardHeader>
        <CardTitle className="text-base">ศาล / เลขคดี</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">ยังไม่ได้ยื่นฟ้อง</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id} className="py-2">
                <p className="font-medium">
                  {COURT_LEVEL_LABELS[p.courtLevel]}
                  {p.courtName && p.courtName !== COURT_LEVEL_LABELS[p.courtLevel] ? ` · ${p.courtName}` : ''}
                  {p.courtLevel === (currentLevel ?? CourtLevel.TRIAL) && (
                    <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs text-primary">ชั้นปัจจุบัน</span>
                  )}
                </p>
                <p className="text-muted-foreground">{proceedingNumbers(p)}</p>
                {judgmentLine(p) && <p className="text-muted-foreground">{judgmentLine(p)}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <Button key={a.id} type="button" size="sm" variant={action === a.id ? 'secondary' : 'outline'} onClick={() => open(a.id)}>
              {a.label}
            </Button>
          ))}
        </div>

        {action && (
          <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-muted-foreground">
                {action === 'filing' ? 'วันยื่นฟ้อง' : action === 'service' ? 'วันที่จำเลยได้รับหมาย' : action === 'judgment' ? 'วันอ่านคำพิพากษา' : 'วันได้รับสำเนาอุทธรณ์'}
              </span>
              <ThaiDateInput required value={date} onChange={setDate} />
            </label>
            {action === 'filing' && (
              <label className="block">
                <span className="mb-1 block text-muted-foreground">หมายเลขคดีดำ</span>
                <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="เช่น พ.123/2569" />
              </label>
            )}
            {action === 'service' && (
              <label className="block">
                <span className="mb-1 block text-muted-foreground">วิธีส่งหมาย</span>
                <select className={SELECT} value={method} onChange={(e) => setMethod(e.target.value as ServiceMethod)}>
                  {Object.values(ServiceMethod).map((m) => <option key={m} value={m}>{SERVICE_METHOD_LABELS[m]}</option>)}
                </select>
              </label>
            )}
            {action === 'judgment' && (
              <>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">ศาลที่พิพากษา</span>
                  <select className={SELECT} value={level} onChange={(e) => setLevel(e.target.value as CourtLevel)}>
                    {Object.values(CourtLevel).map((l) => <option key={l} value={l}>{COURT_LEVEL_LABELS[l]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">ผลคำพิพากษา</span>
                  <select required className={SELECT} value={outcome} onChange={(e) => setOutcome(e.target.value as JudgmentOutcome)}>
                    <option value="" disabled>เลือกผล</option>
                    {Object.values(JudgmentOutcome).map((o) => <option key={o} value={o}>{JUDGMENT_OUTCOME_LABELS[o]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">จำนวนเงินตามคำพิพากษา (บาท)</span>
                  <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">หมายเลขคดีแดง</span>
                  <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="เช่น พ.999/2570" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">สรุปคำพิพากษา</span>
                  <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </>
            )}
            {error && <p className="text-destructive sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy || !date}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
            </div>
          </form>
        )}
        {message && <p role="status" className="text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
```

`apps/web/src/app/(dashboard)/cases/[id]/page.tsx` — `import { CaseProceedingsCard } from '@/components/cases/CaseProceedingsCard';` and directly after the closing `</Card>` of the `data-testid="case-information"` card (before `<div className="min-w-0 space-y-4">`) add:

```tsx
          <CaseProceedingsCard
            caseId={legalCase.id}
            proceedings={legalCase.proceedings ?? []}
            currentLevel={legalCase.courtLevel ?? null}
            onChanged={loadCase}
          />
```

- [ ] **Step 5: Trigger box keeps only ORDER_RECEIVED; timeline refreshes after a confirm**

`apps/web/src/components/cases/CaseCalendarPanel.tsx`:
1. Delete `MANUAL_TRIGGERS` and its comment, and the `trigger` state; in `handleApply` send `trigger: DeadlineTrigger.ORDER_RECEIVED`.
2. Replace the trigger `<label>…<select>…</label>` with nothing (the form keeps only the date input and the button).
3. Pass `onChanged={() => setReloadKey((n) => n + 1)}` to `<DateSuggestionsPanel … />`.

`apps/web/src/components/cases/DateSuggestionsPanel.tsx`:
1. Add `onChanged,` to the destructured props and `/** After a confirm or dismiss — the caller reloads what the new event affects (timeline). */ onChanged?: () => void;` to the props type.
2. In `confirm`, after `setSuggestions((prev) => prev.filter((x) => x.id !== s.id));` add `onChanged?.();`; do the same in `dismiss` after its local removal.

`apps/web/src/lib/i18n/dashboard.ts` — TH `dateSuggestions`: `applyTrigger: 'บันทึกวันได้รับคำสั่งศาล', applyTriggerHint: 'การยื่นฟ้อง ส่งหมาย คำพิพากษา และสำเนาอุทธรณ์ บันทึกที่การ์ด "ศาล / เลขคดี" ในหน้าภาพรวม — ช่องนี้สำหรับคำสั่งศาลที่ได้รับ ระบบจะเสนอวันครบกำหนดให้ยืนยัน', applyTriggerDate: 'วันที่ได้รับคำสั่ง',`; EN: `applyTrigger: 'Record a court order received', applyTriggerHint: 'Filing, service, judgment and appeal copies are recorded on the "Court / case numbers" card in Overview. Use this for a court order received; the system proposes deadlines to confirm.', applyTriggerDate: 'Date received',`.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter web test && pnpm --filter web exec tsc --noEmit`
Expected: PASS / no errors.

Manual check (dev server on port 3011 per the worktree setup): open a case → Overview → "บันทึกคำพิพากษา" with a date → message shows N suggestions → Timeline tab lists them → confirm one → the new DEADLINE appears in the timeline without a page reload.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/web/src/lib/proceedings.ts apps/web/src/lib/proceedings.test.ts apps/web/src/lib/api.ts apps/web/src/components/cases/CaseProceedingsCard.tsx "apps/web/src/app/(dashboard)/cases/[id]/page.tsx" apps/web/src/components/cases/CaseCalendarPanel.tsx apps/web/src/components/cases/DateSuggestionsPanel.tsx apps/web/src/lib/i18n/dashboard.ts
/usr/bin/git commit -m "feat(web): court proceedings card with filing/service/judgment/appeal actions; timeline refreshes on confirm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Parties as a single source of truth (API + data migration)

**Files:**
- Create: `apps/api/src/cases/party-sync.ts`, `apps/api/src/cases/party-sync.spec.ts`
- Create: `apps/api/src/cases/case-participants.service.spec.ts`
- Create: `apps/api/prisma/migrations/20261011130400_parties_single_source/migration.sql`
- Modify: `apps/api/src/cases/dto/case.dto.ts` (`partyRole` → `PartyRole` enum; `CreateCaseDto.opponents`; `UpdateCaseDto.clients`; participant `clientId`/`representedByParticipantId`)
- Modify: `apps/api/src/cases/cases.service.ts` (`caseInclude.participants` full rows; `create`; `update`)
- Modify: `apps/api/src/cases/case-participants.service.ts` (activity + audit + link checks)
- Modify: `apps/api/src/intake/intake.service.ts` (`openCaseFromIntake`)
- Modify: `packages/shared/src/index.ts:923` (drop the `opposingParty` field from the default "คดีความ" case type)

**Interfaces:**
- Consumes: Task 1 `PartyRole`, `ourParticipantRole`, `opponentParticipantRole`, `CaseParticipant.clientId/representedByParticipantId`.
- Produces:
  - `type PartyDb = Pick<PrismaService | Prisma.TransactionClient, 'case' | 'caseParticipant'>`
  - `ensureOurClientParticipant(db: PartyDb, caseId: string): Promise<void>` — when `Case.partyRole` and `Case.clientId` are set, the client is a participant on side OURS with `ourParticipantRole(partyRole)` (found by `clientId`; created or corrected; never duplicated).
  - `interface OpponentInput { name: string; role?: ParticipantRole; personType?: string }`; `addOpponents(db: PartyDb, caseId: string, partyRole: string | null | undefined, opponents: OpponentInput[]): Promise<number>` — side OPPONENT, default role `opponentParticipantRole(partyRole)`, skips blanks and names already on the opponent side (case-insensitive).
  - `CreateCaseDto.opponents?: OpponentDto[]`, `CreateCaseDto.partyRole?: PartyRole`, `UpdateCaseDto.partyRole?: PartyRole | null`, `UpdateCaseDto.clients?: AdditionalClientDto[]` (replaces the list), `CreateParticipantDto/UpdateParticipantDto.clientId?`, `.representedByParticipantId?`.
  - Every case response (`caseInclude`) now carries full participant rows (fixes "participants disappear after saving the overview").
  - Participant create/update/delete write a `CaseActivity` (type NOTE) and an `AuditLog` (`CASE_PARTICIPANT_ADDED` / `_UPDATED` / `_REMOVED`).
  - `Case.customFields.opposingParty` no longer exists after the migration; nothing writes it.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/cases/party-sync.spec.ts`:

```ts
import { addOpponents, ensureOurClientParticipant } from './party-sync';

const fakeDb = () => ({
  case: { findUnique: jest.fn() },
  caseParticipant: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    createMany: jest.fn().mockImplementation(({ data }) => Promise.resolve({ count: data.length })),
  },
});

describe('ensureOurClientParticipant', () => {
  it('adds the client on our side with our role', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ partyRole: 'DEFENDANT', clientId: 'cl-1', clientName: null, client: { name: 'บริษัท ก จำกัด' } });

    await ensureOurClientParticipant(db as never, 'case-1');

    expect(db.caseParticipant.create).toHaveBeenCalledWith({
      data: { caseId: 'case-1', clientId: 'cl-1', name: 'บริษัท ก จำกัด', role: 'DEFENDANT', side: 'OURS' },
    });
  });

  it('is idempotent and corrects a stale role', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ partyRole: 'PLAINTIFF', clientId: 'cl-1', clientName: 'ก', client: { name: 'ก' } });
    db.caseParticipant.findFirst.mockResolvedValue({ id: 'p1', role: 'DEFENDANT', side: 'OURS' });

    await ensureOurClientParticipant(db as never, 'case-1');

    expect(db.caseParticipant.create).not.toHaveBeenCalled();
    expect(db.caseParticipant.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { role: 'PLAINTIFF', side: 'OURS' } });
  });

  it('does nothing without a party role or a client', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ partyRole: null, clientId: 'cl-1', clientName: 'ก', client: { name: 'ก' } });
    await ensureOurClientParticipant(db as never, 'case-1');
    db.case.findUnique.mockResolvedValue({ partyRole: 'PLAINTIFF', clientId: null, clientName: 'ก', client: null });
    await ensureOurClientParticipant(db as never, 'case-1');
    expect(db.caseParticipant.create).not.toHaveBeenCalled();
  });
});

describe('addOpponents', () => {
  it('puts opponents on the opposite role, skipping blanks and names already there', async () => {
    const db = fakeDb();
    db.caseParticipant.findMany.mockResolvedValue([{ name: 'นายเดิม' }]);

    const count = await addOpponents(db as never, 'case-1', 'PLAINTIFF', [
      { name: '  บริษัท ข จำกัด ', personType: 'นิติบุคคล' },
      { name: 'นายเดิม' },
      { name: ' ' },
      { name: 'ทนายฝั่งโน้น', role: 'OPPOSING_LAWYER' as never },
    ]);

    expect(count).toBe(2);
    expect(db.caseParticipant.createMany).toHaveBeenCalledWith({
      data: [
        { caseId: 'case-1', name: 'บริษัท ข จำกัด', role: 'DEFENDANT', side: 'OPPONENT', personType: 'นิติบุคคล' },
        { caseId: 'case-1', name: 'ทนายฝั่งโน้น', role: 'OPPOSING_LAWYER', side: 'OPPONENT', personType: null },
      ],
    });
  });

  it('uses OTHER when our side is unknown', async () => {
    const db = fakeDb();
    await addOpponents(db as never, 'case-1', null, [{ name: 'นาย ค' }]);
    expect(db.caseParticipant.createMany.mock.calls[0][0].data[0].role).toBe('OTHER');
  });
});
```

Create `apps/api/src/cases/case-participants.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { CaseParticipantsService } from './case-participants.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseFeedService } from '../common/services/case-feed.service';

describe('CaseParticipantsService', () => {
  const user = { id: 'u1', firmId: 'firm-1' } as any;
  let service: CaseParticipantsService;
  let prisma: any;
  const feed = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
      caseParticipant: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p9', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'p1', name: 'เดิม', role: 'DEFENDANT', ...data })),
        delete: jest.fn(),
      },
      client: { count: jest.fn().mockResolvedValue(1) },
      clientContact: { count: jest.fn() },
      caseType: { count: jest.fn() },
      firmMember: { count: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        CaseParticipantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: feed },
      ],
    }).compile();
    service = module.get(CaseParticipantsService);
  });

  it('adding a party writes a case activity and an audit row', async () => {
    await service.create(user, 'case-1', { name: 'บริษัท ข', role: 'DEFENDANT', side: 'OPPONENT' } as any);

    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'case-1', userId: 'u1', type: 'NOTE', title: 'เพิ่มคู่ความ: บริษัท ข (จำเลย)' }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        firmId: 'firm-1', userId: 'u1', action: 'CASE_PARTICIPANT_ADDED',
        metadata: { caseId: 'case-1', participantId: 'p9', name: 'บริษัท ข', role: 'DEFENDANT', side: 'OPPONENT' },
      },
    });
  });

  it('rejects a client from another firm', async () => {
    prisma.client.count.mockResolvedValue(0);
    await expect(
      service.create(user, 'case-1', { name: 'x', role: 'PLAINTIFF', side: 'OURS', clientId: 'foreign' } as any),
    ).rejects.toThrow('ลูกความที่เลือกไม่อยู่ในสำนักงานนี้');
  });

  it('rejects counsel linked to a party of another case, or to itself', async () => {
    prisma.caseParticipant.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(user, 'case-1', { name: 'ทนาย', role: 'OPPOSING_LAWYER', side: 'OPPONENT', representedByParticipantId: 'other' } as any),
    ).rejects.toThrow('คู่ความที่เลือกไม่อยู่ในคดีนี้');

    prisma.caseParticipant.findFirst.mockResolvedValueOnce({ id: 'p1', caseId: 'case-1' });
    await expect(
      service.update(user, 'case-1', 'p1', { representedByParticipantId: 'p1' } as any),
    ).rejects.toThrow('คู่ความที่เลือกไม่อยู่ในคดีนี้');
  });

  it('removing a party is logged and audited', async () => {
    prisma.caseParticipant.findFirst.mockResolvedValue({ id: 'p1', caseId: 'case-1', name: 'เดิม', role: 'DEFENDANT', side: 'OPPONENT' });

    await service.remove(user, 'case-1', 'p1');

    expect(feed.log).toHaveBeenCalledWith(expect.objectContaining({ title: 'ลบคู่ความ: เดิม (จำเลย)' }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'CASE_PARTICIPANT_REMOVED' }),
    });
  });
});
```

Append to `apps/api/src/cases/case-stages.spec.ts` (Task 7's harness) — the regression for "participants disappear after saving the overview" (the PATCH response carried only `name`/`role`, so the side-grouped list rendered nothing):

```ts
  it('every case response carries full participant rows', async () => {
    await service.update(user, 'case-1', { title: 'ชื่อใหม่' } as any);
    expect(prisma.case.update.mock.calls[0][0].include.participants).toEqual({ orderBy: { createdAt: 'asc' } });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/cases/party-sync.spec.ts src/cases/case-participants.service.spec.ts src/cases/case-stages.spec.ts`
Expected: FAIL — `Cannot find module './party-sync'`; participants service has no `CaseFeedService` and writes no audit row.

- [ ] **Step 3: Party helpers**

Create `apps/api/src/cases/party-sync.ts`:

```ts
import { ParticipantRole, ParticipantSide, opponentParticipantRole, ourParticipantRole } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';

export type PartyDb = Pick<PrismaService | Prisma.TransactionClient, 'case' | 'caseParticipant'>;

export interface OpponentInput {
  name: string;
  role?: ParticipantRole;
  personType?: string;
}

/**
 * CaseParticipant is the only place parties live. Our own client is one of
 * them, on side OURS, with the role matching Case.partyRole — kept in step here
 * so conflict checks and pleadings read one list.
 */
export async function ensureOurClientParticipant(db: PartyDb, caseId: string): Promise<void> {
  const legalCase = await db.case.findUnique({
    where: { id: caseId },
    select: { partyRole: true, clientId: true, clientName: true, client: { select: { name: true } } },
  });
  if (!legalCase?.partyRole || !legalCase.clientId) return;
  const role = ourParticipantRole(legalCase.partyRole);
  const existing = await db.caseParticipant.findFirst({
    where: { caseId, clientId: legalCase.clientId },
    select: { id: true, role: true, side: true },
  });
  if (existing) {
    if (existing.role !== role || existing.side !== ParticipantSide.OURS) {
      await db.caseParticipant.update({ where: { id: existing.id }, data: { role, side: ParticipantSide.OURS } });
    }
    return;
  }
  await db.caseParticipant.create({
    data: {
      caseId,
      clientId: legalCase.clientId,
      name: legalCase.client?.name ?? legalCase.clientName ?? '',
      role,
      side: ParticipantSide.OURS,
    },
  });
}

/** @returns how many opponent rows were added. */
export async function addOpponents(
  db: PartyDb,
  caseId: string,
  partyRole: string | null | undefined,
  opponents: OpponentInput[],
): Promise<number> {
  const existing = await db.caseParticipant.findMany({
    where: { caseId, side: ParticipantSide.OPPONENT },
    select: { name: true },
  });
  const seen = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const data = [];
  for (const opponent of opponents) {
    const name = opponent.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    data.push({
      caseId,
      name,
      role: opponent.role ?? opponentParticipantRole(partyRole),
      side: ParticipantSide.OPPONENT,
      personType: opponent.personType?.trim() || null,
    });
  }
  if (data.length === 0) return 0;
  const result = await db.caseParticipant.createMany({ data });
  return result.count;
}
```

- [ ] **Step 4: DTOs**

`apps/api/src/cases/dto/case.dto.ts`:
1. Add `PartyRole, ParticipantRole` to the `@lawfirm/shared` import (if `ParticipantRole` is not already imported).
2. In `CreateCaseDto` replace the `partyRole` field with:

```ts
  @IsOptional()
  @IsEnum(PartyRole)
  partyRole?: PartyRole;
```

   and add after `clients`:

```ts
  /** คู่ความฝ่ายตรงข้าม — กลายเป็น CaseParticipant ฝั่ง OPPONENT */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OpponentDto)
  opponents?: OpponentDto[];
```

3. Add above `CreateCaseDto`:

```ts
export class OpponentDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  /** Default: the role opposite ours (โจทก์ ⇄ จำเลย, ผู้ร้อง ⇄ ผู้คัดค้าน). */
  @IsOptional()
  @IsEnum(ParticipantRole)
  role?: ParticipantRole;

  /** 'บุคคลธรรมดา' | 'นิติบุคคล' — same free text the participants form uses. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  personType?: string;
}
```

4. In `UpdateCaseDto` replace `partyRole` with `@IsOptional() @IsEnum(PartyRole) partyRole?: PartyRole | null;` and add:

```ts
  /** ลูกความเพิ่มเติม — ส่งมาคือแทนที่ทั้งรายการ */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalClientDto)
  clients?: AdditionalClientDto[];
```

5. In `CreateParticipantDto` add:

```ts
  /** ลูกความในทะเบียนที่เป็นคนเดียวกับคู่ความรายนี้ */
  @IsOptional()
  @IsUUID()
  clientId?: string;

  /** สำหรับทนาย/ผู้แทนฝ่ายตรงข้าม: คู่ความที่เขาเป็นตัวแทน */
  @IsOptional()
  @IsUUID()
  representedByParticipantId?: string;
```

   and the same two fields in `UpdateParticipantDto` typed `string | null`.

(Add `ArrayMaxSize`, `MaxLength`, `IsUUID` to the class-validator import where missing.)

- [ ] **Step 5: Cases service**

In `apps/api/src/cases/cases.service.ts`:
1. `import { addOpponents, ensureOurClientParticipant } from './party-sync';`
2. `caseInclude`: replace `participants: { select: { name: true, role: true } },` with `participants: { orderBy: { createdAt: 'asc' as const } },` — every response now returns full rows, so the participants section no longer empties after "บันทึก" on the overview.
3. In `create`, after the "เปิดคดี" `caseFeed.log` (and the Task 8 limitation call), add:

```ts
    if (dto.opponents?.length) await addOpponents(this.prisma, created.id, dto.partyRole, dto.opponents);
    await ensureOurClientParticipant(this.prisma, created.id);
```

   and change `partyRole: dto.partyRole as any,` to `partyRole: dto.partyRole,`.
4. In `update`:
   - extend `assertFirmRefs` `clientIds` with `...(dto.clients ?? []).map((c) => c.clientId)`;
   - change the destructure to `const { customFields, customers, clients, stageNote: _stageNote, ...rest } = dto;`;
   - add to the `case.update` data: `additionalClients: clients === undefined ? undefined : { deleteMany: {}, create: this.additionalClientRows(clients) },`;
   - after the update, add:

```ts
    if (dto.partyRole !== undefined || dto.clientId !== undefined) {
      await ensureOurClientParticipant(this.prisma, id);
    }
```

   (If any of these runs after the APPEAL early-return added in Task 9, place them before that block.)

- [ ] **Step 6: Participants service**

Replace `apps/api/src/cases/case-participants.service.ts` with:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseFeedService } from '../common/services/case-feed.service';
import { assertFirmRefs } from '../common/firm-refs';
import { CreateParticipantDto, UpdateParticipantDto } from './dto/case.dto';

const ROLE_TH: Record<string, string> = {
  PLAINTIFF: 'โจทก์', JOINT_PLAINTIFF: 'โจทก์ร่วม', DEFENDANT: 'จำเลย', JOINT_DEFENDANT: 'จำเลยร่วม',
  PETITIONER: 'ผู้ร้อง', RESPONDENT: 'ผู้คัดค้าน', WITNESS: 'พยาน', EXPERT: 'ผู้เชี่ยวชาญ',
  OPPOSING_LAWYER: 'ทนายฝ่ายตรงข้าม', OPPOSING_INSURER: 'บริษัทประกันฝ่ายตรงข้าม', OTHER: 'อื่น ๆ',
};

@Injectable()
export class CaseParticipantsService {
  constructor(
    private prisma: PrismaService,
    private caseFeed: CaseFeedService,
  ) {}

  private async verifyCase(firmId: string, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({ where: { id: caseId, firmId } });
    if (!legalCase) throw new NotFoundException('Case not found');
    return legalCase;
  }

  /** A linked client must be this firm's; represented party must be on this case and not the row itself. */
  private async checkLinks(
    user: AuthUser,
    caseId: string,
    dto: { clientId?: string | null; representedByParticipantId?: string | null },
    selfId?: string,
  ) {
    await assertFirmRefs(this.prisma, user.firmId, { clientIds: [dto.clientId] });
    if (dto.representedByParticipantId) {
      const party = dto.representedByParticipantId === selfId
        ? null
        : await this.prisma.caseParticipant.findFirst({ where: { id: dto.representedByParticipantId, caseId } });
      if (!party) throw new BadRequestException('คู่ความที่เลือกไม่อยู่ในคดีนี้');
    }
  }

  private async record(
    user: AuthUser,
    caseId: string,
    action: 'ADDED' | 'UPDATED' | 'REMOVED',
    row: { id: string; name: string; role: string; side: string },
  ) {
    const verb = { ADDED: 'เพิ่มคู่ความ', UPDATED: 'แก้ไขคู่ความ', REMOVED: 'ลบคู่ความ' }[action];
    await this.caseFeed.log({
      caseId,
      userId: user.id,
      type: ActivityType.NOTE,
      title: `${verb}: ${row.name} (${ROLE_TH[row.role] ?? row.role})`,
    });
    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: `CASE_PARTICIPANT_${action}`,
        metadata: { caseId, participantId: row.id, name: row.name, role: row.role, side: row.side },
      },
    });
  }

  async findAll(user: AuthUser, caseId: string) {
    await this.verifyCase(user.firmId, caseId);
    return this.prisma.caseParticipant.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
  }

  async create(user: AuthUser, caseId: string, dto: CreateParticipantDto) {
    await this.verifyCase(user.firmId, caseId);
    await this.checkLinks(user, caseId, dto);
    const created = await this.prisma.caseParticipant.create({ data: { caseId, ...dto } });
    await this.record(user, caseId, 'ADDED', created);
    return created;
  }

  async update(user: AuthUser, caseId: string, participantId: string, dto: UpdateParticipantDto) {
    await this.verifyCase(user.firmId, caseId);
    const participant = await this.prisma.caseParticipant.findFirst({ where: { id: participantId, caseId } });
    if (!participant) throw new NotFoundException('Participant not found');
    await this.checkLinks(user, caseId, dto, participantId);
    const updated = await this.prisma.caseParticipant.update({ where: { id: participantId }, data: dto });
    await this.record(user, caseId, 'UPDATED', updated);
    return updated;
  }

  async remove(user: AuthUser, caseId: string, participantId: string) {
    await this.verifyCase(user.firmId, caseId);
    const participant = await this.prisma.caseParticipant.findFirst({ where: { id: participantId, caseId } });
    if (!participant) throw new NotFoundException('Participant not found');
    await this.prisma.caseParticipant.delete({ where: { id: participantId } });
    await this.record(user, caseId, 'REMOVED', participant);
    return { deleted: true };
  }
}
```

(Check the `update` test: the first `findFirst` call returns the participant row, the self-link check short-circuits before a second query.)

- [ ] **Step 7: Intake conversion**

In `apps/api/src/intake/intake.service.ts`:
1. `import { addOpponents, ensureOurClientParticipant } from '../cases/party-sync';`
2. In `openCaseFromIntake`'s `this.prisma.case.create({ data: { … } })` add:

```ts
        // Facts the intake already captured travel with the case (spec L5).
        customFields: {
          ...(intake.incidentDate ? { incidentDate: intake.incidentDate.toISOString().slice(0, 10) } : {}),
          ...(intake.estimatedDamage != null ? { estimatedDamage: intake.estimatedDamage } : {}),
        },
```

3. After the "เปิดคดี" `caseFeed.log`:

```ts
    if (intake.opposingParty?.trim()) {
      await addOpponents(this.prisma, newCase.id, intake.partyRole, [{ name: intake.opposingParty }]);
    }
    await ensureOurClientParticipant(this.prisma, newCase.id);
```

- [ ] **Step 8: Default case type and data migration**

`packages/shared/src/index.ts` — in `DEFAULT_CASE_TYPES`, delete the `fieldSchema` (with the `opposingParty` entry) from "คดีความ" and keep its comment line; run `pnpm --filter @lawfirm/shared build`.

Create `apps/api/prisma/migrations/20261011130400_parties_single_source/migration.sql`:

```sql
-- Spec L5: CaseParticipant is the only home for parties.

-- 1. customFields.opposingParty → an OPPONENT participant (role opposite ours; OTHER when unknown).
INSERT INTO "CaseParticipant" ("id", "caseId", "name", "role", "side", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       c."id",
       TRIM(c."customFields"->>'opposingParty'),
       (CASE c."partyRole"
          WHEN 'PLAINTIFF'  THEN 'DEFENDANT'
          WHEN 'DEFENDANT'  THEN 'PLAINTIFF'
          WHEN 'PETITIONER' THEN 'RESPONDENT'
          WHEN 'RESPONDENT' THEN 'PETITIONER'
          ELSE 'OTHER'
        END)::"ParticipantRole",
       'OPPONENT'::"ParticipantSide",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "Case" c
 WHERE NULLIF(TRIM(c."customFields"->>'opposingParty'), '') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "CaseParticipant" p
      WHERE p."caseId" = c."id" AND p."side" = 'OPPONENT'
        AND LOWER(TRIM(p."name")) = LOWER(TRIM(c."customFields"->>'opposingParty'))
   );

UPDATE "Case" SET "customFields" = "customFields" - 'opposingParty'
 WHERE "customFields" IS NOT NULL AND "customFields" ? 'opposingParty';

-- 2. Our client on side OURS with our role. First link hand-entered OURS rows that carry the
--    client's name, so the insert below does not duplicate them.
UPDATE "CaseParticipant" p
   SET "clientId" = c."clientId"
  FROM "Case" c JOIN "Client" cl ON cl."id" = c."clientId"
 WHERE p."caseId" = c."id" AND p."side" = 'OURS' AND p."clientId" IS NULL
   AND LOWER(TRIM(p."name")) = LOWER(TRIM(cl."name"))
   AND NOT EXISTS (SELECT 1 FROM "CaseParticipant" q WHERE q."caseId" = c."id" AND q."clientId" = c."clientId");

INSERT INTO "CaseParticipant" ("id", "caseId", "clientId", "name", "role", "side", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", c."clientId", cl."name",
       c."partyRole"::text::"ParticipantRole", 'OURS'::"ParticipantSide",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "Case" c
  JOIN "Client" cl ON cl."id" = c."clientId"
 WHERE c."partyRole" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "CaseParticipant" p WHERE p."caseId" = c."id" AND p."clientId" = c."clientId");

-- 3. Firms that kept the default "คดีความ" type still show an "opposingParty" custom field; drop it.
UPDATE "CaseType"
   SET "fieldSchema" = (
     SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
       FROM jsonb_array_elements("fieldSchema"::jsonb) f
      WHERE f->>'key' <> 'opposingParty'
   )
 WHERE "fieldSchema" IS NOT NULL
   AND jsonb_typeof("fieldSchema"::jsonb) = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements("fieldSchema"::jsonb) f WHERE f->>'key' = 'opposingParty');
```

Apply:

```bash
cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261011130400_parties_single_source/migration.sql && pnpm exec prisma migrate resolve --applied 20261011130400_parties_single_source && cd ../..
psql "$DATABASE_URL" -c "SELECT count(*) AS left_over FROM \"Case\" WHERE \"customFields\" ? 'opposingParty';"
```

Expected: `left_over = 0`.

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/cases src/intake && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS / no errors. (`cases.controller.spec`/`cases.service.spec` assertions on `caseInclude` that expect `participants: { select: … }` must be updated to the new `orderBy` form.)

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add apps/api/src/cases apps/api/src/intake/intake.service.ts apps/api/prisma/migrations/20261011130400_parties_single_source packages/shared/src/index.ts
/usr/bin/git commit -m "feat(cases): parties live only in CaseParticipant — opponents on create/convert, our client auto-added, audited changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Conflict check enforced server-side (API)

**Files:**
- Modify: `apps/api/src/conflict-check/conflict-check.service.ts` (search covers additional clients; `opponentConflicts`, `gateNewCase`, `recordForCase`; `record` moves the intake stage)
- Modify: `apps/api/src/conflict-check/conflict-check.service.spec.ts`
- Modify: `apps/api/src/cases/dto/case.dto.ts` (`CreateCaseDto.conflictOverrideReason`), `apps/api/src/cases/cases.service.ts` (`create`), `apps/api/src/cases/cases.module.ts` (import `ConflictCheckModule`)
- Modify: `apps/api/src/intake/intake.service.ts` (`openCaseFromIntake`, `convertPortalSubmission`), `apps/api/src/intake/dto/intake.dto.ts` (`ConvertPortalSubmissionDto.conflictOverrideReason`)
- Modify: `apps/api/src/client-portal/client-portal-intake.service.ts` (`submit`: record, never block), `apps/api/src/client-portal/client-portal.module.ts` (import `ConflictCheckModule`)
- Test: `apps/api/src/conflict-check/conflict-check.service.spec.ts`, `apps/api/src/cases/case-conflict-gate.spec.ts` (new)

**Interfaces:**
- Consumes: Task 1 `ConflictCheck.caseId`; Task 12 `CreateCaseDto.opponents`, `addOpponents`.
- Produces:
  - `interface PartyName { name: string; side: 'OURS' | 'OPPONENT' }`
  - `opponentConflicts(searched: PartyName[], matches: ConflictMatch[]): ConflictMatch[]` — hits whose side is the other side of the searched name's side (NEUTRAL hits never count).
  - `interface ConflictGate { result: ConflictResult.CLEAR | ConflictResult.POTENTIAL_CONFLICT; terms: string[]; matches: ConflictMatch[]; overrideReason: string | null }`
  - `ConflictCheckService.gateNewCase(user: AuthUser, input: { parties: PartyName[]; overrideReason?: string | null; excludeIntakeId?: string }): Promise<ConflictGate>` — drops names shorter than `CONFLICT_TERM_MIN_LENGTH` (3) and the `TMP_CLIENT_PLACEHOLDER` ('tmp') before searching; no usable name → CLEAR without searching. Conflicts and no reason → `409 { code: 'CONFLICT_FOUND', message, matches }`; reason present but under 10 chars → `400 'เหตุผลที่ข้ามผลตรวจต้องยาวอย่างน้อย 10 ตัวอักษร'`.
  - `ConflictCheckService.recordForCase(user: AuthUser, gate: ConflictGate, link: { caseId?: string; intakeId?: string }): Promise<void>` — writes the `ConflictCheck` (CLEAR, or POTENTIAL_CONFLICT with the reason in `notes`), an `AuditLog` `CONFLICT_OVERRIDDEN` when overridden, and moves a linked intake to stage CONFLICT_CHECK if it is earlier.
  - `CreateCaseDto.conflictOverrideReason?: string`; `ConvertPortalSubmissionDto.conflictOverrideReason?: string`. `DecideIntakeDto`/`ConvertToCaseDto` already carry `conflictOverrideReason`.
  - New `ConflictMatchKind` value `'CASE_CLIENT'` (an additional client on a case, side OURS).

Decisions: the client-portal `submit` (a client opening their own request) cannot answer a 409, so it records the check (POTENTIAL_CONFLICT with note "เปิดจากพอร์ทัล — ทนายต้องตรวจ" when names clash) and never blocks; the staff-side `portal-submissions/:id/convert` is gated like any other opening.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/conflict-check/conflict-check.service.spec.ts`:
- add to `prismaMock`'s returned object: `caseClient: { ...empty }, auditLog: { create: jest.fn() }, intake: { ...empty, findFirst: jest.fn().mockResolvedValue({ id: 'intake-1', stage: 'NEW_INQUIRY' }), update: jest.fn() },` (replacing the existing `intake` entry);
- import `ConflictException` from `@nestjs/common` and `opponentConflicts` from `./conflict-check.service`;
- append:

```ts
describe('conflict gate', () => {
  const ourClientAsOpponentElsewhere = {
    caseParticipant: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'p1', name: 'บริษัท ก จำกัด', role: 'DEFENDANT', side: 'OPPONENT',
          case: { id: 'case-9', title: 'คดีเก่า', ownRef: 'REF9', status: 'OPEN' } },
      ]),
    },
  };

  it('a name on the same side elsewhere is not a conflict; the other side is', () => {
    const matches = [
      { kind: 'CLIENT', term: 'บริษัท ก จำกัด', name: 'บริษัท ก จำกัด', side: 'OURS' },
      { kind: 'CASE_PARTY', term: 'บริษัท ก จำกัด', name: 'บริษัท ก จำกัด', side: 'OPPONENT' },
      { kind: 'CASE_PARTY', term: 'นาย ข', name: 'นาย ข', side: 'NEUTRAL' },
    ] as any;
    expect(
      opponentConflicts([{ name: 'บริษัท ก จำกัด', side: 'OURS' }, { name: 'นาย ข', side: 'OPPONENT' }], matches),
    ).toEqual([matches[1]]);
  });

  it('opens CLEAR when nothing clashes', async () => {
    const service = await build(prismaMock());
    const gate = await service.gateNewCase(user, { parties: [{ name: 'บริษัท ใหม่ จำกัด', side: 'OURS' }] });
    expect(gate).toMatchObject({ result: ConflictResult.CLEAR, overrideReason: null });
  });

  it('short names and the "tmp" placeholder are not searched and do not throw', async () => {
    const prisma = prismaMock();
    const service = await build(prisma);
    const gate = await service.gateNewCase(user, {
      parties: [{ name: 'tmp', side: 'OURS' }, { name: 'ab', side: 'OPPONENT' }, { name: ' ', side: 'OPPONENT' }],
    });
    expect(gate).toEqual({ result: ConflictResult.CLEAR, terms: [], matches: [], overrideReason: null });
    expect((prisma.client as any).findMany).not.toHaveBeenCalled();
  });

  it('a clash without a reason is a 409 CONFLICT_FOUND carrying the matches', async () => {
    const service = await build(prismaMock(ourClientAsOpponentElsewhere));
    const attempt = service.gateNewCase(user, { parties: [{ name: 'บริษัท ก จำกัด', side: 'OURS' }] });
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'CONFLICT_FOUND', matches: [expect.objectContaining({ caseId: 'case-9', side: 'OPPONENT' })] },
    });
  });

  it('a reason under 10 characters is refused; a proper one lets it through as POTENTIAL_CONFLICT', async () => {
    const service = await build(prismaMock(ourClientAsOpponentElsewhere));
    await expect(
      service.gateNewCase(user, { parties: [{ name: 'บริษัท ก จำกัด', side: 'OURS' }], overrideReason: 'สั้นไป' }),
    ).rejects.toThrow('เหตุผลที่ข้ามผลตรวจต้องยาวอย่างน้อย 10 ตัวอักษร');

    const gate = await service.gateNewCase(user, {
      parties: [{ name: 'บริษัท ก จำกัด', side: 'OURS' }],
      overrideReason: 'คดีเก่าจบไปแล้วและลูกความยินยอมเป็นหนังสือ',
    });
    expect(gate.result).toBe(ConflictResult.POTENTIAL_CONFLICT);
  });

  it('ignores hits on the intake being converted', async () => {
    const service = await build(prismaMock({
      intake: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'intake-1', title: 'เรื่องนี้', clientName: 'x', opposingParty: 'บริษัท ก จำกัด', contactName: null, status: 'OPEN' },
        ]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    }));
    const gate = await service.gateNewCase(user, {
      parties: [{ name: 'บริษัท ก จำกัด', side: 'OURS' }],
      excludeIntakeId: 'intake-1',
    });
    expect(gate.result).toBe(ConflictResult.CLEAR);
  });

  it('records the check on the case, audits an override and moves an earlier intake to CONFLICT_CHECK', async () => {
    const prisma = prismaMock();
    const service = await build(prisma);

    await service.recordForCase(
      user,
      { result: ConflictResult.POTENTIAL_CONFLICT, terms: ['บริษัท ก จำกัด'], matches: [{ kind: 'CLIENT' } as any], overrideReason: 'ลูกความยินยอมเป็นหนังสือแล้ว' },
      { caseId: 'case-1', intakeId: 'intake-1' },
    );

    expect((prisma.conflictCheck as any).create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'case-1', intakeId: 'intake-1', result: 'POTENTIAL_CONFLICT',
        notes: 'ลูกความยินยอมเป็นหนังสือแล้ว', matchCount: 1, checkedById: 'u1', firmId: 'firm-1',
      }),
    });
    expect((prisma.auditLog as any).create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'CONFLICT_OVERRIDDEN' }),
    });
    expect((prisma.intake as any).update).toHaveBeenCalledWith({
      where: { id: 'intake-1' },
      data: { stage: 'CONFLICT_CHECK', stageChangedAt: expect.any(Date) },
    });
  });

  it('finds our additional clients as OURS', async () => {
    const service = await build(prismaMock({
      caseClient: {
        findMany: jest.fn().mockResolvedValue([
          { client: { id: 'cl-2', name: 'บริษัท ร่วม จำกัด' }, case: { id: 'case-3', title: 'คดี', ownRef: 'R3', status: 'OPEN' } },
        ]),
      },
    }));
    const found = await service.search(user, ['บริษัท ร่วม']);
    expect(found.matches).toContainEqual(expect.objectContaining({ kind: 'CASE_CLIENT', side: 'OURS', caseId: 'case-3' }));
  });
});
```

Create `apps/api/src/cases/case-conflict-gate.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CasesService } from './cases.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { CaseActivitiesService } from './case-activities.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { ConflictCheckService } from '../conflict-check/conflict-check.service';

describe('POST /cases conflict gate', () => {
  const user = { id: 'u1', firmId: 'firm-1', firmRole: 'OWNER' } as any;
  const gate = { gateNewCase: jest.fn(), recordForCase: jest.fn() };
  let service: CasesService;
  let prisma: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      client: { findFirst: jest.fn().mockResolvedValue({ id: 'cl-1', name: 'บริษัท ก จำกัด' }), count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([]) },
      clientContact: { count: jest.fn() },
      caseType: { count: jest.fn() },
      firmMember: { count: jest.fn().mockResolvedValue(1) },
      case: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'case-new', ownRef: 'C-1', openedAt: new Date(), leadLawyerId: 'u1' }),
      },
      firm: { findUnique: jest.fn().mockResolvedValue({ ownRefPrefix: 'C' }) },
      caseParticipant: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
        { provide: CaseAccessService, useValue: { canAccessCase: jest.fn().mockResolvedValue(true) } },
        { provide: CaseActivitiesService, useValue: { create: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn() } },
        { provide: ConflictCheckService, useValue: gate },
      ],
    }).compile();
    service = module.get(CasesService);
  });

  const dto = {
    title: 'ฟ้องเรียกค่าเสียหาย', clientId: 'cl-1', partyRole: 'PLAINTIFF', courtLevel: 'TRIAL',
    leadLawyerId: 'u1', opponents: [{ name: 'บริษัท ข จำกัด' }], conflictOverrideReason: undefined,
  } as any;

  it('checks our client and every opponent before creating, and records the result on the case', async () => {
    gate.gateNewCase.mockResolvedValue({ result: 'CLEAR', terms: [], matches: [], overrideReason: null });

    await service.create(user, dto);

    expect(gate.gateNewCase).toHaveBeenCalledWith(user, {
      parties: [
        { name: 'บริษัท ก จำกัด', side: 'OURS' },
        { name: 'บริษัท ข จำกัด', side: 'OPPONENT' },
      ],
      overrideReason: undefined,
    });
    expect(gate.recordForCase).toHaveBeenCalledWith(user, expect.objectContaining({ result: 'CLEAR' }), { caseId: 'case-new' });
  });

  it('creates nothing when the gate refuses', async () => {
    gate.gateNewCase.mockRejectedValue(new ConflictException({ code: 'CONFLICT_FOUND', matches: [] }));

    await expect(service.create(user, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.case.create).not.toHaveBeenCalled();
  });
});
```

(The mock covers every delegate `create` touches: `generateOwnRef` reads `firm.findUnique` + `case.findMany`, `insertCase` reads `case.findUnique` and writes `case.create`, the party helpers use `caseParticipant`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/conflict-check src/cases/case-conflict-gate.spec.ts`
Expected: FAIL — `gateNewCase is not a function`, `opponentConflicts` not exported, no `CASE_CLIENT` kind.

- [ ] **Step 3: Service**

In `apps/api/src/conflict-check/conflict-check.service.ts`:

1. Imports: `import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';`, add `INTAKE_STAGE_ORDER, IntakeStage, TMP_CLIENT_PLACEHOLDER` to the `@lawfirm/shared` import, and `import { CONFLICT_TERM_MIN_LENGTH } from './dto/conflict-check.dto';`.
2. Add `| 'CASE_CLIENT'` to `ConflictMatchKind`.
3. In `search`, add a sixth query to the `Promise.all` and its loop:

```ts
        this.prisma.caseClient.findMany({
          where: { case: { firmId: user.firmId }, client: { name: like } },
          select: {
            client: { select: { id: true, name: true } },
            case: { select: { id: true, title: true, ownRef: true, status: true } },
          },
          take: 20,
        }),
```

   (destructure it as `caseClients`), and after the `casesByClientName` loop:

```ts
      for (const k of caseClients) {
        matches.push({
          kind: 'CASE_CLIENT',
          term,
          name: k.client.name,
          side: 'OURS',
          clientId: k.client.id,
          caseId: k.case.id,
          caseTitle: k.case.title,
          ownRef: k.case.ownRef,
          caseStatus: k.case.status,
        });
      }
```

4. Above the class add:

```ts
export interface PartyName {
  name: string;
  side: 'OURS' | 'OPPONENT';
}

export interface ConflictGate {
  result: ConflictResult.CLEAR | ConflictResult.POTENTIAL_CONFLICT;
  terms: string[];
  matches: ConflictMatch[];
  overrideReason: string | null;
}

const OVERRIDE_MIN_LENGTH = 10;

/** Spec L6: a searched name found on the other side somewhere else. Same-side and neutral hits are not conflicts. */
export function opponentConflicts(searched: PartyName[], matches: ConflictMatch[]): ConflictMatch[] {
  const sideOf = new Map(searched.map((p) => [p.name.trim().toLowerCase(), p.side]));
  return matches.filter((m) => {
    const side = sideOf.get(m.term.trim().toLowerCase());
    return !!side && (m.side === 'OURS' || m.side === 'OPPONENT') && m.side !== side;
  });
}
```

5. Add methods to the class:

```ts
  /**
   * Runs before a case is opened. Names too short to search meaningfully, and the
   * "tmp" placeholder client, are skipped — the search itself would 400 on them.
   */
  async gateNewCase(
    user: AuthUser,
    input: { parties: PartyName[]; overrideReason?: string | null; excludeIntakeId?: string },
  ): Promise<ConflictGate> {
    const parties = input.parties
      .map((p) => ({ ...p, name: p.name.trim() }))
      .filter((p) => p.name.length >= CONFLICT_TERM_MIN_LENGTH && p.name.toLowerCase() !== TMP_CLIENT_PLACEHOLDER);
    if (!parties.length) return { result: ConflictResult.CLEAR, terms: [], matches: [], overrideReason: null };

    const found = await this.search(user, parties.map((p) => p.name));
    const conflicts = opponentConflicts(parties, found.matches).filter(
      (m) => !input.excludeIntakeId || m.intakeId !== input.excludeIntakeId,
    );
    if (!conflicts.length) {
      return { result: ConflictResult.CLEAR, terms: found.terms, matches: found.matches, overrideReason: null };
    }

    const reason = input.overrideReason?.trim() ?? '';
    if (!reason) {
      throw new ConflictException({
        code: 'CONFLICT_FOUND',
        message: 'พบชื่อที่อาจขัดกัน (conflict of interest) — ตรวจรายการแล้วระบุเหตุผลเพื่อเปิดคดีต่อ',
        matches: conflicts,
      });
    }
    if (reason.length < OVERRIDE_MIN_LENGTH) {
      throw new BadRequestException(`เหตุผลที่ข้ามผลตรวจต้องยาวอย่างน้อย ${OVERRIDE_MIN_LENGTH} ตัวอักษร`);
    }
    return { result: ConflictResult.POTENTIAL_CONFLICT, terms: found.terms, matches: conflicts, overrideReason: reason };
  }

  async recordForCase(user: AuthUser, gate: ConflictGate, link: { caseId?: string; intakeId?: string }) {
    const check = await this.prisma.conflictCheck.create({
      data: {
        firmId: user.firmId,
        caseId: link.caseId,
        intakeId: link.intakeId,
        searchTerms: gate.terms,
        matches: gate.matches as unknown as object,
        matchCount: gate.matches.length,
        result: gate.result as never,
        notes: gate.overrideReason,
        checkedById: user.id,
      },
    });
    if (gate.result === ConflictResult.POTENTIAL_CONFLICT) {
      await this.prisma.auditLog.create({
        data: {
          firmId: user.firmId,
          userId: user.id,
          action: 'CONFLICT_OVERRIDDEN',
          metadata: { conflictCheckId: check.id, caseId: link.caseId ?? null, intakeId: link.intakeId ?? null, reason: gate.overrideReason, matchCount: gate.matches.length },
        },
      });
    }
    if (link.intakeId) await this.advanceIntakeToConflictCheck(link.intakeId);
  }

  private async advanceIntakeToConflictCheck(intakeId: string) {
    const intake = await this.prisma.intake.findFirst({ where: { id: intakeId }, select: { id: true, stage: true } });
    if (!intake) return;
    const index = INTAKE_STAGE_ORDER.indexOf(intake.stage as IntakeStage);
    if (index >= INTAKE_STAGE_ORDER.indexOf(IntakeStage.CONFLICT_CHECK)) return;
    await this.prisma.intake.update({
      where: { id: intakeId },
      data: { stage: IntakeStage.CONFLICT_CHECK as never, stageChangedAt: new Date() },
    });
  }
```

6. In `record`, after `this.prisma.conflictCheck.create(…)` assign the result to `const created`, then `if (dto.intakeId) await this.advanceIntakeToConflictCheck(dto.intakeId);` and `return created;`.

- [ ] **Step 4: Gate `POST /cases`**

`apps/api/src/cases/dto/case.dto.ts` — in `CreateCaseDto`:

```ts
  /** เหตุผลที่เปิดคดีทั้งที่พบชื่อขัดกัน — ต้องมีเมื่อ API ตอบ 409 CONFLICT_FOUND (อย่างน้อย 10 ตัวอักษร) */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  conflictOverrideReason?: string;
```

`apps/api/src/cases/cases.module.ts` — import `ConflictCheckModule` (`../conflict-check/conflict-check.module`) into `imports`.

`apps/api/src/cases/cases.service.ts`:
1. Inject `private conflictCheck: ConflictCheckService,` in the constructor **before** the `@Optional() cargoClaims` parameter (import from `../conflict-check/conflict-check.service`); add `{ provide: ConflictCheckService, useValue: { gateNewCase: jest.fn().mockResolvedValue({ result: 'CLEAR', terms: [], matches: [], overrideReason: null }), recordForCase: jest.fn() } }` to the providers of the existing `CasesService` specs that construct it via `Test.createTestingModule` (`cases.service.spec.ts`, `cases-close-gate.spec.ts`, `cases-soft-delete.spec.ts`, `cases.assignment-notify.spec.ts`, `claimed-amount.spec.ts`, `case-stages.spec.ts`).
2. In `create`, after the client lookup and before `insertCase`:

```ts
    const additionalNames = dto.clients?.length
      ? (await this.prisma.client.findMany({
          where: { id: { in: dto.clients.map((c) => c.clientId) }, firmId: user.firmId },
          select: { name: true },
        })).map((c) => c.name)
      : [];
    const gate = await this.conflictCheck.gateNewCase(user, {
      parties: [
        ...(dto.clientName ? [{ name: dto.clientName, side: 'OURS' as const }] : []),
        ...additionalNames.map((name) => ({ name, side: 'OURS' as const })),
        ...(dto.opponents ?? []).map((o) => ({ name: o.name, side: 'OPPONENT' as const })),
      ],
      overrideReason: dto.conflictOverrideReason,
    });
```

3. After the case exists (next to the Task 12 `addOpponents` call): `await this.conflictCheck.recordForCase(user, gate, { caseId: created.id });`

`dto.clientName` is filled from the selected client a few lines earlier, so the client's registered name is what is searched.

- [ ] **Step 5: Gate intake openings and portal conversion**

`apps/api/src/intake/intake.service.ts` — at the top of `openCaseFromIntake` (before the Own Ref generation):

```ts
    const gate = await this.conflictCheck.gateNewCase(user, {
      parties: [
        ...(intake.clientName ? [{ name: intake.clientName, side: 'OURS' as const }] : []),
        ...(intake.client?.name && intake.client.name !== intake.clientName ? [{ name: intake.client.name, side: 'OURS' as const }] : []),
        ...(intake.additionalClients ?? []).map((c: { client?: { name: string } | null }) => c.client?.name).filter(Boolean).map((name) => ({ name: name!, side: 'OURS' as const })),
        ...(intake.opposingParty ? [{ name: intake.opposingParty, side: 'OPPONENT' as const }] : []),
      ],
      overrideReason: dto.conflictOverrideReason,
      excludeIntakeId: intake.id,
    });
```

and right after the case is created (next to the Task 12 party calls) `await this.conflictCheck.recordForCase(user, gate, { caseId: newCase.id, intakeId: intake.id });`. Keep the existing "เปิดคดีโดยข้ามผลตรวจ conflict" activity — it now fires only when an override was actually needed: change its condition to `if (gate.overrideReason)` and its description to `gate.overrideReason`. (`findOne` uses `intakeInclude`, which loads `client { id, name }` and `additionalClients { client { id, name } }`.)

`apps/api/src/intake/dto/intake.dto.ts` — add to `ConvertPortalSubmissionDto`:

```ts
  /** เหตุผลที่รับเรื่องต่อทั้งที่พบชื่อขัดกัน — ต้องมีเมื่อ API ตอบ 409 CONFLICT_FOUND */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  conflictOverrideReason?: string;
```

In `convertPortalSubmission`, inside the transaction after the `submission.intakeId` early return and before `tx.intake.create`, load the client name and gate:

```ts
      const portalClient = await tx.client.findFirst({ where: { id: submission.clientId, firmId: user.firmId }, select: { name: true } });
      const gate = await this.conflictCheck.gateNewCase(user, {
        parties: portalClient ? [{ name: portalClient.name, side: 'OURS' }] : [],
        overrideReason: dto.conflictOverrideReason,
      });
```

and after the intake is created and linked: `await this.conflictCheck.recordForCase(user, gate, { intakeId: intake.id });` (the gate's search reads outside the transaction, which is fine — it only reads).

`apps/api/src/client-portal/client-portal-intake.service.ts` — inject `ConflictCheckService` (add `ConflictCheckModule` to `imports` in `apps/api/src/client-portal/client-portal.module.ts` — `CasesModule` does not re-export it) and, after the transaction commits (where owners are alerted), add:

```ts
    // A client opening their own request cannot answer a conflict prompt: record, never block.
    // The forced reason makes a clash land as POTENTIAL_CONFLICT for the lawyer to review.
    const actor = { id: legalCase.leadLawyerId, firmId: portalUser.firmId } as AuthUser;
    try {
      const gate = await this.conflictCheck.gateNewCase(actor, {
        parties: [{ name: clientName, side: 'OURS' }],
        overrideReason: 'เปิดจากพอร์ทัล — ทนายต้องตรวจ',
      });
      await this.conflictCheck.recordForCase(actor, gate, { caseId: legalCase.id });
    } catch (err) {
      this.logger.warn(`Conflict check for portal case ${legalCase.id} failed: ${(err as Error).message}`);
    }
```

Add `private readonly logger = new Logger(ClientPortalIntakeService.name);` to the class and `Logger` to its `@nestjs/common` import (the service has no logger today); import `AuthUser` from `@lawfirm/shared` if not already imported.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter api exec jest --config jest.config.js src/conflict-check src/cases src/intake src/client-portal src/app.module.spec.ts && pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: PASS / no errors.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/api/src/conflict-check apps/api/src/cases apps/api/src/intake apps/api/src/client-portal
/usr/bin/git commit -m "feat(conflict): server-side conflict gate on every case opening, with audited override

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Web — conflict override dialog on every opening (intake decide/convert, portal convert)

**Files:**
- Modify: `apps/web/src/lib/api.ts:49-56, ~:97` (`ApiError.body`), `convertPortalSubmission` signature
- Create: `apps/web/src/lib/conflict.ts`, `apps/web/src/lib/conflict.test.ts`
- Create: `apps/web/src/components/ConflictOverrideDialog.tsx`
- Modify: `apps/web/src/app/(dashboard)/intake/[id]/page.tsx` (`handleDecide` ~:526, `handleConvert` ~:897)
- Modify: `apps/web/src/app/(dashboard)/intake/portal-submissions/page.tsx:37`

**Interfaces:**
- Consumes: Task 13 `409 { code: 'CONFLICT_FOUND', message, matches: ConflictMatch[] }`, the `conflictOverrideReason` fields.
- Produces: `ApiError.body?: unknown` (the parsed error JSON); `interface ConflictMatchItem { kind: string; term: string; name: string; side?: string; role?: string; caseId?: string; caseTitle?: string; ownRef?: string; intakeId?: string; intakeTitle?: string }`; `conflictMatchesFrom(err: unknown): ConflictMatchItem[] | null`; `describeConflictMatch(m: ConflictMatchItem): string`; `OVERRIDE_MIN_LENGTH = 10`; `<ConflictOverrideDialog matches busy onCancel onConfirm(reason) />`; `api.convertPortalSubmission(token, id, { officePlannedDate?, conflictOverrideReason? })`. Task 15 (create form) uses the same three pieces.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/conflict.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conflictMatchesFrom, describeConflictMatch } from './conflict.ts';

/** Same shape as ApiError (status + parsed body); api.ts itself is not importable under node --test. */
const apiError = (status: number, body: unknown) => Object.assign(new Error('x'), { status, body });
const match = { kind: 'CASE_PARTY', term: 'บริษัท ก', name: 'บริษัท ก จำกัด', side: 'OPPONENT', role: 'DEFENDANT', caseId: 'c9', caseTitle: 'คดีเก่า', ownRef: 'REF9' };

test('reads the matches out of a 409 CONFLICT_FOUND', () => {
  assert.deepEqual(conflictMatchesFrom(apiError(409, { code: 'CONFLICT_FOUND', matches: [match] })), [match]);
});

test('anything else is not a conflict prompt', () => {
  assert.equal(conflictMatchesFrom(apiError(409, { message: 'Own Ref taken' })), null);
  assert.equal(conflictMatchesFrom(apiError(400, { code: 'CONFLICT_FOUND', matches: [] })), null);
  assert.equal(conflictMatchesFrom(new Error('network')), null);
});

test('describes where the name was found and on which side', () => {
  assert.equal(describeConflictMatch(match), 'บริษัท ก จำกัด — ฝ่ายตรงข้ามในคดี REF9 คดีเก่า');
  assert.equal(
    describeConflictMatch({ kind: 'CLIENT', term: 'x', name: 'นาย ข', side: 'OURS' }),
    'นาย ข — ลูกความของสำนักงาน',
  );
  assert.equal(
    describeConflictMatch({ kind: 'INTAKE_PARTY', term: 'x', name: 'นาย ค', side: 'OPPONENT', intakeTitle: 'เรื่องใหม่' }),
    'นาย ค — ฝ่ายตรงข้ามในเรื่องรับใหม่ เรื่องใหม่',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `Cannot find module './conflict.ts'`.

- [ ] **Step 3: `ApiError` carries the body**

`apps/web/src/lib/api.ts`:

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Parsed JSON error body — some errors carry data the UI acts on (e.g. CONFLICT_FOUND matches). */
    public body?: unknown,
  ) {
    super(message);
  }
}
```

and in `request` change `throw new ApiError(res.status, message);` to `throw new ApiError(res.status, message, body);`. A 409 CONFLICT_FOUND is a prompt, not a failure, so in the same block change `if (isAction) publishActionFeedback(…)` to `if (isAction && (body as { code?: string })?.code !== 'CONFLICT_FOUND') publishActionFeedback(…)`.

Replace `convertPortalSubmission` with:

```ts
  convertPortalSubmission: (
    token: string,
    submissionId: string,
    data: { officePlannedDate?: string; conflictOverrideReason?: string } = {},
  ) =>
    request<IntakeItem>(`/intake/portal-submissions/${submissionId}/convert`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),
```

and update its other caller(s) found by `grep -rn "convertPortalSubmission(" apps/web/src` to pass `{ officePlannedDate }` instead of the bare string.

- [ ] **Step 4: Helpers and dialog**

Create `apps/web/src/lib/conflict.ts`:

```ts
/** Mirrors the API's ConflictMatch. */
export interface ConflictMatchItem {
  kind: string;
  term: string;
  name: string;
  side?: string;
  role?: string;
  caseId?: string;
  caseTitle?: string;
  ownRef?: string;
  intakeId?: string;
  intakeTitle?: string;
}

export const OVERRIDE_MIN_LENGTH = 10;

/**
 * The matches of a 409 CONFLICT_FOUND, or null for any other error. Checked by shape
 * (ApiError's `status` + `body`) so this file stays importable without api.ts.
 */
export function conflictMatchesFrom(err: unknown): ConflictMatchItem[] | null {
  const e = err as { status?: number; body?: unknown } | null;
  if (!e || typeof e !== 'object' || e.status !== 409) return null;
  const body = e.body as { code?: string; matches?: ConflictMatchItem[] } | undefined;
  return body?.code === 'CONFLICT_FOUND' && Array.isArray(body.matches) ? body.matches : null;
}

export function describeConflictMatch(m: ConflictMatchItem): string {
  const side = m.side === 'OURS' ? 'ฝ่ายเรา' : m.side === 'OPPONENT' ? 'ฝ่ายตรงข้าม' : 'ผู้เกี่ยวข้อง';
  if (m.kind === 'CLIENT' || m.kind === 'CLIENT_CONTACT') return `${m.name} — ลูกความของสำนักงาน`;
  if (m.intakeId) return `${m.name} — ${side}ในเรื่องรับใหม่ ${m.intakeTitle ?? ''}`.trim();
  return `${m.name} — ${side}ในคดี ${[m.ownRef, m.caseTitle].filter(Boolean).join(' ')}`.trim();
}
```

Create `apps/web/src/components/ConflictOverrideDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/misc';
import { ConflictMatchItem, describeConflictMatch, OVERRIDE_MIN_LENGTH } from '@/lib/conflict';

/**
 * The server found a name of ours on the other side somewhere (or the reverse).
 * Opening anyway needs a written reason, which is stored with the conflict check and audited.
 */
export function ConflictOverrideDialog({
  matches,
  busy,
  onCancel,
  onConfirm,
}: {
  matches: ConflictMatchItem[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= OVERRIDE_MIN_LENGTH;

  return (
    <Modal open onClose={onCancel} closeOnBackdrop={!busy} className="max-w-xl" ariaLabel="พบชื่อที่อาจขัดกัน">
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); if (ok) onConfirm(reason.trim()); }}
      >
        <div>
          <h2 className="text-lg font-semibold">พบชื่อที่อาจขัดกัน (conflict of interest)</h2>
          <p className="mt-1 text-sm text-muted-foreground">ตรวจรายการด้านล่าง ถ้ายืนยันเปิดต่อ ระบบจะบันทึกเหตุผลไว้เป็นหลักฐาน</p>
        </div>
        <ul className="max-h-60 space-y-2 overflow-y-auto text-sm">
          {matches.map((m, i) => (
            <li key={`${m.kind}-${m.caseId ?? m.intakeId ?? m.name}-${i}`} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950">
              {m.caseId ? <Link href={`/cases/${m.caseId}`} target="_blank" className="underline">{describeConflictMatch(m)}</Link> : describeConflictMatch(m)}
            </li>
          ))}
        </ul>
        <label className="block text-sm font-medium">
          เหตุผลที่เปิดต่อ (อย่างน้อย {OVERRIDE_MIN_LENGTH} ตัวอักษร)
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="เช่น คดีเดิมจบแล้ว และลูกความทั้งสองฝ่ายยินยอมเป็นหนังสือ"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!ok || busy}>{busy ? 'กำลังเปิด…' : 'ยืนยันเปิดต่อ'}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>ยกเลิก</Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 5: Intake decide / convert and portal convert**

`apps/web/src/app/(dashboard)/intake/[id]/page.tsx`:
1. Imports: `import { ConflictOverrideDialog } from '@/components/ConflictOverrideDialog';` and `import { conflictMatchesFrom, type ConflictMatchItem } from '@/lib/conflict';`.
2. State: `const [conflict, setConflict] = useState<{ matches: ConflictMatchItem[]; retry: (reason: string) => void } | null>(null);`
3. Change `handleDecide` to `async (conflictOverrideReason?: string) => {…}`; add `...(conflictOverrideReason ? { conflictOverrideReason } : {}),` inside the `accepted` spread; in its `catch` first try:

```tsx
      const matches = conflictMatchesFrom(err);
      if (matches) { setConflict({ matches, retry: (reason) => { setConflict(null); void handleDecide(reason); } }); return; }
```

   Every existing `onClick={handleDecide}` becomes `onClick={() => handleDecide()}`.
4. Change `handleConvert` the same way: signature `(payload, conflictOverrideReason?: string)`, send `...(conflictOverrideReason ? { conflictOverrideReason } : {})`, and in `catch`:

```tsx
      const matches = conflictMatchesFrom(err);
      if (matches) { setConflict({ matches, retry: (reason) => { setConflict(null); void handleConvert(payload, reason); } }); return; }
```

5. Render near the other modals:

```tsx
      {conflict && (
        <ConflictOverrideDialog
          matches={conflict.matches}
          busy={submitting}
          onCancel={() => setConflict(null)}
          onConfirm={conflict.retry}
        />
      )}
```

`apps/web/src/app/(dashboard)/intake/portal-submissions/page.tsx` — same pattern around line 37: import the dialog and helper, add the `conflict` state, change the convert call to `api.convertPortalSubmission(token, id, reason ? { conflictOverrideReason: reason } : {})` inside a `convert = async (id: string, reason?: string) => {…}` function, and on `conflictMatchesFrom(e)` open the dialog with `retry: (r) => { setConflict(null); void convert(id, r); }`; render the dialog at the end of the page.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter web test && pnpm --filter web exec tsc --noEmit`
Expected: PASS / no errors.

Manual check: create a client "บริษัท ทดสอบ ขัดกัน จำกัด", add it as an OPPONENT participant on another case, then decide an intake for that client as FILE_SUIT → dialog lists the other case → a 9-character reason keeps the button disabled → a proper reason opens the case; `/cases/<id>` timeline shows "เปิดคดีโดยข้ามผลตรวจ conflict".

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/web/src/lib/api.ts apps/web/src/lib/conflict.ts apps/web/src/lib/conflict.test.ts apps/web/src/components/ConflictOverrideDialog.tsx "apps/web/src/app/(dashboard)/intake/[id]/page.tsx" "apps/web/src/app/(dashboard)/intake/portal-submissions/page.tsx"
/usr/bin/git commit -m "feat(web): conflict override dialog when opening a case from intake or portal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Web — create-case form gets parties, court, numbers, limitation and the conflict prompt

**Files:**
- Create: `apps/web/src/lib/case-create.ts`, `apps/web/src/lib/case-create.test.ts`
- Create: `apps/web/src/components/cases/CourtSelect.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/new/page.tsx` (state ~:73-89, `handleSubmit` ~:204-301, `applySuggestion` ~:303, form body ~:380-600)
- Modify: `apps/web/src/components/cases/CaseOverviewForm.tsx` (court `<select>` → `CourtSelect`)

**Interfaces:**
- Consumes: Task 8 `limitationDeadline`, Task 12 `opponents`/`PartyRole`, Task 13 `conflictOverrideReason`, Task 14 `conflictMatchesFrom`, `ConflictOverrideDialog`.
- Produces: `interface OpponentRow { name: string; role: string; personType: string }`; `litigationPayload(input: { partyRole: string; opponents: OpponentRow[]; courtLevel: string; courtName: string; blackCaseNumber: string; limitationDeadline: string }): { partyRole?: string; opponents?: { name: string; role?: string; personType?: string }[]; courtLevel: string; courtName?: string; blackCaseNumber?: string; limitationDeadline?: string }`; `bangkokDayToIso(day: string): string` (00:00 Bangkok of `YYYY-MM-DD`); `<CourtSelect value courts onChange className id? />` — catalog `<select>` plus "ศาลอื่น (พิมพ์เอง)" that reveals a text input.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/case-create.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bangkokDayToIso, litigationPayload } from './case-create.ts';

test('blank litigation fields are left out; the court level always goes', () => {
  assert.deepEqual(
    litigationPayload({ partyRole: '', opponents: [{ name: ' ', role: '', personType: '' }], courtLevel: 'TRIAL', courtName: ' ', blackCaseNumber: '', limitationDeadline: '' }),
    { courtLevel: 'TRIAL' },
  );
});

test('filled fields are trimmed; opponents keep only what was chosen', () => {
  assert.deepEqual(
    litigationPayload({
      partyRole: 'PLAINTIFF',
      opponents: [
        { name: ' บริษัท ข จำกัด ', role: '', personType: 'นิติบุคคล' },
        { name: 'ทนาย ค', role: 'OPPOSING_LAWYER', personType: '' },
      ],
      courtLevel: 'TRIAL',
      courtName: 'ศาลแพ่ง',
      blackCaseNumber: ' พ.123/2569 ',
      limitationDeadline: '2027-03-01',
    }),
    {
      partyRole: 'PLAINTIFF',
      opponents: [
        { name: 'บริษัท ข จำกัด', personType: 'นิติบุคคล' },
        { name: 'ทนาย ค', role: 'OPPOSING_LAWYER' },
      ],
      courtLevel: 'TRIAL',
      courtName: 'ศาลแพ่ง',
      blackCaseNumber: 'พ.123/2569',
      limitationDeadline: '2027-02-28T17:00:00.000Z',
    },
  );
});

test('a date-only value means that Bangkok day', () => {
  assert.equal(bangkokDayToIso('2027-03-01'), '2027-02-28T17:00:00.000Z');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `Cannot find module './case-create.ts'`.

- [ ] **Step 3: Helper and court select**

Create `apps/web/src/lib/case-create.ts`:

```ts
export interface OpponentRow {
  name: string;
  /** '' = let the API choose the role opposite ours. */
  role: string;
  personType: string;
}

export function bangkokDayToIso(day: string): string {
  return new Date(`${day}T00:00:00+07:00`).toISOString();
}

/** The litigation part of POST /cases, without empty values. */
export function litigationPayload(input: {
  partyRole: string;
  opponents: OpponentRow[];
  courtLevel: string;
  courtName: string;
  blackCaseNumber: string;
  limitationDeadline: string;
}) {
  const opponents = input.opponents
    .map((row) => ({
      name: row.name.trim(),
      ...(row.role ? { role: row.role } : {}),
      ...(row.personType ? { personType: row.personType } : {}),
    }))
    .filter((row) => row.name);
  return {
    ...(input.partyRole ? { partyRole: input.partyRole } : {}),
    ...(opponents.length ? { opponents } : {}),
    courtLevel: input.courtLevel,
    ...(input.courtName.trim() ? { courtName: input.courtName.trim() } : {}),
    ...(input.blackCaseNumber.trim() ? { blackCaseNumber: input.blackCaseNumber.trim() } : {}),
    ...(input.limitationDeadline ? { limitationDeadline: bangkokDayToIso(input.limitationDeadline) } : {}),
  };
}
```

Create `apps/web/src/components/cases/CourtSelect.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { CourtItem } from '@/lib/api';

const OTHER = '__other__';

/** The court catalog, with "ศาลอื่น" for a court not (yet) in it. */
export function CourtSelect({
  id,
  value,
  courts,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  courts: CourtItem[];
  onChange: (name: string) => void;
  className: string;
}) {
  const inCatalog = !value || courts.some((court) => court.name === value);
  const [typing, setTyping] = useState(!inCatalog);

  return (
    <>
      <select
        id={id}
        value={typing ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) { setTyping(true); onChange(''); return; }
          setTyping(false);
          onChange(e.target.value);
        }}
        className={className}
      >
        <option value="">ยังไม่ระบุ</option>
        {courts.map((court) => <option key={court.id} value={court.name}>{court.name}</option>)}
        <option value={OTHER}>ศาลอื่น (พิมพ์เอง)</option>
      </select>
      {typing && (
        <input
          aria-label="ชื่อศาล"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="พิมพ์ชื่อศาล"
          className={className}
        />
      )}
    </>
  );
}
```

`apps/web/src/components/cases/CaseOverviewForm.tsx` — `import { CourtSelect } from './CourtSelect';` and replace the court `<select>…</select>` inside `<label className="text-sm">ศาล…</label>` with `<CourtSelect value={value.courtName} courts={courts} onChange={(name) => set('courtName', name)} className={input} />`.

- [ ] **Step 4: The create page**

In `apps/web/src/app/(dashboard)/cases/new/page.tsx`:

1. Imports: add `CourtItem` to the `@/lib/api` import; `import { CourtSelect } from '@/components/cases/CourtSelect';`, `import { ConflictOverrideDialog } from '@/components/ConflictOverrideDialog';`, `import { conflictMatchesFrom, type ConflictMatchItem } from '@/lib/conflict';`, `import { litigationPayload, type OpponentRow } from '@/lib/case-create';`; add `COURT_LEVEL_LABELS, PARTY_ROLE_LABELS, PartyRole, CASE_NUMBER_HINT, CASE_NUMBER_HTML` to the `@lawfirm/shared` import.
2. State — extend `form` with `partyRole: '', courtLevel: CourtLevel.TRIAL as string, blackCaseNumber: '', limitationDeadline: '',` and add:

```tsx
  const [opponents, setOpponents] = useState<OpponentRow[]>([{ name: '', role: '', personType: '' }]);
  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [conflict, setConflict] = useState<ConflictMatchItem[] | null>(null);
```

   and in the lookup `Promise.all` effect add a sixth entry `api.getCourts(token).catch(() => [] as CourtItem[]),` and `setCourts(courtList)` in the `.then` (destructure `courtList`).
3. Change `const handleSubmit = async () => {` to `const handleSubmit = async (conflictOverrideReason?: string) => {`. In the payload object replace `courtName: …` and `courtLevel: CourtLevel.TRIAL,` with:

```tsx
        ...litigationPayload({
          partyRole: form.partyRole,
          opponents,
          courtLevel: form.courtLevel,
          courtName: form.courtName,
          blackCaseNumber: form.blackCaseNumber,
          limitationDeadline: form.limitationDeadline,
        }),
        ...(conflictOverrideReason ? { conflictOverrideReason } : {}),
```

4. After `const createdClient = await api.createClient(…)` add (so a retry after the conflict prompt reuses this client instead of creating it again):

```tsx
        setClients((rows) => [...rows, createdClient]);
        setForm((current) => ({ ...current, clientId: createdClient.id, clientName: createdClient.name }));
```

5. In the `catch (err)` of `handleSubmit`, first:

```tsx
      const matches = conflictMatchesFrom(err);
      if (matches) {
        setConflict(matches);
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
```

6. `applySuggestion` — an extracted opposing party becomes an opponent row:

```tsx
    if (field === 'opposingParty') {
      setOpponents((rows) => rows.some((row) => row.name.trim() === value.trim())
        ? rows
        : [...rows.filter((row) => row.name.trim()), { name: value.trim(), role: '', personType: '' }]);
      return;
    }
```

   (insert at the top of `applySuggestion`), and in `SuggestedFieldsPanel`'s `current` prop replace `opposingParty: form.customFields.opposingParty,` with `opposingParty: opponents.map((row) => row.name).filter(Boolean).join(', '),`. In the case-type `onChange`, drop `opposingParty: current.customFields.opposingParty ?? '',` from the preserved custom fields.
7. Form body — directly after the lead-lawyer `<label>` add a "คู่ความและศาล" section:

```tsx
              <section className="space-y-4 border-t border-border pt-5" aria-label="คู่ความและศาล">
                <h3 className="text-sm font-semibold">คู่ความและศาล</h3>
                <label htmlFor="party-role" className={fieldLabel}>เราเป็น
                  <select id="party-role" value={form.partyRole} onChange={(e) => setForm({ ...form, partyRole: e.target.value })} className={inputClass}>
                    <option value="">ยังไม่ระบุ</option>
                    {Object.values(PartyRole).map((role) => <option key={role} value={role}>{PARTY_ROLE_LABELS[role]}</option>)}
                  </select>
                </label>
                <div className="space-y-2">
                  <p className={fieldLabel}>คู่ความฝ่ายตรงข้าม</p>
                  {opponents.map((row, index) => (
                    <div key={index} className="grid min-w-0 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]">
                      <input aria-label={`ชื่อคู่ความฝ่ายตรงข้ามรายที่ ${index + 1}`} value={row.name} placeholder="ชื่อบุคคลหรือบริษัท"
                        onChange={(e) => setOpponents((rows) => rows.map((r, i) => i === index ? { ...r, name: e.target.value } : r))} className={inputClass} />
                      <select aria-label={`ฐานะคู่ความรายที่ ${index + 1}`} value={row.role}
                        onChange={(e) => setOpponents((rows) => rows.map((r, i) => i === index ? { ...r, role: e.target.value } : r))} className={inputClass}>
                        <option value="">ฝั่งตรงข้ามของเรา</option>
                        <option value="PLAINTIFF">โจทก์</option><option value="DEFENDANT">จำเลย</option>
                        <option value="PETITIONER">ผู้ร้อง</option><option value="RESPONDENT">ผู้คัดค้าน</option>
                        <option value="OPPOSING_LAWYER">ทนายฝ่ายตรงข้าม</option><option value="OPPOSING_INSURER">บริษัทประกันฝ่ายตรงข้าม</option>
                        <option value="OTHER">อื่น ๆ</option>
                      </select>
                      <select aria-label={`ประเภทบุคคลรายที่ ${index + 1}`} value={row.personType}
                        onChange={(e) => setOpponents((rows) => rows.map((r, i) => i === index ? { ...r, personType: e.target.value } : r))} className={inputClass}>
                        <option value="">ประเภท</option><option value="บุคคลธรรมดา">บุคคลธรรมดา</option><option value="นิติบุคคล">นิติบุคคล</option>
                      </select>
                      <Button type="button" variant="ghost" size="icon" aria-label={`ลบคู่ความรายที่ ${index + 1}`} disabled={opponents.length === 1}
                        onClick={() => setOpponents((rows) => rows.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setOpponents((rows) => [...rows, { name: '', role: '', personType: '' }])}>
                    <Plus className="h-3.5 w-3.5" /> เพิ่มคู่ความ
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label htmlFor="court-level" className={fieldLabel}>ระดับศาล
                    <select id="court-level" value={form.courtLevel} onChange={(e) => setForm({ ...form, courtLevel: e.target.value })} className={inputClass}>
                      {Object.values(CourtLevel).map((level) => <option key={level} value={level}>{COURT_LEVEL_LABELS[level]}</option>)}
                    </select>
                  </label>
                  <label htmlFor="court-name" className={fieldLabel}>ศาล
                    <CourtSelect id="court-name" value={form.courtName} courts={courts} onChange={(courtName) => setForm((current) => ({ ...current, courtName }))} className={inputClass} />
                  </label>
                  <label htmlFor="black-case-number" className={fieldLabel}>หมายเลขคดีดำ
                    <input id="black-case-number" value={form.blackCaseNumber} onChange={(e) => setForm({ ...form, blackCaseNumber: e.target.value })}
                      placeholder={CASE_NUMBER_HINT} pattern={CASE_NUMBER_HTML} title={CASE_NUMBER_HINT} className={inputClass} />
                  </label>
                  <label htmlFor="limitation-deadline" className={fieldLabel}>วันครบอายุความ
                    <input id="limitation-deadline" type="date" value={form.limitationDeadline} onChange={(e) => setForm({ ...form, limitationDeadline: e.target.value })} className={inputClass} />
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">ระบบเตือนก่อนครบ 90 / 30 / 7 / 1 วัน</span>
                  </label>
                </div>
              </section>
```

8. In "รายละเอียดคดีเพิ่มเติม": delete the `คู่กรณี` `<label>` and the `ศาล` `<label>` (both now live above).
9. Custom fields — show every field of the type, required or not: change the section condition to `fieldSchema.some((field) => field.key !== 'chargeSection')`, its heading to `ข้อมูลของประเภทคดีนี้`, the map filter to `fieldSchema.filter((field) => field.key !== 'chargeSection')`, render `{field.label}{field.required ? ' *' : ''}`, and set `required={field.required}` on the inputs/selects. Likewise show the `chargeSection` textarea whenever the type has that field (`fieldSchema.some((field) => field.key === 'chargeSection')`), `required={…required}` and label `ข้อหาหรือฐานความผิด{required ? ' *' : ''}`.
10. Before the closing `</div>` of the page, render the prompt:

```tsx
      {conflict && (
        <ConflictOverrideDialog
          matches={conflict}
          busy={submitting}
          onCancel={() => setConflict(null)}
          onConfirm={(reason) => { setConflict(null); void handleSubmit(reason); }}
        />
      )}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter web test && pnpm --filter web exec tsc --noEmit`
Expected: PASS / no errors.

Manual check (dev server): create a case "เราเป็น โจทก์", opponent "บริษัท ข จำกัด", ศาลแพ่ง, black number, อายุความ in 2027 → case opens; Overview shows the opponent as จำเลย and the client as โจทก์ (OURS); Timeline shows "ครบอายุความ" on that day at 16:30. Repeat with the opponent name equal to an existing client → the conflict dialog appears; a reason opens the case and only one client record exists.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/web/src/lib/case-create.ts apps/web/src/lib/case-create.test.ts apps/web/src/components/cases/CourtSelect.tsx apps/web/src/components/cases/CaseOverviewForm.tsx "apps/web/src/app/(dashboard)/cases/new/page.tsx"
/usr/bin/git commit -m "feat(web): create-case form with our side, opponents, court catalog, case number, limitation date and conflict prompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Web — case overview edits parties properly (our side, additional clients, limitation, participant links)

**Files:**
- Create: `apps/web/src/lib/participants.ts`, `apps/web/src/lib/participants.test.ts`
- Modify: `apps/web/src/lib/api.ts` (`CaseItem.partyRole`, `CaseItem.participants`, `CaseParticipantItem` links)
- Modify: `apps/web/src/components/cases/CaseOverviewForm.tsx` (`CaseOverviewValues`; party-role options; additional clients; limitation date; drop "คู่กรณี")
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` (overview form init ~:196-212 and ~:556-588, `handleSaveOverview` ~:624-655, view rows ~:1290-1300 and ~:1435-1440)
- Modify: `apps/web/src/components/cases/CaseParticipantsSection.tsx` (client link, represented party)

**Interfaces:**
- Consumes: Task 12 `UpdateCaseDto.clients`, `partyRole: PartyRole | null`, participant `clientId`/`representedByParticipantId`; Task 8 `limitationDeadline`; Task 15 `bangkokDayToIso`.
- Produces: `COUNSEL_ROLES: readonly string[]` (`OPPOSING_LAWYER`, `OPPOSING_INSURER`); `participantPayload(form: Record<string, string>): Record<string, string | null>` — '' → null, `clientId` only on side OURS, `representedByParticipantId` only for counsel roles. `CaseOverviewValues` loses `opposingParty`, gains `limitationDeadline: string` (`YYYY-MM-DD` Bangkok) and `additionalClientIds: string[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/participants.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { participantPayload } from './participants.ts';

const base = { name: 'บริษัท ก', role: 'PLAINTIFF', side: 'OURS', clientId: 'cl-1', representedByParticipantId: 'p-2', phone: '' };

test('blanks become null', () => {
  assert.equal(participantPayload(base).phone, null);
});

test('a client link only on our side; a represented party only for counsel', () => {
  assert.deepEqual(
    [participantPayload(base).clientId, participantPayload(base).representedByParticipantId],
    ['cl-1', null],
  );
  const counsel = participantPayload({ ...base, role: 'OPPOSING_LAWYER', side: 'OPPONENT' });
  assert.deepEqual([counsel.clientId, counsel.representedByParticipantId], [null, 'p-2']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `Cannot find module './participants.ts'`.

- [ ] **Step 3: Helper and types**

Create `apps/web/src/lib/participants.ts`:

```ts
/** Opposing counsel / insurer act for a party; that link is what `representedByParticipantId` records. */
export const COUNSEL_ROLES: readonly string[] = ['OPPOSING_LAWYER', 'OPPOSING_INSURER'];

export function participantPayload(form: Record<string, string>): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(form)) data[key] = value === '' ? null : value;
  if (form.side !== 'OURS') data.clientId = null;
  if (!COUNSEL_ROLES.includes(form.role)) data.representedByParticipantId = null;
  return data;
}
```

`apps/web/src/lib/api.ts`:
- `CaseItem.partyRole?: import('@lawfirm/shared').PartyRole | null;`
- `CaseItem.participants?: CaseParticipantItem[];` (the API now returns full rows everywhere)
- in `CaseParticipantItem` add `clientId?: string | null;` and `representedByParticipantId?: string | null;`
- in `CaseDetail`, drop its own `participants` override if it now duplicates `CaseItem`'s.

- [ ] **Step 4: Overview form**

`apps/web/src/components/cases/CaseOverviewForm.tsx`:
1. Import `PARTY_ROLE_LABELS, PartyRole` from `@lawfirm/shared`.
2. In `CaseOverviewValues` remove `opposingParty: string;` and add `limitationDeadline: string; additionalClientIds: string[];`; change `set`'s key type to `Exclude<keyof CaseOverviewValues, 'customers' | 'additionalClientIds'>`.
3. Replace the party-role `<select>` options with `<option value="">ยังไม่ระบุ</option>{Object.values(PartyRole).map(role => <option key={role} value={role}>{PARTY_ROLE_LABELS[role]}</option>)}`.
4. Replace the `คู่กรณี` `<label>` with:

```tsx
        <label className="text-sm">วันครบอายุความ<input type="date" value={value.limitationDeadline} onChange={e => set('limitationDeadline', e.target.value)} className={input} /><span className="mt-1 block text-xs text-muted-foreground">ระบบเตือนก่อนครบ 90 / 30 / 7 / 1 วัน · คู่ความแก้ที่ส่วน &quot;คู่ความและผู้เกี่ยวข้อง&quot;</span></label>
```

5. After the ลูกความ `<label>` (still inside the people section) add:

```tsx
        <div className="space-y-2 text-sm sm:col-span-2">
          <p>ลูกความเพิ่มเติม</p>
          {value.additionalClientIds.map((clientId, index) => (
            <div key={index} className="flex min-w-0 items-center gap-2">
              <select aria-label={`ลูกความเพิ่มเติมรายที่ ${index + 1}`} value={clientId}
                onChange={e => onChange({ ...value, additionalClientIds: value.additionalClientIds.map((id, i) => i === index ? e.target.value : id) })} className={input}>
                <option value="">เลือกลูกความ</option>
                {clients.filter(client => client.id !== value.clientId).map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
              <Button type="button" variant="ghost" size="icon" aria-label={`ลบลูกความเพิ่มเติมรายที่ ${index + 1}`}
                onClick={() => onChange({ ...value, additionalClientIds: value.additionalClientIds.filter((_, i) => i !== index) })}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...value, additionalClientIds: [...value.additionalClientIds, ''] })}>
            <Plus className="h-3.5 w-3.5" /> เพิ่มลูกความ
          </Button>
        </div>
```

- [ ] **Step 5: Case page**

`apps/web/src/app/(dashboard)/cases/[id]/page.tsx`:
1. Imports: `PARTY_ROLE_LABELS, type PartyRole` from `@lawfirm/shared`; `import { bangkokDayToIso } from '@/lib/case-create';`.
2. Initial `overviewForm` state: remove `opposingParty: '',`, add `limitationDeadline: '', additionalClientIds: [] as string[],`.
3. In `startEditOverview`'s `setOverviewForm({...})`: remove the `opposingParty` line and add

```tsx
      limitationDeadline: legalCase.limitationDeadline
        ? new Date(legalCase.limitationDeadline).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
        : '',
      additionalClientIds: (legalCase.additionalClients ?? []).map((ac) => ac.clientId),
```

   and add the additional clients to `knownClients` the same way the customers are (`for (const ac of legalCase.additionalClients ?? []) knownClients.set(ac.clientId, { ...ac.client, contacts: [] });`).
4. In `handleSaveOverview`'s `api.updateCase` body:
   - change `partyRole: overviewForm.partyRole || null,` (unchanged shape, now any `PartyRole`);
   - add `limitationDeadline: overviewForm.limitationDeadline ? bangkokDayToIso(overviewForm.limitationDeadline) : null,`
   - add `clients: overviewForm.additionalClientIds.filter(Boolean).map((clientId) => ({ clientId })),`
   - replace the `customFields` object with:

```tsx
        customFields: {
          ...Object.fromEntries(Object.entries(legalCase.customFields ?? {}).filter(([key]) => key !== 'opposingParty')),
          chargeSection: overviewForm.chargeSection.trim(),
          incidentDate: overviewForm.incidentDate,
          estimatedDamage: overviewForm.estimatedDamage,
        },
```

5. View mode: replace the "ฝ่ายเรา" value expression with `{legalCase.partyRole ? PARTY_ROLE_LABELS[legalCase.partyRole as PartyRole] : '—'}`; next to it add

```tsx
                  <div>
                    <p className="text-xs text-muted-foreground">วันครบอายุความ</p>
                    <p className="font-medium">{legalCase.limitationDeadline ? formatDate(legalCase.limitationDeadline) : '—'}</p>
                  </div>
```

   and in the custom-fields label map delete the `opposingParty: 'คู่กรณี',` entry (and filter `k !== 'opposingParty'` in the entries filter, for any case the migration missed).

- [ ] **Step 6: Participant links**

`apps/web/src/components/cases/CaseParticipantsSection.tsx`:
1. Imports: `import { useEffect } from 'react';` (merge), `ClientItem` from `@/lib/api`, `import { COUNSEL_ROLES, participantPayload } from '@/lib/participants';`.
2. `emptyForm` gains `clientId: '', representedByParticipantId: '',`; `openEdit` sets `clientId: p.clientId ?? '', representedByParticipantId: p.representedByParticipantId ?? '',`.
3. Load the firm's clients when the form opens:

```tsx
  const [clients, setClients] = useState<ClientItem[]>([]);
  useEffect(() => {
    if (!showForm || !token || clients.length) return;
    api.getClients(token).then(setClients).catch(() => setClients([]));
  }, [showForm, token, clients.length]);
```

4. In `handleSubmit` replace the `for (const [k, v] of Object.entries(form))` loop with `const data = participantPayload(form);`.
5. In the form, after the side selector, add:

```tsx
            {form.side === 'OURS' && (
              <label className="block text-sm">
                ลูกความในทะเบียน (ถ้าเป็นคนเดียวกัน)
                <select value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                  <option value="">ไม่ผูก</option>
                  {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </label>
            )}
            {COUNSEL_ROLES.includes(form.role) && (
              <label className="block text-sm">
                เป็นตัวแทนของ
                <select value={form.representedByParticipantId} onChange={e => setForm({ ...form, representedByParticipantId: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                  <option value="">ยังไม่ระบุ</option>
                  {participants.filter(p => p.id !== editingId && !COUNSEL_ROLES.includes(p.role)).map(p => <option key={p.id} value={p.id}>{p.name} ({ROLE_LABELS[p.role] ?? p.role})</option>)}
                </select>
              </label>
            )}
```

6. In each listed participant row, under the name, show the link when present: `{p.representedByParticipantId && <span className="text-xs text-muted-foreground">ตัวแทนของ {participants.find(x => x.id === p.representedByParticipantId)?.name ?? '—'}</span>}` and `{p.clientId && <span className="text-xs text-muted-foreground">ลูกความในทะเบียน</span>}`.
7. Re-sync when the parent reloads (the case page reloads after proceeding actions and stage moves): add

```tsx
  useEffect(() => { if (!showForm && initialParticipants) setParticipants(initialParticipants); }, [initialParticipants, showForm]);
```

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter web test && pnpm --filter web exec tsc --noEmit`
Expected: PASS / no errors.

Manual check: on a case, "แก้ไขข้อมูลคดี" → set เราเป็น "ผู้ร้อง", add an additional client, set อายุความ → บันทึก → the participants list is still there and now includes the client as ผู้ร้อง (ฝ่ายเรา); add opposing counsel and link "เป็นตัวแทนของ" the opponent → the row shows "ตัวแทนของ …"; Timeline shows "เพิ่มคู่ความ: …".

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/web/src/lib/participants.ts apps/web/src/lib/participants.test.ts apps/web/src/lib/api.ts apps/web/src/components/cases/CaseOverviewForm.tsx "apps/web/src/app/(dashboard)/cases/[id]/page.tsx" apps/web/src/components/cases/CaseParticipantsSection.tsx
/usr/bin/git commit -m "feat(web): overview edits party role, additional clients and limitation date; participants link to clients and counsel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Mobile — our side, opponents and a real client picker on create; parties by side on the case

**Files:**
- Modify: `packages/shared/src/index.ts` (after `enum ParticipantSide` ~:536: `PARTICIPANT_ROLE_LABELS`, `PARTICIPANT_SIDE_LABELS`, `groupParticipantsBySide`)
- Create: `apps/api/src/common/participant-groups.spec.ts` (tests the shared helper — mobile has no test runner)
- Modify: `apps/mobile/src/api/client.ts:17-24, ~:102-111` (`ApiError.body`)
- Modify: `apps/mobile/src/api/types.ts` (`CaseDetail.partyRole`, `participants`; `CaseParticipant`)
- Create: `apps/mobile/src/components/ClientPicker.tsx`
- Modify: `apps/mobile/app/case/new.tsx`
- Modify: `apps/mobile/app/case/[id].tsx` (overview card: parties by side)
- Create: `apps/mobile/app/case/[id]/party.tsx` (add / edit / delete one participant)

**Interfaces:**
- Consumes: Task 1 `PartyRole`, `PARTY_ROLE_LABELS`, `opponentParticipantRole`; Task 12 `opponents`, participant endpoints with activity/audit; Task 13 `409 CONFLICT_FOUND` + `conflictOverrideReason`; Task 9/12 full `participants` on `GET /cases/:id`.
- Produces (shared): `PARTICIPANT_ROLE_LABELS: Record<ParticipantRole, string>`, `PARTICIPANT_SIDE_LABELS: Record<ParticipantSide, string>`, `groupParticipantsBySide<T extends { side: string }>(rows: T[]): { side: ParticipantSide; label: string; items: T[] }[]` (OURS → OPPONENT → NEUTRAL, empty groups dropped). Mobile: `ApiError.body?: unknown`; `<ClientPicker value onChange disabled />` with `value: { id: string; name: string } | null`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/participant-groups.spec.ts`:

```ts
import { PARTICIPANT_ROLE_LABELS, groupParticipantsBySide } from '@lawfirm/shared';

describe('groupParticipantsBySide', () => {
  it('orders our side, then the opponents, then neutral, dropping empty groups', () => {
    const groups = groupParticipantsBySide([
      { id: 'w', side: 'NEUTRAL' },
      { id: 'o1', side: 'OPPONENT' },
      { id: 'u', side: 'OURS' },
      { id: 'o2', side: 'OPPONENT' },
    ]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['ฝ่ายเรา', ['u']],
      ['ฝ่ายตรงข้าม', ['o1', 'o2']],
      ['ผู้เกี่ยวข้อง', ['w']],
    ]);
    expect(groupParticipantsBySide([{ id: 'x', side: 'OURS' }]).map((g) => g.side)).toEqual(['OURS']);
  });

  it('labels every participant role in Thai', () => {
    expect(PARTICIPANT_ROLE_LABELS.RESPONDENT).toBe('ผู้คัดค้าน');
    expect(PARTICIPANT_ROLE_LABELS.OPPOSING_LAWYER).toBe('ทนายฝ่ายตรงข้าม');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api exec jest --config jest.config.js src/common/participant-groups.spec.ts`
Expected: FAIL — `groupParticipantsBySide is not a function`.

- [ ] **Step 3: Shared labels and grouping**

In `packages/shared/src/index.ts`, directly after the `ParticipantSide` enum, add (kept in `index.ts`, not `litigation.ts`: these maps are built at load time from the enums, and `litigation.ts` only imports `index` as a type to avoid a CommonJS load-order cycle):

```ts
export const PARTICIPANT_ROLE_LABELS: Record<ParticipantRole, string> = {
  [ParticipantRole.PLAINTIFF]: 'โจทก์',
  [ParticipantRole.JOINT_PLAINTIFF]: 'โจทก์ร่วม',
  [ParticipantRole.DEFENDANT]: 'จำเลย',
  [ParticipantRole.JOINT_DEFENDANT]: 'จำเลยร่วม',
  [ParticipantRole.PETITIONER]: 'ผู้ร้อง',
  [ParticipantRole.RESPONDENT]: 'ผู้คัดค้าน',
  [ParticipantRole.WITNESS]: 'พยาน',
  [ParticipantRole.EXPERT]: 'ผู้เชี่ยวชาญ',
  [ParticipantRole.OPPOSING_LAWYER]: 'ทนายฝ่ายตรงข้าม',
  [ParticipantRole.OPPOSING_INSURER]: 'บริษัทประกันฝ่ายตรงข้าม',
  [ParticipantRole.OTHER]: 'อื่น ๆ',
};

export const PARTICIPANT_SIDE_LABELS: Record<ParticipantSide, string> = {
  [ParticipantSide.OURS]: 'ฝ่ายเรา',
  [ParticipantSide.OPPONENT]: 'ฝ่ายตรงข้าม',
  [ParticipantSide.NEUTRAL]: 'ผู้เกี่ยวข้อง',
};

const SIDE_ORDER: ParticipantSide[] = [ParticipantSide.OURS, ParticipantSide.OPPONENT, ParticipantSide.NEUTRAL];

export function groupParticipantsBySide<T extends { side: string }>(rows: T[]) {
  return SIDE_ORDER.map((side) => ({
    side,
    label: PARTICIPANT_SIDE_LABELS[side],
    items: rows.filter((row) => row.side === side),
  })).filter((group) => group.items.length > 0);
}
```

Run `pnpm --filter @lawfirm/shared build`, then the Step 2 command again → PASS; also re-run `src/common/litigation-enums.spec.ts` → PASS.

- [ ] **Step 4: Mobile API error body and types**

`apps/mobile/src/api/client.ts` — give `ApiError` a third constructor parameter `public body?: unknown,`; in `api()` keep the parsed body in a variable declared before the `try` (`let parsed: unknown;` … `parsed = await res.json(); const body = parsed as …`) and `throw new ApiError(res.status, message, parsed);`.

`apps/mobile/src/api/types.ts`:

```ts
export interface CaseParticipant {
  id: string;
  name: string;
  role: string;
  side: string;
  personType: string | null;
  phone: string | null;
  clientId: string | null;
  representedByParticipantId: string | null;
}
```

and in `CaseDetail` add `partyRole?: import('@lawfirm/shared').PartyRole | null;` and `participants?: CaseParticipant[];`.

- [ ] **Step 5: Client picker**

Create `apps/mobile/src/components/ClientPicker.tsx`:

```tsx
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useClients } from '@/api/hooks';
import { Button, ErrorNote } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export type PickedClient = { id: string; name: string };

/** Search the firm's clients; create one from the typed name when nobody matches. */
export function ClientPicker({ value, onChange, disabled = false }: {
  value: PickedClient | null;
  onChange: (client: PickedClient | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cache = useQueryClient();
  const clients = useClients(search.trim());

  if (value) {
    return <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }}>{value.name}</Text>
      <Button title="เปลี่ยน" ghost disabled={disabled} onPress={() => onChange(null)} />
    </View>;
  }

  const create = async () => {
    const name = search.trim();
    if (!name) return;
    setBusy(true); setError('');
    try {
      const created = await api<PickedClient>('/clients', { method: 'POST', body: { name, type: 'INDIVIDUAL', contacts: [{ name, isPrimary: true }] } });
      await cache.invalidateQueries({ queryKey: ['clients'] });
      onChange({ id: created.id, name: created.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สร้างลูกความไม่สำเร็จ');
    } finally { setBusy(false); }
  };

  const rows = (clients.data ?? []).slice(0, 8);
  const exact = rows.some((c) => c.name.trim().toLowerCase() === search.trim().toLowerCase());
  return <View style={{ gap: spacing.sm }}>
    <TextInput value={search} onChangeText={setSearch} editable={!disabled && !busy} placeholder="ค้นหาชื่อลูกความ"
      style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.button, padding: spacing.md, minHeight: 48 }} />
    {rows.map((c) => (
      <Pressable key={c.id} accessibilityRole="button" disabled={disabled} onPress={() => onChange({ id: c.id, name: c.name })}
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }}>
        <Text>{c.name}</Text>
      </Pressable>
    ))}
    {!!search.trim() && !exact && <Button title={`สร้างลูกความใหม่ "${search.trim()}"`} ghost busy={busy} disabled={disabled} onPress={create} />}
    {clients.isError && <ErrorNote message="โหลดรายชื่อลูกความไม่สำเร็จ" onRetry={() => clients.refetch()} />}
    {!!error && <Text style={{ color: colors.warn }}>{error}</Text>}
  </View>;
}
```

(`colors.line` and `radius.button` are the tokens `app/event/new.tsx` already uses for inputs.)

- [ ] **Step 6: Create / edit screen**

`apps/mobile/app/case/new.tsx`:
1. Imports: add `PARTY_ROLE_LABELS, PartyRole` to the `@lawfirm/shared` import; `import { ApiError } from '@/api/client';` (merge with `api`); `import { ClientPicker, PickedClient } from '@/components/ClientPicker';`.
2. State: replace `const [clientName, setClientName] = useState('');` with `const [pickedClient, setPickedClient] = useState<PickedClient | null>(null);` and add:

```tsx
  const [partyRole, setPartyRole] = useState('');
  const [opponents, setOpponents] = useState<string[]>(['']);
  const [conflict, setConflict] = useState<Array<{ name: string; side?: string; ownRef?: string; caseTitle?: string }> | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
```

3. In the seeding effect replace `setClientName(…)` with `setPickedClient(data.client ? { id: data.client.id, name: data.client.name } : null); setPartyRole(data.partyRole ?? '');`.
4. In `save`, build the body as:

```tsx
        const body = { title: title.trim(),
          ...(pickedClient ? { clientId: pickedClient.id, clientName: pickedClient.name } : {}),
          partyRole: partyRole || (id ? null : undefined),
          ...(!id ? { opponents: opponents.map(name => name.trim()).filter(Boolean).map(name => ({ name })) } : {}),
          ...(!id && overrideReason.trim() ? { conflictOverrideReason: overrideReason.trim() } : {}),
          description: description.trim(), courtName: courtName || undefined, courtLevel, caseTypeId: caseTypeId || undefined,
          ...(id && status !== current.data?.status ? { status } : {}) };
```

   and in its `catch` add first:

```tsx
      const conflictBody = e instanceof ApiError && e.status === 409 ? (e.body as { code?: string; matches?: typeof conflict }) : null;
      if (conflictBody?.code === 'CONFLICT_FOUND') { setConflict(conflictBody.matches ?? []); return; }
```

   (rename the caught variable to `e` if it is named differently).
5. In the "ข้อมูลคดี" section replace `<FormField label="ชื่อลูกความ" … />` with:

```tsx
    <SectionLabel style={formLabelSpacing}>ลูกความ</SectionLabel>
    <ClientPicker value={pickedClient} onChange={setPickedClient} disabled={busy || !!savedId} />
    <Dropdown label="เราเป็น" value={partyRole} onChange={setPartyRole} disabled={busy || !!savedId}
      options={[{ value: '', label: 'ยังไม่ระบุ' }, ...Object.values(PartyRole).map(role => ({ value: role, label: PARTY_ROLE_LABELS[role] }))]} />
    {!id && <>
      <SectionLabel style={formLabelSpacing}>คู่ความฝ่ายตรงข้าม</SectionLabel>
      {opponents.map((name, index) => <FormField key={index} label={`รายที่ ${index + 1}`} value={name} disabled={busy || !!savedId}
        onChange={next => setOpponents(rows => rows.map((row, i) => i === index ? next : row))} placeholder="ชื่อบุคคลหรือบริษัท" />)}
      <Button title="เพิ่มคู่ความ" ghost disabled={busy || !!savedId} onPress={() => setOpponents(rows => [...rows, ''])} />
    </>}
```

6. Before the save button:

```tsx
    {conflict && <Card>
      <Text style={{ color: colors.warn, fontWeight: '700' }}>พบชื่อที่อาจขัดกัน</Text>
      {conflict.map((m, i) => <Text key={i} style={{ marginTop: 4 }}>{m.name} — {m.side === 'OURS' ? 'ฝ่ายเรา' : 'ฝ่ายตรงข้าม'}{m.ownRef ? ` ในคดี ${m.ownRef}` : ''}</Text>)}
      <FormField label="เหตุผลที่เปิดต่อ (อย่างน้อย 10 ตัวอักษร)" value={overrideReason} onChange={setOverrideReason} multiline disabled={busy} />
    </Card>}
```

   and make the button `disabled={!!conflict && overrideReason.trim().length < 10}` (the next press resends with the reason). Add `Card` to the `@/components/ui` import.

- [ ] **Step 7: Parties on the case**

`apps/mobile/app/case/[id].tsx`:
1. Imports: `import { groupParticipantsBySide, PARTICIPANT_ROLE_LABELS, PARTY_ROLE_LABELS, type ParticipantRole, type PartyRole } from '@lawfirm/shared';`
2. In the overview `Card`, after `<InfoRow label="ลูกความ" … />` add `<InfoRow label="เราเป็น" value={detail.partyRole ? PARTY_ROLE_LABELS[detail.partyRole as PartyRole] : null} />`.
3. After the overview `Card` (still inside `tab === 'ภาพรวม'`, wrap both in a fragment) add:

```tsx
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.infoLabel}>คู่ความ</Text>
              <Button title="เพิ่ม" ghost onPress={() => router.push(`/case/${id}/party`)} />
            </View>
            {(detail.participants ?? []).length === 0
              ? <EmptyNote>ยังไม่มีคู่ความ</EmptyNote>
              : groupParticipantsBySide(detail.participants ?? []).map(group => <View key={group.side} style={{ marginTop: spacing.sm }}>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{group.label}</Text>
                  {group.items.map(p => <Pressable key={p.id} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}
                    onPress={() => router.push(`/case/${id}/party?participantId=${p.id}`)}>
                    <Text>{p.name} · {PARTICIPANT_ROLE_LABELS[p.role as ParticipantRole] ?? p.role}</Text>
                  </Pressable>)}
                </View>)}
          </Card>
```

Create `apps/mobile/app/case/[id]/party.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { PARTICIPANT_ROLE_LABELS, PARTICIPANT_SIDE_LABELS, ParticipantRole, ParticipantSide, opponentParticipantRole } from '@lawfirm/shared';
import { api } from '@/api/client';
import { useCase } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { Dropdown } from '@/components/Dropdown';
import { FormField, FormPage, FormSection } from '@/components/Form';
import { Button, ErrorNote, Loading } from '@/components/ui';
import { colors } from '@/theme';

export default function CasePartyScreen() {
  const { id, participantId } = useLocalSearchParams<{ id: string; participantId?: string }>();
  const router = useRouter();
  const cache = useQueryClient();
  const legalCase = useCase(id);
  const existing = legalCase.data?.participants?.find((p) => p.id === participantId);
  const [name, setName] = useState('');
  const [side, setSide] = useState<string>(ParticipantSide.OPPONENT);
  const [role, setRole] = useState<string>(ParticipantRole.OTHER);
  const [personType, setPersonType] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existing) {
      setName(existing.name); setSide(existing.side); setRole(existing.role);
      setPersonType(existing.personType ?? ''); setPhone(existing.phone ?? '');
    } else if (legalCase.data) {
      setRole(opponentParticipantRole(legalCase.data.partyRole ?? null));
    }
  }, [existing?.id, legalCase.data?.id]);

  if (legalCase.isLoading) return <Loading />;
  if (!legalCase.data) return <FormPage><ErrorNote message="โหลดคดีไม่สำเร็จ" onRetry={() => legalCase.refetch()} /></FormPage>;

  const done = async () => {
    await cache.invalidateQueries({ queryKey: ['case', id] });
    router.back();
  };

  const save = async () => {
    if (!name.trim()) return Alert.alert('กรอกไม่ครบ', 'ใส่ชื่อคู่ความ');
    setBusy(true); setError('');
    try {
      const body = { name: name.trim(), side, role, personType: personType || null, phone: phone.trim() || null };
      await api(existing ? `/cases/${id}/participants/${existing.id}` : `/cases/${id}/participants`, { method: existing ? 'PATCH' : 'POST', body });
      await done();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally { setBusy(false); }
  };

  const remove = () => Alert.alert('ลบคู่ความ', `ลบ "${existing?.name}"?`, [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: 'ลบ', style: 'destructive', onPress: async () => {
      setBusy(true);
      try { await api(`/cases/${id}/participants/${existing!.id}`, { method: 'DELETE' }); await done(); }
      catch (e) { setError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ'); setBusy(false); }
    } },
  ]);

  return <FormPage>
    <Stack.Screen options={{ title: existing ? 'แก้ไขคู่ความ' : 'เพิ่มคู่ความ' }} />
    <FormSection title={legalCase.data.ownRef} detail={legalCase.data.title}>
      <FormField label="ชื่อ" value={name} onChange={setName} disabled={busy} />
      <Dropdown label="ฝ่าย" value={side} onChange={setSide} disabled={busy}
        options={Object.values(ParticipantSide).map((s) => ({ value: s, label: PARTICIPANT_SIDE_LABELS[s] }))} />
      <Dropdown label="ฐานะในคดี" value={role} onChange={setRole} disabled={busy}
        options={Object.values(ParticipantRole).map((r) => ({ value: r, label: PARTICIPANT_ROLE_LABELS[r] }))} />
      <Dropdown label="ประเภทบุคคล" value={personType} onChange={setPersonType} disabled={busy}
        options={[{ value: '', label: 'ยังไม่ระบุ' }, { value: 'บุคคลธรรมดา', label: 'บุคคลธรรมดา' }, { value: 'นิติบุคคล', label: 'นิติบุคคล' }]} />
      <FormField label="โทรศัพท์" value={phone} onChange={setPhone} disabled={busy} />
    </FormSection>
    {!!error && <Text style={{ color: colors.warn }}>{error}</Text>}
    <Button title="บันทึก" busy={busy} onPress={save} />
    {existing && <Button title="ลบคู่ความ" ghost disabled={busy} onPress={remove} />}
  </FormPage>;
}
```

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @lawfirm/shared build && pnpm --filter @lawfirm/mobile typecheck && pnpm --filter api exec jest --config jest.config.js src/common`
Expected: no errors / PASS.

Manual check (Expo, iOS simulator): new case → search a client, pick "เราเป็น จำเลย", add one opponent → saved case shows the client under ฝ่ายเรา as จำเลย and the opponent under ฝ่ายตรงข้าม as โจทก์ → tap the opponent → edit phone → back → updated. Create a case whose opponent is an existing client → the conflict card appears; the button stays disabled until 10 characters of reason.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add packages/shared/src/index.ts apps/api/src/common/participant-groups.spec.ts apps/mobile/src/api/client.ts apps/mobile/src/api/types.ts apps/mobile/src/components/ClientPicker.tsx apps/mobile/app/case/new.tsx "apps/mobile/app/case/[id].tsx" "apps/mobile/app/case/[id]/party.tsx"
/usr/bin/git commit -m "feat(mobile): our side, opponents and client picker on create; parties grouped by side with add/edit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Calculators — court fee (ตาราง 1 ท้าย ป.วิ.พ.) and simple interest

**Files:**
- Modify: `packages/shared/src/litigation.ts` (append `courtFee`, `simpleInterest`, `interestDays`, constants)
- Create: `apps/api/src/common/litigation-calculators.spec.ts` (tests the shared functions)
- Create: `apps/web/src/components/cases/LitigationCalculatorsCard.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` (ทุนทรัพย์ row ~:1294; card under `CaseProceedingsCard`)
- Modify: `apps/web/src/lib/case-print-forms.ts:21, :56`, `apps/web/src/lib/case-print-forms.test.ts`

**Interfaces:**
- Produces (shared): `COURT_FEE_NON_MONEY = 200`; `courtFee(amount: number | null): number` (baht, 2 decimals; `null` = claim with no money value); `DEFAULT_INTEREST_RATE = 5`; `simpleInterest(principal: number, ratePercent: number, days: number): number` (baht, 2 decimals); `interestDays(fromDay: string, toDay: string): number` (`YYYY-MM-DD`, calendar days, never negative). Print values gain `courtFee`.

Rates (verified 2026-10-12): ตาราง 1 ค่าธรรมเนียมศาล (ค่าขึ้นศาล) ท้ายประมวลกฎหมายวิธีพิจารณาความแพ่ง, as amended by พ.ร.บ.แก้ไขเพิ่มเติมประมวลกฎหมายวิธีพิจารณาความแพ่ง (ฉบับที่ 24) พ.ศ. 2551 — the Code text at drthawip.com (updated 9 ต.ค. 2569) still footnotes ฉบับที่ 24 as the table's last amendment: money claims 2% of the amount up to 50,000,000 baht but not more than 200,000 baht, plus 0.1% of the part above 50,000,000; claims with no money value 200 baht; a satang fraction rounds up (stated in thanulaw.com's fee guide). These match the spec, so the spec's test points stand. Out of scope and not computed: the separate table items for mortgage foreclosure / arbitral-award enforcement (1%, cap 100,000) and คดีมโนสาเร่ (cap 1,000) — the card says so. **The implementer re-checks the table at https://www.krisdika.go.th (ป.วิ.พ., ตาราง 1) before committing; if the official text differs, it wins and the test values change.**

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/common/litigation-calculators.spec.ts`:

```ts
import { COURT_FEE_NON_MONEY, courtFee, interestDays, simpleInterest } from '@lawfirm/shared';

describe('courtFee (ตาราง 1 ท้าย ป.วิ.พ.)', () => {
  it.each([
    [0, 0],
    [1, 0.02],
    [49_999_999, 200_000],
    [50_000_000, 200_000],
    [50_000_001, 200_000.01], // 0.1% of 1 baht = 0.1 satang → rounds up to 1 satang
    [100_000_000, 250_000],
    [200_000_000, 350_000],
  ])('%d baht → %d baht', (amount, fee) => {
    expect(courtFee(amount)).toBe(fee);
  });

  it('caps at 200,000 from 10,000,000 baht', () => {
    expect(courtFee(9_999_999)).toBe(199_999.98);
    expect(courtFee(10_000_000)).toBe(200_000);
  });

  it('a claim without a money value pays 200 baht', () => {
    expect(courtFee(null)).toBe(COURT_FEE_NON_MONEY);
    expect(COURT_FEE_NON_MONEY).toBe(200);
  });

  it('handles satang amounts', () => {
    expect(courtFee(1_234.56)).toBe(24.7); // 24.6912 → 24.70
  });
});

describe('simpleInterest', () => {
  it('principal × rate × days / 365', () => {
    expect(simpleInterest(100_000, 5, 365)).toBe(5_000);
    expect(simpleInterest(100_000, 5, 30)).toBe(410.96);
    expect(simpleInterest(100_000, 7.5, 0)).toBe(0);
  });

  it('counts calendar days between two Bangkok days, never negative', () => {
    expect(interestDays('2026-01-01', '2027-01-01')).toBe(365);
    expect(interestDays('2028-02-28', '2028-03-01')).toBe(2);
    expect(interestDays('2027-01-02', '2027-01-01')).toBe(0);
  });
});
```

In `apps/web/src/lib/case-print-forms.test.ts`, inside the existing test after `assert.equal(values.amount, '0');` add:

```ts
  assert.equal(values.courtFee, '0');
  assert.equal(casePrintDefaults({ ...c, claimedAmount: 1_000_000 }, '').courtFee, '20,000');
  assert.equal(casePrintDefaults({ ...c, claimedAmount: null }, '').courtFee, '');
```

and after `const complaint = buildCasePrintHtml(...)` add `assert.ok(complaint.includes('ค่าขึ้นศาล'));`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js src/common/litigation-calculators.spec.ts` → FAIL (`courtFee is not a function`).
Run: `pnpm --filter web test` → FAIL (`values.courtFee` undefined).

- [ ] **Step 3: Shared functions**

Append to `packages/shared/src/litigation.ts`:

```ts
/**
 * ค่าขึ้นศาล — ตาราง 1 ท้ายประมวลกฎหมายวิธีพิจารณาความแพ่ง
 * (แก้ไขโดย พ.ร.บ.แก้ไขเพิ่มเติม ป.วิ.พ. (ฉบับที่ 24) พ.ศ. 2551), verified 2026-10-12:
 *   (1) คำฟ้องที่มีทุนทรัพย์: ไม่เกิน 50,000,000 บาท ร้อยละ 2 แต่ไม่เกิน 200,000 บาท;
 *       ส่วนที่เกิน 50,000,000 บาท ร้อยละ 0.1
 *   (2) คดีไม่มีทุนทรัพย์: 200 บาท
 * Appeal and ฎีกา pay on the same table, on the amount still in dispute.
 * A fraction of a satang rounds up. Not covered: mortgage/arbitral-award items and คดีมโนสาเร่.
 * Source text: https://www.krisdika.go.th (ป.วิ.พ. ตาราง 1) — if it changes, change this and its tests.
 */
export const COURT_FEE_NON_MONEY = 200;
const FIRST_BAND_SATANG = 50_000_000 * 100;
const FIRST_BAND_CAP_SATANG = 200_000 * 100;

/** @param amount ทุนทรัพย์ in baht; null = a claim with no money value. @returns baht. */
export function courtFee(amount: number | null): number {
  if (amount == null) return COURT_FEE_NON_MONEY;
  // Integer satang so 2% / 0.1% never pick up float noise.
  const satang = Math.max(0, Math.round(amount * 100));
  const first = Math.min(Math.ceil((Math.min(satang, FIRST_BAND_SATANG) * 2) / 100), FIRST_BAND_CAP_SATANG);
  const above = Math.ceil(Math.max(0, satang - FIRST_BAND_SATANG) / 1000);
  return (first + above) / 100;
}

/** ป.พ.พ. ม.224 (แก้ไข 2564): 3% ตาม ม.7 + 2% = 5% ต่อปี — editable per calculation. */
export const DEFAULT_INTEREST_RATE = 5;

/** Simple interest in baht, rounded to satang: principal × rate × days / 365. */
export function simpleInterest(principal: number, ratePercent: number, days: number): number {
  return Math.round(((principal * ratePercent) / 100) * (days / 365) * 100) / 100;
}

/** Calendar days from one `YYYY-MM-DD` day to another (0 when `toDay` is earlier). */
export function interestDays(fromDay: string, toDay: string): number {
  const ms = Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}
```

Run `pnpm --filter @lawfirm/shared build`, then the Step 2 api command → PASS.

- [ ] **Step 4: Overview card and inline fee**

Create `apps/web/src/components/cases/LitigationCalculatorsCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { DEFAULT_INTEREST_RATE, courtFee, interestDays, simpleInterest } from '@lawfirm/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatCurrency } from '@/lib/utils';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

/** ค่าขึ้นศาล (ทุกชั้นศาลใช้ตารางเดียวกันกับทุนทรัพย์ที่พิพาท) และดอกเบี้ยอย่างง่าย — ตัวเลขประกอบการตัดสินใจ ไม่ใช่ใบแจ้งหนี้ของศาล */
export function LitigationCalculatorsCard({ claimedAmount }: { claimedAmount: number | null }) {
  const [disputed, setDisputed] = useState(claimedAmount != null ? String(claimedAmount) : '');
  const [principal, setPrincipal] = useState(claimedAmount != null ? String(claimedAmount) : '');
  const [rate, setRate] = useState(String(DEFAULT_INTEREST_RATE));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today());

  const disputedValue = disputed.trim() ? Number(disputed) : null;
  const days = from && to ? interestDays(from, to) : 0;
  const interest = principal.trim() && rate.trim() ? simpleInterest(Number(principal), Number(rate), days) : null;

  return (
    <Card data-testid="litigation-calculators">
      <CardHeader><CardTitle className="text-base">คำนวณค่าขึ้นศาลและดอกเบี้ย</CardTitle></CardHeader>
      <CardContent className="space-y-5 text-sm">
        <section className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-muted-foreground">ทุนทรัพย์ที่พิพาท (ชั้นต้น / อุทธรณ์ / ฎีกา ใช้ตารางเดียวกัน)</span>
            <MoneyInput min={0} value={disputed} onValueChange={setDisputed} className="h-9 w-full rounded-md border border-input bg-background px-3" />
          </label>
          <p>
            ค่าขึ้นศาล: <span className="font-semibold">{formatCurrency(courtFee(disputedValue))}</span>
            {disputedValue == null && <span className="text-muted-foreground"> (คดีไม่มีทุนทรัพย์)</span>}
          </p>
          <p className="text-xs text-muted-foreground">ตาราง 1 ท้าย ป.วิ.พ.: ร้อยละ 2 ไม่เกิน 200,000 บาท (ส่วนไม่เกิน 50 ล้าน) + ร้อยละ 0.1 ของส่วนที่เกิน · ไม่รวมคดีจำนอง/บังคับตามคำชี้ขาด/มโนสาเร่</p>
        </section>
        <section className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-muted-foreground">เงินต้น (บาท)</span>
            <MoneyInput min={0} value={principal} onValueChange={setPrincipal} className="h-9 w-full rounded-md border border-input bg-background px-3" />
          </label>
          <label className="block">
            <span className="mb-1 block text-muted-foreground">อัตราดอกเบี้ย (% ต่อปี)</span>
            <Input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-muted-foreground">นับจากวันที่</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-muted-foreground">ถึงวันที่</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <p className="sm:col-span-2">
            ดอกเบี้ย {days} วัน: <span className="font-semibold">{interest == null ? '—' : formatCurrency(interest)}</span>
            <span className="block text-xs text-muted-foreground">ค่าเริ่มต้น 5% ต่อปี ตาม ป.พ.พ. ม.224 (แก้ไข 2564: 3% ตาม ม.7 + 2%) · ดอกเบี้ยอย่างง่าย เงินต้น × อัตรา × วัน / 365</span>
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
```


`apps/web/src/app/(dashboard)/cases/[id]/page.tsx`:
1. `import { LitigationCalculatorsCard } from '@/components/cases/LitigationCalculatorsCard';` and add `courtFee` to the `@lawfirm/shared` import.
2. Under the ทุนทรัพย์ value `<p className="font-medium">…</p>` add:

```tsx
                    {legalCase.claimedAmount != null && (
                      <p className="text-xs text-muted-foreground">ค่าขึ้นศาลโดยประมาณ {formatCurrency(courtFee(legalCase.claimedAmount))}</p>
                    )}
```

3. Right after `<CaseProceedingsCard … />` (Task 11) add `<LitigationCalculatorsCard claimedAmount={legalCase.claimedAmount ?? null} />`.

- [ ] **Step 5: Complaint print form**

`apps/web/src/lib/case-print-forms.ts`:
1. `import { courtFee } from '@lawfirm/shared';` (keep the existing `import type { CaseDetail } from './api';`).
2. In `casePrintDefaults`'s returned object, after `amount: …,` add:

```ts
    courtFee: c.claimedAmount == null ? '' : courtFee(c.claimedAmount).toLocaleString('th-TH', { maximumFractionDigits: 2 }),
```

3. In the `complaint` template change `${line('เรื่อง', 'subject')}${line('จำนวนทุนทรัพย์', 'amount', 'บาท')}` to `${line('เรื่อง', 'subject')}${pair(line('จำนวนทุนทรัพย์', 'amount', 'บาท'), line('ค่าขึ้นศาล', 'courtFee', 'บาท'))}`.

(`'th-TH'` with `maximumFractionDigits: 2` prints `20,000` for 20000 — the existing `amount` test already relies on this locale output.)

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js src/common && pnpm --filter web test && pnpm --filter web exec tsc --noEmit`
Expected: PASS / no errors.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add packages/shared/src/litigation.ts apps/api/src/common/litigation-calculators.spec.ts apps/web/src/components/cases/LitigationCalculatorsCard.tsx "apps/web/src/app/(dashboard)/cases/[id]/page.tsx" apps/web/src/lib/case-print-forms.ts apps/web/src/lib/case-print-forms.test.ts
/usr/bin/git commit -m "feat(litigation): court fee per ตาราง 1 ท้าย ป.วิ.พ. and simple interest on the case overview and complaint form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

### 1. Spec coverage (Part L)

| Spec item | Task(s) |
|---|---|
| L1 day basis `MONTHS` (ม.193/3, 193/5), month-end clamp | 1 (enum), 2 (`addBangkokMonths`, `computeDueDate`) |
| L1 negative offsets, roll back before / forward after, drop `@Min(0)` and clamp | 2, 6 (DTO bounds −3650…3650) |
| L1 due 16:30 Asia/Bangkok | 2 (`courtCloseAt`, `applyTrigger`, reschedule preview) |
| L1 `CourtEventKind` + `CalendarEvent.courtEventKind`, web + mobile pickers | 1, 4 (API, CalendarEventDialog, court-day next hearing, mobile event form) |
| L1 rule filter by court kind; `partySide`; `courtLevel`; service method | 1 (columns), 3 (`deadlineRuleApplies`) |
| L1 triggers `FILED`, `APPEAL_SERVED`, JUDGMENT per court level | 1, 3, 10 |
| L1 default rule table (11 rows), new + existing firms | 5 (shared list, seed, migration 130100) |
| L1 "วิธีส่งหมาย: รับเอง / ปิดหมาย" select | 11 (service action), 10 (API) |
| L1 lead lawyer notified (inbox + push + LINE), still PENDING | 3 (`notifyAssigned` after `createMany`) |
| L1 per-firm editable copies; OWNER/`manageFirmContent`; platform admin keeps globals | 3 (override resolution), 6 (API + `/admin/deadline-rules`) |
| L1 2570 holidays; lunar only with official source; < 10 holidays warning | 5 (migration 130100, `incompleteHolidayYears`, DateSuggestionsPanel) |
| L2 new `CASE_STAGE_ORDER`, locked test, INTAKE_REVIEW label | 7 |
| L2 `CaseStatusLog` per stage change; backward move needs a note (400) | 7 |
| L2 APPEAL/SUPREME sets court level and opens a proceeding | 9 |
| L2 PATCH cannot close/archive (400 "ใช้ปุ่มปิดคดี"); mobile edit drops the options; close requires outcome; reopen restores stage | 7 |
| L3 `CaseProceeding` model, unique (case, level) | 1 |
| L3 backfill from black/red numbers | 9 (migration 130300) |
| L3 case fields mirror the current proceeding; `{{trial…}}` template fields | 9 |
| L3 card with filing / service / judgment / appeal-copy actions; manual box only for ORDER_RECEIVED | 10 (API), 11 (web) |
| L3 judgment clears the limitation reminder and notifies the lead with the appeal deadline | 8 (judgment counts as filed), 10 |
| L4 generalised "ครบอายุความ" event, 90/30/7/1 reminders, removed when cleared or filed; create-form field | 8, 15 (web), 16 (edit) |
| L5 `CaseParticipant` only (migration of `customFields.opposingParty`), intake conversion incl. incidentDate/estimatedDamage | 12 (migration 130400, `openCaseFromIntake`) |
| L5 PETITIONER/RESPONDENT; `clientId`, `representedByParticipantId` | 1, 12, 16 |
| L5 our client auto-added on side OURS | 12 (`ensureOurClientParticipant`) |
| L5 web create form (เราเป็น, opponents, court catalog + ศาลอื่น, level, black number, อายุความ, all custom fields) | 15 |
| L5 mobile create (เราเป็น, opponents, real client picker) and case detail parties by side with add/edit | 17 |
| L5 participant changes → CaseActivity + AuditLog | 12 |
| L5 bugs: participants vanish after overview save; timeline not refreshed after confirming a suggestion | 12 (full participant rows in every response) + 16 (re-sync); 11 (`onChanged`) |
| L5 additional clients editable after create | 12 (API), 16 (web) |
| L6 gate at POST /cases, intake convert/decide-open, portal-submission convert | 13 (API), 14 (intake + portal UI), 15 (create UI), 17 (mobile) |
| L6 search covers participants and linked clients; opponent-match rule; CLEAR record; 409 + reason ≥ 10; override audited; intake → CONFLICT_CHECK | 13 |
| L7 court fee (tested at 0; 1; 49,999,999; 50,000,000; 50,000,001; 100,000,000; 200,000,000), shown on overview and complaint form, cited | 18 |
| L7 simple interest, 5% default (ม.224 / ม.7), editable | 18 |

No spec item is without a task.

### 2. Placeholder scan

Searched for "TBD", "TODO", "implement later", "similar to Task", "appropriate error handling" and hedges ("whatever", "if it is not reachable"): none left. Every code step carries the code; every test step carries the test.

### 3. Type and name consistency

- Prisma enum columns are string-literal unions, not the shared TS enums. Shared helpers that take DB rows are therefore string-typed (`DeadlineRuleKey`, `DeadlineRuleFilter` in Task 3; `kindFor` in Task 4), and DB values passed into enum-typed contexts are cast (`as CourtEventKind | null`, `as CourtLevel | null`). Shared enum → Prisma is always fine (existing code relies on it).
- Names used across tasks match their producer: `ruleSpanDays`, `courtCloseAt`, `addBangkokMonths` (2) · `effectiveDeadlineRules`, `deadlineRuleApplies`, `deadlineRuleKey`, `DeadlineTriggerContext.{courtEventKind,courtLevel,serviceMethod}` (3) · `DEFAULT_DEADLINE_RULES`, `incompleteHolidayYears` (5) · `caseStageIndex`, `isBackwardStage`, `CaseFeedService.log({ stageTransition })` (7) · `syncLimitationReminder` (8) · `ensureProceeding`, `mirrorProceeding`, `saveCaseNumbers`, `sortProceedings` (9) · `CaseProceedingsService.record*` and the five client calls (10, 11) · `ensureOurClientParticipant`, `addOpponents` (12) · `gateNewCase`, `recordForCase`, `opponentConflicts`, `PartyName`, `ConflictGate` (13) · `conflictMatchesFrom`, `ConflictOverrideDialog`, `OVERRIDE_MIN_LENGTH` (14) · `litigationPayload`, `bangkokDayToIso`, `CourtSelect` (15) · `participantPayload`, `COUNSEL_ROLES` (16) · `groupParticipantsBySide`, `PARTICIPANT_ROLE_LABELS`, `PARTICIPANT_SIDE_LABELS` (17) · `courtFee`, `simpleInterest`, `interestDays` (18).
- Migration timestamps: `20261011130000` (Task 1) → `130100` (5) → `130200` (8) → `130300` (9) → `130400` (12); data that uses new enum values never shares a file with the `ADD VALUE`.
- Web unit tests run under `node --test` without a bundler, so tested `lib/*.ts` files import other app files only with `import type` (`conflict.ts` checks `ApiError` by shape for this reason) and import `@lawfirm/shared` at runtime (built `dist`).
- Constructor changes ripple into specs: `DeadlineRulesService` gains `AssignmentNotifierService` (3); `CasesService` gains `ConflictCheckService` (13 lists every spec that must provide it); `CaseParticipantsService` gains `CaseFeedService` (12).

### 4. Review Focus

The five lines at the top are each pinned by a test in the owning task: Bangkok-evening trigger (2), firm switches a global rule off (3), double-submitted judgment (10), reopening a case closed before stage logs (7), short / "tmp" names in the conflict gate (13).

### 5. Decisions where the spec was open (resolved in the tasks named)

1. **Unknown context for rule filters** (3): a court-kind rule needs that exact kind; court level falls back to `Case.courtLevel` then TRIAL; a party-side rule still fires when `Case.partyRole` is unknown; no service method means รับเอง (+15).
2. **Firm override of a global rule** (3, 6): override = firm row with the same trigger + label (spec). The UI locks the label while customising so the key cannot drift; "turn off for my firm" saves an inactive override; deleting the override restores the global rule.
3. **"Filed" for the limitation reminder** (8): a proceeding with `filedAt`, a black case number, or a judgment (backfilled proceedings have numbers but no filing date; L3 also wants the reminder cleared on judgment).
4. **"sets stage AWAITING_JUDGMENT → keeps it"** (10): judgment moves the stage to AWAITING_JUDGMENT only if the case is earlier; a case at APPEAL/SUPREME/ENFORCEMENT keeps its stage.
5. **"JUDGMENT (final)" 10-year rule** (5): no "final" flag exists, so the rule has no level filter and fires on each recorded judgment; the engine's PENDING check prevents duplicates while a card is open, and the lawyer dismisses the superseded one.
6. **Default-judgment check +30 days after posted service** (5): kept as the spec table says (+30, plaintiff side) even though with ปิดหมาย the answer is itself due at +30; firms can tune it in `/admin/deadline-rules`.
7. **Portal** (13): the staff `portal-submissions/:id/convert` is gated like any opening; the client's own `submit` cannot answer a prompt, so it records the check (POTENTIAL_CONFLICT with a fixed note when names clash) and never blocks.
8. **2570 lunar holidays** (5): no official Cabinet / Royal Gazette source found as of 2026-10-12 (only BOT สนส. 37/2569 for financial institutions), so only the 16 fixed-date days and their substitution days are seeded; the 10-holiday warning therefore does not fire for 2027 even though lunar days are still missing — the migration comment says to enter them at `/admin/holidays` once announced; the holiday data stays the admin's responsibility as before.
9. **Court fee scope** (18): money claims and non-money claims only, as specified; the table's separate mortgage / arbitral-award / มโนสาเร่ items are named as not covered.
10. **"Notified … inbox + push + LINE" while a caller holds a transaction** (3): the notice is written outside the caller's transaction (marked `ponytail:`), accepting a rare stale notice over a new outbox.

### 6. Order and dependencies

Tasks run in order 1 → 18. Hard dependencies: 1 before everything; 2 → 3 → 4/5/6 (engine); 7 before 9/10 (stage log); 8 before 9/10 (reminder sync); 9 → 10 → 11; 12 before 13 (opponents feed the gate) and before 15–17; 13 → 14 → 15; 17 needs 12–13; 18 is independent after 1 (it only needs `litigation.ts`). Migrations 130100–130400 are applied in Tasks 5, 8, 9, 12 respectively, each with psql + `migrate resolve --applied`.
