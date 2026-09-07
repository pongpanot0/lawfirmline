# วันของฉัน + LINE digest + Deadline engine + เตือนตารางชน

วันที่: 2026-09-07 · branch `claude/ai-medical-case-analysis-628f91`

## ที่มา
ทนายต้องเปิด 4–5 หน้าเพื่อตอบคำถาม "พรุ่งนี้มีงานอะไร" — ข้อมูลมีครบใน DB
แต่ไม่มีอะไรรวม `CalendarEvent` กับ `Task` เข้าด้วยกัน

## สิ่งที่ทำ

### แกนกลาง
- `apps/api/src/common/utils/bangkok-time.ts` — helper ที่ปักหมุด Asia/Bangkok
  (ไทยเป็น UTC+7 คงที่ ไม่มี DST) แก้ปัญหาเส้นแบ่งวันขึ้นกับ timezone ของ server
- `apps/api/src/agenda/agenda.service.ts` — `AgendaService` รวม event + task
  เป็น `AgendaItem` เดียว จัดกลุ่ม เลยกำหนด/วันนี้/พรุ่งนี้/วันถัดไป

### P0 — วันของฉัน
- `GET /agenda/my-day`, `GET /agenda?from&to`
- หน้า `/my-day` + เมนู sidebar + i18n ไทย/อังกฤษ
- index ใหม่: `CalendarEvent.startAt`, `Task.dueDate`, `Task(assigneeId,status,dueDate)`

### P1 — LINE digest รายวัน
- `DailyDigestScheduler` cron `0 18 * * *` timeZone `Asia/Bangkok`
  ส่งงานพรุ่งนี้ให้เจ้าของงานรายคน ไม่ส่งถ้าไม่มีงาน กันส่งซ้ำด้วย `DailyDigestLog`
- แก้ `ReminderScheduler` ที่เดิมโหลดนัดในอนาคตทั้งระบบทุก 10 นาที → จำกัด 30 วัน

### P2 — Deadline engine
- `DeadlineRule` (firm + ประเภทคดี + เหตุตั้งต้น + จำนวนวัน + วิธีนับ)
- นับวันแบบ CALENDAR / BUSINESS, ตกวันหยุด-เสาร์อาทิตย์เลื่อนเป็นวันทำการถัดไป
- ผลลัพธ์ลง `DocumentDateSuggestion` (source=RULE) ให้ทนายยืนยัน ไม่ลงปฏิทินเอง
- หน้า `/admin/deadline-rules` (owner only), endpoint `POST /cases/:id/deadlines/apply`
- firm ใหม่ได้กฎเริ่มต้น 4 ข้อจาก `provisionDefaults`

### P3 — เตือนตารางชน + เวลาเดินทาง
- ตรวจเวลาซ้อน และเวลาเดินทางระหว่างสถานที่ไม่พอ
- `departBy` บอกเวลาที่ต้องออกจากสำนักงานสำหรับนัดแรกของวัน

## การตรวจสอบ
- unit: 299 ผ่าน (49 suites) รวม `app.module.spec.ts` ที่พิสูจน์ว่าไม่มี DI cycle
- migration: apply กับ Postgres จริง แล้ว `prisma migrate diff` = No difference
- E2E ด้วยมือ: boot API + web จริง ทดสอบ `/my-day`, สร้าง/ปิด/ลบกฎ,
  apply trigger แล้วได้ suggestion 2026-10-05 (2026-10-04 ตรงวันอาทิตย์ → เลื่อน)

## ค้างไว้
- ตาราง `PublicHoliday` ยังว่าง — BUSINESS นับข้ามเฉพาะเสาร์อาทิตย์
  จนกว่าจะใส่วันหยุดราชการ (ยังไม่มี UI/endpoint)
- ค่า offset ของกฎเริ่มต้นต้องให้ทนายตรวจก่อนใช้จริง
