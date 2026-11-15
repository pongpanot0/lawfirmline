# 2026-11-15 — Member work summary page

- New page `/operations/people/[userId]` (runOperations only), from Team Radar "เปิดดู": KPIs, closed-vs-new per week, open/overdue trend, stage bottleneck + 5 longest-waiting tasks, CoachingTab (manual or AI draft, edit before send).
- API `GET /operations/people/:id/summary` → `buildWorkSummary` in `packages/shared/src/work-summary.ts` (12 Bangkok weeks; current assignee only).
- AI coaching draft gets `waitingByStage`; prompt makes the first improvement point name the bottleneck.
- Team Radar sorts by openPoints/standard, overdue breaks ties, on-leave last.
- `/coaching/mine` full width.
- Mockup: Stitch project 4125760283365915225; PNG in `docs/mockups/member-summary.png`.
- Gotcha: Recharts SVG attributes can't take `var(--token)` — resolve via getComputedStyle (`useChartColors`).
- Open question to user: office default 10 pts/week — switch to monthly or reweight sizes?

## Follow-up (same day): task size from data + monthly standard
- New tasks without a size: workflow steps use `sizeFromDays(durationDays)` (≤0.5 S, ≤1 M, else L); other tasks with a workType use `sizeFromHistory` (median accepted→done days of the last 100 finished tasks of that type, ≥5 samples; ≤1 S, ≤3 M, else L). No workType or too little history → DB default M. Other create paths (court-day, intake, practice setup, import, client-360) still default M.
- Standard now from the last 4 weeks (min 4 finished tasks), still points/week internally so near/over rules are unchanged; Team Radar shows "ทำได้ ~N/เดือน" (×4).
- Coaching AI still reads 8 weeks of history; its standard uses only the last 4.
