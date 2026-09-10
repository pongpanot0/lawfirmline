# ความคืบหน้า: Email Intake, Word Review, Pre-Litigation Workspace

วันที่: 9 กันยายน 2026
อ้างอิง brief: `docs/claude-implementation-brief-email-intake-review-flow-2026-09-09.md`

สถานะโดยรวม: **backend และ UI ของทั้ง 2 ฟีเจอร์หลัก (email intake + document review rounds) ทำงานจริงและทดสอบผ่าน browser จริงครบทั้งคู่แล้ว** (อัปเดตล่าสุด: เพิ่มหน้า Document Review เสร็จ)

## สิ่งที่ทำเสร็จและเข้าใช้งานได้จริง

### 1. Data model (Prisma migration จริง ใช้กับฐานข้อมูลจริงแล้ว)

Migration: `apps/api/prisma/migrations/20260909051707_email_intake_and_review_rounds/` และ
`apps/api/prisma/migrations/20260909051800_intake_contact_and_response_date/`

- `EmailThread`, `EmailMessage`, `EmailAttachment` — เก็บอีเมลต้นทางแบบ mock provider (ยังไม่เชื่อม Outlook/Gmail จริง)
- `IntakeFieldProposal` — เก็บข้อมูลที่ระบบเสนอต่อ field พร้อม source, สถานะ (SUGGESTED/REQUIRES_CONFIRMATION/CONFIRMED/REJECTED/CONFLICT), ผู้ยืนยัน, เวลา
- `Intake.contactName`, `Intake.requestedResponseDate` — เพิ่มใหม่ แยกจาก `Intake.deadlineDate` (กำหนดตามกฎหมาย) ตามข้อกำหนดของ brief
- `DocumentVersion.status/notes/contentHash/createdById` — เพิ่มสถานะ DRAFT/WAITING_REVIEW/RETURNED_FOR_CHANGES/APPROVED/SUPERSEDED
- `ReviewRound`, `ReviewDecision` — รอบตรวจผูกกับ document version ตรง ๆ, ผู้ตรวจ/ผู้แก้เป็น array ของ userId, กติกาอนุมัติ ALL/ANY_ONE

Migration รันจริงกับ dev Postgres ที่ใช้ร่วมกันหลาย worktree แล้ว (`docker exec lawfirm-postgres`, port 5433) โดยใช้ `prisma migrate deploy` ไม่ใช้ `reset` เพื่อไม่ให้ข้อมูลของ session อื่นหาย

### 2. Backend API (NestJS) — ผ่าน unit test ทั้งหมดแล้ว

**`apps/api/src/email-intake/`**
- `GET /email-intake/threads` — คิวอีเมล พร้อม excerpt, จำนวนไฟล์แนบ, สถานะ
- `GET /email-intake/threads/:threadId` — รายละเอียด thread + proposals
- `POST /email-intake/threads/:threadId/accept` — สร้าง/จับคู่ Intake จาก thread, ดึงข้อมูลลูกค้าเดิมมาเสนอถ้าชื่อตรงกันแบบไม่กำกวม, idempotent (กดซ้ำไม่สร้างเรื่องซ้ำ)
- `POST /email-intake/threads/:threadId/mock-reply` — จำลอง reply เข้า thread เดิม สร้าง field proposal ใหม่โดยไม่เขียนทับค่าที่ยืนยันแล้ว
- `POST /email-intake/intakes/:intakeId/field-proposals/:proposalId` — ยืนยัน/ไม่ใช้ข้อมูลที่เสนอ, เขียนค่าลง Intake เมื่อยืนยัน

**`apps/api/src/intake/intake.service.ts`** (แก้ของเดิม)
- `assess()` (ปุ่ม "ยืนยันข้อมูลและรับเข้าพิจารณา") ถูกกันไว้: ถ้ายังมี field proposal สถานะ REQUIRES_CONFIRMATION จะ throw 400
- `update()`: แก้ `estimatedDamage` หรือ `requestedResponseDate` จะ reset สถานะ proposal ที่เคยยืนยันแล้วของ field นั้นกลับเป็น REQUIRES_CONFIRMATION

**`apps/api/src/document-review/`**
- `GET .../review-rounds/eligible-members` — เฉพาะสมาชิกที่มีสิทธิ์ในคดี (owner, lead lawyer, case assignment) — **แก้ security bug ระหว่างพัฒนา**: เดิม endpoint นี้เคย return `passwordHash` ติดมาด้วย แก้แล้วด้วย explicit select
- `POST .../review-rounds` — เปิดรอบตรวจ ผูกกับ document version ที่ระบุ, ตรวจว่า reviewer/editor ทุกคนมีสิทธิ์ในคดีจริง, version ที่ APPROVED แล้วเปิดรอบซ้ำไม่ได้
- `POST .../review-rounds/:roundId/decision` — approve/return
  - reviewer ต้องอยู่ในรายชื่อของรอบ
  - return ต้องมี reason
  - decision ต้องอ้าง `reviewedDocumentVersionId` ตรงกับเวอร์ชันปัจจุบันของรอบ — ถ้าไม่ตรง (มีคนอัปโหลดฉบับใหม่ระหว่างเปิดหน้าอยู่) จะ throw 400 พร้อมข้อความให้เปิดฉบับล่าสุด
  - reviewer คนเดิม approve/return ซ้ำ = idempotent (คืนสถานะปัจจุบัน ไม่สร้างซ้ำ ไม่ error) แม้รอบจะปิดไปแล้วก็ตาม
  - เมื่อผู้ตรวจครบตามกติกา (ALL/ANY_ONE) → round และ document version เปลี่ยนเป็น APPROVED
  - return → round เป็น RETURNED, version เป็น RETURNED_FOR_CHANGES

**`apps/api/src/documents/documents.service.ts`** (แก้ของเดิม)
- อัปโหลดเวอร์ชันใหม่ → เวอร์ชันเดิมที่เคย APPROVED จะกลาย SUPERSEDED อัตโนมัติ (approval เดิมใช้ต่อกับฉบับใหม่ไม่ได้)
- บันทึก `createdById` ทุกเวอร์ชันที่สร้าง (เดิมไม่มี)
- `uploadVersion` endpoint รับ `notes` (หมายเหตุการแก้ไข) เพิ่ม

### 3. Frontend (Next.js) — ทดสอบผ่าน browser จริงแล้ว

- `/email-intake` — คิวอีเมลรอรับเรื่อง (ใหม่)
- `/email-intake/[threadId]` — หน้า split view: อีเมลต้นทางซ้าย / ข้อมูลที่เตรียมให้ขวา พร้อม badge แหล่งที่มา, ปุ่มยืนยัน/แก้ไขก่อนยืนยัน/ไม่ใช้ข้อมูลนี้ต่อ field, ปุ่มหลัก "ยืนยันข้อมูลและรับเข้าพิจารณา" (disabled จนกว่าจะยืนยันครบ), กล่อง "จำลองอีเมลตอบกลับ" สำหรับทดสอบ reply-thread โดยยังไม่เชื่อมกล่องเมลจริง
- เพิ่มเมนู "รับเรื่องจากอีเมล" ในแถบเมนูหลัก (`LexFlowSidebar.tsx`)
- `/cases/:id/documents/:documentId/review` (ใหม่) — หน้าตรวจเอกสารตามข้อ F ของ brief: แสดงฉบับที่กำลังตรวจ, สถานะแต่ละผู้ตรวจ, ปุ่ม "ผ่านการตรวจฉบับนี้"/"ส่งกลับแก้ไข" (ส่งกลับบังคับกรอกเหตุผล), ข้อความ "คุณตรวจผ่านแล้ว/ผ่านครบแล้ว", แจ้งเตือนเมื่อ version เปลี่ยนระหว่างเปิดหน้า, ประวัติรอบตรวจย้อนหลัง, และช่องอัปโหลดฉบับใหม่ในหน้าเดียวกัน
- [`CreateReviewRoundDialog`](apps/web/src/components/documents/CreateReviewRoundDialog.tsx) — เลือกผู้ตรวจ/ผู้แก้แบบ multi-select จากสมาชิกคดีจริง (ดึงจาก `eligible-members`), เลือกกติกา ALL/ANY_ONE
- ปุ่ม "ส่งตรวจ/ผลตรวจ" เพิ่มในหน้ารายการเอกสารของเคส (`/cases/:id/documents`) ลิงก์ไปหน้าตรวจของแต่ละไฟล์

ทดสอบผ่าน browser จริง: อัปโหลดเอกสาร → เปิดหน้าตรวจ → กด "ผ่านการตรวจฉบับนี้" → เห็น "ผ่านการตรวจครบแล้ว" ทันที ปุ่มหายไปถูกต้อง (ป้องกัน approve ซ้ำ) ไม่มี error ใน console

## ขั้นตอนทดลอง flow ที่ทำสำเร็จจริงในเซสชันนี้ (ผ่าน browser, ไม่ใช่แค่ curl)

1. ล็อกอินด้วย `admin@lawfirm.com` / `password123`
2. เปิด `/email-intake` เห็นอีเมล mock 2 เรื่อง พร้อมสถานะ "รอรับเรื่อง"
3. เปิดอีเมล "แจ้งข้อพิพาทค่าเช่าพื้นที่ค้างชำระ" — เห็น split view, เห็น badge "ต้องยืนยัน" ครบ 4 ช่อง (จำนวนเงิน, วันที่ลูกค้าขอคำตอบ, คู่กรณี, สรุปคำขอ) พร้อมระบุแหล่งที่มาจากเนื้อหาอีเมลจริง
4. กด "ยืนยันค่านี้" ทีละช่อง badge เปลี่ยนเป็น "ยืนยันแล้ว" ทันที
5. เมื่อยืนยันครบ ปุ่ม "ยืนยันข้อมูลและรับเข้าพิจารณา" เปิดใช้งาน กดแล้ว redirect ไปหน้า `/intake/:id` สถานะ "กำลังประเมิน"
6. กลับไป `/email-intake` เห็นทั้งสองแถวเปลี่ยนเป็น "รับเรื่องแล้ว"
7. (ทดสอบผ่าน API โดยตรงเพิ่มเติม) จำลอง reply "ชำระเงินไปแล้วบางส่วน คงเหลือ 400,000 บาท" → เกิด proposal ใหม่สำหรับ `estimatedDamage` โดยค่าที่ยืนยันไปแล้ว (450,000) ยังอยู่ไม่ถูกทับ, proposal ใหม่มี `previousValue` โชว์ค่าก่อนหน้าให้เทียบ
8. (ทดสอบผ่าน API) สร้างเอกสาร case → เปิดรอบตรวจ 1 คน → approve สำเร็จ document version กลายเป็น APPROVED → กด approve ซ้ำ (idempotent, ไม่ error) → กด approve ด้วย `reviewedDocumentVersionId` ปลอมยืนยันว่า reject กรณี version ไม่ตรง → กด return ไม่ใส่เหตุผลยืนยันว่า reject

## ผลการทดสอบที่รันจริง

```
apps/api: npx jest --config jest.config.js
Test Suites: 65 passed, 65 total
Tests:       421 passed, 421 total
```

รวม unit test ใหม่ 26 เคส ครอบคลุม:
- idempotent accept (กดรับซ้ำไม่สร้าง intake ซ้ำ)
- confirm/reject field proposal ไม่เขียนทับ field อื่น
- gate การรับเข้าพิจารณาเมื่อยังมี field ค้างยืนยัน
- reply ไม่เขียนทับ field ที่ยืนยันแล้ว
- stale-version protection บนหน้าตรวจ
- บังคับใส่เหตุผลตอน return
- reviewer นอกรายชื่อ approve ไม่ได้
- idempotent decision (approve/return ซ้ำไม่สร้างซ้ำ)
- นับผู้อนุมัติครบตามกติกา ALL/ANY_ONE ก่อนเปลี่ยนสถานะ approved
- reviewer/editor ต้องเป็นสมาชิกคดีจริง

`npx tsc --noEmit` ผ่านทั้ง `apps/api` และ `apps/web` (ไม่มี type error ใหม่จากงานนี้)

## Migration ที่ต้อง apply

```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate
```

Mock seed (เพิ่มข้อมูล ไม่ลบของเดิม ปลอดภัยกับ DB ที่ใช้ร่วมกัน):
```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-email-intake.ts
```

Web app ต้องตั้ง `NEXT_PUBLIC_API_URL` ให้ตรงกับ backend ที่รันจริง และ backend ต้องมี origin ของ web อยู่ใน `CORS_ORIGIN` (แก้ `.env` ของ `apps/api` เพิ่ม `http://localhost:3015` ไว้แล้วสำหรับ dev server ตาม `.claude/launch.json`)

## ส่วนที่เชื่อมจริง vs ยังเป็น adapter จำลอง

| ส่วน | สถานะ |
|---|---|
| ฐานข้อมูล, การยืนยันตัวตน, สิทธิ์เข้าถึงคดี | จริง |
| การดึง field จากอีเมล (จำนวนเงิน, วันที่, คู่กรณี) | **จำลองด้วย regex** (`field-extraction.util.ts`) ไม่ใช่ AI/LLM จริง — ทำหน้าที่พิสูจน์ flow เท่านั้น แม่นยำต่ำกว่าการใช้โมเดลจริงแน่นอน |
| การรับอีเมลเข้าระบบ (Outlook/Gmail) | **จำลองทั้งหมด** ผ่าน `EmailThread`/`EmailMessage` ที่ seed เอง หรือ endpoint `mock-reply` ยังไม่มี webhook/poller เชื่อมกล่องเมลจริง |
| ไฟล์แนบอีเมล | โครงสร้างรองรับ (`EmailAttachment`) แต่ยังไม่มี path ที่สร้างไฟล์จากอีเมล mock จริง (0 ไฟล์แนบในข้อมูลทดสอบ) |
| การอัปโหลด/ดาวน์โหลดเอกสาร, เวอร์ชัน | จริง ใช้ storage เดิมของระบบ |
| Review round / decision | จริง ผูกกับสิทธิ์คดีจริง |
| ร่างตอบลูกค้า (ข้อ H ของ brief) | **ยังไม่ได้ทำ** |
| แบบฟอร์มศาล (ข้อ D บางส่วน) | **ยังไม่ได้ทำ** — ใช้ document/version ทั่วไปเท่านั้น ยังไม่มี concept "court form template" ที่เก็บ source/verified date แยก |
| การตรวจบนกระดาษ (ข้อ G) | **ยังไม่ได้ทำ** |

## ข้อจำกัดและสิ่งที่ยังไม่เสร็จ (พูดตรงไปตรงมา)

1. การตรวจจับไฟล์ซ้ำจาก reply ยังไม่ทำ (backend ยังไม่ตรวจ content hash ของไฟล์แนบอีเมล เพราะยังไม่มี path สร้างไฟล์จาก mock attachment จริง)
2. ยังไม่มีการแจ้ง "draft อาจต้องทบทวน" อัตโนมัติเมื่อข้อมูลใหม่ถูก apply แล้วกระทบเอกสารที่ร่างไว้ (ระบุใน brief ข้อ 3) — ตอนนี้ปล่อยให้ทนายสังเกตเองจากหน้า proposal
3. Draft ตอบลูกค้า (ข้อ H) และแบบฟอร์มศาลที่เก็บ source/verified date (ข้อ D) ยังไม่ได้เริ่ม
4. การตรวจบนกระดาษ (ข้อ G) — ยังไม่มีช่องแนบภาพ/PDF ที่ขีดแก้กลับมาผูกกับเวอร์ชัน มีแต่หมายเหตุข้อความตอน "ส่งกลับแก้ไข"
5. `Role.ADMIN`-only guard เดิมบน endpoint อัปโหลดเวอร์ชันเอกสาร (`documents.controller.ts`) ยังไม่ได้แก้ — อาจจำกัดว่าใครแก้ไขเอกสารได้จริงในทางปฏิบัติ ไม่ได้อยู่ในสโคปที่แก้รอบนี้
6. Regex extraction เป็น heuristic คร่าว ๆ ความแม่นยำต่ำกับอีเมลที่ประโยคซับซ้อนกว่าตัวอย่าง — ทุกค่าที่เสนอบังคับให้ทนายยืนยันอยู่แล้วตาม design จึงไม่มีความเสี่ยงข้อมูลผิดหลุดเข้าระบบโดยไม่ผ่านตา แต่ต้องคาดหวังว่าจะพลาดหรือดึงข้อมูลได้ไม่ครบในหลายเคส

## ลำดับงานที่ควรทำต่อ

1. Draft ตอบลูกค้า (สถานะ internal reasoning / reviewed / draft created / sent — ต้องแยกจากกันชัดเจนตาม brief)
2. เชื่อม Outlook จริง (เริ่มจาก read-only + draft-only ตาม brief, ยังไม่ auto-send)
3. แบบฟอร์มศาลที่มี source/verified date และ placeholder ที่ชัดเจน
4. แนบภาพ/PDF กระดาษขีดแก้ผูกกับเวอร์ชันที่ตรวจ (ข้อ G)
