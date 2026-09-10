# Case in-page tabs (no full page navigation)

**Date:** 2026-09-10  
**Status:** Implemented  
**Choice:** Stay on `/cases/[id]`; switch sections with `?tab=` (option A)

## Problem

Case sub-areas (งาน, ปฏิทิน, เอกสาร, …) are separate Next.js routes. Clicking the case tab bar navigates to a new URL and remounts the page. Users want tab switches that feel like staying on the same case page (same as the AI analysis right panel).

## Goals

- Switching ภาพรวม / งาน / ปฏิทิน / เอกสาร / ค่าใช้จ่าย / ประกัน / ข้อความ / รายงานปิดงาน does **not** feel like leaving the case.
- Case chrome stays mounted: back link, title, status, summary strip, tab bar, AI analysis button/panel.
- Tabs remain shareable/bookmarkable via query string.
- Old deep links (`/cases/[id]/tasks`, etc.) keep working via redirect.

## Non-goals

- Rewriting business logic inside each tab’s content.
- Changing document review (`/cases/[id]/documents/[documentId]/review`) — stays a dedicated page.
- Client-portal case navigation.
- Merging the global floating `AIAssistantPanel` with case file-analysis panel.

## Approach

**Single case shell + `?tab=` content switch.**

1. `/cases/[id]` owns chrome + tab bar + active panel.
2. Active tab from `searchParams.tab` (default `overview`).
3. Tab clicks call `router.replace(`/cases/${id}?tab=${tabId}`)` (or clear query for overview) — no path change away from `/cases/[id]`.
4. Extract each current `page.tsx` under `cases/[id]/{tasks,calendar,documents,billing,insurance,messages,closing-report}` into a panel component (e.g. `CaseTasksPanel`) that receives `caseId` (and props it already needs). Overview body stays inline or becomes `CaseOverviewPanel`.
5. Legacy routes become thin redirects to `?tab=…`.

## Tab IDs

| Tab ID | Label | Legacy path |
|--------|--------|-------------|
| `overview` | ภาพรวม | `/cases/[id]` |
| `tasks` | งาน | `/cases/[id]/tasks` |
| `calendar` | ปฏิทิน | `/cases/[id]/calendar` |
| `documents` | เอกสาร | `/cases/[id]/documents` |
| `billing` | ค่าใช้จ่าย | `/cases/[id]/billing` |
| `insurance` | ประกัน | `/cases/[id]/insurance` |
| `messages` | ข้อความ | `/cases/[id]/messages` |
| `closing-report` | รายงานปิดงาน | `/cases/[id]/closing-report` |

Invalid / unknown `tab` → treat as `overview`.

## URL rules

- Overview: `/cases/[id]` or `/cases/[id]?tab=overview` (prefer bare path when selecting overview).
- Other tabs: `/cases/[id]?tab=<id>`.
- Use `replace` for tab switches so the history stack is not flooded.
- Legacy path → permanent or soft redirect to the equivalent `?tab=` URL (implementation may use `redirect()` in each old `page.tsx` or a shared helper).

## Chrome & internal links

- Tab bar: buttons (or links to `?tab=`), active state from current tab — not `Link` to `/tasks` etc.
- AI analysis button/panel behavior unchanged (overlay; no route change).
- Overview shortcuts that today `href`/`push` to `/tasks` or `/calendar` must switch `?tab=` instead.
- Global/other pages that link to `/cases/:id/documents` (e.g. documents hub) may keep legacy URLs; redirects handle them.
- Document list → review page still navigates to `/documents/[documentId]/review`.
- Review page “back to documents” should land on `/cases/[id]?tab=documents`.

## Panel extraction

- Move UI + data loading from each sub-`page.tsx` into `apps/web/src/components/cases/` as `CaseTasksPanel`, `CaseCalendarPanel`, `CaseDocumentsPanel`, `CaseBillingPanel`, `CaseInsurancePanel`, `CaseMessagesPanel`, `CaseClosingReportPanel` (and optionally `CaseOverviewPanel` if overview body is extracted).
- Panels are client components as today.
- Remove per-subpage “back to case” + duplicate page-level case chrome where the shell already provides context; keep a short section heading inside the panel when it aids scanning (e.g. “ข้อความ”).
- Lazy-load non-overview panels with `next/dynamic` so overview first paint does not pull every tab bundle.

## Accessibility

- Tab list: `role="tablist"` / `tab` / `tabpanel` with `aria-selected` and `aria-controls`, or keep nav semantics with `aria-current="page"` on the active control.
- Focus: when switching tabs, move focus to the panel heading or panel container.

## Testing

- Unit/helper: parse/normalize tab id; unknown → overview.
- Manual / e2e smoke: click each tab → URL `?tab=` updates, chrome does not remount (title stays), content matches; open legacy `/tasks` → ends on `?tab=tasks`; document review still opens as its own page.

## Rollout

1. Add tab helpers + shell wiring on case page with overview only still inline.
2. Extract panels one-by-one; wire into switch; add redirects.
3. Update in-app links (overview shortcuts, review back link).
4. Remove dead back-link chrome from panels.

## Out of scope follow-ups

- Prefetching tab data on hover.
- Keeping multiple tab panels mounted (cache) after visit.
