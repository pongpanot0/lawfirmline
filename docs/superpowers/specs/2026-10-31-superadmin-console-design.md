# Superadmin console — UI spec (for Codex)

**Status:** backend done on branch `claude/admin-page-owner-442b40`. This doc is the full UI brief.
**Owner of the UI work:** Codex. Do not change API shapes. If the UI needs something the API lacks, list it under "API gaps" in the PR description and don't invent client-side substitutes.

## 1. What this is

Samnuan is a multi-firm SaaS. The **superadmin** is the person who built and runs the program, not a firm owner. They need their own console, separate from every firm's workspace, to:

1. see every firm and its subscription, usage and members, and fix a subscription by hand;
2. maintain **master data** that every firm shares (courts, public holidays, statutory deadline rules, built-in document templates);
3. read the **error log** collected from the API, background jobs and the browser, and mark errors resolved.

Access = the signed-in user's email is listed in the API env `PLATFORM_ADMIN_EMAILS`. The web reads it as `user.isPlatformAdmin` (on `AuthUser` from `/auth/me` and login). Every `/platform/*` endpoint also checks this on the server (403 otherwise).

## 2. Ground rules

- Route root: **`/superadmin`** (`apps/web/src/app/superadmin/`). It sits outside `(dashboard)`. **No firm sidebar, no firm AppShell, no TrialBanner.**
- A shell already exists: [layout.tsx](../../../apps/web/src/app/superadmin/layout.tsx) handles loading, redirects to `/login` when signed out, blocks when `!isPlatformAdmin`, and draws a header. Extend it with the navigation below. Keep those three guards.
- A first version of the firms page exists: [page.tsx](../../../apps/web/src/app/superadmin/page.tsx). Redesign and split it freely. Its save logic (send only changed fields; dates are the **end** of the chosen Bangkok day) must stay.
- Visual system: follow [design.md](../../../design.md) and [tokens.css](../../../tokens.css): paper/navy, hairlines, 8px controls, 44px targets, status always has text. This is a **Workbench** surface: dense, tables on desktop, record rows on phones. Give it a small "Superadmin" identity in the header so it never gets mistaken for a firm's app.
- Reuse `apps/web/src/components/ui/*` (Card, Badge variants `success | warning | destructive | muted | outline`, Button, `TextField`/`SelectField`/`DateField`, `SideDrawer`, `LoadFailed`, `EmptyState`, `Skeleton`) and `PageHeader`.
- UI copy is Thai. Keep technical tokens (status enums, HTTP codes, paths, stack traces) as-is in monospace.
- Dates: show in Bangkok time via `formatDate` / `formatDateTime` (`@/lib/utils`). Date inputs go through `bangkokDateInputValue` (`@/lib/bangkok`).
- All API calls go through `api.*` in `apps/web/src/lib/api.ts` (`request()` adds the token and refreshes it). Add new methods and types there next to the existing `getPlatform*` ones.
- Every list has loading, empty and error (with retry) states. Every mutation shows pending, error and success feedback. Destructive actions need a confirm step.

## 3. Information architecture

Left nav on desktop (collapses to a top menu/drawer on phones):

| Nav label | Route | Purpose |
|---|---|---|
| ภาพรวม | `/superadmin` | Dashboard: KPIs + error summary + latest signups |
| สำนักงาน | `/superadmin/firms` | All firms, search, filter by status |
| (detail) | `/superadmin/firms/[id]` | One firm: subscription editor, members, usage, billing, activity, errors |
| ข้อมูลกลาง › ศาล | `/superadmin/master/courts` | Court registry |
| ข้อมูลกลาง › วันหยุดราชการ | `/superadmin/master/holidays` | Public holidays per year |
| ข้อมูลกลาง › กฎวันครบกำหนด | `/superadmin/master/deadline-rules` | Global (statutory) deadline rules only |
| ข้อมูลกลาง › เทมเพลตเอกสาร | `/superadmin/master/document-templates` | Built-in templates |
| Error logs | `/superadmin/errors` | Error log list + detail |

The header shows the signed-in email, a link **"กลับไปที่สำนักงาน"** to `/dashboard`, and logout. The nav item "Error logs" shows a count badge with `summary.open` when it is above 0.

## 4. Pages

### 4.1 ภาพรวม `/superadmin`

Data: `GET /platform/overview`, `GET /platform/error-logs/summary`, `GET /platform/firms` (first 5 = latest signups).

- KPI row: total firms (sum of `firmsByStatus`), ACTIVE, TRIAL, PAST_DUE + EXPIRED (warning tone when > 0), new firms in 30 days, total users, revenue in 30 days (THB, `toLocaleString('th-TH')`). Revenue = paid `BillingInvoice` amounts, **not** MRR. Label it "รายรับ 30 วัน".
- Error panel: open errors count, plus last-24h counts per source (`api`, `server`, `web`). Clicking goes to `/superadmin/errors?status=open`.
- "สมัครล่าสุด": the 5 newest firms (name, owner email, status badge, created date), each linking to the firm detail.

### 4.2 สำนักงาน `/superadmin/firms`

Data: `GET /platform/firms?q=` (server search over name, slug and member email, newest first, max 200).

- Search box (debounced about 250ms, `q` kept in the URL). Status filter chips: all / TRIAL / ACTIVE / PAST_DUE / CANCELED / EXPIRED. Filter on the client.
- Desktop table columns: name + slug, owner email, status badge, plan, members `memberCount/maxUsers` (warning when at the limit), cases, trial end (only when TRIAL), period end, created. Add a "Stripe" badge when `stripeManaged`. A row click opens the detail page.
- Phone: record rows with name, status, owner and members.

Status labels and tones: TRIAL ทดลองใช้ (warning), ACTIVE ใช้งาน (success), PAST_DUE ค้างชำระ (destructive), CANCELED ยกเลิก (muted), EXPIRED หมดอายุ (destructive).

### 4.3 Firm detail `/superadmin/firms/[id]`

Data: `GET /platform/firms/:id` (one call; shape in §5). Save: `PATCH /platform/firms/:id`.

Sections (tabs or stacked cards):

1. **Header:** name, slug, status + plan badges, Stripe badge, created date, Stripe customer id in monospace when present.
2. **Subscription editor:** the fields from the current drawer (status, plan, maxUsers 1–1000, trial end, period end with "empty = never expires"). Send only changed fields. When `stripeManaged`, show the notice "Stripe webhook อาจเขียนทับสถานะ/แพ็กเกจเมื่อมีรอบบิลใหม่". Show inline help:
   - "ต่อทดลองใช้" = status TRIAL + new trial end.
   - "เปิดใช้แบบโอนเงิน" = status ACTIVE + plan + period end.
   - Setting EXPIRED/CANCELED on a firm with one member makes the system move it to FREE on its next request. This is expected; say so.
3. **Usage:** cases, clients, intakes, documents, pending invitations, AI runs (30d), AI tokens (30d).
4. **Members:** name, email, role badge, MFA on/off, last seen (`lastSeenAt`, "ไม่เคยเข้าใช้" when null), joined.
5. **Billing history:** last 12 `billingInvoices` (number, plan, period, amount + currency, status, paid at).
6. **Recent activity:** last 30 `auditLogs` (action in monospace, who, when, collapsible metadata JSON). Platform edits show as `PLATFORM_FIRM_UPDATED` with `metadata.by`, `from` and `to`. Render that diff readably.
7. **Errors:** `openErrors` count with a link to `/superadmin/errors?firmId=<id>&status=open`.

404 → "ไม่พบสำนักงาน" plus a back link.

### 4.4 Master data

All four pages share one layout: PageHeader, a primary "เพิ่ม…" action, a list, and edit/delete per row. Copy in each PageHeader: "ข้อมูลนี้ใช้ร่วมกันทุกสำนักงาน — แก้แล้วมีผลทันทีกับทุกที่". Deletes need a confirm.

**Courts** (`/courts`, already platform-guarded for writes):
- `GET /courts?activeOnly=false` returns `CourtItem[] { id, name, address?, isActive }`.
- `POST /courts {name, address?}`; `PATCH /courts/:id {name?, address?, isActive?}`; `DELETE /courts/:id`.
- About 300 rows: needs a search box and an active/inactive filter. Prefer deactivating (isActive toggle) over deleting; the delete confirm should say cases may reference the court.
- Existing client methods: `api.getCourts`, `createCourt`, `updateCourt` (add `deleteCourt` if missing).

**Public holidays** (`/public-holidays`):
- `GET /public-holidays?year=YYYY` returns `PublicHolidayItem[]`.
- `POST /public-holidays {date, name}` adds one; `PUT /public-holidays {year, holidays:[{date,name}]}` replaces a whole year; `DELETE /public-holidays/:id`.
- Year switcher. Show a warning when a year has fewer than 19 holidays, because the deadline calculator flags such years.
- "แทนที่ทั้งปี" takes pasted rows (`YYYY-MM-DD ชื่อวันหยุด`, one per line) with a preview and confirm.
- Existing client methods: `getPublicHolidays`, `addPublicHoliday`, `deletePublicHoliday`, plus the replace-year method near line 2240 of api.ts.

**Deadline rules — global only** (`/deadline-rules`):
- `GET /deadline-rules` returns global rules and the caller's own firm rules. **Show only `firmId === null`.**
- Create with `POST /deadline-rules {...fields, global: true}`.
- `PATCH /deadline-rules/:id` takes `offsetDays`, `dayBasis`, `isActive` and the filter fields. **The label is not editable**, because it is the key firm overrides match on. Explain this in the UI.
- `DELETE /deadline-rules/:id`.
- Reuse the form and field helpers from `apps/web/src/app/(dashboard)/admin/deadline-rules/page.tsx` and `apps/web/src/lib/deadline-rules.ts`. Do not duplicate them.

**Built-in document templates** (new, `/platform/document-templates`):
- `GET` returns `{ id, firmId: null, name, description, templateBody, caseTypeId: null, createdAt }[]`.
- `POST {name, description?, templateBody}`; `PATCH /:id {name?, description?, templateBody?}`; `DELETE /:id`.
- Editor: name, description, and a monospace textarea for `templateBody` (up to 100k chars). Show a side list of the variables the renderer fills: `ownRef, caseNumber, customerRef, clientName, courtName, folderId, title, caseType, date, blackCaseNumber, redCaseNumber, plaintiffNames, defendantNames, trialCourtName, trialBlackCaseNumber, trialRedCaseNumber, appealBlackCaseNumber, appealRedCaseNumber, supremeBlackCaseNumber, supremeRedCaseNumber, lawyerName, nextHearingDate, nextHearingTime, nextHearingCourt`, written as `{{name}}`.
- Built-ins have no case type (case types belong to each firm).

### 4.5 Error logs `/superadmin/errors`

Data: `GET /platform/error-logs` (query in §5), `GET /platform/error-logs/:id`, `PATCH /platform/error-logs/resolve`.

- Filters, kept in the URL: status (open by default / resolved / all), source (all / api / server / web), search `q` (message, path, context), `firmId` (set from a firm link; show it as a removable chip with the firm name).
- List rows: time, source badge (api = destructive, server = warning, web = outline), status code if any, `context`, message (one line, truncated), `method path` in monospace, resolved marker. Load more with `nextCursor`. Show `total`.
- Checkbox multi-select with "ทำเครื่องหมายว่าแก้แล้ว" / "เปิดใหม่" acting on the selection (`ids` up to 500).
- Detail (drawer or split pane): full message, stack in a scrollable `<pre>` with a copy button, method/path/status, firm (name + slug, link to firm detail), user (name + email), user agent, created, and resolved at/by. Resolve/reopen button.
- The list response omits `stack`; fetch the detail on open.
- Empty state for "open": "ยังไม่มี error ที่ต้องดู".

## 5. API reference (implemented)

All endpoints require a superadmin bearer token unless noted. Errors return `{ statusCode, message }`; show `message`.

```ts
// GET /platform/overview
{ firmsByStatus: Partial<Record<'TRIAL'|'ACTIVE'|'PAST_DUE'|'CANCELED'|'EXPIRED', number>>;
  newFirms30d: number; users: number; revenue30d: number /* THB */ }

// GET /platform/firms?q=        (already typed as PlatformFirm[] in api.ts)
// GET /platform/firms/:id/members  -> PlatformFirmMember[] (now also mfaEnabled, lastSeenAt)

// GET /platform/firms/:id
{ firm: { id; name; slug; subscriptionStatus; subscriptionPlan: Plan|null; trialStartAt; trialEndAt;
          currentPeriodEnd: string|null; trialReminderSentDays: number|null; maxUsers; officeAddress;
          ownRefPrefix; slaConfig: unknown; createdAt; updatedAt; stripeManaged: boolean; stripeCustomerId: string|null };
  members: { id; email; firstName; lastName; mfaEnabled: boolean; role: FirmRole; createdAt; lastSeenAt: string|null }[];
  usage: { cases; clients; intakes; documents; pendingInvitations; aiRuns30d; aiTokens30d };
  billingInvoices: { id; invoiceNumber; plan; billingPeriod: 'MONTHLY'|'YEARLY'; amount; currency; status: 'PENDING'|'PAID'|'FAILED'; paidAt: string|null; createdAt }[];
  auditLogs: { id; action; metadata: unknown; createdAt; user: { email; firstName; lastName } | null }[];
  openErrors: number }

// PATCH /platform/firms/:id   (all optional; send only changes)
{ subscriptionStatus?; subscriptionPlan?; maxUsers?: 1..1000; trialEndAt?: ISO; currentPeriodEnd?: ISO | null }

// GET /platform/error-logs?status=open|resolved&source=api|server|web&q=&firmId=<uuid>&cursor=<id>&limit=1..200(50)
{ items: ErrorLogRow[]; total: number; nextCursor: string | null }
type ErrorLogRow = { id; source: 'api'|'server'|'web'; message; context: string|null; method: string|null;
  path: string|null; statusCode: number|null; userId: string|null; firmId: string|null; userAgent: string|null;
  resolvedAt: string|null; resolvedBy: string|null /* email */; createdAt }
// GET /platform/error-logs/:id -> ErrorLogRow & { stack: string|null; firm: {name; slug}|null; user: {email; firstName; lastName}|null }
// GET /platform/error-logs/summary -> { open: number; last24h: Partial<Record<'api'|'server'|'web', number>> }
// PATCH /platform/error-logs/resolve { ids: uuid[] (1..500); resolved: boolean } -> { updated: number }

// /platform/document-templates  GET | POST | PATCH /:id | DELETE /:id  (see §4.4)

// POST /client-errors   (PUBLIC, 20/min per IP) — used by the web reporter in §6
{ message: string (≤2000); stack?: string (≤8000); url?: string (≤500); kind?: 'error'|'unhandledrejection'|'boundary' }
```

Sources: `api` is any HTTP 5xx (with request, user and firm); `server` is any `Logger.error` (cron, mail, integrations); `web` is the browser. Rows older than 90 days are purged nightly.

## 6. Web error reporting (also Codex)

The browser source only fills up once the web app reports errors. Add:

- `apps/web/src/lib/report-client-error.ts`: `reportClientError({message, stack, url, kind})` posts to `${API_URL}/client-errors` with `fetch(..., { keepalive: true })` and swallows its own failures. Dedupe identical messages for 60s in memory and cap at 10 reports per page load. Use `location.pathname` as `url` (no query string, which can carry tokens or personal data).
- A `ClientErrorReporter` client component in the root `app/layout.tsx` that listens to `window` `error` and `unhandledrejection`.
- `app/global-error.tsx` and `app/(dashboard)/error.tsx` (Next error boundaries) that report with `kind: 'boundary'` and show a friendly Thai retry screen in the design system.
- Skip reporting in `next dev` unless `NEXT_PUBLIC_REPORT_DEV_ERRORS=1`.

## 7. Clean-up in the firm app

- Firm Settings → สำนักงาน currently links to `/admin/holidays` and `/admin/courts` (owner-gated, but only a superadmin can actually save). Remove both links from `OFFICE_LINKS` in `app/(dashboard)/settings/page.tsx`, delete those two pages, and drop their entries in `components/onboarding/page-tour-steps.ts`.
- `/admin/deadline-rules` stays for firms (firm rules + overrides). Remove its platform-admin-only controls for global rules (`isPlatformAdmin` branches) now that they live in the console.

## 8. Acceptance

- [ ] Signed out → `/superadmin` redirects to `/login`. A non-superadmin sees the block message, and no `/platform/*` data loads.
- [ ] Every page in §3 works at 375px and desktop, in light and dark, with loading/empty/error states.
- [ ] Firm edit sends only changed fields. Extending a trial to date D keeps the firm usable through the end of D (Bangkok). The audit tab shows the change.
- [ ] Master data CRUD works for all four types. The deadline-rules page never shows firm rules. The label is read-only on edit.
- [ ] Throwing in a page shows the boundary screen, and a `web` row appears in Error logs within seconds. Resolve/reopen works for one or many.
- [ ] Courts/holidays links are gone from firm Settings. `pnpm --filter web exec tsc --noEmit` and the web tests pass.

## Out of scope (not built, don't fake)

Plan prices and limits (in code: `PLAN_CONFIG` in `packages/shared`), impersonating a firm user, deleting a firm, emailing firms, error grouping/alerts, charts beyond plain numbers.
