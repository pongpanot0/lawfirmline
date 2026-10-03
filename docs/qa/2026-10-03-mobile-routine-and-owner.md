# Mobile routine and Owner assignment

Implemented in the current worktree. The existing theme, five tabs and role hierarchy remain the entry points.

## Behavior

- Owner can compare outstanding work, overdue work, today's work/completions, acceptance, review queues, worker reports with timestamps, blockers, appointments and approved leave before assigning. Reports missing on the selected Bangkok date and an empty recorded queue never imply availability. Assignment and reassignment refresh the selected date's data before confirmation.
- Opening a task shows the work and its next action. Additional metadata stays behind the existing editor. A general task starts with a title and the current worker; case, date, files and review remain optional.
- Office-authored routine steps have instructions, expected output, source guidance, example filename, required attachment type and checks. Owner/Senior configures these on the existing SOP editor. New tasks copy the published version; updating the office SOP does not silently change work already assigned. Existing general tasks are not converted into guessed routines.
- The worker acknowledges the assignment, records checks, uploads results and reports progress/blockers in the task. Unsaved files/messages/reports must be saved before handing off or closing work. Partial upload retry retains the saved task and only retries remaining files.
- Routine handoff and acceptance require persisted checks, required attachments and resolved blockers/holds/dependencies. A different reviewer inspects the actual result. A PDF attachment and checked boxes do not establish document quality.
- Returning work records the reason and resets the checks. The original worker can follow their submitted task after handoff without gaining access to unrelated tasks in the same case.
- Creation retries reuse the original request and server creation key; concurrent repeats create one task. Review, company tenancy and Owner daily visibility are enforced by the API.

## Verification

Local API: `http://127.0.0.1:3001`; local database: `localhost:5432/lawfirm_ui_20261002`.

```sh
pnpm --filter @lawfirm/shared build
pnpm --filter api exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
pnpm --filter @lawfirm/mobile typecheck
node apps/mobile/scripts/check-court-workflow.cjs
node apps/mobile/scripts/check-routine-workflow.cjs
pnpm --filter web exec node --test --experimental-strip-types src/lib/daily-workboard.test.ts
pnpm --filter api test -- --runInBand --watchman=false tasks.service.spec.ts tasks.service.detail.spec.ts task-detail.service.spec.ts practice-setup.service.spec.ts daily-operations.service.spec.ts case-access.service.spec.ts
E2E_API_URL=http://127.0.0.1:3001 pnpm exec playwright test --project=mobile-routine
pnpm --filter @lawfirm/mobile exec expo export --platform ios --platform android --output-dir /private/tmp/lawfirm-mobile-routine-export-final
git diff --check
```

Typechecks, helper checks, four web workload checks, seven API regression suites (111 tests), the API integration journey and iOS/Android exports passed. The integration journey uses four roles and actual local persistence/file upload; it checks immutable versions, repeated SOP application, unacknowledged/foreign progress denial, stale checks (409), incomplete results, Owner-only daily access, blocker clearing, case and standalone review/revision, delivered-task scope, concurrent creation retries and staged routine subtasks. Fixtures are cleaned after the journey.

Two migrations were applied to this local database only: `20261002160000_task_routine` and `20261002170000_task_creation_key`. No remote migration, deployment, commit or push was performed.

iOS/Android Hermes exports are bundle verification. Native screen interaction, camera/file permissions, large fonts, keyboard behavior, push delivery and physical-device E2E remain unverified. The localhost3018 prototype is separate from the native app and contains simulated data.
