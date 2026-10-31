# 2026-10-31 — Office operations features

Spec: `docs/superpowers/specs/2026-10-31-office-operations-design.md` · Plan: `docs/superpowers/plans/2026-10-31-office-operations.md`

## Shipped
- **Write-off / discount** on time entries and expenses; written-off time excluded from all revenue figures.
- **Auto time suggestions** from Outlook email restored (lawyer confirms); manual time entry + edit/delete; default rate.
- **Firm metrics** (`/reports`) with member targets/rates on `/team`; target prorated by days.
- **Lawyer licence tracking** (profile + team page, badges) and 08:00 reminder cron (idempotent via `LawyerLicenseReminderLog`); `{lawyerLicenseNo}` template field.
- **Closing checklist** adds unbilled time/expenses, unpaid/draft invoices; optional future-event removal (via CalendarService, removes Outlook copies); reminders skip CLOSED/ARCHIVED cases.
- **Cash advance** return / settle / reconciliation tab ("เงินทดรอง"); court receipt no. on web + mobile expense forms.
- **Paper file** check-out/in/move, QR labels (`/f/[folderId]`), checked-out list; login `?next=` local-only return path.

## Migration
`20261031120000_office_operations` (renamed from `…100000…` to sort after main's `error_log`/`daily_brief`). Additive only. Not yet applied to local DB (Docker was down) — prod applies on api boot.

## Rulings / left open
- e-Notice and e-signature dropped by user.
- LINE expense flow: no receipt-no question (flow has no category step).
- Licence lives on `User` → editable from any firm the lawyer belongs to (review M2).
- LINE time digest includes EXTERNAL members / lapsed firms (legacy behaviour, review M5).
- Future-event removal not transactional (partial removal possible on error).

## Verification
API 2495/2495, web 196/196, api/web/mobile tsc clean, migration SQL == schema diff. Browser check not done.
