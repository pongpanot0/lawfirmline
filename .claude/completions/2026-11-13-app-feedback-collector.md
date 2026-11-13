# App feedback collector (2026-11-13)

Spec: docs/superpowers/specs/2026-11-13-app-feedback-design.md · Mockups: docs/design/2026-11-13-app-feedback/

## What shipped
- API `apps/api/src/app-feedback`: `POST /app-feedback` (staff, multipart, 10/min) and `/platform/feedback/*` (list, summary, resolve, screenshot, pages, page comments, LINE rounds). Migration `20261113120000_app_feedback` (additive: 2 enums, 2 tables).
- LINE: survey push with quick-reply postbacks `fbk:<round>:<1-3>`; tap upserts a RATING; optional comment via an `APP_FEEDBACK` conversation step ("ข้าม" skips).
- Web: account-menu report dialog, per-page rating bar in AppShell, superadmin tabs สำนักงาน | Feedback (รายการ · สรุปรายหน้า · รอบ LINE).
- Mobile: /app-feedback screen from More, per-screen rating sheet host in the root layout.

## Decisions worth remembering
- Web superadmin has no Error Log UI, so top tabs are สำนักงาน | Feedback (mockup said Error Log | Feedback).
- No HEIC screenshots: most browsers cannot render them in the admin drawer.
- LINE recipients = users whose oldest membership is non-EXTERNAL, because the bot resolves a LINE user to that membership.
- A shown rating prompt counts as asked (90 days per page, one per day app-wide) on both web and mobile.

## Verification
- api: feedback + LINE specs 163/163, app.module boot spec 51/51, tsc clean.
- web: tsc clean, helper tests 2/2; browser click-through of every flow against the local API on 3021/3026.
- mobile: tsc clean, tests 11/11. Not run on a device/simulator.
- Cursor independent review: 1 HIGH refuted (API boots), 6 fixed, 1 left (pre-existing single-session LINE store).

## Deploy notes
No new dependencies. Migration is additive and the API migrates on boot. `PLATFORM_ADMIN_EMAILS` must already be set for the superadmin tab.
