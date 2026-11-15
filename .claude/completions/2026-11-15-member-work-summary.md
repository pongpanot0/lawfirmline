# 2026-11-15 — Member work summary page

- New page `/operations/people/[userId]` (runOperations only), from Team Radar "เปิดดู": KPIs, closed-vs-new per week, open/overdue trend, stage bottleneck + 5 longest-waiting tasks, CoachingTab (manual or AI draft, edit before send).
- API `GET /operations/people/:id/summary` → `buildWorkSummary` in `packages/shared/src/work-summary.ts` (12 Bangkok weeks; current assignee only).
- AI coaching draft gets `waitingByStage`; prompt makes the first improvement point name the bottleneck.
- Team Radar sorts by openPoints/standard, overdue breaks ties, on-leave last.
- `/coaching/mine` full width.
- Mockup: Stitch project 4125760283365915225; PNG in `docs/mockups/member-summary.png`.
- Gotcha: Recharts SVG attributes can't take `var(--token)` — resolve via getComputedStyle (`useChartColors`).
- Open question to user: office default 10 pts/week — switch to monthly or reweight sizes?
