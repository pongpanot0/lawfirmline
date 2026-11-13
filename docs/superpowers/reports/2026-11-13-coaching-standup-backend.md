# Coaching + daily standup backend — slice 1

Status: implemented and verified locally; no commit. No radar wiring or web edits.
The brief did not supply an actual `-o` path; this report was written early at this fallback path and updated at completion.

## Delivered

- Contract models `DailyStandup`, `StandupPromptLog`, `CoachingNote`, `StandupStatus`, Firm/User back-relations, and COACHING/STANDUP notification categories.
- Shared contracts, pure `standupRequired`, and source unit tests run through the API Jest setup. Shared `dist` rebuilt (ignored build output).
- Registered `CoachingModule`; exported `StandupService` and `CoachingService` for later radar integration.
- `StandupService.statesFor(firmId, userIds, day)` batches member/leave/holiday/entry reads. `CoachingService.cuesFor(firmId, userIds)` uses grouped counts/latest timestamps. Neither wires radar fields.
- Standup editable upsert/skip/history; real-data suggestions from the previous working day's own DAILY_UPDATE/completed tasks and today's planned work (scheduled date first, deadline fallback, matching the daily board). Suggestions are capped at 20 per group to match the request-array limit.
- Approved inclusive leave dates and public holidays affect required/state. Bangkok calendar dates are separate from timestamp boundaries. Standup body task IDs pass `assertFirmRefs` and an additional caller-assignment check.
- Added optional `taskIds` validation and the daily-board-compatible tenant predicate to `common/firm-refs.ts`; existing callers retain their behavior.
- Coaching drafts only run from POST `/coaching/draft`: strict structured JSON plus server validation, firm-local task allowlist, warm Thai instructions, no business-record writes, usage logged via `RagService.logRun` to the existing AI-run accounting path. Missing configuration returns Thai 503; invalid/upstream output returns Thai 502. Draft throttle is 5 requests per minute.
- AI input includes the recipient's last 14 days of DAILY_UPDATE comments and their comments on assigned tasks, last 10 standups, open points, overdue count and eight Bangkok Monday-based calendar weeks of finished points. The current partial week is included; pending-review work is excluded from open points, matching Operations. `standardPoints` uses the existing shared `HEAVY_QUEUE_POINTS` value (10).
- Known firm client/contact/party names (including legacy case/intake name fields) are replaced before the existing shared `redactForAi` identifier redactor. No client/party relations or names are intentionally included in the prompt. Linked task titles returned to the UI are resolved locally.
- Save atomically writes a coaching note and recipient inbox notification, then preference-aware push. Recipient-only acknowledgement is firm scoped and returns 404 for anybody else; retries preserve the first acknowledgement/reply.
- Team summary counts are firm-wide regardless of list filters: sent this Bangkok month, all awaiting acknowledgement, and current non-EXTERNAL team members without a note in 30 days.
- Morning cron: `30 8 * * 1-5`, `Asia/Bangkok`. It excludes non-required/already-entered users, rechecks an entry inside the transaction, and atomically commits the unique user/day prompt log with the inbox notification to prevent duplicate scheduler workers. Push follows commit and respects per-category preferences; a failed recipient does not block others.
- Both categories appear in API preferences automatically from the Prisma enum and in mobile labels/types. Neither new feature has a mobile screen in this slice: `appPath` remains null and push opens the existing `/notifications` screen. Web notification paths remain `/coaching/mine` and `/my-day`.

## Endpoints

All endpoints use JwtAuthGuard + FirmRoleGuard. Manager routes require capability `runOperations` (OWNER/OFFICE_MANAGER). UUIDs, text lengths, history days, enum filters and arrays are validated with DTOs; task arrays are unique UUIDs, at most 20.

| Method | Endpoint | Access / result |
| --- | --- | --- |
| GET | /standup/today | Member; StandupToday |
| PUT | /standup/today | Member; CHECKED_IN StandupEntry |
| POST | /standup/today/skip | Member; SKIPPED StandupEntry |
| GET | /standup/members/:userId?days=6 | Manager; entries newest first within the last N calendar days (1–365) |
| POST | /coaching/draft | Manager, throttled; unsaved CoachingDraft |
| POST | /coaching | Manager; saved CoachingNoteView plus notification |
| GET | /coaching?userId=&status=pending\|acknowledged | Manager; summary and filtered notes |
| GET | /coaching/members/:userId | Manager; member notes |
| GET | /coaching/mine | Recipient; own firm notes |
| POST | /coaching/:id/acknowledge | Recipient only; CoachingNoteView |

## Migration

`apps/api/prisma/migrations/20261113210000_coaching_standup/migration.sql`

Created one migration from a saved pre-edit schema to the new schema using:

```sh
npx prisma migrate diff --from-schema-datamodel /private/tmp/coaching-standup-old-schema.prisma --to-schema-datamodel apps/api/prisma/schema.prisma --script
```

The final schema-to-schema diff was compared byte-for-byte with the migration and matched. SQL only adds the requested enum values/models/indexes/foreign keys. `npx prisma generate --schema apps/api/prisma/schema.prisma` succeeded (Prisma 6.19.3). No migration dev/deploy, shadow DB, DB connection or data modification was performed.

## Verification

Executed sequentially, with one heavy process at a time:

- `npm run build --prefix packages/shared` — PASS, shared dist rebuilt.
- `npx tsc --noEmit -p packages/shared` — PASS.
- `npx tsc --noEmit -p apps/api` — PASS (full API source/spec compile).
- From `apps/api`: `npx jest --runInBand --watchman=false src/coaching src/common/firm-refs.spec.ts src/notifications/notification-center.service.spec.ts src/notifications/assignment-notifier.service.spec.ts src/notifications/app-route.spec.ts` — PASS: **128 tests, 11 suites**.
- `git diff --check` — PASS.
- Protected-file SHA checks — PASS for shared task-operations and daily-operations service. `git diff --name-only -- apps/web packages/shared/src/task-operations.ts apps/api/src/operations/daily-operations.service.ts` is empty.

Jest coverage includes standupRequired/date boundaries, upsert/skip/state/history/suggestions/ownership, scheduler dedupe/concurrent claims/skip cases, preference-aware notifications, AI redaction/JSON failures/unknown task IDs/no business writes/stats, save notification, recipient permissions/retries, manager guard behavior, DTO limits, team summary, batch cues and existing notification behavior.

Final Jest log tail:

```text

Test Suites: 11 passed, 11 total
Tests:       128 passed, 128 total
Snapshots:   0 total
Time:        4.533 s, estimated 7 s
Ran all test suites matching src/coaching|src/common/firm-refs.spec.ts|src/notifications/notification-center.service.spec.ts|src/notifications/assignment-notifier.service.spec.ts|src/notifications/app-route.spec.ts.
```

Logs (local):
- `/private/tmp/coaching-jest.log`
- `/private/tmp/coaching-api-tsc.log` (empty; exit 0)
- `/private/tmp/coaching-shared-build.log`
- `/private/tmp/coaching-shared-tsc.log` (empty; exit 0)
- `/private/tmp/coaching-prisma-generate.log`

Verification environment: the initial worktree node_modules lacked several already-declared API dependencies. A temporary npm install was stopped when it stalled; existing installed copies from a sibling worktree were copied read-only into this worktree's ignored `apps/api/node_modules` (throttler 6.7.1, helmet 8.3.0, stripe 19.3.0, exceljs 4.4.0, MCP SDK 1.32.2, zod 4.6.7). No package.json or lockfile changed, and no sibling files were changed. Watchman was disabled because its state directory is outside the sandbox.

## Files changed

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261113210000_coaching_standup/migration.sql`
- `apps/api/src/app.module.ts`
- `apps/api/src/common/firm-refs.ts`
- `apps/api/src/common/firm-refs.spec.ts`
- `apps/api/src/notifications/notifications.module.ts`
- `apps/api/src/notifications/notification-center.service.spec.ts`
- `apps/mobile/src/api/types.ts`
- `apps/mobile/src/notification-categories.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/standup.ts`
- `packages/shared/src/standup.spec.ts`
- `packages/shared/src/coaching.ts`
- `apps/api/src/coaching/coaching-notifier.service.spec.ts`
- `apps/api/src/coaching/coaching-notifier.service.ts`
- `apps/api/src/coaching/coaching.controller.spec.ts`
- `apps/api/src/coaching/coaching.controller.ts`
- `apps/api/src/coaching/coaching.module.ts`
- `apps/api/src/coaching/coaching.service.spec.ts`
- `apps/api/src/coaching/coaching.service.ts`
- `apps/api/src/coaching/dto/coaching.dto.spec.ts`
- `apps/api/src/coaching/dto/coaching.dto.ts`
- `apps/api/src/coaching/shared-contract.spec.ts`
- `apps/api/src/coaching/standup.controller.ts`
- `apps/api/src/coaching/standup.scheduler.spec.ts`
- `apps/api/src/coaching/standup.scheduler.ts`
- `apps/api/src/coaching/standup.service.spec.ts`
- `apps/api/src/coaching/standup.service.ts`
- `docs/superpowers/reports/2026-11-13-coaching-standup-backend.md`

## Limits / not performed

- No database migration application or live database verification; no real OpenAI call, push delivery, HTTP deployment, mobile runtime or web UI verification. These require their separate runtime/integration environments.
- Push is best effort after the atomic inbox/log commit, matching existing notifier behavior. A crash after commit can leave the inbox entry without a push retry; an outbox would be needed for guaranteed retries.
- Name filtering removes names known to the firm's records; deterministic redaction cannot guarantee recognition of an unregistered name first introduced in arbitrary free text.
- No commit, PR, deployment, radar fields or protected web/shared daily-operations edits. Existing untracked contract/mockup files were left as provided.
