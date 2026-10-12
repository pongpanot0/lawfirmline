# Mobile Litigation Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Thai lawyer do the litigation work from the phone that today needs the web: record court events, confirm/dismiss deadline suggestions, see limitation and per-level court numbers, set the limitation date, review documents and tasks waiting for them, @mention people, and estimate court fees and interest.

**Architecture:** Two small API additions (a `pendingDeadlineConfirms` field on My Day, two review-round list endpoints, Thai date-suggestion errors, section hints in notification deep links). Everything else is the Expo app: new pure modules (`thai-date.ts`, `deadline.ts`, `litigation.ts`, `mentions.ts`) with one static check script, a handful of React Query hooks, three shared components from the design (`SectionCard`, `ActionSheet`, `ThaiDateField`), and one feature component per case-screen card. Screens only wire these together.

**Tech Stack:** NestJS 10 + Prisma in `apps/api` (jest `*.spec.ts` beside sources), Expo SDK 56 + expo-router + React Query 5 in `apps/mobile` (typecheck + `scripts/*.cjs` static checks, no jest), shared enums and calculators in `packages/shared` (built to `dist/`).

**Spec:** `docs/superpowers/specs/2026-10-12-mobile-litigation-parity.md` (requirements + binding decisions D1–D10). Screen design and exact Thai copy: `docs/design/2026-10-12-mobile-litigation-parity.md`. Code facts with file:line: `docs/superpowers/specs/2026-10-12-mobile-parity-map.md`. Executors read all three; where a fact and the source disagree, the source wins.

## Global Constraints

- Decisions D1–D10 in the spec are final. Do not re-open them.
- No new dependencies anywhere (no `expo-haptics`, no toast library, no NetInfo). Reuse `apps/mobile/src` components and `theme.ts` tokens only; no one-off colors or fonts (`apps/mobile/design.md:20`).
- All UI text is Thai. Copy Thai strings verbatim from the design doc; where this plan writes a string the design does not have, it says so in the task.
- Permissions mirror the API guards: court-event records and deadline confirm/dismiss = anyone who can open the case, hidden on `CLOSED`/`ARCHIVED` cases (D8); review-round decisions = a reviewer named on a `WAITING_REVIEW` round who has not decided yet; mentions keep the static hint (D9).
- Never optimistic-update a legal deadline: a deadline row, a court-event record and a limitation date change on screen only after the server answers.
- Every mutation: `retry: false`, its button `busy`/`disabled` while sending, invalidate the affected queries on settle (also on error), and show failures in Thai through `actionErrorText` (Task 3).
- Dates: Bangkok calendar day; display the Buddhist year (`thDate`, `thDateLong`); deadlines are due 16:30 Bangkok; a whole-day date is sent as `new Date(`${day}T00:00:00+07:00`).toISOString()` (`bangkokDayToIso`, Task 3).
- Offline = the last request failed with a bare `TypeError` (`isNetworkError`, Task 3). Sections render from the React Query cache; action buttons are disabled with the design's offline copy, never fail silently, and never clear typed input.
- Rules of hooks: `app/case/[id].tsx` and `app/court-day/[eventId].tsx` return early (`Loading`/`ErrorNote`). Every new hook in those screens goes above the first `return`.
- Memory limit: one `tsc` or test process at a time; jest always with `--maxWorkers=2`; no simulator, no `expo start`, no dev server in any task.
- Git: call `/usr/bin/git`; stage explicit paths only (never `git add -A` or `git add .`); end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never commit `.claude/launch.json`, `apps/web/next-env.d.ts`, `apps/web/tsconfig.json`, `apps/web/tsconfig.tsbuildinfo`, `.env*`, or anything under `.superpowers/`.
- After editing `packages/shared`, run `pnpm --filter @lawfirm/shared build` before any api/mobile check (api, mobile and the static check scripts read `packages/shared/dist`).
- No migrations are expected. If one ever is: hand-written SQL in `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql` with timestamps from `20261012120000`, applied with `psql` + `prisma migrate resolve --applied`; never `migrate dev` or `migrate deploy`.

Commands (run from the worktree root `/Users/pongpanot_s/Documents/dev/lawfirm/.claude/worktrees/casefox-clio-features-35183a`):

```bash
# api tests (paths are relative to apps/api)
pnpm --filter api exec jest --config jest.config.js --maxWorkers=2 src/<path>.spec.ts
# api typecheck
pnpm --filter api exec tsc --noEmit -p tsconfig.json
# shared build (after any packages/shared edit)
pnpm --filter @lawfirm/shared build
# mobile typecheck
(cd apps/mobile && pnpm exec tsc --noEmit)
# mobile static checks
node apps/mobile/scripts/check-litigation-parity.cjs
node apps/mobile/scripts/check-court-workflow.cjs
```

## Review Focus

1. **A deadline confirmed or dismissed twice, or on the wrong case** (double tap, two phones, a list restored from the 7-day cache): the request must target the suggestion's own `caseId`, a second tap must not send a second request, and the server's "already handled" answer must reach the lawyer in Thai. Pinned in Task 3 (`suggestionRequest` + hook wiring check), Task 5 (in-flight guard per row) and Task 1 (Thai 409/404 messages).
2. **A half-typed limitation date silently clearing the stored one** (`13 / – / 25` typed over a saved date, or `31 เม.ย.`): the form must keep the stored date, block save with the Thai alert, and send `limitationDeadline: null` only after the lawyer confirmed `ลบวันครบอายุความ?`. Pinned in Task 3 (`checkThaiDate`, `limitationPatch`) and Task 8 (scenario check).
3. **Actions offered that the API refuses** (a closed or archived case, a round I already decided, a round I am not on): the buttons must not render. Pinned in Task 3 (`canRecordProceedings`, `canDecideRound` checks) and wired in Tasks 5, 6 and 9.
4. **A stale cache showing an already-confirmed suggestion as pending** (the case screen opened from the persisted cache after someone confirmed on the web): the list must refetch on every mount and after every decision, including failed ones, and My Day must count only `PENDING` rows. Pinned in Task 3 (`staleTime: 0` + invalidation check) and Task 1 (`pendingDeadlineConfirms` query check).
5. **Offline taps losing input** (record a judgment in a court basement, return a document with a typed reason): the sheet stays open with everything typed, the lawyer reads `ต้องต่อเน็ตเพื่อบันทึก`, and nothing resets until the server answers. Pinned in Task 3 (`actionErrorText`) and Task 6 (`runProceeding` check); the return-reason sheet in Task 9 follows the same rule.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/agenda.ts` | `PendingDeadlineConfirm` + `MyDayResponse.pendingDeadlineConfirms` (D1) |
| `apps/api/src/agenda/agenda.service.ts` (+ spec) | Group PENDING suggestions on live cases the caller leads |
| `apps/api/src/intelligence/date-suggestions.service.ts` (+ spec) | Thai refusal messages, same exception classes (D5) |
| `apps/api/src/notifications/app-route.ts` (+ spec) | `?tab=calendar|documents|comments` → `?section=deadlines|documents|comments` (D6) |
| `apps/api/src/document-review/document-review.service.ts` (+ spec) | `listMine`, `listForCase`, round summaries with names and per-reviewer decision; notices link to the documents tab |
| `apps/api/src/document-review/document-review-queue.controller.ts` (+ spec) | `GET /document-review/mine`, `GET /cases/:caseId/review-rounds` (D2) |
| `apps/api/src/document-review/document-review.module.ts` | Registers the queue controller |
| `apps/mobile/src/api/types.ts` | `CaseProceeding`, `DateSuggestion`, `ReviewRoundSummary`, `ProceedingKind`; `CaseDetail` gains `stage`, `limitationDeadline`, `proceedings` |
| `apps/mobile/src/api/hooks.ts` | Date-suggestion, proceeding and review-round queries/mutations |
| `apps/mobile/src/api/files.ts` | `openCaseDocument(..., version?)` opens the reviewed version |
| `apps/mobile/src/thai-date.ts` | Typed Thai date parts ↔ Bangkok day, all-or-none rule, `limitationPatch` |
| `apps/mobile/src/deadline.ts` | `deadlineUrgency` thresholds, `legalBasis` |
| `apps/mobile/src/litigation.ts` | Permission tests, offline/error text, request builders, court-level rows, proceeding body/result text, calculator estimate, home queue routes |
| `apps/mobile/src/mentions.ts` | `@` query, insert, candidates, mentioned/dropped ids |
| `apps/mobile/src/workflow.ts` | `actionAppRoute` keeps section hints |
| `apps/mobile/scripts/check-litigation-parity.cjs` | Static check for every pure module and the hook wiring |
| `apps/mobile/scripts/check-court-workflow.cjs` | Gains the `actionAppRoute` section asserts |
| `apps/mobile/src/components/SectionCard.tsx` | Card + title + count Tag + optional collapse |
| `apps/mobile/src/components/ActionSheet.tsx` | Bottom sheet lifted from `ReassignSheet`, keyboard-safe |
| `apps/mobile/src/components/ThaiDateField.tsx` | วัน / เดือน / ปี พ.ศ. entry + calendar icon + clear-with-confirm |
| `apps/mobile/src/components/DatePicker.tsx` | `iconOnly` trigger for `ThaiDateField` |
| `apps/mobile/src/components/Form.tsx` | `FormField.keyboardType` |
| `apps/mobile/src/components/ui.tsx` | `ActionRow.count` / `tone` (count Tag on home rows) |
| `apps/mobile/src/components/DeadlineConfirmCard.tsx` | "รอยืนยันวันครบกำหนด" list with ✓ / ✕ |
| `apps/mobile/src/components/CourtNumbersCard.tsx` | "ศาลและเลขคดี": limitation + one row per court level |
| `apps/mobile/src/components/RecordCourtEventSheet.tsx` | "บันทึกเหตุการณ์ในศาล" sheet (case screen + court-day) |
| `apps/mobile/src/components/ReviewRoundsCard.tsx` | "เอกสารรอคุณตรวจ" with open / approve / return |
| `apps/mobile/src/components/MentionField.tsx` | Comment field with inline `@` picker and hint |
| `apps/mobile/src/components/LitigationCalculatorCard.tsx` | Court fee + interest estimate |
| `apps/mobile/app/case/[id].tsx` | Offline cache rendering (D7) and the new cards above/inside the tabs |
| `apps/mobile/app/court-day/[eventId].tsx` | "ศาลอ่านคำพิพากษาวันนี้" chip |
| `apps/mobile/app/(tabs)/index.tsx` | "ต้องจัดการก่อน" card; review count for every reviewer |
| `apps/mobile/app/notifications.tsx` | `?filter=deadline|document` opens the filtered pending list |
| `apps/mobile/app/case/new.tsx` | "วันครบอายุความ" on create/edit |
| `apps/mobile/src/components/TaskWorkView.tsx` | Mentions in "บันทึกเพิ่มเติม" |

Task order: 1 → 2 → 3 → 4 → 5 → 6, then 7–11 in any order. Tasks 7–11 assume 1–6 are merged (their `app/case/[id].tsx` anchors include Task 6's lines), so their check steps expect a `PASS:` line rather than a fixed count.

---

## Tasks

### Task 1: API — My Day deadline count (D1), Thai date-suggestion errors (D5), deep-link sections (D6)

**Files:**
- Modify: `packages/shared/src/agenda.ts:86-95` (`MyDayResponse`)
- Modify: `apps/api/src/agenda/agenda.service.ts:91-119` (`getMyDay`)
- Modify: `apps/api/src/intelligence/date-suggestions.service.ts:47,50,65,68,80,111`
- Modify: `apps/api/src/notifications/app-route.ts:6-9`
- Test: `apps/api/src/agenda/agenda.service.spec.ts`, `apps/api/src/intelligence/date-suggestions.service.spec.ts`, `apps/api/src/notifications/app-route.spec.ts`

**Interfaces:**
- Consumes: `CaseAccessService.getCaseFilterForUser(user)` (already injected in `AgendaService`).
- Produces: `PendingDeadlineConfirm { caseId: string; ownRef: string; title: string; count: number; nearestDate: string }` exported from `@lawfirm/shared`; `MyDayResponse.pendingDeadlineConfirms: PendingDeadlineConfirm[]`. Push/inbox `appPath` for case notices now carries `?section=deadlines|documents|comments`. Date-suggestion errors keep their HTTP status and exception class but speak Thai.

- [ ] **Step 1: Write the failing deep-link test**

Replace the whole of `apps/api/src/notifications/app-route.spec.ts` with:

```ts
import { toAppRoute } from './app-route';

const ID = '11111111-2222-3333-4444-555555555555';

describe('toAppRoute', () => {
  it.each([
    [`/cases/${ID}`, `/case/${ID}`],
    // D6: the web tab becomes the app section the case screen opens.
    [`/cases/${ID}?tab=calendar`, `/case/${ID}?section=deadlines`],
    [`/cases/${ID}?tab=calendar&eventId=e1`, `/case/${ID}?section=deadlines`],
    [`/cases/${ID}?tab=documents`, `/case/${ID}?section=documents`],
    [`/cases/${ID}?tab=comments`, `/case/${ID}?section=comments`],
    // Tabs the app has no section for still open the case.
    [`/cases/${ID}?tab=tasks`, `/case/${ID}`],
    [`/cases/${ID}?tab=constructor`, `/case/${ID}`],
    [`/cases/${ID}#top`, `/case/${ID}`],
    ['/todos', '/(tabs)/tasks'],
    ['/todos?view=review', '/(tabs)/tasks'],
    ['/expenses/claim', '/expenses/claims'],
    [`/expenses/claim/${ID}`, `/expenses/claim/${ID}`],
    [`/court-day/${ID}`, `/court-day/${ID}`],
    ['/leaves', '/leaves'],
  ])('%s → %s', (web, app) => expect(toAppRoute(web)).toBe(app));

  it('returns null where the app has no screen', () => {
    expect(toAppRoute(`/intake/${ID}`)).toBeNull();
    expect(toAppRoute('/cases/not-a-uuid')).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing Thai-message test**

In `apps/api/src/intelligence/date-suggestions.service.spec.ts`, inside `describe('confirm', () => {` (it needs the `pending` fixture), add after the test `'throws ConflictException when the suggestion is not PENDING'`:

```ts
    it('refuses in Thai so the phone can show the message as it is (D5)', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(null);
      await expect(service.dismiss('case-1', 'sug-1', 'user-1')).rejects.toThrow('ไม่พบวันที่ที่ระบบเสนอนี้');

      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({ ...pending, status: DateSuggestionStatus.CONFIRMED });
      await expect(service.dismiss('case-1', 'sug-1', 'user-1')).rejects.toThrow('วันที่นี้ถูกยืนยันหรือไม่ใช้ไปแล้ว');

      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({ ...pending, triggerEventId: 'trigger-1' });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', {})).rejects.toThrow('วันที่ที่ระบบเสนอเปลี่ยนแล้ว กรุณาตรวจอีกครั้ง');

      const revision = new Date('2026-09-12T00:00:00.000Z');
      mockPrisma.documentDateSuggestion.findUnique
        .mockResolvedValueOnce({ ...pending, triggerEventId: 'trigger-1', updatedAt: revision })
        .mockResolvedValueOnce({ ...pending, triggerEventId: 'trigger-2', updatedAt: revision });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', { expectedUpdatedAt: revision.toISOString() }))
        .rejects.toThrow('นัดที่เป็นต้นเรื่องของวันนี้เปลี่ยนแล้ว กรุณาตรวจอีกครั้ง');

      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({ ...pending, source: 'DOCUMENT' });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', {})).rejects.toThrow('เลือกทนายผู้รับผิดชอบวันนี้ก่อนยืนยัน');

      mockPrisma.case.findUnique.mockResolvedValue({ firmId: 'firm-1' });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.confirm('case-1', 'sug-1', 'user-1', { assigneeId: 'lawyer-2' }))
        .rejects.toThrow('ทนายผู้รับผิดชอบไม่ได้อยู่ในสำนักงานนี้');
      expect(mockCalendar.createInternal).not.toHaveBeenCalled();
    });
```

The existing tests keep asserting the exception classes (`ConflictException`, `NotFoundException`, `BadRequestException`), which proves the HTTP codes did not change.

- [ ] **Step 3: Write the failing My Day test**

In `apps/api/src/agenda/agenda.service.spec.ts`:

1. Add the model to the mock (inside `const mockPrisma = {`):

```ts
    documentDateSuggestion: { findMany: jest.fn() },
```

2. In `beforeEach`, after `setTasks([]);`, add:

```ts
    mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([]);
```

3. Add this test after `'my-day carries a review queue built from the reviewer rule'`:

```ts
  it('my-day counts PENDING deadline suggestions per live case the caller leads, nearest date first (D1)', async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([]);
    mockPrisma.task.findMany.mockResolvedValue([]);
    // Prisma returns them nearest first (orderBy suggestedDate asc).
    mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([
      { caseId: 'case-1', suggestedDate: new Date('2026-09-20T09:30:00Z'), case: { ownRef: 'C-001', title: 'คดีหนึ่ง' } },
      { caseId: 'case-2', suggestedDate: new Date('2026-09-25T09:30:00Z'), case: { ownRef: 'C-002', title: 'คดีสอง' } },
      { caseId: 'case-1', suggestedDate: new Date('2026-10-01T09:30:00Z'), case: { ownRef: 'C-001', title: 'คดีหนึ่ง' } },
    ]);

    const day = await service.getMyDay(user);

    expect(day.pendingDeadlineConfirms).toEqual([
      { caseId: 'case-1', ownRef: 'C-001', title: 'คดีหนึ่ง', count: 2, nearestDate: '2026-09-20T09:30:00.000Z' },
      { caseId: 'case-2', ownRef: 'C-002', title: 'คดีสอง', count: 1, nearestDate: '2026-09-25T09:30:00.000Z' },
    ]);
    const query = mockPrisma.documentDateSuggestion.findMany.mock.calls[0][0];
    // Only rows still waiting (a confirmed one must never be counted), only live cases the caller leads,
    // and never outside the caller's case filter (firm + soft-delete).
    expect(query.where).toEqual({
      status: 'PENDING',
      case: { AND: [{ firmId: 'firm-1' }, { leadLawyerId: 'user-1', status: { notIn: ['CLOSED', 'ARCHIVED'] } }] },
    });
    expect(query.orderBy).toEqual([{ suggestedDate: 'asc' }, { id: 'asc' }]);
  });

  it('my-day returns an empty deadline list when nothing waits', async () => {
    const day = await service.getMyDay(user);
    expect(day.pendingDeadlineConfirms).toEqual([]);
  });
```

- [ ] **Step 4: Run the three specs to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js --maxWorkers=2 src/notifications/app-route.spec.ts src/intelligence/date-suggestions.service.spec.ts src/agenda/agenda.service.spec.ts`
Expected: FAIL — app-route rows with `?section=` get `/case/<id>`; the Thai test gets `'Date suggestion not found'`; `day.pendingDeadlineConfirms` is `undefined`.

- [ ] **Step 5: Implement the deep-link sections**

In `apps/api/src/notifications/app-route.ts`, replace lines 6-9:

```ts
export function toAppRoute(webPath: string): string | null {
  const [path] = webPath.split(/[?#]/);
  const caseId = path.match(/^\/cases\/([0-9a-f-]{36})$/i)?.[1];
  if (caseId) return `/case/${caseId}`;
```

with:

```ts
/** Web case tabs that have a matching section on the app's case screen (D6). */
const CASE_SECTIONS = new Map([
  ['calendar', 'deadlines'],
  ['documents', 'documents'],
  ['comments', 'comments'],
]);

export function toAppRoute(webPath: string): string | null {
  const [path, query = ''] = webPath.split('#')[0].split('?');
  const caseId = path.match(/^\/cases\/([0-9a-f-]{36})$/i)?.[1];
  if (caseId) {
    const section = CASE_SECTIONS.get(new URLSearchParams(query).get('tab') ?? '');
    return section ? `/case/${caseId}?section=${section}` : `/case/${caseId}`;
  }
```

The rest of the function keeps using `path` unchanged.

- [ ] **Step 6: Make the date-suggestion refusals Thai**

In `apps/api/src/intelligence/date-suggestions.service.ts` change only the message strings (keep each exception class):

| Line | Old | New |
|---|---|---|
| 47 | `'Date suggestion not found'` | `'ไม่พบวันที่ที่ระบบเสนอนี้'` |
| 50 | `'Date suggestion is no longer pending'` | `'วันที่นี้ถูกยืนยันหรือไม่ใช้ไปแล้ว'` |
| 65 | `'Date suggestion changed; review it again'` | `'วันที่ที่ระบบเสนอเปลี่ยนแล้ว กรุณาตรวจอีกครั้ง'` |
| 68 | `'Select a responsible lawyer for this date'` | `'เลือกทนายผู้รับผิดชอบวันนี้ก่อนยืนยัน'` |
| 80 | `'Responsible lawyer is not in this firm'` | `'ทนายผู้รับผิดชอบไม่ได้อยู่ในสำนักงานนี้'` |
| 111 | `'Date suggestion source changed; review it again'` | `'นัดที่เป็นต้นเรื่องของวันนี้เปลี่ยนแล้ว กรุณาตรวจอีกครั้ง'` |

(These strings are not in the design doc; D5 only asks for Thai. Nothing in `apps/web` or `apps/mobile` matches on the English text — checked with grep.)

- [ ] **Step 7: Add the shared type and build shared**

In `packages/shared/src/agenda.ts`, replace:

```ts
  warnings: AgendaWarning[];
  reviewQueue: ReviewQueueItem[];
}
```

with:

```ts
  warnings: AgendaWarning[];
  reviewQueue: ReviewQueueItem[];
  /** PENDING deadline suggestions on live cases the caller leads, one row per case (D1). */
  pendingDeadlineConfirms: PendingDeadlineConfirm[];
}

/** One case's deadline suggestions waiting for the lead lawyer ("วันครบกำหนดรอยืนยัน"). */
export interface PendingDeadlineConfirm {
  caseId: string;
  ownRef: string;
  title: string;
  count: number;
  /** Earliest suggested date among the case's pending rows (ISO instant). */
  nearestDate: string;
}
```

Run: `pnpm --filter @lawfirm/shared build`
Expected: exits 0.

- [ ] **Step 8: Fill the field in `getMyDay`**

In `apps/api/src/agenda/agenda.service.ts`:

1. Add `PendingDeadlineConfirm,` to the `@lawfirm/shared` import list (alphabetical, after `MyDayResponse,`).
2. Replace:

```ts
    const [overdueItems, aheadItems, reviewRows] = await Promise.all([
      this.getOverdue(user, todayStart),
      this.getAgenda(user, todayStart, horizonEnd),
      this.prisma.task.findMany({ where: reviewQueueWhere(user), select: reviewQueueSelect, orderBy: reviewQueueOrder, take: 20 }),
    ]);
```

with:

```ts
    const [overdueItems, aheadItems, reviewRows, pendingDateRows] = await Promise.all([
      this.getOverdue(user, todayStart),
      this.getAgenda(user, todayStart, horizonEnd),
      this.prisma.task.findMany({ where: reviewQueueWhere(user), select: reviewQueueSelect, orderBy: reviewQueueOrder, take: 20 }),
      // The push "วันครบกำหนดรอยืนยัน" goes to the case lead, so the home count is theirs too (D1).
      this.prisma.documentDateSuggestion.findMany({
        where: {
          status: 'PENDING',
          case: { AND: [this.caseAccess.getCaseFilterForUser(user), { leadLawyerId: user.id, status: { notIn: ['CLOSED', 'ARCHIVED'] } }] },
        },
        select: { caseId: true, suggestedDate: true, case: { select: { ownRef: true, title: true } } },
        orderBy: [{ suggestedDate: 'asc' }, { id: 'asc' }],
        // ponytail: a lead with more than 200 waiting dates sees a capped count; group in SQL if that ever happens.
        take: 200,
      }),
    ]);
```

3. Replace the return line:

```ts
    return { today: todayKey, overdue: overdueItems, todayItems, tomorrow, upcoming, warnings, reviewQueue: reviewRows.map(toReviewQueueItem) };
```

with:

```ts
    return {
      today: todayKey, overdue: overdueItems, todayItems, tomorrow, upcoming, warnings,
      reviewQueue: reviewRows.map(toReviewQueueItem),
      pendingDeadlineConfirms: this.groupPendingConfirms(pendingDateRows),
    };
```

4. Add this private method right after `getMyDay`:

```ts
  /** Rows arrive nearest date first, so the first row seen for a case carries its nearest date. */
  private groupPendingConfirms(
    rows: { caseId: string; suggestedDate: Date; case: { ownRef: string; title: string } }[],
  ): PendingDeadlineConfirm[] {
    const byCase = new Map<string, PendingDeadlineConfirm>();
    for (const row of rows) {
      const entry = byCase.get(row.caseId);
      if (entry) entry.count += 1;
      else byCase.set(row.caseId, {
        caseId: row.caseId, ownRef: row.case.ownRef, title: row.case.title, count: 1, nearestDate: row.suggestedDate.toISOString(),
      });
    }
    return [...byCase.values()];
  }
```

- [ ] **Step 9: Run the specs and the api typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js --maxWorkers=2 src/notifications/app-route.spec.ts src/intelligence/date-suggestions.service.spec.ts src/agenda/agenda.service.spec.ts src/notifications/assignment-notifier.service.spec.ts`
Expected: PASS (assignment-notifier still maps `?tab=tasks` to plain `/case/<id>`).

Run: `pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add packages/shared/src/agenda.ts apps/api/src/agenda/agenda.service.ts apps/api/src/agenda/agenda.service.spec.ts apps/api/src/intelligence/date-suggestions.service.ts apps/api/src/intelligence/date-suggestions.service.spec.ts apps/api/src/notifications/app-route.ts apps/api/src/notifications/app-route.spec.ts
/usr/bin/git commit -m "$(cat <<'EOF'
feat(api): my-day deadline confirm count, Thai date-suggestion errors, deep-link sections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 1 -->

### Task 2: API — review rounds waiting for me and per case (D2)

**Files:**
- Modify: `apps/api/src/document-review/document-review.service.ts` (constructor `:16`, notices `:120`, `:224`, new methods)
- Create: `apps/api/src/document-review/document-review-queue.controller.ts`
- Modify: `apps/api/src/document-review/document-review.module.ts:9`
- Test: `apps/api/src/document-review/document-review.service.spec.ts`, Create `apps/api/src/document-review/document-review-queue.controller.spec.ts`

**Interfaces:**
- Consumes: `CaseAccessService.getCaseFilterForUser(user)` (global `CommonModule`), `ReviewRoundStatus` from `../generated/prisma`.
- Produces (both endpoints return the same row shape, used by mobile Task 3 as `ReviewRoundSummary`):

```ts
{
  id: string; caseId: string; caseRef: string | null; caseTitle: string | null;
  documentId: string; documentVersionId: string; filename: string; version: number;
  scope: string | null; dueAt: string | null; status: 'WAITING_REVIEW' | 'RETURNED' | 'APPROVED' | 'CANCELLED';
  createdAt: string; createdByName: string | null;
  reviewers: Array<{ id: string; name: string | null; decision: 'APPROVED' | 'RETURNED' | null }>;
}
```

- `GET /document-review/mine` → rounds in `WAITING_REVIEW` where I am a reviewer and have not decided, on non-closed cases I can open, due date first (nulls last), max 50.
- `GET /cases/:caseId/review-rounds` (case access) → every round on that case's documents, newest first, max 50.
- Decisions keep using `POST /cases/:caseId/documents/:documentId/review-rounds/:roundId/decision`.
- Review notices now link to `/cases/<id>?tab=documents`, which Task 1 maps to the app's `?section=documents`.

- [ ] **Step 1: Write the failing service tests**

In `apps/api/src/document-review/document-review.service.spec.ts`:

1. Add the import:

```ts
import { CaseAccessService } from '../common/services/case-access.service';
```

2. In `const mockPrisma = {`, add:

```ts
    user: { findMany: jest.fn() },
```

3. After `const notifier = { notifyAssigned: jest.fn() };`, add:

```ts
  const mockCaseAccess = { getCaseFilterForUser: jest.fn().mockReturnValue({ firmId: 'firm-1' }) };
```

4. In the `providers` array, add `{ provide: CaseAccessService, useValue: mockCaseAccess },`.

5. In `describe('notices')`, extend the two existing expectations so they also pin the link:
   - in `'tells each reviewer when a round is created'` add `entityPath: '/cases/case-1?tab=documents',` inside `expect.objectContaining({ ... })`;
   - in `'tells the creator when a round is returned'` add the same `entityPath: '/cases/case-1?tab=documents',`.

6. Add a new `describe` block before the final `});`:

```ts
  describe('review queues (D2)', () => {
    const summaryRow = {
      id: 'round-1',
      documentVersionId: 'version-3',
      reviewerIds: ['reviewer-1', 'reviewer-2'],
      scope: 'ข้อ 1-5',
      dueAt: new Date('2026-10-15T09:30:00Z'),
      status: 'WAITING_REVIEW',
      createdById: 'author',
      createdAt: new Date('2026-10-11T03:00:00Z'),
      decisions: [{ reviewerId: 'reviewer-2', decision: 'APPROVED' }],
      documentVersion: {
        documentId: 'doc-1',
        version: 3,
        document: { filename: 'สัญญา.pdf', caseId: 'case-1', case: { ownRef: 'C-001', title: 'คดีทดสอบ' } },
      },
    };

    beforeEach(() => {
      mockPrisma.reviewRound.findMany.mockResolvedValue([summaryRow]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'author', firstName: 'สมชาย', lastName: 'ใจดี' },
        { id: 'reviewer-1', firstName: 'สมหญิง', lastName: 'ตรวจดี' },
        { id: 'reviewer-2', firstName: 'มานะ', lastName: 'ขยัน' },
      ]);
    });

    it('lists only rounds still waiting for my own decision, on live cases I can open', async () => {
      const rows = await service.listMine(user);

      expect(mockCaseAccess.getCaseFilterForUser).toHaveBeenCalledWith(user);
      expect(mockPrisma.reviewRound.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          status: 'WAITING_REVIEW',
          reviewerIds: { has: 'reviewer-1' },
          decisions: { none: { reviewerId: 'reviewer-1' } },
          documentVersion: { document: { case: { AND: [{ firmId: 'firm-1' }, { status: { notIn: ['CLOSED', 'ARCHIVED'] } }] } } },
        },
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        take: 50,
      }));
      expect(rows).toEqual([{
        id: 'round-1', caseId: 'case-1', caseRef: 'C-001', caseTitle: 'คดีทดสอบ',
        documentId: 'doc-1', documentVersionId: 'version-3', filename: 'สัญญา.pdf', version: 3,
        scope: 'ข้อ 1-5', dueAt: '2026-10-15T09:30:00.000Z', status: 'WAITING_REVIEW',
        createdAt: '2026-10-11T03:00:00.000Z', createdByName: 'สมชาย ใจดี',
        reviewers: [
          { id: 'reviewer-1', name: 'สมหญิง ตรวจดี', decision: null },
          { id: 'reviewer-2', name: 'มานะ ขยัน', decision: 'APPROVED' },
        ],
      }]);
    });

    it('lists every round on one case, newest first, scoped to that case', async () => {
      await service.listForCase('case-1');
      expect(mockPrisma.reviewRound.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { documentVersion: { document: { caseId: 'case-1' } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }));
    });

    it('skips the name lookup when there are no rounds', async () => {
      mockPrisma.reviewRound.findMany.mockResolvedValue([]);
      expect(await service.listMine(user)).toEqual([]);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Write the failing controller test**

Create `apps/api/src/document-review/document-review-queue.controller.spec.ts`:

```ts
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { DocumentReviewQueueController } from './document-review-queue.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';

describe('DocumentReviewQueueController', () => {
  const reflector = new Reflector();
  const service = { listMine: jest.fn().mockResolvedValue([]), listForCase: jest.fn().mockResolvedValue([]) };
  const controller = new DocumentReviewQueueController(service as never);
  const user = { id: 'reviewer-1', firmId: 'firm-1' } as never;

  it('serves the two URLs the app calls', () => {
    expect(reflector.get(PATH_METADATA, controller.mine)).toBe('document-review/mine');
    expect(reflector.get(PATH_METADATA, controller.forCase)).toBe('cases/:caseId/review-rounds');
  });

  it('needs a signed-in user for both lists and case access for the case list', () => {
    expect(reflector.get(GUARDS_METADATA, DocumentReviewQueueController)).toEqual([JwtAuthGuard]);
    expect(reflector.get(GUARDS_METADATA, controller.forCase)).toEqual([CaseAccessGuard]);
    expect(reflector.get(GUARDS_METADATA, controller.mine)).toBeUndefined();
  });

  it('passes the caller and the case through', async () => {
    await controller.mine(user);
    expect(service.listMine).toHaveBeenCalledWith(user);
    await controller.forCase('case-1');
    expect(service.listForCase).toHaveBeenCalledWith('case-1');
  });
});
```

- [ ] **Step 3: Run both specs to verify they fail**

Run: `pnpm --filter api exec jest --config jest.config.js --maxWorkers=2 src/document-review/document-review.service.spec.ts src/document-review/document-review-queue.controller.spec.ts`
Expected: FAIL — `service.listMine is not a function`, the controller module cannot be found, and the notice tests see `entityPath: '/cases/case-1'`.

- [ ] **Step 4: Add the queue methods to the service**

In `apps/api/src/document-review/document-review.service.ts`:

1. Change the prisma import line to also bring `Prisma`:

```ts
import { DocumentVersionStatus, NotificationCategory, Prisma, ReviewDecisionType, ReviewRoundStatus } from '../generated/prisma';
```

and add:

```ts
import { CaseAccessService } from '../common/services/case-access.service';
```

2. Below `const roundInclude = { ... };` add:

```ts
/** What a round list needs: the document, its case, and who decided what (no file contents). */
const summaryInclude = {
  decisions: { select: { reviewerId: true, decision: true } },
  documentVersion: {
    select: {
      documentId: true,
      version: true,
      document: { select: { filename: true, caseId: true, case: { select: { ownRef: true, title: true } } } },
    },
  },
} satisfies Prisma.ReviewRoundInclude;
type SummaryRound = Prisma.ReviewRoundGetPayload<{ include: typeof summaryInclude }>;
```

3. Replace the constructor:

```ts
  constructor(private prisma: PrismaService, private notifier: AssignmentNotifierService) {}
```

with:

```ts
  constructor(
    private prisma: PrismaService,
    private notifier: AssignmentNotifierService,
    private caseAccess: CaseAccessService,
  ) {}
```

4. Add these methods right after `listForDocument`:

```ts
  /** Rounds still waiting for the caller's own decision, on live cases they can open (home + notices). */
  async listMine(user: AuthUser) {
    const rounds = await this.prisma.reviewRound.findMany({
      where: {
        status: ReviewRoundStatus.WAITING_REVIEW,
        reviewerIds: { has: user.id },
        decisions: { none: { reviewerId: user.id } },
        documentVersion: {
          document: { case: { AND: [this.caseAccess.getCaseFilterForUser(user), { status: { notIn: ['CLOSED', 'ARCHIVED'] } }] } },
        },
      },
      include: summaryInclude,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 50,
    });
    return this.toSummaries(rounds);
  }

  /** Every round on one case's documents, newest first. CaseAccessGuard already checked the case. */
  async listForCase(caseId: string) {
    const rounds = await this.prisma.reviewRound.findMany({
      where: { documentVersion: { document: { caseId } } },
      include: summaryInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return this.toSummaries(rounds);
  }

  /** Names for the sender and reviewers in one query; each reviewer carries their own decision. */
  private async toSummaries(rounds: SummaryRound[]) {
    if (!rounds.length) return [];
    const ids = [...new Set(rounds.flatMap((round) => [round.createdById, ...round.reviewerIds]))];
    const people = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    });
    const names = new Map(people.map((person) => [person.id, `${person.firstName} ${person.lastName}`]));
    return rounds.map((round) => ({
      id: round.id,
      caseId: round.documentVersion.document.caseId,
      caseRef: round.documentVersion.document.case?.ownRef ?? null,
      caseTitle: round.documentVersion.document.case?.title ?? null,
      documentId: round.documentVersion.documentId,
      documentVersionId: round.documentVersionId,
      filename: round.documentVersion.document.filename,
      version: round.documentVersion.version,
      scope: round.scope,
      dueAt: round.dueAt?.toISOString() ?? null,
      status: round.status,
      createdAt: round.createdAt.toISOString(),
      createdByName: names.get(round.createdById) ?? null,
      reviewers: round.reviewerIds.map((id) => ({
        id,
        name: names.get(id) ?? null,
        decision: round.decisions.find((decision) => decision.reviewerId === id)?.decision ?? null,
      })),
    }));
  }
```

5. Point both review notices at the documents tab. In `createReviewRound` and in `notifyRoundClosed` replace

```ts
      entityPath: `/cases/${caseId}`,
```

with

```ts
      entityPath: `/cases/${caseId}?tab=documents`,
```

(two occurrences; the web case page already reads `?tab=documents`.)

- [ ] **Step 5: Create the controller**

Create `apps/api/src/document-review/document-review-queue.controller.ts`:

```ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { DocumentReviewService } from './document-review.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/** Read-only round lists for the app (D2). Decisions stay on DocumentReviewController. */
@Controller()
@UseGuards(JwtAuthGuard)
export class DocumentReviewQueueController {
  constructor(private service: DocumentReviewService) {}

  @Get('document-review/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.listMine(user);
  }

  @Get('cases/:caseId/review-rounds')
  @UseGuards(CaseAccessGuard)
  forCase(@Param('caseId') caseId: string) {
    return this.service.listForCase(caseId);
  }
}
```

In `apps/api/src/document-review/document-review.module.ts` add the import and register it:

```ts
import { DocumentReviewQueueController } from './document-review-queue.controller';
```

```ts
  controllers: [DocumentReviewController, DocumentReviewQueueController],
```

- [ ] **Step 6: Run the specs and the api typecheck**

Run: `pnpm --filter api exec jest --config jest.config.js --maxWorkers=2 src/document-review`
Expected: PASS (service, scheduler and the new controller spec).

Run: `pnpm --filter api exec tsc --noEmit -p tsconfig.json`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/api/src/document-review/document-review.service.ts apps/api/src/document-review/document-review.service.spec.ts apps/api/src/document-review/document-review-queue.controller.ts apps/api/src/document-review/document-review-queue.controller.spec.ts apps/api/src/document-review/document-review.module.ts
/usr/bin/git commit -m "$(cat <<'EOF'
feat(api): review rounds waiting for me and per case; review notices open the documents tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 2 -->

### Task 3: Mobile data layer — types, hooks, Thai dates, urgency, action helpers, static check

**Files:**
- Create: `apps/mobile/scripts/check-litigation-parity.cjs`
- Create: `apps/mobile/src/thai-date.ts`, `apps/mobile/src/deadline.ts`, `apps/mobile/src/litigation.ts`
- Modify: `apps/mobile/src/api/types.ts:84-97` (`CaseDetail`) + append new types
- Modify: `apps/mobile/src/api/hooks.ts:10-25` (type import) + append hooks at the end of the file

**Interfaces:**
- Consumes: Task 1 (`MyDayResponse.pendingDeadlineConfirms` arrives through the shared re-export in `types.ts:6`), Task 2 row shape.
- Produces (later tasks use exactly these names):
  - `thai-date.ts`: `ThaiDateParts { d: string; m: string; y: string }`, `ThaiDateCheck`, `checkThaiDate(parts): ThaiDateCheck`, `dayToParts(day: string | null | undefined): ThaiDateParts`, `bangkokDayToIso(day: string): string`, `limitationPatch(formDay: string | null, storedDay: string | null): { limitationDeadline?: string | null }`, `THAI_MONTH_OPTIONS: { value: string; label: string }[]`, `THAI_DATE_PARTIAL`, `THAI_DATE_IMPOSSIBLE`, `THAI_DATE_YEAR`.
  - `deadline.ts`: `UrgencyTone = 'due' | 'court' | 'info'`, `Urgency { tone; label; daysLeft }`, `deadlineUrgency(isoDate: string, now: Date): Urgency`, `legalBasis(label: string | null | undefined): string | null`.
  - `litigation.ts`: `canRecordProceedings(status): boolean`, `isNetworkError(error): boolean`, `OFFLINE_SAVE`, `actionErrorText(error): string`, `suggestionRequest(row, action, leadLawyerId?): { path; body? }`, `canDecideRound(round, userId): boolean`, `reviewDecisionRequest(round, action, reason?): { path; body }`.
  - `types.ts`: `CaseProceeding`, `ProceedingKind`, `DateSuggestion`, `ReviewRoundSummary`; `CaseDetail.stage?`, `.limitationDeadline?`, `.proceedings?`.
  - `hooks.ts`: `useDateSuggestions(caseId)` key `['date-suggestions', caseId]`; `useDecideSuggestion(caseId)` vars `{ suggestion: DateSuggestion; action: 'confirm' | 'dismiss'; leadLawyerId?: string | null }`; `useRecordProceeding(caseId)` vars `{ kind: ProceedingKind; body: Record<string, string> }` → `{ proceeding: CaseProceeding | null; suggestions: number }`; `useCaseReviewRounds(caseId)` key `['review-rounds', caseId]`; `useMyReviewRounds()` key `['my-review-rounds']`; `useDecideReviewRound(caseId)` vars `{ round: ReviewRoundSummary; action: 'approve' | 'return'; reason?: string }` → `{ id: string; status: string }`.
  - `scripts/check-litigation-parity.cjs`: later tasks add `check('<name>', () => { ... })` blocks directly above the line `// ── add new check(...) blocks above this line ──`.

- [ ] **Step 1: Write the failing static check**

Create `apps/mobile/scripts/check-litigation-parity.cjs`:

```js
// Run with: node apps/mobile/scripts/check-litigation-parity.cjs   (needs `pnpm --filter @lawfirm/shared build`)
// Pure logic and hook wiring for the mobile litigation work. Dates run under a non-Bangkok TZ on purpose.
process.env.TZ = 'America/Los_Angeles';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', file);
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = (id) => (Object.hasOwn(mocks, id) ? mocks[id] : original(id));
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}

const format = load('format.ts');
const thaiDate = load('thai-date.ts');
const deadline = load('deadline.ts');
const lit = load('litigation.ts', { './format': format, './thai-date': thaiDate });
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('thai date parts: all three or none, no impossible day, Buddhist year only', () => {
  const { checkThaiDate, dayToParts, bangkokDayToIso, limitationPatch, THAI_MONTH_OPTIONS, THAI_DATE_PARTIAL, THAI_DATE_IMPOSSIBLE, THAI_DATE_YEAR } = thaiDate;
  assert.equal(THAI_DATE_PARTIAL, 'กรอกให้ครบทั้งวัน เดือน ปี หรือเว้นว่างทั้งหมด');
  assert.equal(THAI_DATE_IMPOSSIBLE, 'วันที่นี้ไม่มีในปฏิทิน');
  assert.equal(THAI_DATE_YEAR, 'ใส่ปี พ.ศ. (เช่น 2569)');
  assert.deepEqual(checkThaiDate({ d: '', m: '', y: '' }), { kind: 'empty' });
  for (const parts of [{ d: '13', m: '', y: '' }, { d: '13', m: '11', y: '256' }, { d: '', m: '11', y: '2569' }]) {
    assert.deepEqual(checkThaiDate(parts), { kind: 'partial', message: THAI_DATE_PARTIAL });
  }
  assert.deepEqual(checkThaiDate({ d: '31', m: '4', y: '2569' }), { kind: 'invalid', message: THAI_DATE_IMPOSSIBLE });
  assert.deepEqual(checkThaiDate({ d: '29', m: '2', y: '2569' }), { kind: 'invalid', message: THAI_DATE_IMPOSSIBLE });
  assert.deepEqual(checkThaiDate({ d: '0', m: '1', y: '2569' }), { kind: 'invalid', message: THAI_DATE_IMPOSSIBLE });
  assert.deepEqual(checkThaiDate({ d: '29', m: '2', y: '2567' }), { kind: 'ok', day: '2024-02-29' });
  assert.deepEqual(checkThaiDate({ d: '13', m: '11', y: '2026' }), { kind: 'invalid', message: THAI_DATE_YEAR });
  assert.deepEqual(checkThaiDate({ d: '1', m: '1', y: '2701' }), { kind: 'invalid', message: THAI_DATE_YEAR });
  assert.deepEqual(checkThaiDate({ d: '1', m: '1', y: '2700' }), { kind: 'ok', day: '2157-01-01' });
  assert.deepEqual(checkThaiDate({ d: '13', m: '11', y: '2569' }), { kind: 'ok', day: '2026-11-13' });
  assert.deepEqual(dayToParts('2026-11-13'), { d: '13', m: '11', y: '2569' });
  assert.deepEqual(dayToParts(null), { d: '', m: '', y: '' });
  assert.equal(bangkokDayToIso('2026-11-13'), '2026-11-12T17:00:00.000Z');
  assert.equal(THAI_MONTH_OPTIONS.length, 12);
  assert.deepEqual(THAI_MONTH_OPTIONS[10], { value: '11', label: 'พฤศจิกายน' });
  // The limitation key is sent only when it changed, and null only for a real clear.
  assert.deepEqual(limitationPatch('2026-11-13', '2026-11-13'), {});
  assert.deepEqual(limitationPatch(null, null), {});
  assert.deepEqual(limitationPatch('2026-11-14', '2026-11-13'), { limitationDeadline: '2026-11-13T17:00:00.000Z' });
  assert.deepEqual(limitationPatch(null, '2026-11-13'), { limitationDeadline: null });
});

check('deadline urgency follows the design thresholds on the Bangkok calendar, due 16:30', () => {
  const now = new Date('2026-10-12T03:00:00Z'); // 12 ต.ค. 2569, 10:00 Bangkok
  const at = (iso, when = now) => deadline.deadlineUrgency(iso, when);
  assert.deepEqual(at('2026-10-12T09:30:00Z'), { tone: 'due', label: 'ครบกำหนดวันนี้ 16:30 น.', daysLeft: 0 });
  assert.deepEqual(at('2026-10-12T09:30:00Z', new Date('2026-10-12T09:31:00Z')), { tone: 'due', label: 'เลยกำหนดวันนี้ 16:30 น.', daysLeft: 0 });
  assert.deepEqual(at('2026-10-09T09:30:00Z'), { tone: 'due', label: 'เลยกำหนด 3 วัน', daysLeft: -3 });
  assert.deepEqual(at('2026-10-13T09:30:00Z'), { tone: 'due', label: 'เหลือ 1 วัน', daysLeft: 1 });
  assert.deepEqual(at('2026-10-19T09:30:00Z'), { tone: 'due', label: 'เหลือ 7 วัน', daysLeft: 7 });
  assert.deepEqual(at('2026-10-20T09:30:00Z'), { tone: 'court', label: 'เหลือ 8 วัน', daysLeft: 8 });
  assert.deepEqual(at('2026-11-11T09:30:00Z'), { tone: 'court', label: 'เหลือ 30 วัน', daysLeft: 30 });
  assert.deepEqual(at('2026-11-12T09:30:00Z'), { tone: 'info', label: 'เหลือ 31 วัน', daysLeft: 31 });
  // A limitation date is stored as Bangkok midnight: 13 พ.ย. 2569 is 32 days away (design example).
  assert.deepEqual(at('2026-11-12T17:00:00.000Z'), { tone: 'info', label: 'เหลือ 32 วัน', daysLeft: 32 });
  // 00:30 Bangkok on 13 ต.ค. is still 12 Oct in UTC: the Bangkok day decides.
  assert.equal(at('2026-10-13T09:30:00Z', new Date('2026-10-12T17:30:00Z')).label, 'ครบกำหนดวันนี้ 16:30 น.');
});

check('legal basis comes from the default rule label; a firm-renamed rule shows none', () => {
  assert.equal(deadline.legalBasis('ครบกำหนดยื่นอุทธรณ์'), 'ป.วิ.พ. ม.229');
  assert.equal(deadline.legalBasis('ครบกำหนดยื่นคำแก้อุทธรณ์'), 'ป.วิ.พ. ม.237');
  assert.equal(deadline.legalBasis('ชื่อที่สำนักงานตั้งเอง'), null);
  assert.equal(deadline.legalBasis(null), null);
});

check('actions are hidden where the API refuses; failures read in Thai', () => {
  const { canRecordProceedings, isNetworkError, actionErrorText, OFFLINE_SAVE, canDecideRound } = lit;
  for (const status of ['OPEN', 'DRAFTING', 'COURT_DATE', 'IN_PROGRESS', 'PENDING']) assert.equal(canRecordProceedings(status), true, status);
  for (const status of ['CLOSED', 'ARCHIVED', '', null, undefined]) assert.equal(canRecordProceedings(status), false, String(status));
  const offline = new TypeError('Network request failed');
  const apiError = (status, message) => Object.assign(new Error(message), { status });
  assert.equal(isNetworkError(offline), true);
  assert.equal(isNetworkError(apiError(409, 'x')), false);
  assert.equal(OFFLINE_SAVE, 'ต้องต่อเน็ตเพื่อบันทึก');
  assert.equal(actionErrorText(offline), OFFLINE_SAVE);
  assert.equal(actionErrorText(apiError(400, 'คดีปิดแล้ว')), 'คดีปิดแล้ว');
  assert.equal(actionErrorText(apiError(409, 'วันที่นี้ถูกยืนยันหรือไม่ใช้ไปแล้ว')), 'วันที่นี้ถูกยืนยันหรือไม่ใช้ไปแล้ว');
  assert.equal(actionErrorText(apiError(403, 'You do not have access to this case')), 'ไม่มีสิทธิ์ทำรายการนี้ในคดีนี้');
  assert.equal(actionErrorText(apiError(404, 'Case not found')), 'ไม่พบรายการนี้แล้ว');
  assert.equal(actionErrorText(apiError(500, 'HTTP 500')), 'ลองใหม่อีกครั้ง');
  const round = { status: 'WAITING_REVIEW', reviewers: [{ id: 'me', decision: null }, { id: 'other', decision: 'APPROVED' }] };
  assert.equal(canDecideRound(round, 'me'), true);
  assert.equal(canDecideRound(round, 'other'), false, 'already decided');
  assert.equal(canDecideRound(round, 'stranger'), false, 'not on the round');
  assert.equal(canDecideRound({ ...round, status: 'RETURNED' }, 'me'), false, 'closed round');
  assert.equal(canDecideRound(round, undefined), false);
});

check("requests target the row's own case and send what the API checks", () => {
  const { suggestionRequest, reviewDecisionRequest } = lit;
  const row = { id: 's1', caseId: 'case-B', updatedAt: '2026-10-12T01:00:00.000Z', source: 'RULE' };
  assert.deepEqual(suggestionRequest(row, 'confirm', 'lead-1'),
    { path: '/cases/case-B/date-suggestions/s1/confirm', body: { expectedUpdatedAt: '2026-10-12T01:00:00.000Z' } });
  assert.deepEqual(suggestionRequest({ ...row, source: 'DOCUMENT' }, 'confirm', 'lead-1').body,
    { expectedUpdatedAt: '2026-10-12T01:00:00.000Z', assigneeId: 'lead-1' });
  assert.deepEqual(suggestionRequest(row, 'dismiss'), { path: '/cases/case-B/date-suggestions/s1/dismiss' });
  const round = { id: 'r1', caseId: 'case-C', documentId: 'd1', documentVersionId: 'v3' };
  assert.deepEqual(reviewDecisionRequest(round, 'return', '  แก้ข้อ 2  '), {
    path: '/cases/case-C/documents/d1/review-rounds/r1/decision',
    body: { action: 'return', reviewedDocumentVersionId: 'v3', reason: 'แก้ข้อ 2' },
  });
  assert.deepEqual(reviewDecisionRequest(round, 'approve', 'ignored').body, { action: 'approve', reviewedDocumentVersionId: 'v3' });
});

check("deadline hooks refetch on every mount, act on the row's case, and refresh after any outcome", async () => {
  const calls = [];
  const invalidated = [];
  const client = { invalidateQueries: ({ queryKey }) => { invalidated.push(JSON.stringify(queryKey)); } };
  const hooks = load('api/hooks.ts', {
    '@tanstack/react-query': { useQuery: (o) => o, useMutation: (o) => o, useInfiniteQuery: (o) => o, useQueryClient: () => client },
    './client': { api: async (requestPath, init) => { calls.push([requestPath, init]); return { status: 'WAITING_REVIEW' }; } },
    '../format': format,
    '../litigation': lit,
  });
  const list = hooks.useDateSuggestions('case-A');
  assert.deepEqual(list.queryKey, ['date-suggestions', 'case-A']);
  assert.equal(list.staleTime, 0, 'a suggestion confirmed elsewhere must not show from the 7-day cache');
  await list.queryFn();
  assert.equal(calls.at(-1)[0], '/cases/case-A/date-suggestions');
  const decide = hooks.useDecideSuggestion('case-A');
  assert.equal(decide.retry, false);
  assert.equal(decide.onMutate, undefined, 'never optimistic on a legal deadline');
  await decide.mutationFn({ suggestion: { id: 's1', caseId: 'case-A', updatedAt: '2026-10-12T01:00:00.000Z', source: 'RULE' }, action: 'confirm' });
  assert.deepEqual(calls.at(-1), ['/cases/case-A/date-suggestions/s1/confirm', { method: 'POST', body: { expectedUpdatedAt: '2026-10-12T01:00:00.000Z' } }]);
  // onSettled runs after success AND failure, so a 409 "already handled" also refreshes the list.
  decide.onSettled();
  for (const key of [['case', 'case-A'], ['date-suggestions', 'case-A'], ['my-day'], ['todos'], ['notifications'], ['actions']]) {
    assert.ok(invalidated.includes(JSON.stringify(key)), `invalidates ${key.join(':')}`);
  }
  const record = hooks.useRecordProceeding('case-A');
  assert.equal(record.retry, false);
  await record.mutationFn({ kind: 'judgment', body: { courtLevel: 'TRIAL' } });
  assert.deepEqual(calls.at(-1), ['/cases/case-A/proceedings/judgment', { method: 'POST', body: { courtLevel: 'TRIAL' } }]);
  const rounds = hooks.useCaseReviewRounds('case-A');
  assert.deepEqual(rounds.queryKey, ['review-rounds', 'case-A']);
  assert.equal(rounds.staleTime, 0);
  assert.deepEqual(hooks.useMyReviewRounds().queryKey, ['my-review-rounds']);
  const review = hooks.useDecideReviewRound('case-A');
  assert.equal(review.retry, false);
  invalidated.length = 0;
  review.onSettled();
  for (const key of [['review-rounds', 'case-A'], ['my-review-rounds'], ['notifications']]) {
    assert.ok(invalidated.includes(JSON.stringify(key)), `invalidates ${key.join(':')}`);
  }
});

// ── add new check(...) blocks above this line ──
(async () => {
  for (const [name, fn] of checks) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`PASS: ${checks.length} mobile litigation parity checks`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: FAIL with `ENOENT ... src/thai-date.ts`.

- [ ] **Step 3: Write `thai-date.ts`**

Create `apps/mobile/src/thai-date.ts`:

```ts
/**
 * Typed Thai dates: วัน / เดือน / ปี พ.ศ. parts <-> a Bangkok calendar day `YYYY-MM-DD` (ค.ศ.).
 * Same rule as the web ThaiDateInput: all three parts or none, and an impossible day
 * (31 เม.ย.) is rejected, never moved to another day.
 */
export interface ThaiDateParts { d: string; m: string; y: string }

export type ThaiDateCheck =
  | { kind: 'empty' }
  | { kind: 'partial'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'ok'; day: string };

export const THAI_DATE_PARTIAL = 'กรอกให้ครบทั้งวัน เดือน ปี หรือเว้นว่างทั้งหมด';
export const THAI_DATE_IMPOSSIBLE = 'วันที่นี้ไม่มีในปฏิทิน';
export const THAI_DATE_YEAR = 'ใส่ปี พ.ศ. (เช่น 2569)';
const MIN_BE_YEAR = 2400;
const MAX_BE_YEAR = 2700;

export const THAI_MONTH_OPTIONS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
].map((label, index) => ({ value: String(index + 1), label }));

export function checkThaiDate(parts: ThaiDateParts): ThaiDateCheck {
  const d = parts.d.trim();
  const m = parts.m.trim();
  const y = parts.y.trim();
  if (!d && !m && !y) return { kind: 'empty' };
  if (!d || !m || y.length !== 4) return { kind: 'partial', message: THAI_DATE_PARTIAL };
  const be = Number(y);
  if (!/^\d{4}$/.test(y) || be < MIN_BE_YEAR || be > MAX_BE_YEAR) return { kind: 'invalid', message: THAI_DATE_YEAR };
  const day = Number(d);
  const month = Number(m);
  const ad = be - 543;
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || month < 1 || month > 12 || day < 1
    || day > new Date(Date.UTC(ad, month, 0)).getUTCDate()) {
    return { kind: 'invalid', message: THAI_DATE_IMPOSSIBLE };
  }
  return { kind: 'ok', day: `${ad}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

export function dayToParts(day: string | null | undefined): ThaiDateParts {
  const match = day?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { d: '', m: '', y: '' };
  return { d: String(Number(match[3])), m: String(Number(match[2])), y: String(Number(match[1]) + 543) };
}

/** Bangkok midnight of a whole day as an ISO instant — how the API stores a limitation or event day. */
export function bangkokDayToIso(day: string): string {
  return new Date(`${day}T00:00:00+07:00`).toISOString();
}

/**
 * The API re-syncs (and resets) the limitation reminder whenever the key is present,
 * so send it only when it changed, and null only for an explicit clear.
 */
export function limitationPatch(formDay: string | null, storedDay: string | null): { limitationDeadline?: string | null } {
  if (formDay === storedDay) return {};
  return { limitationDeadline: formDay ? bangkokDayToIso(formDay) : null };
}
```

- [ ] **Step 4: Write `deadline.ts`**

Create `apps/mobile/src/deadline.ts`:

```ts
/** Deadline urgency on the Bangkok calendar; a legal deadline is due at 16:30 Bangkok on its day. */
export type UrgencyTone = 'due' | 'court' | 'info';
export interface Urgency { tone: UrgencyTone; label: string; daysLeft: number }

const DAY_MS = 86_400_000;
const bangkokKey = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

export function deadlineUrgency(isoDate: string, now: Date): Urgency {
  const due = bangkokKey(Date.parse(isoDate));
  const daysLeft = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${bangkokKey(now.getTime())}T00:00:00Z`)) / DAY_MS);
  if (now.getTime() > Date.parse(`${due}T16:30:00+07:00`)) {
    // ponytail: the design has no copy for "due today, already past 16:30"; this mirrors "ครบกำหนดวันนี้ 16:30 น.".
    return { tone: 'due', daysLeft, label: daysLeft < 0 ? `เลยกำหนด ${-daysLeft} วัน` : 'เลยกำหนดวันนี้ 16:30 น.' };
  }
  if (daysLeft === 0) return { tone: 'due', daysLeft, label: 'ครบกำหนดวันนี้ 16:30 น.' };
  return { tone: daysLeft <= 7 ? 'due' : daysLeft <= 30 ? 'court' : 'info', daysLeft, label: `เหลือ ${daysLeft} วัน` };
}

/**
 * ป.วิ.พ. section behind each platform default rule (packages/shared DEFAULT_DEADLINE_RULES comments).
 * ponytail: suggestions carry no citation field, so this keys on the default label; a firm-renamed rule
 * shows no basis. Move the citation onto the rule row if firms need their own.
 */
const LEGAL_BASIS: Record<string, string> = {
  'ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง': 'ป.วิ.พ. ม.173',
  'ครบกำหนดยื่นคำให้การ': 'ป.วิ.พ. ม.177',
  'ครบกำหนดยื่นคำให้การ (ปิดหมาย)': 'ป.วิ.พ. ม.79 และ ม.177',
  'ตรวจขาดนัดยื่นคำให้การ / ขอให้พิพากษาโดยขาดนัด': 'ป.วิ.พ. ม.197–198',
  'ยื่นบัญชีระบุพยาน': 'ป.วิ.พ. ม.88',
  'ครบกำหนดยื่นอุทธรณ์': 'ป.วิ.พ. ม.229',
  'ครบกำหนดยื่นคำร้องขออนุญาตฎีกาและฎีกา': 'ป.วิ.พ. ม.247',
  'ครบกำหนดยื่นคำแก้อุทธรณ์': 'ป.วิ.พ. ม.237',
  'ใกล้ครบระยะบังคับคดี 10 ปี': 'ป.วิ.พ. ม.274',
};

export function legalBasis(label: string | null | undefined): string | null {
  return label ? LEGAL_BASIS[label] ?? null : null;
}
```

- [ ] **Step 5: Add the mobile types**

In `apps/mobile/src/api/types.ts`, inside `interface CaseDetail`, after `participants?: CaseParticipant[];` add:

```ts
  /** CaseStage; read before and after a court-event record to say whether the stage moved (D3). */
  stage?: string;
  /** Bangkok midnight of the last filing day. Optional: caches persisted by older builds lack it. */
  limitationDeadline?: string | null;
  /** Recorded court levels, TRIAL → SUPREME (`GET /cases/:id` includes them). */
  proceedings?: CaseProceeding[];
```

Append at the end of the file:

```ts
export interface CaseProceeding {
  id: string;
  courtLevel: string;
  courtName: string | null;
  blackCaseNumber: string | null;
  redCaseNumber: string | null;
  filedAt: string | null;
  judgmentAt: string | null;
}

/** The four court events the phone records: `POST /cases/:caseId/proceedings/<kind>`. */
export type ProceedingKind = 'filing' | 'service' | 'judgment' | 'appeal-served';

/** `GET /cases/:caseId/date-suggestions` row (PENDING unless asked otherwise). */
export interface DateSuggestion {
  id: string;
  caseId: string;
  label: string;
  suggestedDate: string;
  status: string;
  source: 'DOCUMENT' | 'RULE';
  sourceExcerpt: string | null;
  deadlineRule: { label: string; trigger: string } | null;
  holidayDataIncomplete?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `GET /document-review/mine` and `GET /cases/:caseId/review-rounds` row. */
export interface ReviewRoundSummary {
  id: string;
  caseId: string;
  caseRef: string | null;
  caseTitle: string | null;
  documentId: string;
  documentVersionId: string;
  filename: string;
  version: number;
  scope: string | null;
  dueAt: string | null;
  status: string;
  createdAt: string;
  createdByName: string | null;
  reviewers: Array<{ id: string; name: string | null; decision: 'APPROVED' | 'RETURNED' | null }>;
}
```

- [ ] **Step 6: Write `litigation.ts`**

Create `apps/mobile/src/litigation.ts`:

```ts
import type { DateSuggestion, ReviewRoundSummary } from './api/types';

/** Court-event records refuse a closed or archived case ('คดีปิดแล้ว'); D8 hides deadline actions there too. */
export function canRecordProceedings(caseStatus: string | null | undefined): boolean {
  return !!caseStatus && caseStatus !== 'CLOSED' && caseStatus !== 'ARCHIVED';
}

/** fetch() throws a bare TypeError when the phone has no connection; the API always answers with a status. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

export const OFFLINE_SAVE = 'ต้องต่อเน็ตเพื่อบันทึก';

/** What a lawyer reads when a legal action fails: the API's Thai message, never "HTTP 409" or English. */
export function actionErrorText(error: unknown): string {
  if (isNetworkError(error)) return OFFLINE_SAVE;
  const message = error instanceof Error ? error.message : '';
  if (/[฀-๿]/.test(message)) return message;
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 403) return 'ไม่มีสิทธิ์ทำรายการนี้ในคดีนี้';
  if (status === 404) return 'ไม่พบรายการนี้แล้ว';
  return 'ลองใหม่อีกครั้ง';
}

/** Confirm/dismiss always target the suggestion's own case, never the screen's. */
export function suggestionRequest(
  suggestion: Pick<DateSuggestion, 'id' | 'caseId' | 'updatedAt' | 'source'>,
  action: 'confirm' | 'dismiss',
  leadLawyerId?: string | null,
): { path: string; body?: Record<string, string> } {
  const path = `/cases/${suggestion.caseId}/date-suggestions/${suggestion.id}/${action}`;
  if (action === 'dismiss') return { path };
  return {
    path,
    body: {
      // The API answers 409 when the row changed since we read it, instead of confirming a moved date.
      expectedUpdatedAt: suggestion.updatedAt,
      // A date read from a document needs a responsible lawyer; the case lead is who the notice went to.
      ...(suggestion.source === 'DOCUMENT' && leadLawyerId ? { assigneeId: leadLawyerId } : {}),
    },
  };
}

/** Only a reviewer named on a waiting round who has not decided yet may decide (API recordDecision). */
export function canDecideRound(round: Pick<ReviewRoundSummary, 'status' | 'reviewers'>, userId: string | null | undefined): boolean {
  return !!userId && round.status === 'WAITING_REVIEW' && round.reviewers.some((person) => person.id === userId && !person.decision);
}

export function reviewDecisionRequest(
  round: Pick<ReviewRoundSummary, 'id' | 'caseId' | 'documentId' | 'documentVersionId'>,
  action: 'approve' | 'return',
  reason?: string,
): { path: string; body: { action: 'approve' | 'return'; reviewedDocumentVersionId: string; reason?: string } } {
  const trimmed = reason?.trim();
  return {
    path: `/cases/${round.caseId}/documents/${round.documentId}/review-rounds/${round.id}/decision`,
    // The API rejects a decision on a version that changed while the screen was open.
    body: { action, reviewedDocumentVersionId: round.documentVersionId, ...(action === 'return' && trimmed ? { reason: trimmed } : {}) },
  };
}
```

- [ ] **Step 7: Add the hooks**

In `apps/mobile/src/api/hooks.ts`:

1. Extend the `import type { ... } from './types';` list with `CaseProceeding,`, `DateSuggestion,`, `ProceedingKind,`, `ReviewRoundSummary,` (keep it alphabetical).
2. Below `import { calendarRangeQuery } from '../format';` add:

```ts
import { reviewDecisionRequest, suggestionRequest } from '../litigation';
```

3. Append at the end of the file:

```ts
/** Everything a court-event record or a deadline decision can change. */
function invalidateCaseDeadlines(client: ReturnType<typeof useQueryClient>, caseId: string) {
  for (const queryKey of [['case', caseId], ['date-suggestions', caseId], ['my-day'], ['todos'], ['case-events', caseId], ['calendar']]) {
    client.invalidateQueries({ queryKey });
  }
  invalidateNotifications(client);
}

export function useDateSuggestions(caseId: string) {
  return useQuery({
    queryKey: ['date-suggestions', caseId],
    queryFn: () => api<DateSuggestion[]>(`/cases/${caseId}/date-suggestions`),
    enabled: !!caseId,
    // A row confirmed elsewhere must not linger as "pending" from the 7-day cache: refetch on every mount.
    staleTime: 0,
  });
}

/** No optimistic update: a legal deadline row changes only after the server answers. */
export function useDecideSuggestion(caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ suggestion, action, leadLawyerId }: { suggestion: DateSuggestion; action: 'confirm' | 'dismiss'; leadLawyerId?: string | null }) => {
      const request = suggestionRequest(suggestion, action, leadLawyerId);
      return api<DateSuggestion>(request.path, { method: 'POST', body: request.body });
    },
    retry: false,
    onSettled: () => invalidateCaseDeadlines(client, caseId),
  });
}

export function useRecordProceeding(caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, body }: { kind: ProceedingKind; body: Record<string, string> }) =>
      api<{ proceeding: CaseProceeding | null; suggestions: number }>(`/cases/${caseId}/proceedings/${kind}`, { method: 'POST', body }),
    retry: false,
    onSettled: () => invalidateCaseDeadlines(client, caseId),
  });
}

export function useCaseReviewRounds(caseId: string) {
  return useQuery({
    queryKey: ['review-rounds', caseId],
    queryFn: () => api<ReviewRoundSummary[]>(`/cases/${caseId}/review-rounds`),
    enabled: !!caseId,
    staleTime: 0,
  });
}

export function useMyReviewRounds() {
  return useQuery({ queryKey: ['my-review-rounds'], queryFn: () => api<ReviewRoundSummary[]>('/document-review/mine') });
}

export function useDecideReviewRound(caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ round, action, reason }: { round: ReviewRoundSummary; action: 'approve' | 'return'; reason?: string }) => {
      const request = reviewDecisionRequest(round, action, reason);
      return api<{ id: string; status: string }>(request.path, { method: 'POST', body: request.body });
    },
    retry: false,
    onSettled: () => {
      for (const queryKey of [['review-rounds', caseId], ['my-review-rounds'], ['case-documents', caseId]]) client.invalidateQueries({ queryKey });
      invalidateNotifications(client);
    },
  });
}
```

(`invalidateNotifications` is a function declaration earlier in the file, so it is in scope.)

- [ ] **Step 8: Run the static check and the typecheck**

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: six `ok - ...` lines and `PASS: 6 mobile litigation parity checks`.

Run: `(cd apps/mobile && pnpm exec tsc --noEmit)`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git add apps/mobile/scripts/check-litigation-parity.cjs apps/mobile/src/thai-date.ts apps/mobile/src/deadline.ts apps/mobile/src/litigation.ts apps/mobile/src/api/types.ts apps/mobile/src/api/hooks.ts
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mobile): litigation data layer — Thai dates, deadline urgency, action helpers, hooks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 3 -->

### Task 4: Mobile shared components (SectionCard, ActionSheet, ThaiDateField) + case screen keeps its cache offline (D7)

**Files:**
- Create: `apps/mobile/src/components/SectionCard.tsx`, `apps/mobile/src/components/ActionSheet.tsx`, `apps/mobile/src/components/ThaiDateField.tsx`
- Modify: `apps/mobile/src/components/DatePicker.tsx:28-60,137-150` (`iconOnly`)
- Modify: `apps/mobile/src/thai-date.ts` (add `thaiDateAction`), `apps/mobile/src/litigation.ts` (add `cachedDataNote`)
- Modify: `apps/mobile/app/case/[id].tsx:104-110,128`
- Test: `apps/mobile/scripts/check-litigation-parity.cjs`

**Interfaces:**
- Consumes: Task 3 `checkThaiDate`, `dayToParts`, `bangkokDayToIso`, `THAI_MONTH_OPTIONS`, `isNetworkError`; `timeAgo` (`src/format.ts:70`).
- Produces:
  - `SectionCard({ title: string; count?: number; tone?: 'due' | 'court' | 'info'; collapsible?: boolean; defaultOpen?: boolean; summary?: string; children })`
  - `ActionSheet({ visible: boolean; title: string; detail?: string; onClose(): void; children })`
  - `ThaiDateField` (forwardRef to the วัน `TextInput`) with props `{ label: string; value: string | null; onChange(day: string | null): void; onInvalidChange?(invalid: boolean): void; clearable?: boolean; clearConfirm?: { title: string; body: string }; hint?: string; disabled?: boolean }` — `value`/`onChange` use a Bangkok day `YYYY-MM-DD`. (`onInvalidChange` and `disabled` are additions to the design's prop list: the design says "the parent form blocks save while the field reports invalid", and forms disable fields while saving.)
  - `DatePicker` gains `iconOnly?: boolean`.
  - `thaiDateAction(next: ThaiDateParts, value: string | null, confirmClear: boolean)` → `{ emit: 'day'; day; invalid: false } | { emit: 'clear'; invalid: false } | { emit: 'confirm-clear'; invalid: false } | { emit: 'none'; invalid: true; message }`.
  - `cachedDataNote(error: unknown, updatedAt: number, now?: Date): string`.

- [ ] **Step 1: Write the failing checks**

In `apps/mobile/scripts/check-litigation-parity.cjs`, add directly above `// ── add new check(...) blocks above this line ──`:

```js
check('the date field holds a half-typed entry back and asks before clearing a saved date', () => {
  const { thaiDateAction } = thaiDate;
  assert.deepEqual(thaiDateAction({ d: '13', m: '', y: '25' }, '2026-11-13', true),
    { emit: 'none', invalid: true, message: 'กรอกให้ครบทั้งวัน เดือน ปี หรือเว้นว่างทั้งหมด' });
  assert.deepEqual(thaiDateAction({ d: '31', m: '4', y: '2569' }, '2026-11-13', true),
    { emit: 'none', invalid: true, message: 'วันที่นี้ไม่มีในปฏิทิน' });
  assert.deepEqual(thaiDateAction({ d: '', m: '', y: '' }, '2026-11-13', true), { emit: 'confirm-clear', invalid: false });
  assert.deepEqual(thaiDateAction({ d: '', m: '', y: '' }, null, true), { emit: 'clear', invalid: false });
  assert.deepEqual(thaiDateAction({ d: '', m: '', y: '' }, '2026-11-13', false), { emit: 'clear', invalid: false });
  assert.deepEqual(thaiDateAction({ d: '14', m: '11', y: '2569' }, '2026-11-13', true), { emit: 'day', day: '2026-11-14', invalid: false });
});

check('a failed refetch keeps the cached case and says why in Thai (D7)', () => {
  const now = new Date('2026-10-12T03:00:00Z');
  assert.equal(lit.cachedDataNote(new TypeError('Network request failed'), now.getTime() - 5 * 60_000, now),
    'ออฟไลน์ · ข้อมูลล่าสุด 5 นาทีที่แล้ว');
  assert.equal(lit.cachedDataNote(Object.assign(new Error('HTTP 500'), { status: 500 }), now.getTime(), now),
    'โหลดข้อมูลล่าสุดไม่ได้ แสดงข้อมูลที่เก็บไว้');
});

```

- [ ] **Step 2: Run it to verify it fails**

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: FAIL with `TypeError: thaiDateAction is not a function`.

- [ ] **Step 3: Add `thaiDateAction` and `cachedDataNote`**

Append to `apps/mobile/src/thai-date.ts`:

```ts
export type ThaiDateAction =
  | { emit: 'day'; day: string; invalid: false }
  | { emit: 'clear'; invalid: false }
  | { emit: 'confirm-clear'; invalid: false }
  | { emit: 'none'; invalid: true; message: string };

/**
 * What the field does with newly typed parts. A half-typed or impossible entry never reaches the
 * form (`none`), so it can never overwrite or clear a saved date; emptying a saved date asks first.
 */
export function thaiDateAction(next: ThaiDateParts, value: string | null, confirmClear: boolean): ThaiDateAction {
  const result = checkThaiDate(next);
  if (result.kind === 'ok') return { emit: 'day', day: result.day, invalid: false };
  if (result.kind === 'empty') return value && confirmClear ? { emit: 'confirm-clear', invalid: false } : { emit: 'clear', invalid: false };
  return { emit: 'none', invalid: true, message: result.message };
}
```

In `apps/mobile/src/litigation.ts` add at the top:

```ts
import { timeAgo } from './format';
```

and append:

```ts
/** D7: the note above a case rendered from cache after its refetch failed. */
export function cachedDataNote(error: unknown, updatedAt: number, now = new Date()): string {
  return isNetworkError(error)
    ? `ออฟไลน์ · ข้อมูลล่าสุด ${timeAgo(new Date(updatedAt), now)}`
    : 'โหลดข้อมูลล่าสุดไม่ได้ แสดงข้อมูลที่เก็บไว้';
}
```

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: `PASS: 8 mobile litigation parity checks`.

- [ ] **Step 4: Create `SectionCard`**

Create `apps/mobile/src/components/SectionCard.tsx`:

```tsx
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { Card, Tag } from './ui';
import { colors, fonts, spacing, TOUCH } from '@/theme';

/** Card + title row + count Tag; when it collapses, the whole header is the 44pt tap target. */
export function SectionCard({ title, count, tone, collapsible = false, defaultOpen = true, summary, children }: {
  title: string;
  count?: number;
  tone?: 'due' | 'court' | 'info';
  collapsible?: boolean;
  defaultOpen?: boolean;
  summary?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(collapsible ? defaultOpen : true);
  const Icon = open ? ChevronDown : ChevronRight;
  const header = <>
    <View style={styles.text}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
    </View>
    {count != null ? <Tag tone={tone ?? 'plain'}>{count}</Tag> : null}
    {collapsible ? <Icon size={20} color={colors.info} /> : null}
  </>;
  return <Card style={styles.card}>
    {collapsible
      ? <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)} style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}>{header}</Pressable>
      : <View style={styles.header}>{header}</View>}
    {open ? children : null}
  </Card>;
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md, gap: spacing.sm },
  header: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  summary: { color: colors.muted, fontSize: 12 },
});
```

- [ ] **Step 5: Create `ActionSheet`**

Create `apps/mobile/src/components/ActionSheet.tsx` (the bottom `Modal` from `ReassignSheet.tsx:54-60,151-171`, plus keyboard handling so a typed reason stays visible):

```tsx
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { colors, fonts, spacing } from '@/theme';

/** Bottom sheet shared by court-event records, review returns and other one-hand flows. */
export function ActionSheet({ visible, title, detail, onClose, children }: {
  visible: boolean;
  title: string;
  detail?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  return <Modal visible={visible} transparent animationType="slide"
    supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Pressable accessible={false} style={[styles.backdrop, { paddingBottom: keyboardHeight }]} onPress={onClose}>
        <Pressable accessible={false} style={[styles.sheet, { paddingBottom: spacing.lg + bottom }]} onPress={() => undefined}>
          <View style={styles.handle} />
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {detail ? <Text style={styles.detail} numberOfLines={2}>{detail}</Text> : null}
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm }}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14,20,32,0.45)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%', maxWidth: 760, alignSelf: 'center', maxHeight: '90%',
    backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: spacing.lg,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  detail: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: spacing.md },
});
```

(The backdrop colour is the one `ReassignSheet` already uses. Refactoring `ReassignSheet` onto `ActionSheet` is optional in the design and is skipped here to keep the diff small.)

- [ ] **Step 6: Give `DatePicker` an icon-only trigger**

In `apps/mobile/src/components/DatePicker.tsx`:

1. Replace the signature

```tsx
export function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (isoDate: string) => void;
}) {
```

with

```tsx
export function DatePicker({
  value,
  onChange,
  iconOnly = false,
}: {
  value: string;
  onChange: (isoDate: string) => void;
  /** A 44pt calendar button only (ThaiDateField shows the date itself). */
  iconOnly?: boolean;
}) {
```

2. Replace the trigger `Pressable` (the one with `accessibilityLabel="เลือกวันที่"`, lines 48-60) with:

```tsx
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={iconOnly ? 'เลือกจากปฏิทิน' : 'เลือกวันที่'}
        accessibilityValue={{ text: valid ? thDate(parsed) : 'ยังไม่ได้เลือก' }}
        style={iconOnly ? styles.icon : styles.field}
        onPress={() => {
          if (valid) setCursor({ y: parsed.getFullYear(), m: parsed.getMonth() });
          setOpen(true);
        }}
      >
        <Calendar size={iconOnly ? 20 : 17} color={iconOnly ? colors.ink : colors.faint} />
        {iconOnly ? null : <Text style={styles.fieldText}>{valid ? thDate(parsed) : 'เลือกวันที่'}</Text>}
      </Pressable>
```

3. In `StyleSheet.create`, after `fieldText`, add:

```ts
  icon: {
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
```

- [ ] **Step 7: Create `ThaiDateField`**

Create `apps/mobile/src/components/ThaiDateField.tsx`:

```tsx
import React, { forwardRef, useEffect, useState } from 'react';
import { Alert, Pressable, TextInput as NativeTextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { SectionLabel } from './ui';
import { Dropdown } from './Dropdown';
import { DatePicker } from './DatePicker';
import { thDateLong } from '@/format';
import { bangkokDayToIso, checkThaiDate, dayToParts, THAI_MONTH_OPTIONS, thaiDateAction, type ThaiDateParts } from '@/thai-date';
import { colors, formLabelSpacing, radius, spacing, TOUCH } from '@/theme';

const input = {
  minHeight: 48, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line,
  borderRadius: radius.button, backgroundColor: colors.surface, color: colors.text, fontSize: 16,
} as const;
const digits = (text: string) => text.replace(/\D/g, '');

/**
 * วัน / เดือน / ปี พ.ศ. typed entry. `value` is a Bangkok day `YYYY-MM-DD` or null. The parent hears
 * only a real date, or null for a deliberate clear; a half-typed or impossible entry stays here and is
 * reported through `onInvalidChange(true)` so the form can block save. The ref is the วัน input.
 */
export const ThaiDateField = forwardRef<NativeTextInput, {
  label: string;
  value: string | null;
  onChange: (day: string | null) => void;
  onInvalidChange?: (invalid: boolean) => void;
  clearable?: boolean;
  clearConfirm?: { title: string; body: string };
  hint?: string;
  disabled?: boolean;
}>(function ThaiDateField({ label, value, onChange, onInvalidChange, clearable = false, clearConfirm, hint, disabled = false }, ref) {
  const [parts, setParts] = useState<ThaiDateParts>(() => dayToParts(value));
  const check = checkThaiDate(parts);

  // Follow a value set from outside (calendar pick, "คืนค่าเดิม") without wiping a half-typed entry.
  useEffect(() => {
    const shown = check.kind === 'ok' ? check.day : check.kind === 'empty' ? null : undefined;
    if (shown !== undefined && shown !== value) setParts(dayToParts(value));
  }, [value]);

  const apply = (next: ThaiDateParts) => {
    const action = thaiDateAction(next, value, !!clearConfirm);
    if (action.emit === 'confirm-clear' && clearConfirm) {
      Alert.alert(clearConfirm.title, clearConfirm.body, [
        { text: 'ยกเลิก', style: 'cancel', onPress: () => setParts(dayToParts(value)) },
        { text: 'ลบวันที่', style: 'destructive', onPress: () => { setParts(next); onInvalidChange?.(false); onChange(null); } },
      ]);
      return;
    }
    setParts(next);
    onInvalidChange?.(action.invalid);
    if (action.emit === 'day') onChange(action.day);
    if (action.emit === 'clear') onChange(null);
  };
  const typed = !!(parts.d || parts.m || parts.y);

  return <View style={{ gap: spacing.sm }}>
    <SectionLabel style={formLabelSpacing}>{label}</SectionLabel>
    {hint ? <Text style={{ color: colors.muted, fontSize: 13 }}>{hint}</Text> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <TextInput ref={ref} accessibilityLabel={`${label} วัน`} placeholder="วัน" placeholderTextColor={colors.faint}
        keyboardType="number-pad" maxLength={2} editable={!disabled} value={parts.d}
        onChangeText={(text) => apply({ ...parts, d: digits(text) })} style={[input, { width: 64 }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Dropdown label="เดือน" value={parts.m} options={THAI_MONTH_OPTIONS} disabled={disabled}
          onChange={(m) => apply({ ...parts, m })} />
      </View>
      <TextInput accessibilityLabel={`${label} ปี พ.ศ.`} placeholder="ปี พ.ศ." placeholderTextColor={colors.faint}
        keyboardType="number-pad" maxLength={4} editable={!disabled} value={parts.y}
        onChangeText={(text) => apply({ ...parts, y: digits(text) })} style={[input, { width: 84 }]} />
      {disabled ? null : <DatePicker iconOnly value={check.kind === 'ok' ? check.day : value ?? ''} onChange={(day) => apply(dayToParts(day))} />}
      {clearable && typed && !disabled ? <Pressable accessibilityRole="button" accessibilityLabel={`ล้าง${label}`}
        onPress={() => apply({ d: '', m: '', y: '' })}
        style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
        <X size={18} color={colors.muted} />
      </Pressable> : null}
    </View>
    {check.kind === 'partial' || check.kind === 'invalid'
      ? <Text accessibilityRole="alert" style={{ color: colors.warn, fontSize: 13 }}>{check.message}</Text>
      : check.kind === 'ok' ? <Text style={{ color: colors.muted, fontSize: 13 }}>{thDateLong(bangkokDayToIso(check.day))}</Text> : null}
  </View>;
});
```

(The read-back uses the existing `thDateLong`, which prints `พฤหัส 13 พ.ย. 2569`; the design's example says `พฤหัสบดี`. Changing the shared weekday table would change every screen, so this keeps the app's existing format.)

- [ ] **Step 8: Keep the cached case on a failed refetch (D7)**

In `apps/mobile/app/case/[id].tsx`:

1. Add the import:

```tsx
import { cachedDataNote } from '@/litigation';
```

2. Replace (lines 104-110):

```tsx
  if (caseQuery.isLoading) return <Loading />;
  if (caseQuery.isError || !caseQuery.data)
    return (
```

with:

```tsx
  if (caseQuery.isLoading) return <Loading />;
  // React Query keeps `data` when a refetch fails (D7): only a case never loaded is an error page.
  if (!caseQuery.data)
    return (
```

3. Replace (line 128):

```tsx
        <Text style={styles.caseTitle}>{detail.title}</Text>
```

with:

```tsx
        <Text style={styles.caseTitle}>{detail.title}</Text>
        {caseQuery.isError ? (
          <ErrorNote message={cachedDataNote(caseQuery.error, caseQuery.dataUpdatedAt)} onRetry={() => caseQuery.refetch()} />
        ) : null}
```

`?section=documents` already opens the เอกสาร tab (`:82`); `?section=deadlines` and `?section=comments` (Task 1) land on ภาพรวม at the top, where Task 5 puts the deadline card — no extra routing code is needed.

- [ ] **Step 9: Typecheck and run the checks**

Run: `(cd apps/mobile && pnpm exec tsc --noEmit)`
Expected: exits 0.

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: `PASS: 8 mobile litigation parity checks`.

- [ ] **Step 10: Commit**

```bash
/usr/bin/git add apps/mobile/src/components/SectionCard.tsx apps/mobile/src/components/ActionSheet.tsx apps/mobile/src/components/ThaiDateField.tsx apps/mobile/src/components/DatePicker.tsx apps/mobile/src/thai-date.ts apps/mobile/src/litigation.ts "apps/mobile/app/case/[id].tsx" apps/mobile/scripts/check-litigation-parity.cjs
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mobile): SectionCard, ActionSheet, ThaiDateField; case screen keeps cached data offline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 4 -->

### Task 5: Mobile case screen — "รอยืนยันวันครบกำหนด", limitation line, "ศาลและเลขคดี"

**Files:**
- Create: `apps/mobile/src/components/DeadlineConfirmCard.tsx`, `apps/mobile/src/components/CourtNumbersCard.tsx`
- Modify: `apps/mobile/src/litigation.ts` (add `limitationRelevant`, `courtLevelRows`)
- Modify: `apps/mobile/app/case/[id].tsx` (imports, refs, above-the-tabs block, ภาพรวม tab, styles)
- Test: `apps/mobile/scripts/check-litigation-parity.cjs`

**Interfaces:**
- Consumes: Task 3 `useDateSuggestions`, `useDecideSuggestion`, `deadlineUrgency`, `legalBasis`, `actionErrorText`, `isNetworkError`, `canRecordProceedings`; Task 4 `SectionCard`, the D7 `cachedDataNote` block.
- Produces:
  - `limitationRelevant(detail: Pick<CaseDetail, 'status' | 'blackCaseNumber' | 'proceedings'>): boolean`
  - `courtLevelRows(detail): CourtLevelRow[]`, `CourtLevelRow { level: CourtLevel; current: boolean; reached: boolean; courtName: string | null; black: string | null; red: string | null }`
  - `DeadlineConfirmCard({ caseId: string; leadLawyerId?: string | null; canAct: boolean; offline: boolean; highlightSince?: string | null })` — Task 6 passes `highlightSince`.
  - `CourtNumbersCard({ detail: CaseDetail; onEditLimitation?: () => void })`
  - In `app/case/[id].tsx`: `scrollRef`, `courtY`, `offline` (boolean) — Tasks 6, 9 and 11 reuse them.

- [ ] **Step 1: Write the failing check**

Add above `// ── add new check(...) blocks above this line ──` in `apps/mobile/scripts/check-litigation-parity.cjs`:

```js
check('limitation matters until filing; one court row per level, current level falls back to the case', () => {
  const { limitationRelevant, courtLevelRows } = lit;
  const open = { status: 'OPEN', blackCaseNumber: null, proceedings: [] };
  assert.equal(limitationRelevant(open), true);
  assert.equal(limitationRelevant({ status: 'OPEN', blackCaseNumber: null }), true, 'older cache without proceedings');
  assert.equal(limitationRelevant({ ...open, status: 'CLOSED' }), false);
  assert.equal(limitationRelevant({ ...open, blackCaseNumber: 'พ.123/2569' }), false);
  assert.equal(limitationRelevant({ ...open, proceedings: [{ courtLevel: 'TRIAL', filedAt: '2026-10-01T00:00:00Z', blackCaseNumber: null, judgmentAt: null }] }), false);
  const rows = courtLevelRows({
    courtLevel: 'APPEAL', courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'อ.5/2570', redCaseNumber: null,
    proceedings: [{ courtLevel: 'TRIAL', courtName: 'ศาลแพ่งกรุงเทพใต้', blackCaseNumber: 'พ.123/2569', redCaseNumber: 'พ.900/2569', filedAt: null, judgmentAt: null }],
  });
  assert.deepEqual(rows.map((row) => [row.level, row.current, row.reached, row.courtName, row.black, row.red]), [
    ['TRIAL', false, true, 'ศาลแพ่งกรุงเทพใต้', 'พ.123/2569', 'พ.900/2569'],
    ['APPEAL', true, true, 'ศาลอุทธรณ์', 'อ.5/2570', null],
    ['SUPREME', false, false, null, null, null],
  ]);
  const unset = courtLevelRows({ courtLevel: null, courtName: 'ศาลแพ่ง', blackCaseNumber: null, redCaseNumber: null });
  assert.deepEqual(unset.map((row) => [row.level, row.current, row.reached, row.courtName]),
    [['TRIAL', true, true, 'ศาลแพ่ง'], ['APPEAL', false, false, null], ['SUPREME', false, false, null]]);
});

```

- [ ] **Step 2: Run it to verify it fails**

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: FAIL with `TypeError: limitationRelevant is not a function`.

- [ ] **Step 3: Add the helpers**

In `apps/mobile/src/litigation.ts`, replace the type import line

```ts
import type { DateSuggestion, ReviewRoundSummary } from './api/types';
```

with

```ts
import { CourtLevel } from '@lawfirm/shared';
import type { CaseDetail, DateSuggestion, ReviewRoundSummary } from './api/types';
```

and append:

```ts
const LEVELS = [CourtLevel.TRIAL, CourtLevel.APPEAL, CourtLevel.SUPREME];

/** Mirrors api common/limitation-reminder.ts: the limitation date stops mattering once the case is filed or closed. */
export function limitationRelevant(detail: Pick<CaseDetail, 'status' | 'blackCaseNumber' | 'proceedings'>): boolean {
  return canRecordProceedings(detail.status) && !detail.blackCaseNumber
    && !(detail.proceedings ?? []).some((row) => row.filedAt || row.blackCaseNumber || row.judgmentAt);
}

export interface CourtLevelRow {
  level: CourtLevel;
  current: boolean;
  /** Earlier and current levels read normally; later ones are muted ("ยังไม่ถึงชั้นนี้"). */
  reached: boolean;
  courtName: string | null;
  black: string | null;
  red: string | null;
}

/** One row per court level. The case's own court and numbers mirror the current level, so they fill its gaps. */
export function courtLevelRows(
  detail: Pick<CaseDetail, 'courtLevel' | 'courtName' | 'blackCaseNumber' | 'redCaseNumber' | 'proceedings'>,
): CourtLevelRow[] {
  const currentLevel = (detail.courtLevel ?? CourtLevel.TRIAL) as CourtLevel;
  const currentIndex = LEVELS.indexOf(currentLevel);
  return LEVELS.map((level, index) => {
    const row = (detail.proceedings ?? []).find((item) => item.courtLevel === level);
    const current = level === currentLevel;
    return {
      level,
      current,
      reached: index <= currentIndex,
      courtName: row?.courtName ?? (current ? detail.courtName : null),
      black: row?.blackCaseNumber ?? (current ? detail.blackCaseNumber : null),
      red: row?.redCaseNumber ?? (current ? detail.redCaseNumber : null),
    };
  });
}
```

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: `PASS: 9 mobile litigation parity checks`.

- [ ] **Step 4: Create `DeadlineConfirmCard`**

Create `apps/mobile/src/components/DeadlineConfirmCard.tsx`:

```tsx
import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useDateSuggestions, useDecideSuggestion } from '@/api/hooks';
import type { DateSuggestion } from '@/api/types';
import { deadlineUrgency, legalBasis } from '@/deadline';
import { actionErrorText, isNetworkError } from '@/litigation';
import { thDate, thTime } from '@/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { SectionCard } from './SectionCard';
import { Button, ErrorNote, Loading, Tag } from './ui';

type Settled = { row: DateSuggestion; text: string; confirmed: boolean; visible: boolean };

/**
 * "รอยืนยันวันครบกำหนด": one-tap ✓, ✕ after a confirmation. Nothing moves before the server answers;
 * a handled row then shows its result for 1.5 s and stays out of the list.
 */
export function DeadlineConfirmCard({ caseId, leadLawyerId, canAct, offline, highlightSince }: {
  caseId: string;
  leadLawyerId?: string | null;
  canAct: boolean;
  offline: boolean;
  /** Rows created at or after this ISO instant were just suggested by a court-event record (D3). */
  highlightSince?: string | null;
}) {
  const suggestions = useDateSuggestions(caseId);
  const decide = useDecideSuggestion(caseId);
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [settled, setSettled] = useState<Record<string, Settled>>({});

  const pending = (suggestions.data ?? []).filter((row) => !settled[row.id]);
  const rows = [...pending, ...Object.values(settled).filter((item) => item.visible).map((item) => item.row)]
    .sort((a, b) => a.suggestedDate.localeCompare(b.suggestedDate));
  const isOffline = offline || (suggestions.isError && isNetworkError(suggestions.error));

  const run = async (row: DateSuggestion, action: 'confirm' | 'dismiss') => {
    // A second tap while the first request is on its way must not send another one.
    if (inFlight.current.has(row.id)) return;
    inFlight.current.add(row.id);
    setBusy((value) => ({ ...value, [row.id]: true }));
    try {
      await decide.mutateAsync({ suggestion: row, action, leadLawyerId });
      const when = `${thDate(row.suggestedDate)} ${thTime(row.suggestedDate)} น.`;
      setSettled((value) => ({
        ...value,
        [row.id]: {
          row,
          confirmed: action === 'confirm',
          visible: true,
          text: action === 'confirm' ? `ยืนยันแล้ว · เพิ่มในปฏิทินคดี ${when}` : 'ไม่ใช้แล้ว · ไม่ได้เพิ่มวันครบกำหนด',
        },
      }));
      setTimeout(() => setSettled((value) => ({ ...value, [row.id]: { ...value[row.id], visible: false } })), 1500);
    } catch (error) {
      // The hook refetches on settle, so a row handled elsewhere (409) disappears after this alert.
      Alert.alert('บันทึกไม่สำเร็จ', actionErrorText(error));
    } finally {
      inFlight.current.delete(row.id);
      setBusy(({ [row.id]: _done, ...rest }) => rest);
    }
  };

  const askDismiss = (row: DateSuggestion) => Alert.alert(
    'ไม่ใช้วันที่ระบบเสนอ?',
    `${row.label} ${thDate(row.suggestedDate)} จะไม่ถูกเพิ่มเป็นวันครบกำหนด ถ้าต้องใช้ภายหลังต้องเพิ่มเอง`,
    [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'ไม่ใช้', style: 'destructive', onPress: () => void run(row, 'dismiss') }],
  );

  if (suggestions.isLoading) return <Loading />;
  if (suggestions.isError && !suggestions.data) return <ErrorNote message="โหลดวันรอยืนยันไม่ได้" onRetry={() => suggestions.refetch()} />;
  if (!rows.length) return null;

  return <SectionCard title="รอยืนยันวันครบกำหนด" count={pending.length} tone="due">
    {!canAct ? <Text style={styles.muted}>รอผู้รับผิดชอบคดียืนยัน</Text>
      : isOffline ? <Text style={styles.muted}>ออฟไลน์ · ต้องต่อเน็ตเพื่อยืนยันวันครบกำหนด</Text> : null}
    {rows.map((row) => {
      const done = settled[row.id];
      const urgency = deadlineUrgency(row.suggestedDate, new Date());
      const basis = legalBasis(row.deadlineRule?.label ?? row.label);
      // ponytail: compares the phone clock with server createdAt; a skewed clock only skips the highlight.
      const fresh = !!highlightSince && row.createdAt >= highlightSince;
      return <View key={row.id} style={[styles.row, fresh && styles.fresh, done && (done.confirmed ? styles.confirmed : styles.dismissed)]}>
        <View style={styles.head}>
          <Text style={styles.label}>{row.label}</Text>
          <Tag tone={urgency.tone}>{urgency.label}</Tag>
        </View>
        <Text style={styles.date}>{thDate(row.suggestedDate)} · {thTime(row.suggestedDate)} น.</Text>
        {basis ? <Text style={styles.muted}>{basis}</Text> : null}
        {row.holidayDataIncomplete ? <Text style={styles.holiday}>⚠ ปฏิทินวันหยุดปีนี้ยังไม่ครบ ตรวจวันอีกครั้ง</Text> : null}
        {done ? <Text style={{ color: done.confirmed ? colors.good : colors.muted, fontWeight: '600' }}>{done.text}</Text>
          : canAct ? <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button title="✕ ไม่ใช้" ghost disabled={isOffline || !!busy[row.id]} onPress={() => askDismiss(row)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="✓ ยืนยันวันนี้" busy={!!busy[row.id]} disabled={isOffline} onPress={() => void run(row, 'confirm')} />
            </View>
          </View> : null}
      </View>;
    })}
  </SectionCard>;
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line },
  fresh: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  confirmed: { borderColor: colors.good, backgroundColor: colors.goodSoft },
  dismissed: { backgroundColor: colors.soft },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { flex: 1, color: colors.ink, fontWeight: '600', fontSize: 15 },
  date: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 13 },
  holiday: { color: colors.warn, backgroundColor: colors.warnSoft, padding: spacing.sm, borderRadius: radius.pill, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});
```

- [ ] **Step 5: Create `CourtNumbersCard`**

Create `apps/mobile/src/components/CourtNumbersCard.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { COURT_LEVEL_LABELS } from '@lawfirm/shared';
import { Text } from '@/components/AppText';
import type { CaseDetail } from '@/api/types';
import { deadlineUrgency } from '@/deadline';
import { courtLevelRows, limitationRelevant } from '@/litigation';
import { thDate } from '@/format';
import { colors, fonts, spacing, TOUCH } from '@/theme';
import { SectionCard } from './SectionCard';
import { Tag } from './ui';

/** "ศาลและเลขคดี": limitation date and one row per court level, all from the cached case. */
export function CourtNumbersCard({ detail, onEditLimitation }: { detail: CaseDetail; onEditLimitation?: () => void }) {
  const urgency = detail.limitationDeadline && limitationRelevant(detail)
    ? deadlineUrgency(detail.limitationDeadline, new Date())
    : null;
  return <SectionCard title="ศาลและเลขคดี">
    <View style={styles.line}>
      <Text style={styles.label}>อายุความ</Text>
      {detail.limitationDeadline ? <>
        <Text style={[styles.value, { flex: 1 }]}>{thDate(detail.limitationDeadline)}</Text>
        {urgency ? <Tag tone={urgency.tone}>{urgency.label}</Tag> : null}
      </> : <>
        <Text style={[styles.muted, { flex: 1 }]}>ยังไม่ระบุอายุความ</Text>
        {onEditLimitation ? <Pressable accessibilityRole="button" accessibilityLabel="แก้ไขวันครบอายุความ" onPress={onEditLimitation} style={styles.link}>
          <Text style={{ color: colors.info, fontWeight: '600' }}>แก้ไข</Text>
        </Pressable> : null}
      </>}
    </View>
    {courtLevelRows(detail).map((row) => <View key={row.level} style={[styles.level, row.current && styles.current]}>
      <View style={styles.line}>
        <Text style={[styles.levelTitle, !row.reached && styles.muted]}>{COURT_LEVEL_LABELS[row.level]}</Text>
        {row.current ? <Tag tone="court">ชั้นปัจจุบัน</Tag> : null}
      </View>
      {row.reached ? <>
        {row.courtName ? <Text style={styles.value}>{row.courtName}</Text> : null}
        <Text selectable style={styles.numbers}>ดำ {row.black ?? '—'} · แดง {row.red ?? '—'}</Text>
      </> : <Text style={styles.muted}>ยังไม่ถึงชั้นนี้</Text>}
    </View>)}
  </SectionCard>;
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  label: { color: colors.faint, fontSize: 12, fontWeight: '600' },
  value: { color: colors.text, fontSize: 14 },
  muted: { color: colors.muted, fontSize: 13 },
  link: { minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center', alignItems: 'flex-end' },
  // An invisible rail keeps every level's text aligned; the current level shows it in accent.
  level: { gap: 2, paddingVertical: spacing.sm, paddingLeft: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.surface },
  current: { borderLeftColor: colors.accent },
  levelTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  numbers: { color: colors.ink, fontSize: 14, fontVariant: ['tabular-nums'] },
});
```

- [ ] **Step 6: Wire both into the case screen**

In `apps/mobile/app/case/[id].tsx`:

1. Change `import React, { useState } from 'react';` to `import React, { useRef, useState } from 'react';`.
2. Replace `import { cachedDataNote } from '@/litigation';` with:

```tsx
import { cachedDataNote, canRecordProceedings, isNetworkError, limitationRelevant } from '@/litigation';
import { deadlineUrgency } from '@/deadline';
import { CourtNumbersCard } from '@/components/CourtNumbersCard';
import { DeadlineConfirmCard } from '@/components/DeadlineConfirmCard';
```

3. Hooks go above the early returns. After `const [openingDoc, setOpeningDoc] = useState<string | null>(null);` add:

```tsx
  const scrollRef = useRef<ScrollView>(null);
  const courtY = useRef(0);
```

4. After `const status = STATUS_LABEL[detail.status] ?? { label: detail.status, tone: 'plain' as TagTone };` add:

```tsx
  const offline = caseQuery.isError && isNetworkError(caseQuery.error);
  const limitation = detail.limitationDeadline && limitationRelevant(detail)
    ? deadlineUrgency(detail.limitationDeadline, new Date())
    : null;
  const showCourtNumbers = () => {
    setTab('ภาพรวม');
    // ponytail: waits for the ภาพรวม tab to lay out once; use onLayout + state if 150 ms ever proves short.
    setTimeout(() => scrollRef.current?.scrollTo({ y: courtY.current, animated: true }), 150);
  };
```

5. On the `<ScrollView` that starts at `style={styles.screen}`, add the prop `ref={scrollRef}`.

6. Directly after the D7 block from Task 4 (`{caseQuery.isError ? ( <ErrorNote ... /> ) : null}`) add:

```tsx
        <DeadlineConfirmCard caseId={id} leadLawyerId={detail.leadLawyerId ?? detail.leadLawyer?.id}
          canAct={canRecordProceedings(detail.status)} offline={offline} />
        {limitation && detail.limitationDeadline ? (
          <Pressable accessibilityRole="button" onPress={showCourtNumbers} style={styles.limitationLine}
            accessibilityLabel={`อายุความ ${thDate(detail.limitationDeadline)} ${limitation.label} ดูศาลและเลขคดี`}>
            <Text style={styles.infoLabel}>อายุความ</Text>
            <Text style={[styles.rowStrong, { flex: 1 }]}>{thDate(detail.limitationDeadline)}</Text>
            <Tag tone={limitation.tone}>{limitation.label}</Tag>
          </Pressable>
        ) : null}
```

7. In the ภาพรวม tab, insert the court card between the status/people `Card` and the คู่ความ `Card`. Replace:

```tsx
          </Card>
          <Card style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.infoLabel}>คู่ความ</Text>
```

with:

```tsx
          </Card>
          <View onLayout={(event) => { courtY.current = event.nativeEvent.layout.y; }}>
            <CourtNumbersCard detail={detail}
              onEditLimitation={canRecordProceedings(detail.status) ? () => router.push(`/case/new?id=${id}`) : undefined} />
          </View>
          <Card style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.infoLabel}>คู่ความ</Text>
```

8. In `StyleSheet.create`, after `caseTitle`, add:

```ts
  limitationLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, marginTop: spacing.md },
```

The deadline card sits above the tabs (it shows on every tab), so the push "วันครบกำหนดรอยืนยัน" (`?section=deadlines`) lands on it with no scrolling.

- [ ] **Step 7: Typecheck and run the checks**

Run: `(cd apps/mobile && pnpm exec tsc --noEmit)`
Expected: exits 0.

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: `PASS: 9 mobile litigation parity checks`.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/mobile/src/components/DeadlineConfirmCard.tsx apps/mobile/src/components/CourtNumbersCard.tsx apps/mobile/src/litigation.ts "apps/mobile/app/case/[id].tsx" apps/mobile/scripts/check-litigation-parity.cjs
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mobile): case screen confirms deadline suggestions and shows limitation and court numbers per level

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 5 -->

### Task 6: Mobile — record court events from the case screen and the court-day chip (item 1, D3)

**Files:**
- Create: `apps/mobile/src/components/RecordCourtEventSheet.tsx`
- Modify: `apps/mobile/src/litigation.ts` (labels, body, confirmation, result text, `runProceeding`)
- Modify: `apps/mobile/app/case/[id].tsx` (button, success card, sheet, highlight)
- Modify: `apps/mobile/app/court-day/[eventId].tsx` (chip + sheet)
- Test: `apps/mobile/scripts/check-litigation-parity.cjs`

**Interfaces:**
- Consumes: Task 3 `useRecordProceeding`, `actionErrorText`, `OFFLINE_SAVE`, `bangkokDayToIso`; Task 4 `ActionSheet`, `ThaiDateField`; Task 5 `DeadlineConfirmCard.highlightSince`, `scrollRef`, `offline`, the `CourtNumbersCard` wrapper in `case/[id].tsx`; shared `CASE_STAGE_LABELS_TH`, `SERVICE_METHOD_LABELS`, `JUDGMENT_OUTCOME_LABELS`, `CourtLevel`.
- Produces:
  - `PROCEEDING_LABELS: Record<ProceedingKind, string>`, `LEVEL_TABS: { value: CourtLevel; label: string }[]`
  - `ProceedingDraft { kind: ProceedingKind | null; level: CourtLevel; day: string | null; method: string; outcome: string }`
  - `proceedingBody(draft): Record<string, string> | null`, `proceedingLevel(kind, chosen, current): CourtLevel`, `proceedingConfirm(kind, level, day): { title; body }`, `proceedingResultText(count, stageBefore?, stageAfter?): string`, `runProceeding(record, stageAfter, stageBefore): Promise<{ ok: true; text } | { ok: false; message }>`
  - `RecordCourtEventSheet({ visible; caseId; currentLevel; stageBefore; initialKind?; initialDay?; offline; onClose(); onRecorded(text, since) })`

API facts this task relies on (`apps/api/src/cases/dto/proceeding.dto.ts`): filing `{ filedAt, courtLevel? }`; service `{ servedAt, method: PERSONAL|POSTED }` (required — it decides 15 vs 30 days, so it is never defaulted); judgment `{ courtLevel, judgmentAt, outcome }` (outcome required); appeal-served `{ servedAt }`. Each returns `{ proceeding, suggestions: number }`; only filing and judgment can move the stage (D3, map 0.2).

- [ ] **Step 1: Write the failing check**

Add above `// ── add new check(...) blocks above this line ──`:

```js
check('court-event body, confirmation and result say exactly what will be and was recorded (D3)', async () => {
  const { proceedingBody, proceedingLevel, proceedingConfirm, proceedingResultText, runProceeding, LEVEL_TABS, PROCEEDING_LABELS } = lit;
  assert.deepEqual(LEVEL_TABS.map((tab) => tab.label), ['ชั้นต้น', 'อุทธรณ์', 'ฎีกา']);
  assert.deepEqual(Object.values(PROCEEDING_LABELS), ['ยื่นฟ้อง', 'ส่งหมาย', 'อ่านคำพิพากษา', 'ได้รับสำเนาอุทธรณ์']);
  const base = { level: 'APPEAL', day: '2026-10-13', method: '', outcome: '' };
  const at = '2026-10-12T17:00:00.000Z';
  assert.deepEqual(proceedingBody({ ...base, kind: 'filing' }), { filedAt: at, courtLevel: 'APPEAL' });
  assert.equal(proceedingBody({ ...base, kind: 'service' }), null, 'service needs a method');
  assert.deepEqual(proceedingBody({ ...base, kind: 'service', method: 'POSTED' }), { servedAt: at, method: 'POSTED' });
  assert.equal(proceedingBody({ ...base, kind: 'judgment' }), null, 'judgment needs an outcome');
  assert.deepEqual(proceedingBody({ ...base, kind: 'judgment', outcome: 'WON' }), { courtLevel: 'APPEAL', judgmentAt: at, outcome: 'WON' });
  assert.deepEqual(proceedingBody({ ...base, kind: 'appeal-served' }), { servedAt: at });
  assert.equal(proceedingBody({ ...base, kind: null }), null);
  assert.equal(proceedingBody({ ...base, kind: 'filing', day: null }), null);
  assert.equal(proceedingLevel('service', 'SUPREME', 'TRIAL'), 'TRIAL', 'service lands on the current level');
  assert.equal(proceedingLevel('judgment', 'APPEAL', 'TRIAL'), 'APPEAL');
  assert.deepEqual(proceedingConfirm('judgment', 'APPEAL', '2026-10-13'), {
    title: 'ยืนยันบันทึกอ่านคำพิพากษา',
    body: 'ชั้นอุทธรณ์ · วันที่ 13 ต.ค. 2569\nระบบจะปรับขั้นตอนคดีและเสนอวันครบกำหนดให้ยืนยัน',
  });
  assert.equal(proceedingConfirm('filing', 'TRIAL', '2026-10-13').body.split(' · ')[0], 'ชั้นต้น');
  assert.equal(proceedingResultText(0, 'FILING', 'FILING'), 'บันทึกแล้ว · ไม่มีวันครบกำหนดที่ต้องยืนยัน');
  assert.equal(proceedingResultText(2, 'FILING', 'AWAITING_JUDGMENT'),
    'บันทึกแล้ว · ขั้นตอนคดีเป็น "รอคำพิพากษา" · ระบบเสนอวันครบกำหนด 2 รายการ รอยืนยัน');
  // Offline: nothing recorded; the caller keeps the sheet and its input and shows this line.
  assert.deepEqual(await runProceeding(async () => { throw new TypeError('Network request failed'); }, async () => 'FILING', 'FILING'),
    { ok: false, message: 'ต้องต่อเน็ตเพื่อบันทึก' });
  assert.deepEqual(await runProceeding(async () => { throw Object.assign(new Error('คดีปิดแล้ว'), { status: 400 }); }, async () => null, null),
    { ok: false, message: 'คดีปิดแล้ว' });
  // Recorded, but the case refetch failed: no claim about the stage.
  assert.deepEqual(await runProceeding(async () => ({ suggestions: 1 }), async () => { throw new TypeError('x'); }, 'PRE_LITIGATION'),
    { ok: true, text: 'บันทึกแล้ว · ระบบเสนอวันครบกำหนด 1 รายการ รอยืนยัน' });
  assert.deepEqual(await runProceeding(async () => ({ suggestions: 1 }), async () => 'FILING', 'PRE_LITIGATION'),
    { ok: true, text: 'บันทึกแล้ว · ขั้นตอนคดีเป็น "ยื่นฟ้อง" · ระบบเสนอวันครบกำหนด 1 รายการ รอยืนยัน' });
});

```

- [ ] **Step 2: Run it to verify it fails**

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: FAIL with `TypeError: Cannot read properties of undefined (reading 'map')` (`LEVEL_TABS` missing).

- [ ] **Step 3: Add the court-event helpers**

In `apps/mobile/src/litigation.ts`, replace the top imports

```ts
import { timeAgo } from './format';
import { CourtLevel } from '@lawfirm/shared';
import type { CaseDetail, DateSuggestion, ReviewRoundSummary } from './api/types';
```

with

```ts
import { CASE_STAGE_LABELS_TH, CaseStage, CourtLevel } from '@lawfirm/shared';
import type { CaseDetail, DateSuggestion, ProceedingKind, ReviewRoundSummary } from './api/types';
import { thDate, timeAgo } from './format';
import { bangkokDayToIso } from './thai-date';
```

(keep whatever order the file has; the point is these four imports.) Append below `courtLevelRows`:

```ts
export const PROCEEDING_LABELS: Record<ProceedingKind, string> = {
  filing: 'ยื่นฟ้อง',
  service: 'ส่งหมาย',
  judgment: 'อ่านคำพิพากษา',
  'appeal-served': 'ได้รับสำเนาอุทธรณ์',
};

const LEVEL_WORD: Record<CourtLevel, string> = {
  [CourtLevel.TRIAL]: 'ต้น',
  [CourtLevel.APPEAL]: 'อุทธรณ์',
  [CourtLevel.SUPREME]: 'ฎีกา',
};

/** The sheet's court-level switch: [ชั้นต้น|อุทธรณ์|ฎีกา]. */
export const LEVEL_TABS = LEVELS.map((level) => ({ value: level, label: level === CourtLevel.TRIAL ? 'ชั้นต้น' : LEVEL_WORD[level] }));

export interface ProceedingDraft {
  kind: ProceedingKind | null;
  level: CourtLevel;
  /** Bangkok day `YYYY-MM-DD`. */
  day: string | null;
  method: string;
  outcome: string;
}

/** The POST body for one court event, or null while a choice the API requires is missing. */
export function proceedingBody(draft: ProceedingDraft): Record<string, string> | null {
  if (!draft.kind || !draft.day) return null;
  const at = bangkokDayToIso(draft.day);
  switch (draft.kind) {
    case 'filing': return { filedAt: at, courtLevel: draft.level };
    case 'service': return draft.method ? { servedAt: at, method: draft.method } : null;
    case 'judgment': return draft.outcome ? { courtLevel: draft.level, judgmentAt: at, outcome: draft.outcome } : null;
    case 'appeal-served': return { servedAt: at };
  }
}

/** Filing and judgment take the chosen level; service and appeal-served land on the case's current one. */
export function proceedingLevel(kind: ProceedingKind, chosen: CourtLevel, current: CourtLevel): CourtLevel {
  return kind === 'filing' || kind === 'judgment' ? chosen : current;
}

/** The Alert before a legal record (design §1): undo's replacement. */
export function proceedingConfirm(kind: ProceedingKind, level: CourtLevel, day: string): { title: string; body: string } {
  return {
    title: `ยืนยันบันทึก${PROCEEDING_LABELS[kind]}`,
    body: `ชั้น${LEVEL_WORD[level]} · วันที่ ${thDate(bangkokDayToIso(day))}\nระบบจะปรับขั้นตอนคดีและเสนอวันครบกำหนดให้ยืนยัน`,
  };
}

/** D3: the count from the response, and the stage only when the refetched case shows it moved. */
export function proceedingResultText(count: number, stageBefore?: string | null, stageAfter?: string | null): string {
  const parts = ['บันทึกแล้ว'];
  if (stageAfter && stageAfter !== stageBefore) {
    parts.push(`ขั้นตอนคดีเป็น "${CASE_STAGE_LABELS_TH[stageAfter as CaseStage] ?? stageAfter}"`);
  }
  parts.push(count > 0 ? `ระบบเสนอวันครบกำหนด ${count} รายการ รอยืนยัน` : 'ไม่มีวันครบกำหนดที่ต้องยืนยัน');
  return parts.join(' · ');
}

/**
 * Record, then describe. A failure returns `ok: false` and the caller keeps the sheet open with its input;
 * a failed case refetch after a successful record only drops the stage claim.
 */
export async function runProceeding(
  record: () => Promise<{ suggestions: number }>,
  stageAfter: () => Promise<string | null | undefined>,
  stageBefore: string | null | undefined,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  let result: { suggestions: number };
  try {
    result = await record();
  } catch (error) {
    return { ok: false, message: actionErrorText(error) };
  }
  const after = await stageAfter().catch(() => stageBefore);
  return { ok: true, text: proceedingResultText(result.suggestions, stageBefore, after) };
}
```

The success line uses the count (D3); the design's example that names the date (`ระบบเสนอวันยื่นอุทธรณ์ 13 พ.ย. 2569 ...`) is replaced by `ระบบเสนอวันครบกำหนด N รายการ รอยืนยัน`, and the dates themselves appear highlighted in the "รอยืนยันวันครบกำหนด" card right below.

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: `PASS: 10 mobile litigation parity checks`.

- [ ] **Step 4: Create the sheet**

Create `apps/mobile/src/components/RecordCourtEventSheet.tsx`:

```tsx
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CourtLevel, JUDGMENT_OUTCOME_LABELS, SERVICE_METHOD_LABELS } from '@lawfirm/shared';
import { Text } from '@/components/AppText';
import { api } from '@/api/client';
import { useRecordProceeding } from '@/api/hooks';
import type { CaseDetail, ProceedingKind } from '@/api/types';
import { bangkokDay } from '@/format';
import {
  LEVEL_TABS, OFFLINE_SAVE, PROCEEDING_LABELS, proceedingBody, proceedingConfirm, proceedingLevel, runProceeding, type ProceedingDraft,
} from '@/litigation';
import { colors, formLabelSpacing, radius, spacing } from '@/theme';
import { ActionSheet } from './ActionSheet';
import { Dropdown } from './Dropdown';
import { ThaiDateField } from './ThaiDateField';
import { Button, FilterTabs, SectionLabel } from './ui';

const KINDS = Object.keys(PROCEEDING_LABELS) as ProceedingKind[];
const METHOD_OPTIONS = Object.entries(SERVICE_METHOD_LABELS).map(([value, label]) => ({ value, label }));
const OUTCOME_OPTIONS = Object.entries(JUDGMENT_OUTCOME_LABELS).map(([value, label]) => ({ value, label }));

/**
 * "บันทึกเหตุการณ์ในศาล": four big choices, the date, the one extra field the API needs, then a confirmation.
 * The draft survives a failed send (the sheet stays open) and resets only after the server recorded it.
 */
export function RecordCourtEventSheet({ visible, caseId, currentLevel, stageBefore, initialKind = null, initialDay, offline, onClose, onRecorded }: {
  visible: boolean;
  caseId: string;
  currentLevel: string | null | undefined;
  stageBefore: string | null | undefined;
  initialKind?: ProceedingKind | null;
  /** Bangkok day `YYYY-MM-DD`; today when omitted. */
  initialDay?: string;
  offline: boolean;
  onClose: () => void;
  /** After the server recorded it: the D3 result line and the instant just before sending. */
  onRecorded: (text: string, since: string) => void;
}) {
  const client = useQueryClient();
  const record = useRecordProceeding(caseId);
  const level = (currentLevel ?? CourtLevel.TRIAL) as CourtLevel;
  const fresh = (): ProceedingDraft => ({
    kind: initialKind, level, day: initialDay ?? bangkokDay(new Date().toISOString()), method: '', outcome: '',
  });
  const [draft, setDraft] = useState<ProceedingDraft>(fresh);
  const [dayInvalid, setDayInvalid] = useState(false);
  const body = proceedingBody(draft);

  const send = async (kind: ProceedingKind, payload: Record<string, string>) => {
    const since = new Date().toISOString();
    const result = await runProceeding(
      () => record.mutateAsync({ kind, body: payload }),
      () => client.fetchQuery({ queryKey: ['case', caseId], queryFn: () => api<CaseDetail>(`/cases/${caseId}`), staleTime: 0 })
        .then((data) => data.stage),
      stageBefore,
    );
    if (!result.ok) {
      Alert.alert('บันทึกไม่สำเร็จ', result.message);
      return;
    }
    setDraft(fresh());
    onRecorded(result.text, since);
    onClose();
  };

  const save = () => {
    if (!body || !draft.kind || !draft.day) return;
    const kind = draft.kind;
    const confirm = proceedingConfirm(kind, proceedingLevel(kind, draft.level, level), draft.day);
    Alert.alert(confirm.title, confirm.body, [
      { text: 'กลับไปแก้', style: 'cancel' },
      { text: 'บันทึก', onPress: () => void send(kind, body) },
    ]);
  };

  return <ActionSheet visible={visible} title="บันทึกเหตุการณ์ในศาล" onClose={onClose}>
    <SectionLabel style={formLabelSpacing}>ชั้นศาล</SectionLabel>
    <FilterTabs items={LEVEL_TABS} value={draft.level} onChange={(value) => setDraft((d) => ({ ...d, level: value as CourtLevel }))} />
    <View style={styles.tiles}>
      {KINDS.map((kind) => <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: draft.kind === kind }}
        accessibilityLabel={PROCEEDING_LABELS[kind]} onPress={() => setDraft((d) => ({ ...d, kind }))}
        style={({ pressed }) => [styles.tile, draft.kind === kind && styles.tileOn, pressed && { opacity: 0.8 }]}>
        <Text style={styles.tileText}>{PROCEEDING_LABELS[kind]}</Text>
      </Pressable>)}
    </View>
    <ThaiDateField label="วันที่เกิดเหตุการณ์" value={draft.day} onInvalidChange={setDayInvalid}
      onChange={(day) => setDraft((d) => ({ ...d, day }))} disabled={record.isPending} />
    {draft.kind === 'service' ? <Dropdown label="วิธีส่งหมาย" value={draft.method} options={METHOD_OPTIONS}
      onChange={(method) => setDraft((d) => ({ ...d, method }))} disabled={record.isPending} /> : null}
    {draft.kind === 'judgment' ? <Dropdown label="ผลคำพิพากษา" value={draft.outcome} options={OUTCOME_OPTIONS}
      onChange={(outcome) => setDraft((d) => ({ ...d, outcome }))} disabled={record.isPending} /> : null}
    <Button title={offline ? OFFLINE_SAVE : 'บันทึก · ไม่ย้อนกลับเอง'} busy={record.isPending}
      disabled={offline || !body || dayInvalid} onPress={save} />
    <Button title="ปิด" ghost disabled={record.isPending} onPress={onClose} />
  </ActionSheet>;
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexBasis: '47%', flexGrow: 1, minHeight: 64, padding: spacing.sm, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.button, backgroundColor: colors.surface,
  },
  tileOn: { borderColor: colors.ink, backgroundColor: colors.accentSoft },
  tileText: { color: colors.ink, fontWeight: '600', fontSize: 15, textAlign: 'center' },
});
```

(`วิธีส่งหมาย` and `ปิด` are not in the design: the API requires the service method, and the sheet needs a visible way out besides the backdrop.)

- [ ] **Step 5: Wire it into the case screen**

In `apps/mobile/app/case/[id].tsx`:

1. Add the import:

```tsx
import { RecordCourtEventSheet } from '@/components/RecordCourtEventSheet';
```

2. Above the early returns, after `const courtY = useRef(0);`, add:

```tsx
  const [recording, setRecording] = useState(false);
  const [recordResult, setRecordResult] = useState('');
  const [highlightSince, setHighlightSince] = useState<string | null>(null);
```

3. Replace

```tsx
        <Text style={styles.caseTitle}>{detail.title}</Text>
```

with

```tsx
        <Text style={styles.caseTitle}>{detail.title}</Text>
        {recordResult ? (
          <Card style={{ borderColor: colors.good, backgroundColor: colors.goodSoft, marginBottom: spacing.sm }}>
            <Text style={{ color: colors.good, fontWeight: '600' }}>{recordResult}</Text>
          </Card>
        ) : null}
```

4. Replace

```tsx
          canAct={canRecordProceedings(detail.status)} offline={offline} />
```

with

```tsx
          canAct={canRecordProceedings(detail.status)} offline={offline} highlightSince={highlightSince} />
```

5. Replace

```tsx
              onEditLimitation={canRecordProceedings(detail.status) ? () => router.push(`/case/new?id=${id}`) : undefined} />
          </View>
```

with

```tsx
              onEditLimitation={canRecordProceedings(detail.status) ? () => router.push(`/case/new?id=${id}`) : undefined} />
          </View>
          {canRecordProceedings(detail.status) ? (
            <View style={{ marginTop: spacing.md }}>
              <Button title="บันทึกเหตุการณ์ในศาล" onPress={() => setRecording(true)} />
            </View>
          ) : null}
```

6. Replace

```tsx
      <ReassignSheet caseId={id} task={reassigning} onClose={() => setReassigning(null)} />
```

with

```tsx
      <RecordCourtEventSheet visible={recording} caseId={id} currentLevel={detail.courtLevel} stageBefore={detail.stage}
        offline={offline} onClose={() => setRecording(false)}
        onRecorded={(text, since) => {
          setRecordResult(text);
          setHighlightSince(since);
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        }} />
      <ReassignSheet caseId={id} task={reassigning} onClose={() => setReassigning(null)} />
```

- [ ] **Step 6: Add the court-day chip**

In `apps/mobile/app/court-day/[eventId].tsx`:

1. Change `import { useCourtDay, useSaveCourtDay, useCompleteCourtDay } from '@/api/hooks';` to:

```tsx
import { useCase, useCourtDay, useSaveCourtDay, useCompleteCourtDay } from '@/api/hooks';
import { RecordCourtEventSheet } from '@/components/RecordCourtEventSheet';
import { canRecordProceedings, isNetworkError } from '@/litigation';
```

2. The screen returns early at `if (!court.data) return ...` (line 75), so the hooks go above it. After the `documents` `useQuery({ ... });` block (lines 48-52) add:

```tsx
  // Case status and level for the judgment chip; usually already cached from the case screen.
  const legalCase = useCase(court.data?.event.caseId ?? '');
  const [recordingJudgment, setRecordingJudgment] = useState(false);
  const [judgmentResult, setJudgmentResult] = useState('');
```

3. Directly after the "ผลนัด" `TextInput` (the line ending `value={state.outcome} onChangeText={(outcome) => change({ outcome })} />`) add:

```tsx
          {legalCase.data && canRecordProceedings(legalCase.data.status) ? <>
            <Pressable accessibilityRole="button" accessibilityLabel="ศาลอ่านคำพิพากษาวันนี้ บันทึกเหตุการณ์ในศาล"
              onPress={() => setRecordingJudgment(true)}
              style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.md,
                borderRadius: 10, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.accentSoft }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>ศาลอ่านคำพิพากษาวันนี้</Text>
            </Pressable>
            {judgmentResult ? <Text style={{ color: colors.good, fontWeight: '600' }}>{judgmentResult}</Text> : null}
          </> : null}
```

4. Replace the end of the component

```tsx
      </Card>
    </ScrollView>
  </SafeAreaView>;
}
```

with

```tsx
      </Card>
    </ScrollView>
    {legalCase.data ? <RecordCourtEventSheet visible={recordingJudgment} caseId={event.caseId}
      currentLevel={legalCase.data.courtLevel} stageBefore={legalCase.data.stage}
      initialKind="judgment" initialDay={bangkokDay(event.startAt)}
      offline={court.isError && isNetworkError(court.error)}
      onClose={() => setRecordingJudgment(false)} onRecorded={(text) => setJudgmentResult(text)} /> : null}
  </SafeAreaView>;
}
```

The date presets to the hearing's own Bangkok day (not the phone's today), so a judgment entered back at the office the next morning still records the day it was read.

- [ ] **Step 7: Typecheck and run the checks**

Run: `(cd apps/mobile && pnpm exec tsc --noEmit)`
Expected: exits 0.

Run: `node apps/mobile/scripts/check-litigation-parity.cjs && node apps/mobile/scripts/check-court-workflow.cjs`
Expected: `PASS: 10 mobile litigation parity checks` and the court-workflow `PASS: ...` line.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/mobile/src/components/RecordCourtEventSheet.tsx apps/mobile/src/litigation.ts "apps/mobile/app/case/[id].tsx" "apps/mobile/app/court-day/[eventId].tsx" apps/mobile/scripts/check-litigation-parity.cjs
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mobile): record filing, service, judgment and appeal copy from the case screen and court day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 6 -->

### Task 7: Mobile home — "ต้องจัดการก่อน" for every reviewer, and deep links that open the right card (items 2, 3, 6; D1, D6)

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx:20-37,117,123,134-140,180,216-225`
- Modify: `apps/mobile/src/components/ui.tsx:29-40` (`ActionRow` count)
- Modify: `apps/mobile/src/litigation.ts` (add `queueRoute`)
- Modify: `apps/mobile/src/workflow.ts:14-19` (`actionAppRoute`)
- Modify: `apps/mobile/app/notifications.tsx:4,44-51`
- Test: `apps/mobile/scripts/check-litigation-parity.cjs`, `apps/mobile/scripts/check-court-workflow.cjs:28`

**Interfaces:**
- Consumes: Task 1 `myDay.data.pendingDeadlineConfirms`; Task 2 + Task 3 `useMyReviewRounds()`; Task 4 `SectionCard`; existing `useTodos('review')`.
- Produces:
  - `queueRoute(caseIds: string[], section: 'deadlines' | 'documents'): string`
  - `ActionRow` gains `count?: number; tone?: TagTone` (renders a count `Tag` before the chevron and reads `"<title> <count> รายการ"` to screen readers).
  - `/notifications?filter=deadline|document` opens the รอจัดการ tab narrowed to `DATE_REVIEW` / `DOCUMENT_REVIEW` rows.
  - `actionAppRoute` returns `/case/<id>?section=deadlines` for `DATE_REVIEW` and `/case/<id>?section=documents&round=<roundId>` for `DOCUMENT_REVIEW` (Task 9 reads `round`).

Placement rule (design "Home placement"): one `SectionCard title="ต้องจัดการก่อน"` above `คิวตัดสินใจวันนี้`, shown only when a count is > 0. "งานรอคุณตรวจ" moves into this card for every eligible reviewer; the owner-only review tile in `คิวตัดสินใจวันนี้` is removed (it duplicated the row for owners and routed office managers to an owner-only list). The existing `รอฉันตรวจ` chip under `งานที่ต้องจัดการ` stays.

- [ ] **Step 1: Write the failing checks**

Add above `// ── add new check(...) blocks above this line ──` in `apps/mobile/scripts/check-litigation-parity.cjs`:

```js
check('home queue rows open the one case, or the filtered waiting list for several', () => {
  assert.equal(lit.queueRoute(['c1', 'c1'], 'deadlines'), '/case/c1?section=deadlines');
  assert.equal(lit.queueRoute(['c1', 'c2'], 'deadlines'), '/notifications?filter=deadline');
  assert.equal(lit.queueRoute(['c9'], 'documents'), '/case/c9?section=documents');
  assert.equal(lit.queueRoute(['c1', 'c2'], 'documents'), '/notifications?filter=document');
});

```

In `apps/mobile/scripts/check-court-workflow.cjs`, after line 28 (`assert.equal(actionAppRoute({ id: 'x', kind: 'UNKNOWN', ... }), null);`) add:

```js
  const reviewCaseId = '22222222-2222-4222-8222-222222222222';
  assert.equal(actionAppRoute({ id: 'date:s1', kind: 'DATE_REVIEW', url: `/cases/${reviewCaseId}/calendar` }), `/case/${reviewCaseId}?section=deadlines`);
  assert.equal(actionAppRoute({ id: `review:${taskId}`, kind: 'DOCUMENT_REVIEW', url: `/cases/${reviewCaseId}/documents` }),
    `/case/${reviewCaseId}?section=documents&round=${taskId}`);
  assert.equal(actionAppRoute({ id: 'draft:d1', kind: 'CLIENT_DRAFT', url: `/cases/${reviewCaseId}?tab=closing-report&draftId=d1` }), `/case/${reviewCaseId}`);
```

- [ ] **Step 2: Run both to verify they fail**

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: FAIL with `TypeError: lit.queueRoute is not a function`.

Run: `node apps/mobile/scripts/check-court-workflow.cjs`
Expected: FAIL — `actual: '/case/2222...'` vs `expected: '/case/2222...?section=deadlines'`.

- [ ] **Step 3: Implement `queueRoute` and the section-aware `actionAppRoute`**

Append to `apps/mobile/src/litigation.ts`:

```ts
/** Home "ต้องจัดการก่อน": a single case opens its card; several open the waiting list narrowed to that kind. */
export function queueRoute(caseIds: string[], section: 'deadlines' | 'documents'): string {
  const unique = [...new Set(caseIds)];
  if (unique.length === 1) return `/case/${unique[0]}?section=${section}`;
  return `/notifications?filter=${section === 'deadlines' ? 'deadline' : 'document'}`;
}
```

In `apps/mobile/src/workflow.ts`, replace `actionAppRoute` (lines 14-19) with:

```ts
export function actionAppRoute(item: { id: string; kind: string; url: string }): string | null {
  const task = item.id.match(/^task:([0-9a-f-]{36})$/i);
  if (task && ['WAITING', 'UNASSIGNED', 'TASK_REVIEW'].includes(item.kind)) return `/task/new?id=${task[1]}`;
  const match = item.url.match(/^\/cases\/([0-9a-f-]{36})(?:[/?#]|$)/i);
  if (!match) return null;
  // Open the case at the card the row is about (D6).
  if (item.kind === 'DATE_REVIEW') return `/case/${match[1]}?section=deadlines`;
  const round = item.id.match(/^review:([0-9a-f-]{36})$/i);
  if (item.kind === 'DOCUMENT_REVIEW') return `/case/${match[1]}?section=documents${round ? `&round=${round[1]}` : ''}`;
  return `/case/${match[1]}`;
}
```

Run: `node apps/mobile/scripts/check-litigation-parity.cjs && node apps/mobile/scripts/check-court-workflow.cjs`
Expected: every check prints `ok - ...`, then a `PASS:` line from each script.

- [ ] **Step 4: Give `ActionRow` a count**

In `apps/mobile/src/components/ui.tsx`, replace `ActionRow` (lines 29-40) with:

```tsx
export function ActionRow({ title, detail, onPress, destructive = false, count, tone = 'court' }: {
  title: string; detail?: string; onPress: () => void; destructive?: boolean; count?: number; tone?: TagTone;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={count != null ? `${title} ${count} รายการ` : title} onPress={onPress}
    style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: colors.soft }]}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[styles.actionTitle, destructive && { color: colors.warn }]}>{title}</Text>
      {detail ? <Text style={styles.actionDetail}>{detail}</Text> : null}
    </View>
    {count != null ? <Tag tone={tone}>{count}</Tag> : null}
    <ChevronRight size={18} color={destructive ? colors.warn : colors.faint} />
  </Pressable>;
}
```

(`Tag` and `TagTone` are declared further down the same file; function and type declarations are hoisted.)

- [ ] **Step 5: Filter the waiting list from a home link**

In `apps/mobile/app/notifications.tsx`:

1. Change `import { Stack, useRouter } from 'expo-router';` to `import { Stack, useLocalSearchParams, useRouter } from 'expo-router';`.
2. Replace

```tsx
  const [view, setView] = useState<Tab>('inbox');
```

with

```tsx
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  // Home "ต้องจัดการก่อน" opens the waiting list narrowed to deadline dates or documents.
  const kind = filter === 'deadline' ? 'DATE_REVIEW' : filter === 'document' ? 'DOCUMENT_REVIEW' : null;
  const [view, setView] = useState<Tab>(kind ? 'pending' : 'inbox');
```

3. Replace

```tsx
  const pending = pendingItems(actions.data?.items ?? [], reviews.data ?? []);
```

with

```tsx
  const pending = pendingItems(actions.data?.items ?? [], reviews.data ?? []).filter((item) => !kind || item.kind === kind);
```

- [ ] **Step 6: Add the home card and open "งานรอคุณตรวจ" to every reviewer**

In `apps/mobile/app/(tabs)/index.tsx`:

1. Add `useMyReviewRounds` to the `@/api/hooks` import on line 20, `ActionRow,` to the `@/components/ui` import (lines 25-33), and below line 35 (`import { agendaIncludesPerson } from '@/workflow';`) add:

```tsx
import { SectionCard } from '@/components/SectionCard';
import { queueRoute } from '@/litigation';
```

2. Replace line 117

```tsx
  const canFinance = hasFirmCapability(user?.firmRole, 'manageInvoices'), isOwner = user?.firmRole === FirmRole.OWNER;
```

with

```tsx
  const canFinance = hasFirmCapability(user?.firmRole, 'manageInvoices');
```

3. Replace line 123

```tsx
  const reviews = useTodos('review');
```

with

```tsx
  // The API's view=review already applies the reviewer rule (named reviewer, else case lead), so everyone asks.
  const reviews = useTodos('review');
  const myRounds = useMyReviewRounds();
```

4. Replace the focus refetch (lines 134-140)

```tsx
  useFocusEffect(useCallback(() => {
    if (canLeave) void pendingLeaves.refetch();
    if (canClaim) void claims.refetch();
    if (isOwner) void reviews.refetch();
    if (owner) void daily.refetch();
    if (canFinance) void finance.refetch();
  }, [owner, canLeave, canClaim, canFinance, isOwner, pendingLeaves.refetch, claims.refetch, reviews.refetch, daily.refetch, finance.refetch]));
```

with

```tsx
  useFocusEffect(useCallback(() => {
    if (canLeave) void pendingLeaves.refetch();
    if (canClaim) void claims.refetch();
    void reviews.refetch();
    void myRounds.refetch();
    if (owner) void daily.refetch();
    if (canFinance) void finance.refetch();
  }, [owner, canLeave, canClaim, canFinance, pendingLeaves.refetch, claims.refetch, reviews.refetch, myRounds.refetch, daily.refetch, finance.refetch]));
```

5. After the `const pendingActions = ...` line (147) add:

```tsx
  const deadlineConfirms = myDay.data?.pendingDeadlineConfirms ?? []; // `?? []`: a cache from before D1 lacks the field
  const deadlineCount = deadlineConfirms.reduce((sum, item) => sum + item.count, 0);
  const reviewCount = reviews.data?.length ?? 0;
  const documentCount = myRounds.data?.length ?? 0;
```

6. In the pull-to-refresh handler replace `actions.refetch(); reviews.refetch();` with `actions.refetch(); reviews.refetch(); myRounds.refetch();`.

7. Replace the start of the decision queue (lines 216-220)

```tsx
      {(isOwner || canLeave || canClaim) && <>
        <SectionLabel>คิวตัดสินใจวันนี้</SectionLabel>
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{[
            ...(isOwner ? [{ view: 'review', label: 'งานรอคุณตรวจ', count: reviews.isError ? undefined : reviews.data?.length }] : []),
```

with

```tsx
      {deadlineCount + reviewCount + documentCount > 0 && <SectionCard title="ต้องจัดการก่อน">
        {deadlineCount > 0 && <ActionRow title="วันครบกำหนดรอยืนยัน" count={deadlineCount} tone="due"
          onPress={() => router.push(queueRoute(deadlineConfirms.map((item) => item.caseId), 'deadlines') as never)} />}
        {reviewCount > 0 && <ActionRow title="งานรอคุณตรวจ" count={reviewCount}
          onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { view: 'review' } })} />}
        {documentCount > 0 && <ActionRow title="เอกสารรอคุณตรวจ" count={documentCount}
          onPress={() => router.push(queueRoute((myRounds.data ?? []).map((round) => round.caseId), 'documents') as never)} />}
      </SectionCard>}
      {(canLeave || canClaim) && <>
        <SectionLabel>คิวตัดสินใจวันนี้</SectionLabel>
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{[
```

(Every OWNER has `approveLeave` and `approveExpenses`, so dropping `isOwner` from the gate hides nothing an owner saw before except the moved review tile.) `FirmRole` stays imported: line 128 still uses it.

- [ ] **Step 7: Typecheck and run the checks**

Run: `(cd apps/mobile && pnpm exec tsc --noEmit)`
Expected: exits 0.

Run: `node apps/mobile/scripts/check-litigation-parity.cjs && node apps/mobile/scripts/check-court-workflow.cjs`
Expected: both print `PASS`.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add "apps/mobile/app/(tabs)/index.tsx" apps/mobile/src/components/ui.tsx apps/mobile/src/litigation.ts apps/mobile/src/workflow.ts apps/mobile/app/notifications.tsx apps/mobile/scripts/check-litigation-parity.cjs apps/mobile/scripts/check-court-workflow.cjs
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mobile): home shows deadline confirms and reviews waiting for every reviewer; deep links open the card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 7 -->

### Task 8: Mobile — limitation date on create and edit (item 5)

**Files:**
- Modify: `apps/mobile/src/thai-date.ts` (add `limitationBody`)
- Modify: `apps/mobile/app/case/new.tsx:1-19,42-60,63-76,120-124`
- Test: `apps/mobile/scripts/check-litigation-parity.cjs`

**Interfaces:**
- Consumes: Task 3 `limitationPatch`, `bangkokDayToIso`, `THAI_DATE_PARTIAL`; Task 4 `ThaiDateField` (ref = the วัน input), `thaiDateAction`; `bangkokDay` (`src/format.ts:36`); `CaseDetail.limitationDeadline` (Task 3).
- Produces: `limitationBody(editing: boolean, formDay: string | null, storedDay: string | null): { limitationDeadline?: string | null }`.

API facts (`apps/api/src/cases/dto/case.dto.ts:187-190,315-318`, `cases.service.ts:576-581,663-665`): create ignores a missing date; update treats `null` as "clear and delete the reminder", `undefined` as "untouched", and re-syncs (resets) the reminder whenever the key is present — so the key is sent only on a change.

- [ ] **Step 1: Write the failing check**

Add above `// ── add new check(...) blocks above this line ──`:

```js
check('a half-typed limitation never reaches the save; only a confirmed clear sends null', () => {
  const { thaiDateAction, limitationBody } = thaiDate;
  assert.deepEqual(limitationBody(false, null, null), {}, 'create without a date sends nothing');
  assert.deepEqual(limitationBody(false, '2026-11-13', null), { limitationDeadline: '2026-11-12T17:00:00.000Z' });
  const stored = '2026-11-13';
  let form = stored;
  const type = (parts) => {
    const action = thaiDateAction(parts, form, true);
    if (action.emit === 'day') form = action.day;
    if (action.emit === 'clear') form = null;
    return action;
  };
  assert.equal(type({ d: '13', m: '', y: '2569' }).invalid, true);
  assert.deepEqual(limitationBody(true, form, stored), {}, 'half-typed: the stored date is untouched');
  assert.equal(type({ d: '31', m: '4', y: '2569' }).invalid, true);
  assert.deepEqual(limitationBody(true, form, stored), {}, 'impossible day: still untouched');
  assert.equal(type({ d: '', m: '', y: '' }).emit, 'confirm-clear', 'emptying a saved date asks first');
  assert.deepEqual(limitationBody(true, form, stored), {}, 'nothing is cleared before the lawyer confirms');
  form = null; // the lawyer tapped "ลบวันที่"
  assert.deepEqual(limitationBody(true, form, stored), { limitationDeadline: null });
  form = stored; // "คืนค่าเดิม"
  assert.deepEqual(limitationBody(true, form, stored), {});
  assert.equal(type({ d: '14', m: '11', y: '2569' }).emit, 'day');
  assert.deepEqual(limitationBody(true, form, stored), { limitationDeadline: '2026-11-13T17:00:00.000Z' });
});

```

- [ ] **Step 2: Run it to verify it fails**

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: FAIL with `TypeError: limitationBody is not a function`.

- [ ] **Step 3: Add `limitationBody`**

Append to `apps/mobile/src/thai-date.ts`:

```ts
/** The limitation part of a case save: create sends a set date only; edit sends only a change (null = confirmed clear). */
export function limitationBody(editing: boolean, formDay: string | null, storedDay: string | null): { limitationDeadline?: string | null } {
  if (!editing) return formDay ? { limitationDeadline: bangkokDayToIso(formDay) } : {};
  return limitationPatch(formDay, storedDay);
}
```

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: every check prints `ok - ...` and the last line starts with `PASS:`.

- [ ] **Step 4: Add the field to the case form**

In `apps/mobile/app/case/new.tsx`:

1. Imports. Replace `import { Alert } from 'react-native';` with `import { Alert, TextInput as NativeTextInput } from 'react-native';` and add:

```tsx
import { ThaiDateField } from '@/components/ThaiDateField';
import { bangkokDay } from '@/format';
import { limitationBody, THAI_DATE_PARTIAL } from '@/thai-date';
```

2. State (all above the early returns at line 97). After `const [status, setStatus] = useState('OPEN');` add:

```tsx
  // Bangkok day or null. A half-typed entry never lands here: ThaiDateField keeps it and reports invalid.
  const [limitation, setLimitation] = useState<string | null>(null);
  const [limitationInvalid, setLimitationInvalid] = useState(false);
  const limitationRef = useRef<NativeTextInput>(null);
  const storedLimitation = current.data?.limitationDeadline ? bangkokDay(current.data.limitationDeadline) : null;
```

3. Seed it with the rest of the case. In the seeding `useEffect`, after `setStatus(data.status);` add:

```tsx
    setLimitation(data.limitationDeadline ? bangkokDay(data.limitationDeadline) : null);
```

4. Block a save with a half-typed or impossible date. In `save`, after the first line (`if (!title.trim() || !ids[0]) return Alert.alert(...)`) add:

```tsx
    if (limitationInvalid) {
      Alert.alert('ตรวจวันครบอายุความ', THAI_DATE_PARTIAL);
      limitationRef.current?.focus();
      return;
    }
```

5. Send it. In the `body` object, replace

```tsx
          description: description.trim(), ...(levelSwitching ? {} : { courtName: courtName || undefined }), courtLevel, caseTypeId: caseTypeId || undefined,
```

with

```tsx
          description: description.trim(), ...(levelSwitching ? {} : { courtName: courtName || undefined }), courtLevel, caseTypeId: caseTypeId || undefined,
          ...limitationBody(!!id, limitation, storedLimitation),
```

6. Render it inside `FormSection title="ข้อมูลคดี"`. Replace

```tsx
    {types.isError && <ErrorNote message="โหลดประเภทคดีไม่ได้" onRetry={() => types.refetch()} />}
    </FormSection>
```

with

```tsx
    {types.isError && <ErrorNote message="โหลดประเภทคดีไม่ได้" onRetry={() => types.refetch()} />}
    <ThaiDateField ref={limitationRef} label="วันครบอายุความ" value={limitation} onChange={setLimitation}
      onInvalidChange={setLimitationInvalid} clearable hint="ว่างได้ ถ้ายังไม่ทราบ" disabled={busy || !!savedId}
      clearConfirm={storedLimitation ? { title: 'ลบวันครบอายุความ?', body: 'คดีนี้จะไม่มีการเตือนอายุความอีก' } : undefined} />
    {!!storedLimitation && limitation === null && <>
      <Text style={{ color: colors.warn }}>จะลบเมื่อกดบันทึก</Text>
      <Button title="คืนค่าเดิม" ghost disabled={busy || !!savedId} onPress={() => setLimitation(storedLimitation)} />
    </>}
    </FormSection>
```

The typed parts live in `ThaiDateField` state and `limitation` in form state; neither is reset by the `catch` in `save`, so a network error keeps what was typed (design "Draft safety"). `clearConfirm` is passed only when a stored date exists ("Clearing an existing value asks for confirmation").

- [ ] **Step 5: Typecheck and run the checks**

Run: `(cd apps/mobile && pnpm exec tsc --noEmit)`
Expected: exits 0.

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: every check prints `ok - ...` and the last line starts with `PASS:`.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add apps/mobile/app/case/new.tsx apps/mobile/src/thai-date.ts apps/mobile/scripts/check-litigation-parity.cjs
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mobile): set and clear the limitation date on case create/edit with a Thai date field

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 8 -->

### Task 9: Mobile — approve / return document review rounds on the case (item 6, D2)

**Files:**
- Modify: `apps/mobile/src/api/files.ts:116-125` (`openCaseDocument` version)
- Create: `apps/mobile/src/components/ReviewRoundsCard.tsx`
- Modify: `apps/mobile/app/case/[id].tsx` (route param `round`, the card above the tabs)
- Test: `apps/mobile/scripts/check-litigation-parity.cjs`

**Interfaces:**
- Consumes: Task 2 endpoints; Task 3 `useCaseReviewRounds`, `useDecideReviewRound`, `canDecideRound`, `actionErrorText`, `ReviewRoundSummary`; Task 4 `SectionCard`, `ActionSheet`; Task 5 `offline`; Task 7 `?round=<roundId>` deep link.
- Produces: `openCaseDocument(caseId: string, documentId: string, filename: string, version?: number): Promise<void>`; `ReviewRoundsCard({ caseId: string; focusRoundId?: string; offline: boolean })`.

API facts (`document-review.service.ts:140-207`): only ids in `reviewerIds` may decide (403 otherwise); a repeat decision returns the round unchanged; `reviewedDocumentVersionId` must equal the round's version (400 `...ฉบับใหม่...`); return needs a reason; return closes the round at once, approve closes it when the rule is met; the response is the round (`status`). Download: `GET /cases/:caseId/documents/:documentId/download?version=<int>`.

- [ ] **Step 1: Write the failing check**

Add above `// ── add new check(...) blocks above this line ──`:

```js
check('a review opens the exact version under review, cached apart from the latest', async () => {
  const downloads = [];
  const files = load('api/files.ts', {
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/',
      downloadAsync: async (url, target) => { downloads.push([url, target]); return { status: 200, uri: target }; },
    },
    'expo-file-system': { File: class {} },
    'expo-sharing': { isAvailableAsync: async () => false },
    './client': {
      API_URL: 'https://api.test', api: async () => ({}), ApiError: class extends Error {},
      authenticatedFetch: async () => ({}), getTokens: async () => ({ accessToken: 't' }),
    },
  });
  await files.openCaseDocument('case-1', 'doc-1', 'สัญญา.pdf', 3);
  await files.openCaseDocument('case-1', 'doc-1', 'สัญญา.pdf');
  assert.deepEqual(downloads, [
    ['https://api.test/cases/case-1/documents/doc-1/download?version=3', 'file:///cache/doc-1-v3-สัญญา.pdf'],
    ['https://api.test/cases/case-1/documents/doc-1/download', 'file:///cache/doc-1-สัญญา.pdf'],
  ]);
});

```

- [ ] **Step 2: Run it to verify it fails**

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: FAIL — the first download URL has no `?version=3` and the target has no `v3-`.

- [ ] **Step 3: Open a pinned version**

In `apps/mobile/src/api/files.ts`, replace `openCaseDocument` (lines 116-125) with:

```ts
export async function openCaseDocument(
  caseId: string,
  documentId: string,
  filename: string,
  /** A review round pins a version; without it the API streams the latest upload. */
  version?: number,
): Promise<void> {
  const safeName = filename.replace(/[^\w.\-ก-๙ ]+/g, '_') || 'document';
  // A pinned version gets its own cache file, so reviewing v3 never shows a cached v4 (or the reverse).
  const target = `${FileSystem.cacheDirectory}${documentId}-${version ? `v${version}-` : ''}${safeName}`;
  const query = version ? `?version=${version}` : '';
  const result = await downloadFile(`/cases/${caseId}/documents/${documentId}/download${query}`, target);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
}
```

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: every check prints `ok - ...` and the last line starts with `PASS:`.

- [ ] **Step 4: Create the card**

Create `apps/mobile/src/components/ReviewRoundsCard.tsx`:

```tsx
import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useAuth } from '@/api/auth';
import { ApiError } from '@/api/client';
import { openCaseDocument } from '@/api/files';
import { useCaseReviewRounds, useDecideReviewRound } from '@/api/hooks';
import type { ReviewRoundSummary } from '@/api/types';
import { actionErrorText, canDecideRound } from '@/litigation';
import { thDate } from '@/format';
import { colors, radius, spacing } from '@/theme';
import { ActionSheet } from './ActionSheet';
import { FormField } from './Form';
import { SectionCard } from './SectionCard';
import { Button, Tag } from './ui';

/** "เอกสารรอคุณตรวจ": open the version under review, approve it, or return it with a reason. */
export function ReviewRoundsCard({ caseId, focusRoundId, offline }: { caseId: string; focusRoundId?: string; offline: boolean }) {
  const { user } = useAuth();
  const rounds = useCaseReviewRounds(caseId);
  const decide = useDecideReviewRound(caseId);
  const [returning, setReturning] = useState<ReviewRoundSummary | null>(null);
  const [reason, setReason] = useState('');
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  const waiting = (rounds.data ?? []).filter((round) => round.status === 'WAITING_REVIEW');
  const mine = waiting.filter((round) => canDecideRound(round, user?.id));
  if (!mine.length && !status) return null;

  const sender = (round: ReviewRoundSummary) => round.createdByName ?? 'ผู้ส่ง';
  const open = async (round: ReviewRoundSummary) => {
    setOpening(round.id);
    try {
      await openCaseDocument(round.caseId, round.documentId, round.filename, round.version);
    } catch (error) {
      // A download that never reached the server has no HTTP status: that is the offline case.
      Alert.alert('เปิดเอกสารไม่สำเร็จ', error instanceof ApiError ? error.message : 'ต้องต่อเน็ตเพื่อเปิดเอกสาร');
    } finally {
      setOpening(null);
    }
  };
  const approve = (round: ReviewRoundSummary) => Alert.alert(`อนุมัติฉบับที่ ${round.version}?`, 'ผู้ส่งจะได้รับแจ้งว่าอนุมัติแล้ว', [
    { text: 'ยกเลิก', style: 'cancel' },
    {
      text: 'อนุมัติ',
      onPress: async () => {
        try {
          const result = await decide.mutateAsync({ round, action: 'approve' });
          // The sender is told only when the round closes; with other reviewers left it stays open.
          setStatus(result.status === 'APPROVED' ? `อนุมัติแล้ว · แจ้ง${sender(round)}แล้ว` : 'อนุมัติแล้ว · รอผู้ตรวจคนอื่น');
        } catch (error) {
          Alert.alert('บันทึกไม่สำเร็จ', actionErrorText(error));
        }
      },
    },
  ]);
  const startReturn = (round: ReviewRoundSummary) => {
    // Never carry a reason typed for one document over to another.
    if (reasonFor !== round.id) {
      setReason('');
      setReasonFor(round.id);
    }
    setReturning(round);
  };
  const sendReturn = async () => {
    if (!returning || !reason.trim()) return;
    try {
      await decide.mutateAsync({ round: returning, action: 'return', reason });
      setStatus(`ส่งกลับแล้ว · แจ้ง${sender(returning)}พร้อมเหตุผล`);
      setReason('');
      setReasonFor(null);
      setReturning(null);
    } catch (error) {
      // Nothing was recorded: the sheet and the typed reason stay.
      Alert.alert('บันทึกไม่สำเร็จ', actionErrorText(error));
    }
  };

  return <>
    <SectionCard title="เอกสารรอคุณตรวจ" count={mine.length} tone="court">
      {status ? <Text style={styles.status}>{status}</Text> : null}
      {waiting.map((round) => {
        const waitingFor = round.reviewers.filter((person) => !person.decision).map((person) => person.name ?? 'ผู้ตรวจ').join(', ');
        return <View key={round.id} style={[styles.row, round.id === focusRoundId && styles.focus]}>
          <Text style={styles.title}>{round.filename} · ฉบับที่ {round.version}</Text>
          <Text style={styles.muted}>ส่งโดย {round.createdByName ?? '—'} · {thDate(round.createdAt)}</Text>
          <Button title={offline ? 'ต้องต่อเน็ตเพื่อเปิดเอกสาร' : 'เปิดเอกสาร'} ghost disabled={offline || !!opening}
            busy={opening === round.id} onPress={() => void open(round)} />
          {canDecideRound(round, user?.id) ? <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button title="ส่งกลับแก้" ghost disabled={offline || decide.isPending} onPress={() => startReturn(round)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="อนุมัติ" disabled={offline || decide.isPending} onPress={() => approve(round)} />
            </View>
          </View> : <Tag tone="info">รอ {waitingFor} ตรวจ</Tag>}
        </View>;
      })}
    </SectionCard>
    <ActionSheet visible={!!returning} title="ส่งกลับแก้" onClose={() => setReturning(null)}
      detail={returning ? `${returning.filename} · ฉบับที่ ${returning.version}` : undefined}>
      <FormField label="เหตุผล (จำเป็น)" value={reason} onChange={setReason} multiline disabled={decide.isPending} />
      <Button title="ส่งกลับ" busy={decide.isPending} disabled={!reason.trim() || offline} onPress={() => void sendReturn()} />
    </ActionSheet>
  </>;
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line },
  focus: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  title: { color: colors.ink, fontWeight: '600', fontSize: 15 },
  muted: { color: colors.muted, fontSize: 13 },
  status: { color: colors.good, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
```

(Copy not in the design: `อนุมัติแล้ว · รอผู้ตรวจคนอื่น` — the design's `แจ้ง{ชื่อ}แล้ว` would be untrue while other reviewers still have to approve; the confirm buttons `ยกเลิก` / `อนุมัติ`.)

- [ ] **Step 5: Put the card on the case screen**

In `apps/mobile/app/case/[id].tsx`:

1. Replace

```tsx
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>();
```

with

```tsx
  const { id, section, round } = useLocalSearchParams<{ id: string; section?: string; round?: string }>();
```

2. Add the import:

```tsx
import { ReviewRoundsCard } from '@/components/ReviewRoundsCard';
```

3. Replace

```tsx
          canAct={canRecordProceedings(detail.status)} offline={offline} highlightSince={highlightSince} />
```

with

```tsx
          canAct={canRecordProceedings(detail.status)} offline={offline} highlightSince={highlightSince} />
        <ReviewRoundsCard caseId={id} focusRoundId={round} offline={offline} />
```

A notice or pending row (`?section=documents&round=<id>`) opens the เอกสาร tab with that round outlined in accent in the card above the tabs.

- [ ] **Step 6: Typecheck and run the checks**

Run: `(cd apps/mobile && pnpm exec tsc --noEmit)`
Expected: exits 0.

Run: `node apps/mobile/scripts/check-litigation-parity.cjs && node apps/mobile/scripts/check-court-workflow.cjs`
Expected: both end with a `PASS:` line (court-workflow still loads `files.ts` with its own mocks).

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/mobile/src/api/files.ts apps/mobile/src/components/ReviewRoundsCard.tsx "apps/mobile/app/case/[id].tsx" apps/mobile/scripts/check-litigation-parity.cjs
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mobile): review rounds on the case — open the pinned version, approve or return with a reason

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 9 -->

### Task 10: Mobile — @mention people in task notes (item 7, D9)

**Files:**
- Create: `apps/mobile/src/mentions.ts`, `apps/mobile/src/components/MentionField.tsx`
- Modify: `apps/mobile/src/components/TaskWorkView.tsx:11,41,242-243`
- Test: `apps/mobile/scripts/check-litigation-parity.cjs`

**Interfaces:**
- Consumes: `useMembers()` (`hooks.ts:538`, `GET /users/members`), `useCase` (already used by `TaskWorkView`), `FormField`, `Card`. API: `POST /tasks/:taskId/comments { body, mentionedUserIds?: uuid[] (≤20) }` returns the saved comment whose `mentionedUserIds` keeps only people who can open the task (`task-detail.service.ts:373-380,413`).
- Produces: `MentionPerson { id; firstName; lastName }`, `mentionQuery(text): string | null`, `insertMention(text, firstName): string`, `matchPeople(people, query, limit = 5)`, `mentionedIdsIn(body, picked): string[]`, `droppedMentions(requested, saved): string[]`, `mentionCandidates(legalCase, members, authorId, extra?)`; `MentionField({ label; value; onChange; people; onPick; disabled? })`.

Scope note: the design hands off `TaskWorkView` only, so the second comment box in `app/task/new.tsx:328-336` is unchanged. Picked people live in component state, not in the task draft: a restored draft sends no mentions (`ponytail` note in code).

- [ ] **Step 1: Write the failing check**

Add above `// ── add new check(...) blocks above this line ──`:

```js
check('mentions: @query at the end, literal insert, case team only, and who the API dropped', () => {
  const m = load('mentions.ts');
  assert.equal(m.mentionQuery('ขอให้ @สม'), 'สม');
  assert.equal(m.mentionQuery('ขอให้ @'), '');
  assert.equal(m.mentionQuery('ขอให้ @สมชาย '), null, 'a space closes the list');
  assert.equal(m.mentionQuery('ไม่มีการกล่าวถึง'), null);
  assert.equal(m.insertMention('ขอให้ @สม', 'สมชาย'), 'ขอให้ @สมชาย ');
  assert.equal(m.insertMention('@', 'A$&B'), '@A$&B ', 'names are inserted literally');
  const lead = { id: 'lead', firstName: 'สมชาย', lastName: 'ใจดี' };
  const team = { leadLawyer: lead, assignments: [{ user: { id: 'author', firstName: 'สมหญิง', lastName: 'ขยัน' } }, { user: lead }] };
  const people = m.mentionCandidates(team, [{ id: 'outsider', firstName: 'มานะ', lastName: 'อดทน' }], 'author',
    [{ id: 'worker', firstName: 'วิชัย', lastName: 'ทำงาน' }, null]);
  assert.deepEqual(people.map((p) => p.id), ['lead', 'worker'], 'case team + assignee; no author, duplicates or outsiders');
  assert.deepEqual(m.mentionCandidates(null, [{ id: 'a', firstName: 'ก', lastName: 'ข' }, { id: 'me', firstName: 'ค', lastName: 'ง' }], 'me')
    .map((p) => p.id), ['a'], 'a task without a case offers firm members');
  assert.deepEqual(m.matchPeople(people, 'สม').map((p) => p.id), ['lead']);
  assert.equal(m.matchPeople(Array.from({ length: 9 }, (_, i) => ({ id: String(i), firstName: `สม${i}`, lastName: '' })), 'สม').length, 5);
  assert.deepEqual(m.mentionedIdsIn('ฝาก @สมชาย ดู', [lead, { id: 'x', firstName: 'มานะ', lastName: '' }]), ['lead'],
    'a picked name deleted from the text is not notified');
  assert.deepEqual(m.droppedMentions(['lead', 'x'], ['lead']), ['x']);
  assert.deepEqual(m.droppedMentions([], undefined), []);
});

```

- [ ] **Step 2: Run it to verify it fails**

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: FAIL with `ENOENT ... src/mentions.ts`.

- [ ] **Step 3: Write `mentions.ts`**

Create `apps/mobile/src/mentions.ts`:

```ts
/** @mentions in task notes. Mirrors the web's lib/mentions.ts, with the cursor at the end of the text. */
export interface MentionPerson { id: string; firstName: string; lastName: string }

/**
 * The `@query` being typed at the end of the text, or null. A space ends it (Thai names have none).
 * ponytail: reads the end of the text, which is where a phone keyboard types; track the selection if
 * mentions in the middle of a note turn out to matter.
 */
export function mentionQuery(text: string): string | null {
  const match = text.match(/@([^\s@]*)$/);
  return match ? match[1].toLowerCase() : null;
}

/** Replace the trailing `@query` with `@FirstName ` — the space closes the list. */
export function insertMention(text: string, firstName: string): string {
  return text.replace(/@[^\s@]*$/, () => `@${firstName} `);
}

/** Up to `limit` people whose name contains the query. */
export function matchPeople<T extends MentionPerson>(people: T[], query: string, limit = 5): T[] {
  return people.filter((person) => `${person.firstName} ${person.lastName}`.toLowerCase().includes(query)).slice(0, limit);
}

/** Picked people whose "@FirstName" is still in the text: deleting the mention un-notifies them. */
export function mentionedIdsIn(body: string, picked: MentionPerson[]): string[] {
  return [...new Set(picked.filter((person) => body.includes(`@${person.firstName}`)).map((person) => person.id))];
}

/** Ids the API dropped (they cannot open the task): the saved comment keeps only the people it notified. */
export function droppedMentions(requested: string[], saved: string[] | null | undefined): string[] {
  const kept = new Set(saved ?? []);
  return requested.filter((id) => !kept.has(id));
}

/** D9: the case team when the task has a case, else firm members; never the author, never twice. */
export function mentionCandidates(
  legalCase: { leadLawyer?: MentionPerson | null; assignments?: Array<{ user: MentionPerson }> } | null | undefined,
  members: MentionPerson[] | undefined,
  authorId: string | undefined,
  extra: Array<MentionPerson | null | undefined> = [],
): MentionPerson[] {
  const pool = legalCase
    ? [legalCase.leadLawyer, ...(legalCase.assignments ?? []).map((item) => item.user), ...extra]
    : [...(members ?? []), ...extra];
  const seen = new Set<string>();
  return pool.filter((person): person is MentionPerson => {
    if (!person || person.id === authorId || seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
}
```

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: every check prints `ok - ...` and the last line starts with `PASS:`.

- [ ] **Step 4: Create `MentionField`**

Create `apps/mobile/src/components/MentionField.tsx`:

```tsx
import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/AppText';
import { insertMention, matchPeople, mentionQuery, type MentionPerson } from '@/mentions';
import { colors, spacing, TOUCH } from '@/theme';
import { FormField } from './Form';
import { Card } from './ui';

/** A note field whose "@" opens an inline list right above it (not a modal), with the D9 hint. */
export function MentionField({ label, value, onChange, people, onPick, disabled = false }: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  people: MentionPerson[];
  onPick: (person: MentionPerson) => void;
  disabled?: boolean;
}) {
  const query = mentionQuery(value);
  const matches = query === null ? [] : matchPeople(people, query);
  return <View style={{ gap: spacing.sm }}>
    {/* No people loaded (offline, error): no list, and plain text still sends. */}
    {query !== null && people.length > 0 && !disabled ? <Card style={{ paddingVertical: spacing.xs }}>
      {matches.length ? matches.map((person) => <Pressable key={person.id} accessibilityRole="button"
        accessibilityLabel={`กล่าวถึง ${person.firstName} ${person.lastName}`}
        onPress={() => { onChange(insertMention(value, person.firstName)); onPick(person); }}
        style={({ pressed }) => [{ minHeight: TOUCH, justifyContent: 'center' }, pressed && { backgroundColor: colors.soft }]}>
        <Text style={{ color: colors.ink }}>{person.firstName} {person.lastName}</Text>
      </Pressable>) : <Text style={{ color: colors.muted, paddingVertical: spacing.sm }}>ไม่พบชื่อนี้</Text>}
      <Text style={{ color: colors.muted, fontSize: 12, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line }}>
        แจ้งเตือนเฉพาะคนที่เปิดงานนี้ได้
      </Text>
    </Card> : null}
    <FormField label={label} value={value} onChange={onChange} multiline disabled={disabled} />
  </View>;
}
```

- [ ] **Step 5: Use it in `TaskWorkView`**

In `apps/mobile/src/components/TaskWorkView.tsx`:

1. Replace `import { useCase, useLawyers } from '@/api/hooks';` with:

```tsx
import { useCase, useLawyers, useMembers } from '@/api/hooks';
import { droppedMentions, mentionCandidates, mentionedIdsIn, type MentionPerson } from '@/mentions';
import { MentionField } from './MentionField';
```

2. After `const [showNote, setShowNote] = useState(false);` (line 41) add:

```tsx
  // ponytail: picks are not part of the task draft, so a restored draft sends no mentions; persist them if that bites.
  const [picked, setPicked] = useState<MentionPerson[]>([]);
  const [mentionNotice, setMentionNotice] = useState('');
  const allMembers = useMembers();
  const people = task.caseId
    ? mentionCandidates(legalCase.data, undefined, user?.id, [task.assignee])
    : mentionCandidates(null, allMembers.data, user?.id);
```

3. Replace lines 242-243:

```tsx
      {showNote && <FormField label="บันทึกเพิ่มเติม" value={note} onChange={setNote} disabled={busy} multiline />}
      {!!note.trim() && <Button title="บันทึกข้อความ" busy={busy} onPress={() => perform(async () => { await api(`/tasks/${task.id}/comments`, { method: 'POST', body: { body: note.trim() } }); setNote(''); })} />}
```

with:

```tsx
      {showNote && <MentionField label="บันทึกเพิ่มเติม" value={note} onChange={setNote} people={people} disabled={busy}
        onPick={(person) => setPicked((list) => (list.some((item) => item.id === person.id) ? list : [...list, person]))} />}
      {!!mentionNotice && <Text style={{ color: colors.muted }}>{mentionNotice}</Text>}
      {!!note.trim() && <Button title="บันทึกข้อความ" busy={busy} onPress={() => perform(async () => {
        const body = note.trim();
        const mentionedUserIds = mentionedIdsIn(body, picked);
        const saved = await api<{ mentionedUserIds?: string[] }>(`/tasks/${task.id}/comments`, {
          method: 'POST',
          body: { body, ...(mentionedUserIds.length ? { mentionedUserIds } : {}) },
        });
        setNote('');
        setPicked([]);
        setMentionNotice(droppedMentions(mentionedUserIds, saved?.mentionedUserIds).length ? 'บางคนไม่ได้รับแจ้งเพราะเปิดงานนี้ไม่ได้' : '');
      })} />}
```

`perform` already persists the draft first and keeps `note` on failure, so an offline send loses nothing.

- [ ] **Step 6: Typecheck and run the checks**

Run: `(cd apps/mobile && pnpm exec tsc --noEmit)`
Expected: exits 0.

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: every check prints `ok - ...` and the last line starts with `PASS:`.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git add apps/mobile/src/mentions.ts apps/mobile/src/components/MentionField.tsx apps/mobile/src/components/TaskWorkView.tsx apps/mobile/scripts/check-litigation-parity.cjs
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mobile): @mention case team members in task notes, with the access hint and dropped-mention notice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 10 -->

### Task 11: Mobile — court-fee and interest calculator on ภาพรวม (item 8)

**Files:**
- Modify: `apps/mobile/src/litigation.ts` (add `litigationEstimate`)
- Modify: `apps/mobile/src/components/Form.tsx:2,38-47` (`FormField.keyboardType`)
- Create: `apps/mobile/src/components/LitigationCalculatorCard.tsx`
- Modify: `apps/mobile/app/case/[id].tsx` (card under the record button)
- Test: `apps/mobile/scripts/check-litigation-parity.cjs`

**Interfaces:**
- Consumes: shared `courtFee(amount: number | null)`, `simpleInterest(principal, ratePercent, days)`, `interestDays(fromDay, toDay)`, `DEFAULT_INTEREST_RATE` (`packages/shared/src/litigation.ts:64-94`); `formatMoney`, `formatMoneyInput`, `bangkokDay`; Task 4 `SectionCard`, `ThaiDateField`; the record button block from Task 6.
- Produces: `litigationEstimate({ amount: string; rate: string; from: string | null; to: string | null }): { fee: number; days: number | null; interest: number | null } | null`; `LitigationCalculatorCard({ claimedAmount: number | null })`; `FormField` gains `keyboardType?: TextInputProps['keyboardType']`.

Copy rule: the design asks to confirm the "not covered" list against the web card (`apps/web/src/components/cases/LitigationCalculatorsCard.tsx:40,61`) and not invent items. The web lists only `ไม่รวมคดีจำนอง/บังคับตามคำชี้ขาด/มโนสาเร่`, so the note is `ⓘ ประมาณการเท่านั้น ไม่รวมคดีจำนอง/บังคับตามคำชี้ขาด/มโนสาเร่` plus the web's interest-basis line; the design's other items (ค่าส่งหมาย, ค่าทนาย, …) are not shown.

- [ ] **Step 1: Write the failing check**

Add above `// ── add new check(...) blocks above this line ──`:

```js
check('court fee and interest estimate come from the shared calculators (item 8)', () => {
  const { litigationEstimate } = lit;
  assert.equal(litigationEstimate({ amount: '', rate: '5', from: null, to: '2026-10-12' }), null, 'กรอกทุนทรัพย์เพื่อคำนวณ');
  assert.equal(litigationEstimate({ amount: 'abc', rate: '5', from: null, to: '2026-10-12' }), null);
  assert.deepEqual(litigationEstimate({ amount: '1,250,000', rate: '5', from: null, to: '2026-10-12' }), { fee: 25000, days: null, interest: null });
  assert.deepEqual(litigationEstimate({ amount: '1,250,000', rate: '5', from: '2025-08-26', to: '2026-10-12' }), { fee: 25000, days: 412, interest: 70547.95 });
  assert.equal(litigationEstimate({ amount: '1,250,000', rate: '', from: '2025-08-26', to: '2026-10-12' }).interest, null);
  // Above 50 million: 200,000 cap on the first band + 0.1% of the rest; an end before the start counts 0 days.
  assert.deepEqual(litigationEstimate({ amount: '60,000,000', rate: '5', from: '2026-10-12', to: '2026-10-01' }), { fee: 210000, days: 0, interest: 0 });
});

```

- [ ] **Step 2: Run it to verify it fails**

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: FAIL with `TypeError: litigationEstimate is not a function`.

- [ ] **Step 3: Add `litigationEstimate`**

In `apps/mobile/src/litigation.ts`, extend the `@lawfirm/shared` import to:

```ts
import { CASE_STAGE_LABELS_TH, CaseStage, CourtLevel, courtFee, interestDays, simpleInterest } from '@lawfirm/shared';
```

and append:

```ts
/** Item 8: null until an amount is typed; interest stays null until both days and a rate are there. */
export function litigationEstimate(input: { amount: string; rate: string; from: string | null; to: string | null }):
  { fee: number; days: number | null; interest: number | null } | null {
  const principal = Number(input.amount.replace(/,/g, ''));
  if (!input.amount.trim() || !Number.isFinite(principal) || principal < 0) return null;
  const rate = Number(input.rate);
  const days = input.from && input.to ? interestDays(input.from, input.to) : null;
  const interest = days != null && input.rate.trim() && Number.isFinite(rate) && rate >= 0
    ? simpleInterest(principal, rate, days)
    : null;
  return { fee: courtFee(principal), days, interest };
}
```

Run: `node apps/mobile/scripts/check-litigation-parity.cjs`
Expected: every check prints `ok - ...` and the last line starts with `PASS:`.

- [ ] **Step 4: Let `FormField` open a number pad**

In `apps/mobile/src/components/Form.tsx`:

1. Add `TextInputProps,` to the `react-native` import on line 2.
2. Replace the `FormField` signature and its `TextInput` (lines 38-47) with:

```tsx
export function FormField({ label, value, onChange, multiline = false, disabled = false, placeholder, keyboardType }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; disabled?: boolean; placeholder?: string;
  keyboardType?: TextInputProps['keyboardType'];
}) {
  return <View style={{ gap: spacing.sm }}>
    <SectionLabel style={formLabelSpacing}>{label}</SectionLabel>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled}
      multiline={multiline} placeholder={placeholder} placeholderTextColor={colors.faint} keyboardType={keyboardType}
      style={{ minHeight: multiline ? 100 : 48, textAlignVertical: multiline ? 'top' : 'center', padding: spacing.md,
        borderWidth: 1, borderColor: colors.line, borderRadius: radius.button, backgroundColor: colors.surface, color: colors.text, fontSize: 16 }} />
  </View>;
}
```

- [ ] **Step 5: Create the card**

Create `apps/mobile/src/components/LitigationCalculatorCard.tsx`:

```tsx
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DEFAULT_INTEREST_RATE } from '@lawfirm/shared';
import { Text } from '@/components/AppText';
import { bangkokDay, formatMoney, formatMoneyInput } from '@/format';
import { litigationEstimate } from '@/litigation';
import { colors, fonts, spacing } from '@/theme';
import { FormField } from './Form';
import { SectionCard } from './SectionCard';
import { ThaiDateField } from './ThaiDateField';

/** Court fee + simple interest estimate. Pure shared functions: works offline, saves nothing. */
export function LitigationCalculatorCard({ claimedAmount }: { claimedAmount: number | null }) {
  const [amount, setAmount] = useState(() => (claimedAmount != null ? formatMoneyInput(String(claimedAmount)) ?? '' : ''));
  const [rate, setRate] = useState(String(DEFAULT_INTEREST_RATE));
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(() => bangkokDay(new Date().toISOString()));
  const estimate = litigationEstimate({ amount, rate, from, to });
  return <SectionCard title="คำนวณค่าขึ้นศาล / ดอกเบี้ย" collapsible defaultOpen={false}
    summary={`ประมาณการ · ทุนทรัพย์ ${claimedAmount != null ? formatMoney(claimedAmount) : '—'} ฿`}>
    <FormField label="ทุนทรัพย์ (บาท)" value={amount} keyboardType="decimal-pad"
      onChange={(text) => { const next = formatMoneyInput(text); if (next !== null) setAmount(next); }} />
    <Text style={styles.result}>{estimate ? `ค่าขึ้นศาลโดยประมาณ  ${formatMoney(estimate.fee)} ฿` : 'กรอกทุนทรัพย์เพื่อคำนวณ'}</Text>
    <View style={styles.divider} />
    <FormField label="ดอกเบี้ยต่อปี (%)" value={rate} onChange={setRate} keyboardType="decimal-pad" />
    <ThaiDateField label="ตั้งแต่" value={from} onChange={setFrom} />
    <ThaiDateField label="ถึง" value={to} onChange={setTo} />
    {estimate?.interest != null
      ? <Text style={styles.result}>{estimate.days} วัน · ดอกเบี้ย {formatMoney(estimate.interest)} ฿</Text>
      : null}
    <Text style={styles.note}>ⓘ ประมาณการเท่านั้น ไม่รวมคดีจำนอง/บังคับตามคำชี้ขาด/มโนสาเร่</Text>
    <Text style={styles.note}>ค่าเริ่มต้น 5% ต่อปี ตาม ป.พ.พ. ม.224 (แก้ไข 2564: 3% ตาม ม.7 + 2%) · ดอกเบี้ยอย่างง่าย เงินต้น × อัตรา × วัน / 365</Text>
  </SectionCard>;
}

const styles = StyleSheet.create({
  result: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, fontVariant: ['tabular-nums'] },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.xs },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
```

- [ ] **Step 6: Put it on ภาพรวม under the record button**

In `apps/mobile/app/case/[id].tsx`:

1. Add the import:

```tsx
import { LitigationCalculatorCard } from '@/components/LitigationCalculatorCard';
```

2. Replace

```tsx
              <Button title="บันทึกเหตุการณ์ในศาล" onPress={() => setRecording(true)} />
            </View>
          ) : null}
```

with

```tsx
              <Button title="บันทึกเหตุการณ์ในศาล" onPress={() => setRecording(true)} />
            </View>
          ) : null}
          <LitigationCalculatorCard claimedAmount={detail.claimedAmount} />
```

The card is closed by default (`defaultOpen={false}`), so ภาพรวม stays scannable; its summary shows the case's claimed amount.

- [ ] **Step 7: Typecheck and run the checks**

Run: `(cd apps/mobile && pnpm exec tsc --noEmit)`
Expected: exits 0.

Run: `node apps/mobile/scripts/check-litigation-parity.cjs && node apps/mobile/scripts/check-court-workflow.cjs`
Expected: both end with a `PASS:` line.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git add apps/mobile/src/litigation.ts apps/mobile/src/components/Form.tsx apps/mobile/src/components/LitigationCalculatorCard.tsx "apps/mobile/app/case/[id].tsx" apps/mobile/scripts/check-litigation-parity.cjs
/usr/bin/git commit -m "$(cat <<'EOF'
feat(mobile): court-fee and interest estimate on the case overview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

<!-- end Task 11 -->

---

## Final verification (after all tasks)

- [ ] `pnpm --filter @lawfirm/shared build`
- [ ] `pnpm --filter api exec jest --config jest.config.js --maxWorkers=2 src/agenda src/intelligence/date-suggestions src/notifications/app-route src/notifications/assignment-notifier src/document-review` — PASS
- [ ] `pnpm --filter api exec tsc --noEmit -p tsconfig.json` — exits 0
- [ ] `(cd apps/mobile && pnpm exec tsc --noEmit)` — exits 0
- [ ] `node apps/mobile/scripts/check-litigation-parity.cjs && node apps/mobile/scripts/check-court-workflow.cjs && node apps/mobile/scripts/check-person-detail.cjs` — all `PASS`
- [ ] `/usr/bin/git status --short` shows none of `.claude/launch.json`, `apps/web/next-env.d.ts`, `apps/web/tsconfig.json`, `apps/web/tsconfig.tsbuildinfo`, `.env*`, `.superpowers/` staged or committed.
