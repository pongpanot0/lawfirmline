# Case in-page tabs

**Date:** 2026-09-10  
**Branch:** `feat/case-in-page-tabs`  
**Spec:** `docs/superpowers/specs/2026-09-10-case-in-page-tabs-design.md`  
**Plan:** `docs/superpowers/plans/2026-09-10-case-in-page-tabs.md`

## What shipped

- Case chrome (header, tablist, AI analysis button/panel) stays on `/cases/[id]`.
- Tabs switch via `router.replace` + `?tab=` (`overview` uses bare path).
- Seven panels under `apps/web/src/components/cases/Case*Panel.tsx`, lazy-loaded.
- Legacy list routes redirect to `?tab=`.
- Document review remains `/documents/[documentId]/review`; back link → `?tab=documents`.

## Smoke

1. Open a case → click each tab → URL updates, title stays.
2. Visit `/cases/<id>/tasks` → lands on `?tab=tasks`.
3. From documents tab open review → back returns to documents tab in shell.
4. AI analysis still opens as right overlay without route change.

## Tests

`pnpm --filter web exec node --test --experimental-strip-types src/lib/case-tabs.test.ts`
