# Redesign verification — 5 October 2026

Implemented coverage: 79 web pages and 41 native screens. The inventory records source coverage; runtime checks below have narrower, explicit bounds.

## Design provenance

[Google Stitch project](https://stitch.withgoogle.com/projects/394194744767221958): 11 interface screens plus a wordmark, exported as HTML and PNG. Root `design.md` and `tokens.css` apply one Hallmark system across staff, client, public and native surfaces. Existing app data and controls determine the implementation.

## Passed checks

| Check | Result |
| --- | --- |
| Web and API production builds | Passed |
| Web TypeScript and native TypeScript | Passed |
| Web unit tests | 89 passed |
| Workflow service tests | 22 passed |
| Static workspace routes | All 43 smoke checks passed; all routes fit at 320, 768 and 1024 px |
| Staff work screens | Dashboard, cases, calendar, team and tasks fit at 320, 375, 414, 768 and 1440 px in TH/EN |
| Case detail | All nine tabs fit at 320, 375, 414, 768, 1024 and 1440 px; the tab row wraps instead of scrolling sideways |
| Public, account and client portal | Seven public/account routes and six authenticated portal routes fit at 320, 375, 414, 768 and 1440 px; portal navigation wraps |
| Auth and recovery | TH/EN login and registration layouts, login error announcement, trial link, invitation/handoff recovery and neutral password recovery passed |
| Preferred workflow | Persists after reload, selected ahead of newer templates, editable before starting; no run created on opening the drawer |
| Default integrity | Concurrent replacements leave one default; foreign templates return 404, ordinary members return 403, null values return 400; archiving clears the default |
| Court Day | Nine checks passed: TH/EN layouts at five widths, file download, atomic outcomes, retries, rollback, draft recovery, future appointments and tenant boundaries |
| New client/case forms and payer contact | Existing simple form checks and updated payer contact flow passed |
| Portal workroom | Existing agreement/file/access flow passed |
| Native Android export | Expo/Metro bundle completed; 3130 modules and 34 assets |
| Native existing checks | Person detail/access/state/contrast, account validation/session races and offline session isolation passed |

Final representative web checks ran against a local production build (`NEXT_BUILD_DIR=.next-verify`), with the API on port 3001 and web on port 3005. Marketing screenshots were recaptured from this rendered build using fictional seeded records, with animations disabled for stable language controls. Both staff light and dark themes were visually inspected.

## Boundaries

- Isolated local PostgreSQL database: `lawfirm_redesign_20261005`. All 121 migrations applied locally, including `20261005121500_workflow_default_template`. Production must apply that additive migration with the API release.
- No production deployment, TestFlight build, Android installation or physical-device visual verification was performed. Native source coverage and bundle success do not establish device layout correctness.
- Optional wide tables keep contained horizontal scrolling so additional legal fields remain accessible. Page content, case tabs and portal navigation fit their available width. Long records/forms retain normal vertical scrolling.
- An initial combined Court Day/journey run hit the unchanged registration rate limit and stale selectors for the Thai split date control. Court Day was rerun successfully in bounded local batches with corrected date selectors. Legacy full onboarding assertions still assume the retired Dashboard heading; that complete journey suite is not claimed as passing. No authentication throttles were weakened.

## Repeat the scoped checks

Use a local database and seeded owner/client accounts as required by existing E2E fixtures. Keep registration batches within the existing five-per-ten-minute ceiling.

```sh
pnpm --filter web test
pnpm --filter api exec jest --config jest.config.js --runInBand workflows.service.spec.ts
pnpm --filter web exec tsc --noEmit --incremental false
pnpm --filter @lawfirm/mobile typecheck
pnpm exec playwright test --project=workspace
pnpm exec playwright test --project=journeys --grep 'public pages|auth forms fit|trial call|login fields|invalid invitation|forgot password gives'
pnpm exec playwright test --project=court-day --grep responsive
pnpm exec playwright test --project=court-day --grep-invert responsive
```
