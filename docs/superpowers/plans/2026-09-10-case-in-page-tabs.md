# Case In-Page Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep lawyers on `/cases/[id]` while switching ภาพรวม / งาน / ปฏิทิน / เอกสาร / ค่าใช้จ่าย / ประกัน / ข้อความ / รายงานปิดงาน via `?tab=`, with legacy sub-routes redirecting into that shell.

**Architecture:** A pure tab helper normalizes `?tab=` values. The case detail page owns chrome (header, tablist, AI panel) and renders one lazy panel per tab. Each former `cases/[id]/<segment>/page.tsx` becomes a `Case*Panel` under `components/cases/`, and the old route files become server `redirect()` stubs. Document review stays a separate page; its back link targets `?tab=documents`.

**Tech Stack:** Next.js 15 App Router (client case page + `useSearchParams` / `router.replace`), React 19, `next/dynamic` for lazy panels, Node test runner (`pnpm --filter web test`).

**Spec:** [docs/superpowers/specs/2026-09-10-case-in-page-tabs-design.md](../specs/2026-09-10-case-in-page-tabs-design.md)

## Global Constraints

- Stay on path `/cases/[id]` for all eight tabs; never navigate to `/cases/[id]/tasks` (etc.) from the tab bar.
- Overview URL prefers bare `/cases/[id]` (no `?tab=overview`); other tabs use `?tab=<id>`.
- Tab switches use `router.replace`, not `push`.
- Unknown / missing `tab` → `overview`.
- Do not rewrite tab business logic; move UI + loaders as-is aside from removing back-to-case chrome.
- `/cases/[id]/documents/[documentId]/review` remains a dedicated page.
- Do not merge with global `AIAssistantPanel`; keep case AI file-analysis overlay as already shipped.
- Panel components live in `apps/web/src/components/cases/` with the names in the spec.

## File map

| File | Role |
|------|------|
| `apps/web/src/lib/case-tabs.ts` | Tab id union, labels, parse, href builder |
| `apps/web/src/lib/case-tabs.test.ts` | Unit tests for parse + href |
| `apps/web/src/components/cases/CaseTasksPanel.tsx` (and Calendar/Documents/Billing/Insurance/Messages/ClosingReport) | Extracted tab bodies |
| `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` | Shell: chrome + tablist + panel switch + AI |
| `apps/web/src/app/(dashboard)/cases/[id]/{tasks,calendar,documents,billing,insurance,messages,closing-report}/page.tsx` | Server redirects to `?tab=` |
| `apps/web/src/app/(dashboard)/cases/[id]/documents/[documentId]/review/page.tsx` | Back link → `?tab=documents` |

Overview body stays inside `page.tsx` for this plan (no `CaseOverviewPanel` unless a later cleanup wants it).

---

### Task 1: Case tab helper + unit tests

**Files:**
- Create: `apps/web/src/lib/case-tabs.ts`
- Create: `apps/web/src/lib/case-tabs.test.ts`

**Interfaces:**
- Produces:
  - `export const CASE_TAB_IDS = ['overview','tasks','calendar','documents','billing','insurance','messages','closing-report'] as const`
  - `export type CaseTabId = (typeof CASE_TAB_IDS)[number]`
  - `export const CASE_TAB_LABELS: Record<CaseTabId, string>` (Thai labels from the spec table)
  - `export function parseCaseTab(value: string | null | undefined): CaseTabId`
  - `export function caseTabHref(caseId: string, tab: CaseTabId): string` — overview → `/cases/${caseId}`; else `/cases/${caseId}?tab=${tab}`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/case-tabs.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCaseTab, caseTabHref } from './case-tabs.ts';

describe('parseCaseTab', () => {
  it('defaults null/empty/unknown to overview', () => {
    assert.equal(parseCaseTab(null), 'overview');
    assert.equal(parseCaseTab(undefined), 'overview');
    assert.equal(parseCaseTab(''), 'overview');
    assert.equal(parseCaseTab('nope'), 'overview');
  });

  it('accepts each known tab id', () => {
    assert.equal(parseCaseTab('tasks'), 'tasks');
    assert.equal(parseCaseTab('closing-report'), 'closing-report');
  });
});

describe('caseTabHref', () => {
  it('uses bare path for overview', () => {
    assert.equal(caseTabHref('abc', 'overview'), '/cases/abc');
  });

  it('uses query for other tabs', () => {
    assert.equal(caseTabHref('abc', 'documents'), '/cases/abc?tab=documents');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter web test -- src/lib/case-tabs.test.ts`  
(or from `apps/web`: `pnpm test -- src/lib/case-tabs.test.ts`)  
Expected: FAIL (module not found / cannot resolve `./case-tabs.ts`).

- [ ] **Step 3: Implement helper**

Create `apps/web/src/lib/case-tabs.ts`:

```ts
export const CASE_TAB_IDS = [
  'overview',
  'tasks',
  'calendar',
  'documents',
  'billing',
  'insurance',
  'messages',
  'closing-report',
] as const;

export type CaseTabId = (typeof CASE_TAB_IDS)[number];

export const CASE_TAB_LABELS: Record<CaseTabId, string> = {
  overview: 'ภาพรวม',
  tasks: 'งาน',
  calendar: 'ปฏิทิน',
  documents: 'เอกสาร',
  billing: 'ค่าใช้จ่าย',
  insurance: 'ประกัน',
  messages: 'ข้อความ',
  'closing-report': 'รายงานปิดงาน',
};

export function parseCaseTab(value: string | null | undefined): CaseTabId {
  if (value && (CASE_TAB_IDS as readonly string[]).includes(value)) {
    return value as CaseTabId;
  }
  return 'overview';
}

export function caseTabHref(caseId: string, tab: CaseTabId): string {
  if (tab === 'overview') return `/cases/${caseId}`;
  return `/cases/${caseId}?tab=${tab}`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter web test -- src/lib/case-tabs.test.ts`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/case-tabs.ts apps/web/src/lib/case-tabs.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add case tab id helper for in-page navigation

EOF
)"
```

---

### Task 2: Wire case shell tab bar to `?tab=` (overview body only)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`

**Interfaces:**
- Consumes: `parseCaseTab`, `caseTabHref`, `CASE_TAB_IDS`, `CASE_TAB_LABELS`, `CaseTabId` from `@/lib/case-tabs`
- Produces: case page reads `useSearchParams().get('tab')`, switches with `router.replace(caseTabHref(id, tab))`, keeps overview grid when tab is `overview`; for other tabs temporarily render a short placeholder `<p>กำลังย้ายแท็บนี้…</p>` until panels land in later tasks (remove placeholders as each panel ships).

- [ ] **Step 1: Import search params + tab helper**

At top of `page.tsx`, ensure:

```ts
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  CASE_TAB_IDS,
  CASE_TAB_LABELS,
  caseTabHref,
  parseCaseTab,
  type CaseTabId,
} from '@/lib/case-tabs';
```

Inside `CaseDetailPage`, after hooks:

```ts
const searchParams = useSearchParams();
const activeTab = parseCaseTab(searchParams.get('tab'));

const selectTab = (tab: CaseTabId) => {
  router.replace(caseTabHref(id, tab));
};
```

Remove the local `tabs` array that builds `href: `/cases/${id}/…``.

- [ ] **Step 2: Replace tab bar markup**

Replace the current tab `<nav>` / button row so tabs are buttons in a `tablist`:

```tsx
<div className="mb-6 flex flex-wrap items-end justify-between gap-2 border-b border-border">
  <div role="tablist" aria-label="เมนูคดี" className="flex min-w-0 flex-1 flex-wrap gap-1">
    {CASE_TAB_IDS.map((tabId) => {
      const selected = activeTab === tabId;
      return (
        <button
          key={tabId}
          type="button"
          role="tab"
          id={`case-tab-${tabId}`}
          aria-selected={selected}
          aria-controls={`case-tabpanel-${tabId}`}
          tabIndex={selected ? 0 : -1}
          className={
            selected
              ? 'whitespace-nowrap border-b-2 border-primary px-4 py-3 text-sm font-semibold text-primary'
              : 'whitespace-nowrap rounded-t-md px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          }
          onClick={() => selectTab(tabId)}
        >
          {CASE_TAB_LABELS[tabId]}
        </button>
      );
    })}
  </div>
  {/* keep existing AI analysis Button unchanged */}
</div>
```

- [ ] **Step 3: Gate overview body + placeholder panels**

Wrap the existing overview grid (the `lg:grid-cols-12` block and anything that is overview-only) so it renders only when `activeTab === 'overview'`. After the tab bar (and before the AI overlay), add:

```tsx
{activeTab !== 'overview' && (
  <div
    role="tabpanel"
    id={`case-tabpanel-${activeTab}`}
    aria-labelledby={`case-tab-${activeTab}`}
    className="min-w-0"
  >
    <p className="text-sm text-muted-foreground">กำลังย้ายแท็บนี้เข้าหน้านี้…</p>
  </div>
)}

{activeTab === 'overview' && (
  <div
    role="tabpanel"
    id="case-tabpanel-overview"
    aria-labelledby="case-tab-overview"
    className="min-w-0"
  >
    {/* existing overview grid JSX */}
  </div>
)}
```

Also update overview shortcuts that currently `Link`/`router.push` to `/cases/${id}/tasks` or `/calendar` so they call `selectTab('tasks')` / `selectTab('calendar')` (or `router.replace(caseTabHref(id, 'tasks'))`) instead.

- [ ] **Step 4: Manual smoke**

Run: `pnpm --filter web dev`  
Open a case → click งาน → URL becomes `/cases/<id>?tab=tasks`, title chrome stays, placeholder shows → click ภาพรวม → URL bare `/cases/<id>`, overview returns.  
Expected: no full navigation to `/tasks`.

- [ ] **Step 5: Commit**

```bash
git add 'apps/web/src/app/(dashboard)/cases/[id]/page.tsx'
git commit -m "$(cat <<'EOF'
feat(web): switch case tabs via ?tab= without leaving case shell

EOF
)"
```

---

### Task 3: Extract `CaseTasksPanel` + redirect `/tasks`

**Files:**
- Create: `apps/web/src/components/cases/CaseTasksPanel.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/tasks/page.tsx` → server redirect only
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` — render panel when `activeTab === 'tasks'`

**Interfaces:**
- Produces: `export function CaseTasksPanel({ caseId }: { caseId: string })`
- Consumes: same APIs/components the current tasks page uses; `caseId` replaces `useParams().id`

- [ ] **Step 1: Move tasks page body into the panel**

Copy `apps/web/src/app/(dashboard)/cases/[id]/tasks/page.tsx` to `apps/web/src/components/cases/CaseTasksPanel.tsx`.

Changes inside the panel:
- Rename default export to `CaseTasksPanel`.
- Props: `{ caseId: string }` — use `caseId` everywhere `id` from params was used.
- Remove `useParams`.
- Remove the back-to-case `Link` + page-level duplicate chrome; keep section title `d.caseTasks.title` and the add-task controls.

- [ ] **Step 2: Replace tasks route with redirect**

Replace `apps/web/src/app/(dashboard)/cases/[id]/tasks/page.tsx` with a **server** page (no `'use client'`):

```tsx
import { redirect } from 'next/navigation';

export default async function CaseTasksRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/cases/${id}?tab=tasks`);
}
```

- [ ] **Step 3: Mount panel from case page**

In `page.tsx`:

```ts
import dynamic from 'next/dynamic';

const CaseTasksPanel = dynamic(
  () => import('@/components/cases/CaseTasksPanel').then((m) => m.CaseTasksPanel),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> },
);
```

Where the non-overview placeholder lives, branch:

```tsx
{activeTab === 'tasks' && (
  <div role="tabpanel" id="case-tabpanel-tasks" aria-labelledby="case-tab-tasks">
    <CaseTasksPanel caseId={id} />
  </div>
)}
```

Keep the generic placeholder only for tabs not yet extracted.

- [ ] **Step 4: Smoke**

Open `/cases/<id>?tab=tasks` and `/cases/<id>/tasks`.  
Expected: both show the tasks UI inside the case shell; legacy URL ends on `?tab=tasks`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/cases/CaseTasksPanel.tsx \
  'apps/web/src/app/(dashboard)/cases/[id]/tasks/page.tsx' \
  'apps/web/src/app/(dashboard)/cases/[id]/page.tsx'
git commit -m "$(cat <<'EOF'
feat(web): embed case tasks tab in case shell

EOF
)"
```

---

### Task 4: Extract `CaseCalendarPanel` + redirect `/calendar`

**Files:**
- Create: `apps/web/src/components/cases/CaseCalendarPanel.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/calendar/page.tsx` → server redirect
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`

**Interfaces:**
- Produces: `export function CaseCalendarPanel({ caseId }: { caseId: string })`

- [ ] **Step 1: Extract panel** — same pattern as Task 3 from `calendar/page.tsx`; drop back-link chrome; prop `caseId`.

- [ ] **Step 2: Redirect page**

```tsx
import { redirect } from 'next/navigation';

export default async function CaseCalendarRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/cases/${id}?tab=calendar`);
}
```

- [ ] **Step 3: Lazy-mount** when `activeTab === 'calendar'` via `next/dynamic` like tasks.

- [ ] **Step 4: Smoke** `/cases/<id>/calendar` → `?tab=calendar` with calendar UI in shell.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/cases/CaseCalendarPanel.tsx \
  'apps/web/src/app/(dashboard)/cases/[id]/calendar/page.tsx' \
  'apps/web/src/app/(dashboard)/cases/[id]/page.tsx'
git commit -m "$(cat <<'EOF'
feat(web): embed case calendar tab in case shell

EOF
)"
```

---

### Task 5: Extract `CaseDocumentsPanel` + redirect list route

**Files:**
- Create: `apps/web/src/components/cases/CaseDocumentsPanel.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/documents/page.tsx` → server redirect **only for the list**; do **not** touch `documents/[documentId]/review/page.tsx` yet
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`

**Interfaces:**
- Produces: `export function CaseDocumentsPanel({ caseId }: { caseId: string })`
- Keep links to `/cases/${caseId}/documents/${doc.id}/review` unchanged.

**Note:** In the App Router, `documents/page.tsx` and `documents/[documentId]/review/page.tsx` coexist. Replacing only `documents/page.tsx` with a redirect is correct; the review nested route stays.

- [ ] **Step 1: Extract panel** from `documents/page.tsx`; remove back-to-case chrome; keep review `Link`s.

- [ ] **Step 2: Redirect list page**

```tsx
import { redirect } from 'next/navigation';

export default async function CaseDocumentsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/cases/${id}?tab=documents`);
}
```

- [ ] **Step 3: Lazy-mount** for `activeTab === 'documents'`.

- [ ] **Step 4: Smoke** list in shell; open a review URL — still a full page.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/cases/CaseDocumentsPanel.tsx \
  'apps/web/src/app/(dashboard)/cases/[id]/documents/page.tsx' \
  'apps/web/src/app/(dashboard)/cases/[id]/page.tsx'
git commit -m "$(cat <<'EOF'
feat(web): embed case documents tab in case shell

EOF
)"
```

---

### Task 6: Extract billing, insurance, messages, closing-report panels

**Files:**
- Create: `apps/web/src/components/cases/CaseBillingPanel.tsx`
- Create: `apps/web/src/components/cases/CaseInsurancePanel.tsx`
- Create: `apps/web/src/components/cases/CaseMessagesPanel.tsx`
- Create: `apps/web/src/components/cases/CaseClosingReportPanel.tsx`
- Modify each corresponding `.../page.tsx` → server redirect with matching `?tab=`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` — mount all four; **delete** the temporary “กำลังย้ายแท็บนี้…” placeholder branch

**Interfaces:**
- Produces:
  - `CaseBillingPanel({ caseId }: { caseId: string })`
  - `CaseInsurancePanel({ caseId }: { caseId: string })`
  - `CaseMessagesPanel({ caseId }: { caseId: string })`
  - `CaseClosingReportPanel({ caseId }: { caseId: string })`

- [ ] **Step 1: Extract all four panels** using the same rules as Task 3 (prop `caseId`, strip back-link chrome, keep section heading).

- [ ] **Step 2: Four redirect stubs** — `?tab=billing|insurance|messages|closing-report`.

- [ ] **Step 3: Lazy-mount each** on the case page; remove placeholder for unknown remaining tabs (every non-overview tab now has a panel).

- [ ] **Step 4: Smoke** click through all eight tabs; each updates `?tab=` (or bare path for overview) and shows real content.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/cases/CaseBillingPanel.tsx \
  apps/web/src/components/cases/CaseInsurancePanel.tsx \
  apps/web/src/components/cases/CaseMessagesPanel.tsx \
  apps/web/src/components/cases/CaseClosingReportPanel.tsx \
  'apps/web/src/app/(dashboard)/cases/[id]/billing/page.tsx' \
  'apps/web/src/app/(dashboard)/cases/[id]/insurance/page.tsx' \
  'apps/web/src/app/(dashboard)/cases/[id]/messages/page.tsx' \
  'apps/web/src/app/(dashboard)/cases/[id]/closing-report/page.tsx' \
  'apps/web/src/app/(dashboard)/cases/[id]/page.tsx'
git commit -m "$(cat <<'EOF'
feat(web): embed remaining case tabs in case shell

EOF
)"
```

---

### Task 7: Review back-link + leftover in-app paths

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/documents/[documentId]/review/page.tsx` — back link
- Grep and fix any **case-shell** links that still `push`/`href` to subpaths when the intent is “open this tab” (overview shortcuts should already be done in Task 2). Leave hub pages (e.g. `/documents` firm-wide list) pointing at legacy URLs; redirects cover them.

**Interfaces:**
- Consumes: `caseTabHref` optional; or hardcode `` `/cases/${caseId}?tab=documents` ``

- [ ] **Step 1: Fix review back link**

Change:

```tsx
href={`/cases/${caseId}/documents`}
```

to:

```tsx
href={`/cases/${caseId}?tab=documents`}
```

- [ ] **Step 2: Repo grep for stale navigations from case overview patterns**

Run:

```bash
rg -n 'cases/\$\{.*\}/(tasks|calendar|documents|billing|insurance|messages|closing-report)' \
  'apps/web/src/app/(dashboard)/cases/[id]/page.tsx' \
  apps/web/src/components/cases
```

Expected: no hits that mean “switch tab” except document **review** links under `CaseDocumentsPanel` (`.../documents/${id}/review`).

- [ ] **Step 3: Manual smoke**

From documents tab → open review → “กลับไปที่เอกสาร” → `/cases/<id>?tab=documents` with list visible and case chrome intact.

- [ ] **Step 4: Commit**

```bash
git add 'apps/web/src/app/(dashboard)/cases/[id]/documents/[documentId]/review/page.tsx' \
  'apps/web/src/app/(dashboard)/cases/[id]/page.tsx' \
  apps/web/src/components/cases
git commit -m "$(cat <<'EOF'
fix(web): return document review to in-page documents tab

EOF
)"
```

---

### Task 8: Final verification + completion note

**Files:**
- Create: `.claude/completions/2026-09-10-case-in-page-tabs.md`
- Optionally update spec status line to `Implemented`

- [ ] **Step 1: Run unit tests**

Run: `pnpm --filter web test -- src/lib/case-tabs.test.ts`  
Expected: PASS.

- [ ] **Step 2: Checklist against the spec**

- [ ] All eight tabs switch without leaving `/cases/[id]`
- [ ] `router.replace` used for tab changes
- [ ] Legacy seven list routes redirect to `?tab=`
- [ ] Document review still dedicated; back link uses `?tab=documents`
- [ ] AI analysis button/panel still overlay-only
- [ ] Non-overview panels loaded via `next/dynamic`

- [ ] **Step 3: Write completion doc** summarizing files touched and how to smoke-test.

- [ ] **Step 4: Commit completion + spec status** (if status updated)

```bash
git add .claude/completions/2026-09-10-case-in-page-tabs.md \
  docs/superpowers/specs/2026-09-10-case-in-page-tabs-design.md
git commit -m "$(cat <<'EOF'
docs: mark case in-page tabs complete

EOF
)"
```

---

## Spec coverage self-review

| Spec item | Task |
|-----------|------|
| `?tab=` on `/cases/[id]` | 1–2 |
| Labels / ids / unknown → overview | 1 |
| `replace` + bare overview URL | 1–2 |
| Chrome stays mounted; AI unchanged | 2 |
| Extract seven panels | 3–6 |
| Lazy `next/dynamic` | 3–6 |
| Legacy redirects | 3–6 |
| Overview shortcuts use tabs | 2 |
| Review page exception + back link | 5, 7 |
| Unit tests for helper | 1 |
| Manual smoke | 2–8 |

No TBD/placeholder steps left in the plan.
