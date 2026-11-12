# Outlook multi-account: calendar overlay + primary account — 2026-11-12

Branch `claude/multiple-outlook-accounts-ec03c3`. Decisions came from a grilling session; mockups in Stitch project "Samnuan Legal Operations Redesign".

- Primary account: `User.primaryMailboxConnectionId`. `findActiveForUser` = primary only when ACTIVE (no silent fallback). Used by new email, calendar copies, add-in, folder links, Drive. Replies go from the thread's own mailbox when it is the sender's and ACTIVE. Disconnecting the primary moves it to the oldest ACTIVE account and notifies. Backfill = the account calendar copies used before (oldest ACTIVE + syncCalendar).
- Calendar overlay: `OutlookCalendarItem` mirror filled by the existing 5-min calendarView delta (window −30d…+400d). Own copies never mirrored; iCalUId dedupe on read. Subject/location/webLink owner-only (`GET /calendar/outlook-items`, 62-day cap). Colleagues get busy ranges only: availability, `TeamRadarDay.outlookBusyMinutes`, `PersonWorkload.outlookBusy`. Rows deleted on showCalendar off and on disconnect.
- UI: settings primary badge + "ตั้งเป็นบัญชีหลัก" + per-account "แสดงนัดจากบัญชีนี้"; web calendar Outlook switch, dashed read-only cards, right-column detail card; radar grey busy bars; mobile calendar switch + bottom sheet, team-week bars.
- Gotchas: Graph returns all-day events at midnight UTC — render by UTC date. Settings page scrolls inside an inner container, so Playwright full-page shots need element screenshots. Hidden Browser pane = 0x0 viewport; use headless Playwright.
- Proof: api jest (outlook-integration, calendar, operations, mcp) 52 suites / 564 ✓, tsc api+web+mobile ✓, local Playwright click-through 13/13 ✓ (servers 3021/3026, seeded qa-* rows). Mobile not run on a simulator.
- Follow-ups: "นำเข้าเป็นนัดในคดี" button (phase 2); mobile calendar still month grid (mockup showed a week strip).
