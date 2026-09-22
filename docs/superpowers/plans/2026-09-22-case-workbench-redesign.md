# Case Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนหน้า `cases/[id]` เป็น Case Workbench ที่ทำให้ผู้ใช้เห็นสถานะสำคัญและเริ่มงานถัดไปได้ทันที โดยคง workflow และ data contract เดิมทั้งหมด

**Architecture:** คง `CaseDetailPage` เป็นเจ้าของ data fetching และ event handlers เดิม แล้วเพิ่ม presentation layer เฉพาะ route ผ่าน CSS Module และ route-local design tokens โครงหน้าใหม่แบ่งเป็น case identity, priority signals, guarded stage control, sticky navigation และ work surface แบบ 8/4 ที่สลับ action rail ขึ้นก่อนบน mobile

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, CSS Modules, Lucide React, browser-based responsive verification

**Spec:** `docs/superpowers/specs/2026-09-22-case-workbench-redesign-design.md`

## Global Constraints

- แก้เฉพาะหน้า `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` และ stylesheet/tokens เฉพาะ route
- ไม่เปลี่ยน API, data contract, authentication, permission หรือ business workflow
- ไม่เพิ่ม dependency หรือ animation library
- ใช้สีและ light/dark semantic variables เดิมของ Samnuan
- ไม่อ้าง deadline, urgency หรือ offline readiness เมื่อไม่มีข้อมูลจริง
- คง ARIA tab semantics และ URL query navigation เดิม
- ไม่มี document-level horizontal overflow ที่ 320, 375, 414 และ 768px
- ไม่แตะไฟล์งานค้างอื่นใน working tree

---

### Task 1: Add Route-local Workbench Tokens and Layout Primitives

**Files:**
- Create: `apps/web/src/app/(dashboard)/cases/[id]/tokens.css`
- Create: `apps/web/src/app/(dashboard)/cases/[id]/case-detail.module.css`
- Create: `apps/web/src/lib/case-workbench.ts`
- Create: `apps/web/src/lib/case-workbench.test.ts`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx:1-75`

**Interfaces:**
- Consumes: semantic variables `--background`, `--foreground`, `--card`, `--border`, `--primary`, `--muted`, `--muted-foreground`, `--ring` จาก `apps/web/src/app/globals.css`
- Produces: CSS Module classes `workbench`, `identity`, `signalStrip`, `stagePanel`, `tabDock`, `workspace`, `mainPane`, `actionRail`, `actionSection`, `dangerZone`

- [ ] **Step 1: Write failing tests for honest priority values**

The tests call `buildCasePrioritySummary` with and without dates and assert that missing values remain `null` rather than becoming fabricated urgency.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter web test -- src/lib/case-workbench.test.ts`

Expected: FAIL because `case-workbench.ts` does not exist yet

- [ ] **Step 3: Implement the display-only priority helper**

Export `buildCasePrioritySummary(input, now)` returning counts, the first pending task and event, and `limitationDays: number | null`. The helper must not mutate or sort its input arrays.

- [ ] **Step 4: Create route-local named tokens**

```css
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · theme: existing Samnuan · designed-as-app */
:root {
  --case-color-paper: hsl(var(--background));
  --case-color-surface: hsl(var(--card));
  --case-color-ink: hsl(var(--foreground));
  --case-color-muted: hsl(var(--muted-foreground));
  --case-color-rule: hsl(var(--border));
  --case-color-accent: hsl(var(--primary));
  --case-color-focus: hsl(var(--ring));
  --case-space-1: 0.25rem;
  --case-space-2: 0.5rem;
  --case-space-3: 0.75rem;
  --case-space-4: 1rem;
  --case-space-5: 1.5rem;
  --case-space-6: 2rem;
  --case-radius-control: 0.625rem;
  --case-radius-panel: 0.875rem;
  --case-rule: 1px solid var(--case-color-rule);
}
```

- [ ] **Step 5: Create structural CSS Module with mobile-first ordering**

```css
@import './tokens.css';

.workbench { min-width: 0; overflow-wrap: anywhere; }
.identity { display: grid; gap: var(--case-space-4); border-bottom: var(--case-rule); padding-bottom: var(--case-space-5); }
.signalStrip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-block: var(--case-rule); }
.workspace { display: grid; grid-template-columns: minmax(0, 2fr) minmax(18rem, 1fr); gap: var(--case-space-5); align-items: start; }
.mainPane { min-width: 0; }
.actionRail { min-width: 0; display: grid; gap: var(--case-space-4); }
.tabDock { position: sticky; top: 0; z-index: 20; background: color-mix(in oklch, var(--case-color-paper) 94%, transparent); backdrop-filter: blur(12px); }

@media (max-width: 767px) {
  .signalStrip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .workspace { grid-template-columns: minmax(0, 1fr); }
  .actionRail { order: -1; }
}

@media (max-width: 374px) {
  .signalStrip { grid-template-columns: minmax(0, 1fr); }
}
```

- [ ] **Step 6: Import the CSS Module and helper without changing global styles**

```tsx
import styles from './case-detail.module.css';
import { buildCasePrioritySummary } from '@/lib/case-workbench';
```

- [ ] **Step 7: Run the focused test and verify GREEN**

Run: `pnpm --filter web test -- src/lib/case-workbench.test.ts`

Expected: the new priority-summary tests pass

- [ ] **Step 8: Run TypeScript and CSS compilation smoke check**

Run: `pnpm --filter web exec tsc --noEmit --incremental false`

Expected: no new TypeScript errors from the CSS Module import

- [ ] **Step 9: Commit the isolated style foundation**

```bash
git add 'apps/web/src/app/(dashboard)/cases/[id]/tokens.css' 'apps/web/src/app/(dashboard)/cases/[id]/case-detail.module.css' 'apps/web/src/app/(dashboard)/cases/[id]/page.tsx' apps/web/src/lib/case-workbench.ts apps/web/src/lib/case-workbench.test.ts
git commit -m "style: add case workbench layout foundation"
```

---

### Task 2: Rebuild the Case Header Around Identity and Priority Signals

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx:616-785`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/case-detail.module.css`

**Interfaces:**
- Consumes: existing `legalCase`, `pendingTasks`, `requiredDocs`, `upcomingEvents`, `preFiling`, `selectTab`, `formatDate`, `formatDateTime`
- Produces: visual regions `case-identity`, `case-priority-signals`, `case-stage-control`; no new API calls

- [ ] **Step 1: Compute display-only priority values from existing data**

```tsx
const nextEvent = upcomingEvents[0] ?? null;
const nextPendingTask = pendingTasks[0] ?? null;
const completedTaskCount = tasks.filter((task) => task.status === 'DONE').length;
const presentRequiredDocumentCount = requiredDocs.required.filter((item) => item.present).length;
const limitationDays = legalCase.limitationDeadline
  ? Math.max(0, Math.ceil((new Date(legalCase.limitationDeadline).getTime() - Date.now()) / 86400000))
  : null;
```

- [ ] **Step 2: Replace the equal-card header with identity plus signal strip**

The header must render, in this order:

```tsx
<header className={styles.identity} data-testid="case-identity">
  <button type="button" onClick={() => router.push('/cases')}>← กลับไปหน้าคดี</button>
  <div>{/* title, reference, client, owner, badges */}</div>
  <div>{/* current context-appropriate primary actions */}</div>
</header>

<section className={styles.signalStrip} aria-label="สัญญาณสำคัญของคดี" data-testid="case-priority-signals">
  {/* next event, limitation date, pending work, required documents */}
</section>
```

Use real values only. Empty values render neutral copy such as `ยังไม่มีนัดถัดไป` or `ยังไม่ระบุ`.

- [ ] **Step 3: Make actionable signals navigate through existing tabs**

```tsx
<button type="button" onClick={() => selectTab('tasks')}>
  <span>งานค้าง</span>
  <strong>{pendingTasks.length}</strong>
  <span>{nextPendingTask?.dueDate ? `ใกล้สุด ${formatDate(nextPendingTask.dueDate)}` : 'ยังไม่กำหนดวันส่ง'}</span>
</button>
```

Repeat the same semantic-button pattern for calendar and documents. The limitation signal remains a non-button because no dedicated editor route exists in this scope.

- [ ] **Step 4: Convert the stage row into a labelled guarded control**

Keep `handleStageChange(option.value)`, `savingStage`, current/past/upcoming states and all stage options. Add explanatory copy `เลือกเพื่อเปลี่ยนขั้นตอนคดี` and visible saving text. Do not add a confirmation dialog.

- [ ] **Step 5: Move close/archive controls into a separate danger zone**

The `showCloseForm`, `getCaseOutstanding`, `handleReopenCase` and `handleArchiveCase` flows remain unchanged. Only relocate their triggers below the main stage control using `styles.dangerZone`.

- [ ] **Step 6: Verify the header against live case data**

Open: `http://thesiambarristers.localhost:3005/cases/6e44f682-08b7-4c9a-b524-2d96b8c431f4`

Expected for the current fixture: title `t3`, stage `ยื่นฟ้อง`, two pending tasks, no required documents, no upcoming appointment and no limitation date; no fabricated urgency styling

- [ ] **Step 7: Commit the header redesign**

```bash
git add 'apps/web/src/app/(dashboard)/cases/[id]/page.tsx' 'apps/web/src/app/(dashboard)/cases/[id]/case-detail.module.css'
git commit -m "feat: prioritize case workbench signals"
```

---

### Task 3: Make Case Navigation Sticky and Reshape the Overview Work Surface

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx:895-1860`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/case-detail.module.css`

**Interfaces:**
- Consumes: existing `CASE_TAB_IDS`, `CASE_TAB_LABELS`, `activeTab`, `selectTab`, all dynamic panels and overview handlers
- Produces: sticky tab dock, `mainPane` and `actionRail`; all tab panels retain their IDs and ARIA relationships

- [ ] **Step 1: Wrap the current tablist in the sticky dock**

```tsx
<nav className={styles.tabDock} aria-label="พื้นที่ทำงานคดี">
  <div className={styles.tabScroller}>
    <div role="tablist" aria-label="เมนูคดี">{/* existing tabs */}</div>
  </div>
  <Button aria-controls="case-ai-analysis-panel">สรุปเอกสารรวม</Button>
</nav>
```

The tab scroller may scroll horizontally, but the document must not.

- [ ] **Step 2: Replace the current 7/5 Tailwind grid with the Workbench grid**

```tsx
<div className={styles.workspace}>
  <section className={styles.mainPane} aria-label="ข้อมูลและประวัติคดี">
    {/* overview, participants, movement, precedent content */}
  </section>
  <aside className={styles.actionRail} aria-label="สิ่งที่ต้องทำต่อ">
    {/* next actions, checklist, appointment, quick task, note */}
  </aside>
</div>
```

Use DOM order `actionRail` then `mainPane` so mobile and assistive-technology reading order starts with next actions. On desktop CSS places `mainPane` in column 1 and `actionRail` in column 2 without duplicating content.

- [ ] **Step 3: Remove the duplicate full pending-task list from overview**

The action rail shows at most three `pendingTasks` as next actions and one `ดูงานทั้งหมด` control. The full list remains in `CaseTasksPanel`. Preserve quick task fields and `addQuickTask` in the action rail.

- [ ] **Step 4: Keep checklist as the single checkable summary**

Preserve `toggleChecklistTask`, `toggleRequiredDoc`, `DocumentDropZone` and Playbook selection. Do not render a second checkable copy elsewhere in overview.

- [ ] **Step 5: Group information cards by reading purpose**

Use `styles.actionSection` for action rail surfaces and subdued rule-separated sections for the main pane. Keep edit forms, error messages, loading states and source-linked precedent results unchanged.

- [ ] **Step 6: Verify tab deep links and overview interactions**

Checks:

```text
?tab=tasks          -> งาน panel visible
?tab=calendar       -> timeline/calendar panel visible
?tab=documents      -> documents panel visible
?tab=billing        -> billing panel visible
?tab=ask-ai         -> facts and precedent panel visible
?tab=closing-report -> closing report panel visible
```

Expected: selected tab updates through `router.replace`, IDs and `aria-labelledby` remain matched

- [ ] **Step 7: Commit the work surface**

```bash
git add 'apps/web/src/app/(dashboard)/cases/[id]/page.tsx' 'apps/web/src/app/(dashboard)/cases/[id]/case-detail.module.css'
git commit -m "feat: reshape case overview as a workbench"
```

---

### Task 4: Responsive, Accessibility and Hallmark Verification

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/case-detail.module.css`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/tokens.css`
- Create: `.hallmark/log.json`

**Interfaces:**
- Consumes: completed Workbench page and existing tenant-authenticated live route
- Produces: verified responsive page plus Hallmark project log entry

- [ ] **Step 1: Run TypeScript**

Run: `pnpm --filter web exec tsc --noEmit --incremental false`

Expected: exit code 0; otherwise distinguish pre-existing failures from files changed by this plan

- [ ] **Step 2: Run the web test suite**

Run: `pnpm --filter web test`

Expected: existing web tests pass with no new failure attributable to the redesigned route

- [ ] **Step 3: Verify desktop visual hierarchy and interactions in the authenticated tenant route**

Confirm title, stage, case reference, owner, four signals, tabs, overview edit, task navigation, calendar navigation, note control and AI analysis trigger remain visible and operable.

- [ ] **Step 4: Verify responsive widths**

At each width 320, 375, 414 and 768px, evaluate:

```js
({
  viewport: window.innerWidth,
  documentWidth: document.documentElement.scrollWidth,
  bodyWidth: document.body.scrollWidth,
  overflow: document.documentElement.scrollWidth > window.innerWidth,
})
```

Expected: `overflow` is `false`; title wraps inside its container; tab scrolling is local; action rail appears before the detail pane below 768px.

- [ ] **Step 5: Verify keyboard and accessibility state**

Tab through back navigation, primary action, signal buttons, stage buttons, tab controls and quick actions. Expected: every control has an immediate visible focus ring and no focus trap; selected tab exposes `aria-selected="true"`.

- [ ] **Step 6: Verify dark mode and reduced-motion behaviour**

Toggle the existing dark-mode control and ensure all new surfaces use semantic tokens. Emulate `prefers-reduced-motion: reduce`; expected: no required information depends on animation.

- [ ] **Step 7: Check runtime logs**

Expected: no new hydration, React key, CSS or route errors after switching tabs and returning to overview.

- [ ] **Step 8: Run Hallmark self-critique and record the design**

The first CSS line must retain the Hallmark stamp. Add the newest entry first:

```json
[
  {
    "date": "2026-09-22",
    "macrostructure": "Workbench",
    "theme": "existing Samnuan",
    "enrichment": "none",
    "brief": "Case detail workbench for legal operations"
  }
]
```

Score Philosophy, Hierarchy, Execution, Specificity, Restraint and Variety from 1–5. Any score below 3 requires a revision before completion.

- [ ] **Step 9: Commit final verification fixes and Hallmark log**

```bash
git add 'apps/web/src/app/(dashboard)/cases/[id]/page.tsx' 'apps/web/src/app/(dashboard)/cases/[id]/case-detail.module.css' 'apps/web/src/app/(dashboard)/cases/[id]/tokens.css' .hallmark/log.json
git commit -m "test: verify case workbench experience"
```
