# Owner daily workflow

Implementation branch: `codex/owner-daily-workflow`.

## Website

- `/operations` opens the daily workboard: ordered queues by person, latest progress, unassigned work, and Owner follow-up.
- Staff and cases come from the current firm's primary records. Work type, priority, reviewer and queue position use native selects.
- Shared website fields live in `apps/web/src/components/ui/form-fields.tsx`: text, textarea, select, date and datetime. API boundaries convert wall clocks with the existing Bangkok helpers.
- Assignment shows existing work, leave, calendar appointments and missing progress. Insertion moves queue order only; existing deadlines stay unchanged.
- Workers acknowledge responsibility, confirm a daily plan, record progress and attach output through the existing task drawer. Required review uses the existing handoff/revision/acceptance flow.
- Task duration and spare hours are not estimated. Skills support suggestions; Owner chooses the recipient.
- Selected dates show current queues with progress/completions for that date, not historical snapshots of task statuses.

## Verification

- API build and API/web TypeScript checks passed.
- 85 affected API tests passed: firm isolation, task access, daily updates, plan confirmation, queue movement and existing review behavior.
- 10 website helper tests passed, including Bangkok date/time boundaries and missing-progress recommendations.
- Real API sequence passed against isolated PostgreSQL database `lawfirm_owner_daily_20260927`: create/unassigned, assign, reorder, acknowledge, plan, progress, handoff, revision, acceptance, leave/calendar and cross-firm denial. Original deadlines verified in persisted rows.
- Browser tests used the running website and real isolated API: Owner assignment with impact confirmation, worker progress/upload/handoff, senior acceptance, Escape/focus behavior and no horizontal overflow at 1440px and 390px.
- A website-entered deadline of 09:45 Bangkok persisted as 02:45 UTC.
- New migration SQL passed in a temporary schema inside a rolled-back transaction.

Run the API integration check only against a dedicated scratch database with the updated schema and a running isolated API:

```sh
DATABASE_URL=postgresql://USER@localhost:5432/lawfirm_owner_daily_test \
JWT_SECRET=owner-daily-test-secret \
DAILY_TEST_API=http://localhost:3011 \
node scripts/check-owner-daily-workflow.cjs
```

The script creates new test firms and users; it refuses database names outside `lawfirm_owner_daily_*` and non-local hosts. No office data or outbound notification credentials were used.

## Release requirement

Apply `20260927130000_owner_daily_operations` before running this API build against the target database. No shared database migrations, push or production deployment were performed.
