# Microsoft 365 integration (A–E) — ออกแบบ

สถานะ: รอรีวิว · ต่อยอดและแทนที่ `2026-10-03-microsoft365-cases-design.md` (ยังใช้หลักการเดิม: ทุกคน login Microsoft ของตัวเอง, delegated เท่านั้น)

## เป้าหมาย

สำนักงานที่ใช้ Microsoft 365 อยู่แล้ว (เช่น สยามบาร์ริสเตอร์) ใช้ระบบเราได้โดย **ไม่ต้องเปลี่ยนวิธีทำงานใน Outlook/OneDrive** และได้ข้อดีของ Office กลับมาในระบบ:

| | ฟีเจอร์ | ผลลัพธ์ที่วัดได้ |
|---|---|---|
| A | นัดในระบบขึ้นปฏิทิน Outlook ของทนาย | สร้าง/แก้/ลบนัดในระบบ → ปฏิทิน Outlook ของทุกคนที่รับผิดชอบนัดนั้นตรงกันภายใน 5 นาที |
| E | ลิงก์ Teams สำหรับนัดลูกความ | ติ๊ก "ประชุมออนไลน์ (Teams)" → ได้ลิงก์เข้าร่วมในระบบ + ในปฏิทิน + ส่งคำเชิญลูกความได้ |
| B | อีเมลเข้าสำนวน | อีเมลใน folder คดีของ Outlook และอีเมลที่ผูกเอง เห็นในแท็บ "อีเมล" ของคดี พร้อมไฟล์แนบ |
| C | ส่ง/ตอบอีเมลจากระบบ | ส่งจากกล่องจดหมายของทนายเอง อยู่ใน Sent ของ Outlook และเข้าแท็บอีเมลของคดีอัตโนมัติ |
| D | เอกสาร OneDrive/SharePoint ในคดี | ผูก folder คดี → เห็นไฟล์สด, กดเปิดแก้ใน Word/Excel ออนไลน์, นำเข้าเป็นเอกสารคดีได้ |

## หลักการที่ใช้ทุกส่วน

1. **Delegated เท่านั้น** — ระบบเห็นเท่าที่ผู้ใช้คนนั้นเห็นใน Microsoft อยู่แล้ว ไม่ใช้ application permission
2. **สิทธิ์ในระบบเป็นตัวตัดสินว่าใครเห็นอะไร** — ข้อมูลที่ผูกกับคดี เห็นได้เฉพาะคนที่มีสิทธิ์คดี (`getCaseFilterForUser`)
3. **ไม่มี AI ในส่วนนี้** — การจับคู่ใช้กฎตรงตัว (เลขอ้างอิง/เลขคดี/อีเมลลูกความ) และทุกการผูกที่ไม่ชัดเจนต้องให้คนยืนยัน
4. **ระบบเป็นต้นทางของนัด** — ปฏิทินซิงก์ทางเดียว (ระบบ → Outlook); แก้ใน Outlook จะถูกเขียนทับเมื่อนัดในระบบเปลี่ยน
5. **ล้มเหลวแบบไม่พังงานหลัก** — Graph ล่ม/token หมดอายุ ต้องไม่ทำให้การสร้างนัดหรือคดีในระบบล้ม; บันทึก `lastError` และให้ cron ซ่อมทีหลัง

## ส่วนที่ 0 — ฐานราก (ต้องมีก่อน A–E)

### การเชื่อมต่อ: แยก "ใช้ทำอะไร" ต่อบัญชี
ทนายที่เชื่อมเพื่อเอาปฏิทิน **ไม่ควร** ทำให้ Inbox ส่วนตัวทั้งหมดไหลเข้าคิวรับเรื่องที่ทั้งสำนักงานเห็น

`MailboxConnection` เพิ่ม:
- `userId` (relation → User, index) — เจ้าของบัญชี Microsoft; backfill จาก `connectedByUserId` (string ลอยๆ ไม่มี relation) แล้วโค้ดใหม่ใช้ `userId` อย่างเดียว — คอลัมน์เดิมยังเก็บไว้เพื่อให้ rollback ได้
- `syncInboxToIntake Boolean @default(false)` — ดึง Inbox เข้าคิว "รับเรื่องทางอีเมล" (เปิดเองพร้อมคำเตือนว่าคนที่ดูคิวได้จะเห็น)
- `syncCalendar Boolean @default(true)`
- `sentDeltaLink String?` — ซิงก์ Sent Items (ใช้กับ B/C)

หน้าตั้งค่า: แต่ละบัญชีแสดงเจ้าของ + สวิตช์ 2 ตัว; "บัญชีของฉัน" แยกจาก "บัญชีอื่นในสำนักงาน" (owner เห็นทั้งหมด)

หนึ่งผู้ใช้ใช้บัญชี Microsoft ของตัวเองได้หนึ่งบัญชีสำหรับปฏิทิน/ส่งอีเมล/ไฟล์ — ใช้ connection ACTIVE ล่าสุดที่ `userId` = ผู้ใช้

### ความปลอดภัย OAuth (ข้อค้างจาก audit 2026-10-03, Medium)
`state` ต้องผูกกับ browser: ตอน `/outlook/connect` ตั้ง nonce ใน HttpOnly, Secure, SameSite=Lax cookie (domain api) แล้ว callback ตรวจว่า nonce ใน state ตรงกับ cookie + ใช้ครั้งเดียว — กันการส่งลิงก์ให้คนอื่นกดแล้วกล่องเขาเข้าสำนักงานเรา

### Graph client
- เพิ่ม: retry เมื่อ 429/503 ตาม `Retry-After` (สูงสุด 3 ครั้ง), ตามหน้า `@odata.nextLink`
- method ใหม่ตามส่วน A–E (ระบุในแต่ละส่วน)

### ข้อมูลอีเมลที่ขาด
`EmailMessage` เพิ่ม `graphMessageId`, `toAddresses String[]`, `ccAddresses String[]`, `bodyHtml` (เก็บเนื้อหาเต็ม — ตอนนี้เก็บแค่ `bodyPreview` ที่ถูกตัด); `bodyText` = แปลง HTML เป็นข้อความ
`EmailThread` เพิ่ม `mailboxConnectionId` (relation, SetNull), `caseId` (relation, SetNull, index)
`EmailAttachment`: endpoint ดาวน์โหลด (ตรวจสิทธิ์เหมือนเห็น thread)

### แก้ของเดิมที่ชนกับงานนี้
- หน้า thread ใน `/email-intake/[threadId]` **เลิกกด accept อัตโนมัติตอนเปิด** (ตอนนี้แค่เปิดดูก็สร้าง Intake) → ต้องกดปุ่ม "รับเป็นเรื่องใหม่" หรือ "ผูกกับคดี"
- ซ่อนกล่อง mock-reply ใน production
- `getEmailThreadFilterForUser`: thread ที่ยังไม่ผูก เห็นได้เฉพาะเจ้าของ mailbox + คนที่มี capability `viewAllCases` (owner/office manager); thread ที่ผูกคดีแล้ว เห็นตามสิทธิ์คดี; thread ที่เป็น intake เห็นตามสิทธิ์ intake เดิม

## ส่วน A — ปฏิทิน Outlook

**ใครได้นัด:** ทุกคนใน `eventPeopleIds(event)` (ผู้รับผิดชอบนัด หรือ lead lawyer ถ้าไม่ระบุ) ที่มี connection ACTIVE + `syncCalendar`

**ข้อมูล:** ตารางใหม่
```prisma
model CalendarEventOutlookCopy {
  id            String   @id @default(uuid())
  eventId       String   // ไม่มี FK: ต้องรู้ graphEventId หลังนัดถูกลบ (cascade จากคดี/นัด) เพื่อไปลบใน Outlook
  userId        String
  connectionId  String
  graphEventId  String
  syncedAt      DateTime // = event.updatedAt ตอนซิงก์ล่าสุด
  lastError     String?  @db.Text
  @@unique([eventId, userId])
  @@index([connectionId])
}
```

**การซิงก์ (reconcile):** `OutlookCalendarSyncService.reconcile()` เป็นแหล่งความจริงเดียว
- cron ทุก 5 นาที + เรียกทันที (ไม่รอผล, try/catch) หลัง create/update/reschedule/remove ใน `CalendarService` และ `EventResponsibilityService` เพื่อให้เร็ว
- ต่อผู้ใช้ที่เปิดซิงก์: หานัดที่เป็นของเขาและ `startAt >= now - 1 วัน` → ไม่มีสำเนา = สร้าง; `event.updatedAt > syncedAt` = PATCH; สำเนาที่นัดไม่ใช่ของเขาแล้ว (เปลี่ยนผู้รับผิดชอบ/lead) = ลบ
- สำเนาที่ `eventId` ไม่มีในระบบแล้ว = ลบใน Outlook + ลบแถว
- ทำแบบนี้แทนการ hook ทุกจุดเขียน เพราะมีจุดเขียนนัดกระจาย 8+ ที่ (deadline rules, limitation reminder, intake, court-day, date suggestions, case activities) — cron จับได้หมดโดยไม่ต้องแก้ทุกไฟล์
- 404 ตอน PATCH/DELETE (ผู้ใช้ลบเองใน Outlook) → ลบแถวสำเนา; ถ้านัดยังเป็นของเขา รอบถัดไปจะสร้างใหม่
- token ใช้ไม่ได้ → บันทึก `lastError`, ข้ามผู้ใช้นั้น (connection ถูก mark EXPIRED อยู่แล้วโดย `getValidAccessToken`)

**หน้าตาในปฏิทิน Outlook:**
- หัวเรื่อง: `[นัดศาล] {title}` / `[นัดลูกความ] …` / `[ครบกำหนด] …` / `{title}`
- เวลา: `startAt`–`endAt` (ไม่มี endAt: นัดศาล/ลูกความ 1 ชม., ครบกำหนด 30 นาที), timeZone UTC
- สถานที่: `courtName`; เนื้อหา: เลขคดี (ownRef, เลขคดีดำ/แดง), ชื่อคดี, รายละเอียด, ลิงก์เปิดคดีในระบบ (โดเมนของสำนักงาน)
- categories `["Samnuan"]`, showAs busy, reminder = ค่าน้อยสุดใน `reminderMinutes`
- `transactionId` = `{eventId}:{userId}` กันสร้างซ้ำเมื่อ retry

## ส่วน E — Teams สำหรับนัดลูกความ

- `CalendarEvent` เพิ่ม `onlineMeeting Boolean @default(false)`, `onlineMeetingUrl String?`, `meetingOrganizerId String?`, `inviteeEmails String[] @default([])`
- ฟอร์มนัด (เฉพาะ CLIENT_MEETING): ติ๊ก "ประชุมออนไลน์ (Teams)" + เลือกผู้รับเชิญจากผู้ติดต่อของลูกความในคดี (`ClientContact.email`) หรือพิมพ์อีเมล
- ผู้จัด (organizer) = คนสร้างนัดถ้ามี connection ไม่งั้นผู้รับผิดชอบคนแรกที่มี; ไม่มีใครเชื่อม → บันทึกนัดได้ แต่ขึ้นข้อความ "ต้องเชื่อม Microsoft ก่อนจึงสร้างลิงก์ Teams ได้"
- สำเนาของผู้จัดสร้างด้วย `isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness"`, `attendees` = ผู้รับเชิญ → Outlook ส่งคำเชิญถึงลูกความเอง (มาจากอีเมลทนาย); ระบบอ่าน `onlineMeeting.joinUrl` กลับมาเก็บที่ `onlineMeetingUrl`
- สำเนาของคนอื่นในทีมใส่ลิงก์ Teams ในเนื้อหา
- ระบบแสดงปุ่ม "เข้าร่วม Teams" + คัดลอกลิงก์ ในรายละเอียดนัด (web) และส่งลิงก์ในข้อความแจ้งเตือนนัดของทีม
- เปลี่ยนเวลา/ยกเลิกนัด → PATCH/DELETE สำเนาผู้จัด → Outlook ส่งอัปเดต/ยกเลิกถึงลูกความเอง
- ใช้สิทธิ์ `Calendars.ReadWrite` อย่างเดียว

## ส่วน B — อีเมลเข้าสำนวน

สองทางเข้า:

**1. ผูก folder Outlook กับคดี (หลัก — ตรงกับที่สำนักงานเก็บอีเมลแยก folder ตามคดีอยู่แล้ว)**
```prisma
model CaseExternalLink {
  id           String   @id @default(uuid())
  firmId       String
  caseId       String
  connectionId String
  kind         CaseExternalLinkKind   // OUTLOOK_FOLDER | DRIVE_FOLDER
  externalId   String                 // mailFolder id | driveItem id
  driveId      String?
  displayPath  String
  deltaLink    String?  @db.Text
  linkedById   String
  lastSyncedAt DateTime?
  lastError    String?  @db.Text
  createdAt    DateTime @default(now())
  @@unique([connectionId, kind, externalId])
  @@index([caseId])
}
```
- หน้า "จับคู่ folder" (ตั้งค่า → Microsoft 365): ระบบดึงรายชื่อ folder ใน Outlook (ชื่ออย่างเดียว) แล้วแนะนำคดีจาก: Own Ref, เลขคดีดำ/แดง (รวมทุกชั้นศาลใน `CaseProceeding`), ชื่อลูกความ ที่อยู่ในชื่อ folder — แสดงเป็นตาราง folder / คดีที่แนะนำ / ความมั่นใจ (ตรงเลขอ้างอิง, ตรงเลขคดี, ตรงชื่อลูกความ) → ผู้ใช้แก้/ข้ามแล้วกด "ยืนยัน" ไม่มีอะไรผูกก่อนยืนยัน
- ผูกได้เฉพาะคดีที่ผู้ใช้มีสิทธิ์
- ซิงก์: delta ราย folder ใน cron (ทุก 5 นาที) + ตอนกด "ซิงก์ตอนนี้"; อีเมลเข้าไปเป็น `EmailThread.caseId` = คดีนั้น สถานะ LINKED ไม่เข้าคิวรับเรื่อง
- ผูกครั้งแรกดึงย้อนหลังทั้ง folder (แบ่งหน้า, เคารพ 429)
- ในหน้าคดี: ปุ่ม "ผูก folder Outlook" เลือกจากต้นไม้ folder ได้เหมือนกัน

**2. ผูกทีละ thread (สำหรับอีเมลใน Inbox ที่เข้าคิวรับเรื่อง)**
- หน้า thread: ปุ่ม "ผูกกับคดี" + คดีที่แนะนำ (ผู้ส่ง/ผู้รับตรงกับอีเมลลูกความหรือผู้ติดต่อของคดี; หัวเรื่องมี Own Ref/เลขคดี)
- ผูกแล้ว → `caseId` + LINKED; ข้อความใหม่ใน conversation เดียวกันเข้าคดีเองอัตโนมัติ (thread เดียวกัน)
- ยกเลิกการผูกได้ (กลับเข้าคิว)

**แท็บ "อีเมล" ในหน้าคดี** (เพิ่มใน `case-tabs.ts`)
- รายการ thread ล่าสุดก่อน, เปิดดูข้อความเต็ม (HTML แสดงแบบ sanitize ใน iframe sandbox), ผู้ส่ง/ผู้รับ, ไฟล์แนบดาวน์โหลดได้
- ปุ่ม "บันทึกไฟล์แนบเข้าเอกสารคดี" → สร้าง `Document` ผ่าน `createFromBuffer` เดิม (ลง feed คดีอยู่แล้ว)
- ไทม์ไลน์คดี: แสดงรายการ "อีเมล: {หัวเรื่อง}" สำหรับ thread ที่มีข้อความใหม่ (อ่านจาก EmailMessage ตรงๆ ไม่สร้าง CaseActivity ซ้ำ)
- Sent Items: ซิงก์ด้วย delta แยก (`sentDeltaLink`) เป็น OUTBOUND — เข้าคดีถ้า conversation ผูกคดีอยู่แล้ว ไม่เข้าคิวรับเรื่อง

## ส่วน C — ส่ง/ตอบอีเมลจากระบบ

- ส่งจาก **กล่องจดหมายของผู้ใช้ที่กดส่งเอง** เท่านั้น (ไม่มี connection → ปุ่มพาไปเชื่อม)
- **ตอบกลับ** (จากแท็บอีเมลคดี/หน้า thread): ถ้าข้อความต้นทางอยู่ในกล่องของผู้ใช้เอง → `createReply`/`createReplyAll` บน `graphMessageId` (thread ต่อเนื่องใน Outlook); ถ้าเป็นกล่องของคนอื่น → สร้างอีเมลใหม่ "Re: {หัวเรื่อง}" จากกล่องตัวเอง ถึงผู้ส่งเดิม และผูกเข้าคดีเดียวกัน
- **เขียนใหม่** (แท็บอีเมลคดี): ผู้รับเลือกจากผู้ติดต่อลูกความ/คู่ความในคดี หรือพิมพ์เอง, CC, หัวเรื่องเติม Own Ref ให้ (แก้ได้), แนบเอกสารคดีได้ (ไฟล์ ≤ 3 MB ต่อไฟล์แนบตรง; ใหญ่กว่านั้นแนะนำให้ใช้ลิงก์ OneDrive จากส่วน D)
- ขั้นตอน Graph: สร้าง draft (`POST /me/messages` หรือ `createReply`) → ได้ `id`, `conversationId`, `internetMessageId` → `PATCH` เนื้อหา/แนบไฟล์ → `POST /send` → บันทึก `EmailThread` (caseId) + `EmailMessage` OUTBOUND ทันที (ไม่ต้องรอ Sent Items sync) — Sent Items sync เจอซ้ำจะข้ามเพราะ `messageKey` เดียวกัน
- ยืนยันก่อนส่งในหน้าจอ (สรุปผู้รับ + ไฟล์แนบ) — ไม่มีขั้นอนุมัติแยก (ทนายส่งในนามตัวเอง เหมือนส่งจาก Outlook)
- ไม่มี AI ช่วยเขียนในรอบนี้
- บันทึก audit log ทุกการส่ง (ผู้ส่ง, ผู้รับ, คดี)

## ส่วน D — เอกสาร OneDrive/SharePoint ในคดี

- ผูก folder OneDrive/SharePoint กับคดี (`CaseExternalLink` kind `DRIVE_FOLDER`) — จากหน้าคดี (ปุ่ม "ผูก folder OneDrive") หรือหน้าจับคู่ folder เดียวกับส่วน B (จับคู่ชื่อ folder แบบเดียวกัน)
- เลือก folder ได้จาก: OneDrive ของฉัน, "แชร์กับฉัน", และ document library ของ SharePoint site (ค้นหา site ด้วย `Sites.Read.All`)
- **แท็บเอกสารคดีมีส่วน "OneDrive"**: รายการไฟล์ดึงสดตอนเปิด (ไม่เก็บสำเนา) ด้วย token ของคนที่ผูก folder; ทุกคนที่มีสิทธิ์คดีเห็นรายการได้ (ตามหลักข้อ 2) + audit log ทุกครั้งที่เปิด/ดาวน์โหลด
- ปุ่มต่อไฟล์:
  - **เปิดใน Office ออนไลน์** → `webUrl` (เปิดในแท็บใหม่; แก้ใน Word/Excel/PowerPoint ออนไลน์ บันทึกใน OneDrive เลย ไม่ต้องดึงกลับ) — คนที่ไม่มีสิทธิ์ไฟล์นั้นใน Microsoft จะถูก Microsoft ปฏิเสธเอง ระบบแสดงข้อความแนะนำให้ขอแชร์หรือใช้ "นำเข้า"
  - **นำเข้าเป็นเอกสารคดี** → ดาวน์โหลดผ่าน Graph แล้ว `createFromBuffer` (ใช้กับ AI/ส่งลูกความ/อนุมัติเอกสาร)
- **ส่งเอกสารคดีไป OneDrive**: ในเอกสารคดีของระบบ ปุ่ม "เปิดแก้ใน Word ออนไลน์" (เฉพาะ .docx/.xlsx/.pptx) → อัปโหลดเวอร์ชันล่าสุดเข้า folder ที่ผูกไว้ (หรือ `OneDrive ของฉัน/Samnuan/{ownRef}` ถ้ายังไม่ผูก) → เปิด `webUrl`; ปุ่ม "ดึงเวอร์ชันล่าสุดกลับ" สร้าง `DocumentVersion` ใหม่ผ่าน `uploadNewVersion` เดิม (เก็บ `driveId/itemId` ใน `DocumentOfficeLink { documentId @unique, connectionId, driveId, itemId, webUrl, uploadedVersion }`); แสดง "แก้ใน Word ล่าสุด {เวลา}" จาก `lastModifiedDateTime` เพื่อเตือนว่ามีของใหม่ยังไม่ดึง
- ไฟล์ใหญ่ (> 4 MB) อัปโหลดด้วย upload session
- คนที่ผูก folder ตัดการเชื่อมต่อ/ลาออก → รายการสดหายไป; ก่อนตัดการเชื่อมต่อเตือนว่ามี folder ผูกกับคดีกี่คดี และเสนอ "นำเข้าไฟล์ทั้ง folder" ก่อน

## นอกขอบเขตรอบนี้ (ทำทีหลังถ้าต้องการ)

- สร้างคดีใหม่จาก folder (ย้ายคดีเก่าเข้าระบบ) — รอบนี้ผูกกับคดีที่มีอยู่แล้วเท่านั้น
- ปฏิทินสองทาง (นัดที่สร้างใน Outlook เข้าระบบ)
- AI ช่วยร่าง/สรุปอีเมล
- shared mailbox (`/users/{shared}/…`) — สิทธิ์ขอไว้แล้ว ยังไม่ทำ UI
- แอปมือถือ (แสดงลิงก์ Teams/อีเมลคดีในมือถือ) — web ก่อน
- publisher verification (MPN)

## การทดสอบ

- Unit (jest + mock Prisma ตามแบบเดิม): reconcile ปฏิทิน (สร้าง/แก้/ลบ/เปลี่ยนเจ้าของ/404/token หมด), ตัวจับคู่ folder ↔ คดี, การสร้าง reply vs อีเมลใหม่, thread filter ใหม่, OAuth nonce cookie
- Graph client: mock `fetch` ตรวจ URL/body/retry 429
- ไม่มีการเรียก Microsoft จริงใน test
- ทดสอบจริงบน prod ด้วยบัญชี pilot ของสยามบาร์ริสเตอร์หลังแอดมินอนุมัติ

## ลำดับการทำ

0 ฐานราก → A ปฏิทิน → E Teams → B อีเมลเข้าสำนวน → C ส่ง/ตอบ → D OneDrive
ทุกส่วนใช้ migration แบบเพิ่มอย่างเดียว (ไม่มีลบคอลัมน์) — rollback image ได้โดยไม่ต้องย้อน DB
