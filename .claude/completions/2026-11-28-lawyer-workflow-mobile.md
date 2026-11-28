# Lawyer workflow — mobile (2026-11-28)

Follow-up to PR #272 (web + API). Approved mockup: `docs/design/2026-11-28-lawyer-workflow-mobile/index.html`.

## What changed (apps/mobile only)
- Case overview, plaintiff side: "ติดตามหลังยื่นฟ้อง" card (`CourtFollowUpsCard`) with a record-call sheet. For "ส่งหมายได้หรือยัง", choosing "ส่งหมายได้แล้ว" records the service itself (date + method incl. overseas, computed answer date) — that closes the item server-side; "ยังส่งไม่ได้" sets ask-again-in-N-days.
- Case overview, defendant side: "กำหนดยื่นคำให้การ" card (`AnswerDeadlineCard`) — file-by date, countdown, timeline, extension request sheet, court-order sheet.
- Insurance card: assured, policy type, claim amount (read-only).
- Hooks in `src/api/hooks.ts`; writes invalidate case, calendar, my-day, actions, workboard and dashboard caches.
- Expense categories need no code: they come from shared (ship with the next app update).

## Verified
Mobile tsc clean, 11/11 tests. iOS simulator (dev client + local API): plaintiff overseas service → answer follow-up 26 ม.ค. 2570 became the next appointment; defendant extension request → court order granted → deadline 28 ก.พ. 2570 / file-by 27 ก.พ.; insurance rows render. Cursor review: one cache-invalidation finding, fixed.

## Release note
JS-only change → ships by EAS update (OTA) to the current runtime; no new native build needed.
