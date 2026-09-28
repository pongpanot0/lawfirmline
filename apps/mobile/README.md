# Samnuan Mobile

Expo / React Native app for working from the phone at court.

## Run

From this checkout:

```bash
pnpm install --frozen-lockfile
pnpm --filter @lawfirm/shared build
cd apps/mobile
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3001 pnpm start
```

This project uses Expo SDK 56. Use an SDK 56 compatible Expo Go or a development build.
The installed simulator's Expo Go 54 cannot run this app. The API defaults to
`https://api.samnuan.com`; explicitly set a local API for development.

## Court workflow and roles

Home starts with today's appointments and shows the primary lawyer and companions.
Owner sees office appointments, manpower and pending/approved expense batches.
Manpower includes assistants, today's appointments and approved/pending leave.
Task counts describe workload; they do not confirm somebody is available.

Lawyer and Owner can change one appointment's team from Home, Calendar, Case or
Court Day. The first selected person is primary; up to nine companions can be
added or removed. Removing a companion only updates that appointment.
All candidates come from the authenticated firm's names-only `GET /users/members`.
Assistants can view the team.

Court Day has three phases: prepare, short capture at court, finish at the office.
Checklist, selected document versions and notes persist in a user/firm scoped
local draft. Saving a server draft does not record the final outcome.
Explicit review and confirmation records the outcome and the selected next
hearing/follow-up task/unsent client report draft. Server versions protect against
overwriting another person's hearing draft. Document downloads need connectivity.

All roles can capture expenses and request leave. Expense category uses
`EXPENSE_CATEGORIES` from the shared package; Other requires a description.
Receipt photos are copied to the app's documents directory. A partial expense can
stay in the local draft list without an amount; uploading requires a valid positive
amount and creates DRAFT, never an implicit claim.
Select completed expense drafts to submit one actual batch. Submitted batches
are shown using `/expense-claims`, never inferred from dates or claimant names.

Owner reviews each batch's claimant, items, categories, cases, amounts and receipts,
then approves/rejects the whole batch or marks an approved batch paid.
Server status transitions and petty cash deductions now run in the same transaction,
with a conditional status update preventing duplicate approval/payment.
Petty cash deductions also check the remaining balance atomically.
Legacy single-item approvals use the same transaction protection.

Leave uses the existing SICK/PERSONAL/VACATION contract. Select a start date and an
optional end date. Sick leave and Owner requests are recorded approved by the
existing API; other requests wait for approval. No unsupported reason field is sent.
There is no time-entry screen or time-entry shortcut.

Query caches and drafts are separated by user and firm. Local drafts are retained
when requests fail. Approval/payment and final hearing confirmation are never
queued to execute automatically. Restoring an auth session still needs connectivity;
this is not a guarantee of fully offline cold start.

## Verification

```bash
pnpm --filter @lawfirm/mobile typecheck
node apps/mobile/scripts/check-court-workflow.cjs
pnpm --filter api exec tsc --noEmit --incremental false
pnpm --filter api exec jest --config jest.config.js --runInBand users.members.spec.ts dashboard.service.spec.ts court-day.service.spec.ts expense-draft.spec.ts petty-cash.service.spec.ts billing.notify.spec.ts
pnpm --filter @lawfirm/mobile exec expo export --platform ios --platform android --output-dir /tmp/lawfirm-mobile-court-export --max-workers 2
```

Checked locally: mobile/API types, focused financial/team/court tests and native
iOS/Android JavaScript bundles. The mobile checks exercise category/amount validation,
allowed batch actions, Bangkok dates, account draft isolation, ordered draft writes
and the actual multipart upload contract. Backend tests use mocked storage, not a
production API or production database. No device interaction, receipt camera flow,
production mutation, release or app installation is claimed by these checks.
