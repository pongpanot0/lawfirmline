# LINE Bot: Expense/Advance Flows + Assignment Notifications + Rich Menu

Completed: 2026-09-17 · Branch: `claude/grill-me-task-intake-expenses-cb2144` · Plan: `docs/superpowers/plans/2026-09-17-line-bot-expense-advance-notify.md`

## What shipped

- **AssignmentNotifierService** (`notifications/assignment-notifier.service.ts`) — central fire-and-forget LINE DM sender (`notifyAssigned`, `notifyFirmOwners`). Never fails the triggering mutation.
- **Notification hooks** (web- and LINE-originated alike):
  | เหตุการณ์ | DM หา |
  |---|---|
  | Task/Todo created for someone else / reassigned | assignee ใหม่ |
  | Task ตีกลับ (NEEDS_REVISION via reject) | คนที่ต้องแก้ |
  | Intake: คนใหม่ใน assignedUserIds (create/update) | เฉพาะคนใหม่ |
  | Case: lead ตั้ง/เปลี่ยน, buddy เพิ่ม | คนใหม่ |
  | Expense approve/paid/reject (เดี่ยว) | คนขอเบิก |
  | Claim approve/paid/reject | ผู้ส่งใบเบิก |
  | Cash advance issued | ผู้รับเงิน |
  | ส่งใบเบิก → Owner | (มีอยู่ก่อนแล้วใน `notifyOwnersOfExpenseClaim`) |
- **LINE expense flow** (`บันทึกค่าใช้จ่าย`) — mode pick (กรอกเอง / AI อ่านจากรูป), receipt photo via new webhook image handling + `LineMessagingService.getMessageContent`, AI extraction (`intelligence/receipt-extraction.service.ts`, gpt-4o vision, หัก 5 เครดิต เฉพาะเมื่ออ่านสำเร็จ, เครดิตไม่พอ → fallback กรอกเอง), case link optional. สร้าง DRAFT แล้ว submit ผ่าน claim pipeline ปกติ → เข้า queue อนุมัติ + แจ้ง Owner.
- **LINE advance flow** (`เบิกล่วงหน้า`) — Owner only (เช็คตั้งแต่ start), เลือกคน → ยอด → โน้ต → ยืนยัน → `CashAdvanceService.issue` + DM ผู้รับ.
- **My-day command** (`งานของฉันวันนี้`) — สรุป เลยกำหนด + วันนี้ (หมวดละ ≤5) + ลิงก์ /my-day. ไม่แทรกกลาง flow ที่ค้างอยู่.
- **Rich-menu commands start flows directly** — a tap with no session no longer bounces through the menu.
- **Rich menu script** `scripts/line-rich-menu.mjs` (+ spec `docs/design/line-rich-menu-spec.md`).

## Remaining ops step

1. ทำภาพเมนู 2500×1686 ตาม `docs/design/line-rich-menu-spec.md`
2. `LINE_CHANNEL_ACCESS_TOKEN=... node scripts/line-rich-menu.mjs menu.png`

## Verification

`npx jest` in apps/api: 96 suites / 632 tests pass. `tsc --noEmit` clean. Module cycles resolved with forwardRef (Tasks/Intake/Billing ↔ Notifications).
