# ความคืบหน้า — ลดขั้นตอนทำงานของทนาย

เริ่ม 8 กันยายน 2026 · branch `claude/lawyer-workflow-reduction-11c1dd`

## หมายเหตุเรื่อง baseline

Brief อ้าง `9e1c048` บน `claude/intake-document-repository` และรายงาน audit 51 routes
แต่ HEAD ปัจจุบันคือ `0acb791` ซึ่งรวม `9e1c048` ไว้แล้วและมีงานเพิ่มอีก 6 commit
ไฟล์ `ux-audit-2026-09-08.md` ไม่มีอยู่ในสาขานี้ และตอนนี้มี **54 routes**
(เพิ่ม `my-day`, `court-schedule`, `admin/holidays`, `admin/deadline-rules`)
จึงยืนยันปัญหาแต่ละข้อจาก source ที่ HEAD ก่อนแก้ทุกครั้ง

## สภาพแวดล้อมทดสอบ

พอร์ต 3005 ถูกใช้โดย dev server ของ checkout หลัก (session อื่น) จึงไม่แตะ
worktree นี้รันบน **API 3011 / web 3015** ตามที่ `.env` ของ worktree ตั้งไว้อยู่แล้ว
เพิ่ม config `api` และ `web` ใน `.claude/launch.json`

## UX-01 — ปฏิทินและบริบทคดี ✅ (โค้ดเสร็จ, รอทดสอบบน browser)

commit `d07264b`

ยืนยันปัญหาที่ HEAD:
- `cases/[id]/calendar` ส่ง `onEventClick={() => {}}` — กดนัดแล้วไม่มีอะไรเกิดขึ้น
  และไม่มีทางเพิ่มนัดจากในคดี
- ฟอร์มรวมตั้ง `caseId: cases[0]?.id` — เลือกคดีแรกของรายการให้เอง
- `d.setHours(9,0,0,0)` แล้ว `toISOString().slice(0,16)` — ที่กรุงเทพฯ แสดง 02:00
  และนัดช่วงค่ำเลื่อนไปวันก่อนหน้า
- `GET/PATCH/DELETE /calendar/events/:id` ไม่มี case filter — id ข้ามสำนักงานอ่านและแก้ได้

แก้:
- `lib/bangkok.ts` เพิ่ม `bangkokInputValue` / `bangkokInputToIso` (+ date-only)
  พร้อมเทสต์ round-trip และเคสข้ามวัน — ใช้ offset คงที่ +07:00 ตามที่ฝั่ง API ทำไว้
- `components/calendar/CalendarEventDialog.tsx` เป็นฟอร์มร่วม เพิ่ม/ดู/แก้/ลบ
  - ในคดี: ไม่มี dropdown เลือกคดี, court เติมจากคดี
  - นอกคดี: ไม่เลือกคดีให้เอง
  - save ล้มเหลว → ข้อความ error ใต้ฟอร์ม ค่าที่กรอกยังอยู่ กดซ้ำได้
  - สร้างสำเร็จแล้วเก็บ `savedId` — กดซ้ำเป็น "แก้ไข" ไม่ใช่สร้างใหม่
  - คำนวณค่าเดินทางล้มเหลวไม่ทำให้นัดหาย
- `CalendarView` เลขวันเป็น `<button>` มี aria-label — ใช้คีย์บอร์ดได้
- ทั้งสองหน้ามี loading / error + ปุ่มลองใหม่ แยกจาก empty
- API: `findOne/update/remove/create` ตรวจ `canAccessCase`; service ภายในที่ตรวจสิทธิ์เองแล้ว
  ใช้ `createInternal` / `updateInternal` / `findOneInternal`

ทดสอบ: `pnpm --filter api test` 369/369 ผ่าน (เพิ่ม `calendar.service.spec.ts` 7 เคส),
`pnpm --filter web test` 18/18 ผ่าน (เพิ่ม 5 เคส), tsc ทั้งสอง app ผ่าน

ยังไม่ได้ทำ: ทดสอบบน browser (รอ login)

## ที่ยังค้าง

- ทดสอบ UX-01 บนเบราว์เซอร์: บันทึก 09:00 แล้วเปิดกลับมาต้องเป็น 09:00, นัดใกล้เที่ยงคืน,
  เพิ่มนัดจากในคดี, retry ไม่สร้างซ้ำ, keyboard/Escape, 375px
- UX-02 ถึง UX-09
