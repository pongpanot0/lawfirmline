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
| SOP handoff creation | Create, reorder/remove steps, review requirement, failed-save retention, edit, search and office default passed; shared template appears in workflows and the case start drawer; owner/senior editing and ordinary-member denial verified; editor and library fit 320, 375, 768 and 1440 px |
| Existing SOP library | Manual editing, automatic publishing/versioning and case application passed at 375 and 1440 px |
| Court Day | Nine checks passed: TH/EN layouts at five widths, file download, atomic outcomes, retries, rollback, draft recovery, future appointments and tenant boundaries |
| New client/case forms and payer contact | Existing simple form checks and updated payer contact flow passed |
| Portal workroom | Existing agreement/file/access flow passed |
| Native Android export | Expo/Metro bundle completed; 3130 modules and 34 assets |
| Native existing checks | Person detail/access/state/contrast, account validation/session races and offline session isolation passed |

Final representative web checks ran against a local production build (`NEXT_BUILD_DIR=.next-verify`), with the API on port 3001 and web on port 3005. Marketing screenshots were recaptured from this rendered build using fictional seeded records, with animations disabled for stable language controls. Both staff light and dark themes were visually inspected.

The SOP follow-up reused the existing workflow template editor and API. Its handoff creation and default integrity checks passed against the updated local production build; existing SOP publishing/application checks passed on the local dev server. Web TypeScript and all 89 web unit tests also passed again. No API or native source changed in this follow-up.

## SOP library refinement and release

The second SOP refinement puts Handoff creation in the page header, explains the three SOP types, provides one office-default selector, and expands saved flows into readable steps with roles, days, review requirements and instructions. The editor supports an editable intake example, optional descriptions/instructions and persistent save/close controls. Failed saves retain inputs; clearing a description persists; editing preserves the office default. Existing permissions and server APIs are reused.

All three SOP browser tests passed against the final local production build, including widths 320, 375, 768 and 1440 px. The office-default/tenant test and its login setup passed. All 89 web unit tests, TypeScript and the production build passed. A repeat fixture batch hit the existing registration throttle (429); the owned local API was restarted before the successful bounded rerun. Production throttles were unchanged.

The initial redesign production release `prod-20261005-stitch-hallmark-redesign` deployed commit `3f6b2b3bfec2043913ab4a76e986b867fa393eb9` successfully in [run 37309456825](https://github.com/pongpanot0/lawfirmline/actions/runs/37309456825). API health returned `ok`, the deployment log confirmed 121 migrations with none pending, and the live public/login surfaces loaded the new fonts, colours and marketing assets. The container build now includes root `tokens.css`.

Android APK 0.1.1 / versionCode 8 was built locally with EAS preview, existing remote signing credentials and production API `https://api.samnuan.com`. Gradle completed successfully; ZIP integrity and APK v2 signature verified. Package: `com.samnuan.app`; bytes: 105371718; SHA256: `6848a0ad24d6a48e150583eea607a6578b840704883b586d374b438526f101df`. Native source comes from commit `3f6b2b3`; the subsequent SOP refinement changes only web source. Artifact: `samnuan-redesign.apk` in this task's deliverables.

Expo Doctor reported 19/22 checks passing: duplicate React versions in the workspace, a known Hermes V1 memory regression reported for Expo 56.0.21, and six Expo patch mismatches. These existing dependency warnings did not prevent the APK build. No SDK major upgrade was included in the UI refinement.

## Boundaries

- Isolated local PostgreSQL database: `lawfirm_redesign_20261005`. All 121 migrations applied locally, including `20261005121500_workflow_default_template`; the production redesign deployment completed migration checks with none pending.
- No TestFlight build, Android installation or physical-device visual verification was performed. The APK build and signature verification do not establish device layout correctness or runtime stability. Authenticated production SOP UI remains behind user login; its detailed workflows were verified against the real local API/database and production web build.
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
pnpm exec playwright test --project=sop-ui
pnpm exec playwright test --project=journeys --grep 'public pages|auth forms fit|trial call|login fields|invalid invitation|forgot password gives'
pnpm exec playwright test --project=court-day --grep responsive
pnpm exec playwright test --project=court-day --grep-invert responsive
```
