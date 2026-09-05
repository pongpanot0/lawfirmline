# Schema Design: Customer Portal + Operations Hub + ผู้ช่วยร่างอีเมลปิดคดี

วันที่: 5 กันยายน 2569
สถานะ: ผลตรวจโดย database-reviewer สำหรับวางแผนพัฒนา ยังไม่ได้สร้าง migration จริง

อ้างอิง requirements เต็มที่ [customer-portal-consolidated-requirements.md](2026-09-05-customer-portal-consolidated-requirements.md)

Verdict: **Additive เท่านั้น** — โครงสร้างเดิม (Intake, Case, ClientContact, Document) ใช้เป็นฐานได้ ไม่ต้องรื้อ ไม่มี column type เปลี่ยนหรือ rename ที่ทำลายข้อมูลเดิม

## การตัดสินใจที่ยืนยันแล้ว (5 กันยายน 2569)

- **Portal submission form เป็น model แยก** (`PortalIntakeSubmission`) ไม่ผูกรวมเข้ากับ `Intake` โดยตรง — `Intake` มี field `portalSubmissionId` อ้างกลับไปแทน
- **Status mapping เก็บเป็นตาราง audit เต็มรูปแบบ** (`IntakeStatusMapping`) ไม่ใช้ enum ธรรมดา — เพื่อเก็บประวัติการเปลี่ยนสถานะทุกครั้งพร้อมผู้แก้และเวลา (ตรงกับ requirement "เก็บตลอดไป" และ audit ที่ต้องตรวจได้)

## ⚠️ แก้ไข 5 กันยายน 2569: ตรวจโค้ดจริงจาก main แล้ว พบว่า Client Portal มีอยู่แล้วบางส่วน

การวิเคราะห์ schema เดิมของ database-reviewer อ่านจาก branch ที่เก่ากว่า main ปัจจุบัน หลังตรวจ `origin/main` จริง (`apps/api/src/client-portal/`, `apps/web/src/app/(client-portal)/`) พบว่ามี **vertical slice ที่ทำงานได้จริงแล้ว**: auth แบบ magic-link → JWT → guard, หน้ารายการ/รายละเอียดคดี, ดาวน์โหลดเอกสาร ต้อง **reuse ของเดิมแทนสร้างซ้ำ** ดังนี้:

| ของเดิมที่มีอยู่ | สถานะ | ผลต่อ schema design |
|---|---|---|
| `ClientPortalLoginToken` + JWT strategy (`client-portal-jwt.strategy.ts`) | ทำงานจริง ครบ flow | **ไม่ต้องออกแบบ auth ใหม่** — ต่อยอด guard เดิมสำหรับ endpoint ใหม่ทั้งหมด |
| `AuditLog` (firmId, userId, action, metadata Json) | เขียนจริง 11 จุด แต่ **ไม่มี endpoint อ่าน** | **ยกเลิก `DocumentAccessAuditLog` ที่เสนอไว้เดิม — reuse `AuditLog`** เพิ่ม action ใหม่ `DOCUMENT_READ`/`DOCUMENT_DOWNLOAD`/`INTAKE_STATUS_CHANGED`/`CONTACT_ACCESS_GRANTED` แทน ใส่ context ผ่าน `metadata: Json` (documentPublicationId, clientContactId เป็นต้น) ต้องเพิ่ม endpoint อ่าน `AuditLog` ใหม่ (ยังไม่มี) |
| `Document.visibleToClient` (Boolean) | ใช้กรองเอกสารที่ Portal เห็นอยู่แล้ว | ไม่มี endpoint ให้ทนายติ๊กเปิด/ปิดต่อเอกสาร (gap จริง) — `DocumentPublication` ยังต้องสร้างเพื่อ freeze เป็นรายเวอร์ชัน (อ้าง `DocumentVersion.version` ที่มีอยู่แล้ว แทนเก็บ `documentVersionNumber` ลอย ๆ) และเก็บ metadata การเผยแพร่ (title/summary/ผู้อนุมัติ) ที่ `visibleToClient` เดี่ยว ๆ ทำไม่ได้ |
| `ReferralChannel` enum (`WALK_IN, PHONE, EMAIL, LINE, REFERRAL, OTHER`) | มีอยู่แล้ว **รวม `LINE`** แต่ยังไม่มี `PORTAL` | **ยกเลิก field `intakeSourceChannel` ใหม่ — เพิ่ม `PORTAL` เข้า enum เดิมแทน** ประหยัดกว่าและสอดคล้องกับที่มีอยู่ |
| `IntakeStatus` enum (`RECEIVED, ASSESSING, ACCEPTED, REJECTED, CONVERTED`) | หยาบกว่าที่ schema เดิมสมมติ (ไม่มี `ACCEPTED_PENDING`/`ACCEPTED_APPROVED`) | **`IntakeStatusMapping` ยังจำเป็น** เพื่อ map สถานะภายในหยาบ 5 ค่า ให้เป็นสถานะภาษาลูกความละเอียดกว่า (8 ค่าตามส่วนที่ 4) — ไม่ต้องขยาย enum ภายใน |
| `TaskStatus` enum (`TODO, IN_PROGRESS, DONE`) — ไม่มี ON_HOLD | ตรงตามที่ออกแบบไว้ | **`TaskOnHold` ยังจำเป็น** เป็นตารางแยก ไม่ผสมเข้า enum สถานะหลัก (ถูกต้องตามที่ออกแบบเดิม) |
| `Case.closingSummary`, `Case.customerRef` | มีอยู่แล้วแต่ **internal-only** ไม่ถูกส่งเข้า client-portal service เลย | **`Case.notesForClient` ยังจำเป็นจริง** ไม่ใช่ของซ้ำ — เพราะของเดิมทั้งสอง field ไม่เคย expose ให้ลูกความเห็น |
| **`portalEnabled` เป็นสิทธิระดับลูกความทั้งองค์กร** (client-portal.service.ts ดึงทุกคดีที่ clientId ตรงกัน ไม่กรองรายแฟ้ม) | **นี่คือช่องว่างจริงที่ตรงกับ requirement** | **`ContactCaseAccess` ยังจำเป็นและสำคัญที่สุด** — ต้องแก้ query ใน `client-portal.service.ts` ให้เช็ค `ContactCaseAccess` แทนการดึงทุกคดีของ client ตรง ๆ (มิฉะนั้นผู้ติดต่อใหม่จะเห็นทุกแฟ้มขององค์กรทันทีที่เปิด portalEnabled ซึ่งขัดกับ requirement ส่วนที่ 8) |

**สรุปการเปลี่ยนแปลงจาก schema design เดิม**:
- ❌ ตัด `DocumentAccessAuditLog` model — ใช้ `AuditLog` เดิม + เพิ่ม action ใหม่ + เพิ่ม endpoint อ่าน (ของใหม่ที่ต้องทำ)
- ❌ ตัด field `Intake.intakeSourceChannel` — เพิ่ม `PORTAL` เข้า `ReferralChannel` enum แทน (ใช้ field `referralChannel` เดิม)
- ✅ Models ที่เหลือ (`PortalIntakeSubmission`, `IntakeStatusMapping`, `ContactCaseAccess`, `DocumentPublication`, `ContactNotificationPreference`, `TaskOnHold`) ยังจำเป็นตามเดิม — ปรับ `DocumentPublication` ให้อ้าง `DocumentVersion.version` ที่มีอยู่แล้วแทนเก็บเลขเวอร์ชันลอย ๆ

## Models ใหม่ที่ต้องเพิ่ม (ปรับปรุงหลังตรวจโค้ดจริงแล้ว — ดูส่วนแก้ไขด้านบน)

### 1. PortalIntakeSubmission (แยกจาก Intake ตามที่ยืนยัน)

```prisma
model PortalIntakeSubmission {
  id                  String    @id @default(uuid())
  clientContactId     String
  referenceNumber     String    @unique   // เลขอ้างอิงที่ลูกความเห็น
  title               String
  detail              String    @db.Text
  clientRequestedDate DateTime?
  attachmentUrls       String[]  @default([])
  urgencyFlag         Boolean   @default(false)
  submittedAt         DateTime  @default(now())
  withdrawnByClient    Boolean   @default(false)
  withdrawnAt          DateTime?
  withdrawnReason      String?

  intakeId            String?   @unique   // เชื่อมกลับเมื่อสำนักงานสร้าง Intake จากเรื่องนี้
  intake               Intake?  @relation(fields: [intakeId], references: [id])

  clientContact ClientContact @relation(fields: [clientContactId], references: [id])
  createdAt DateTime @default(now())

  @@index([clientContactId, submittedAt])
  @@index([withdrawnByClient])
}
```

**เหตุผลที่แยก model**: เรื่องที่ลูกความส่งผ่าน Portal มี field เฉพาะฝั่งลูกความ (referenceNumber ที่ลูกความเห็น, urgencyFlag ที่ลูกความติ๊กเอง, withdrawn) ที่ไม่ควรปนกับ field ภายในของ Intake (F02 ตรวจผลประโยชน์ขัดกัน, F03 ขอบเขตว่าจ้าง ฯลฯ) การแยกทำให้ schema ของ Intake ไม่บวมด้วย field ที่ใช้เฉพาะ channel เดียว และรองรับกรณีที่เรื่องเดียวกันถูกส่งซ้ำหรือยังไม่ถูกแปลงเป็น Intake

**Flow**: `PortalIntakeSubmission` created → สำนักงานเห็นในคิว F01 → เมื่อรับเข้าสู่ pipeline สร้าง `Intake` ใหม่ พร้อม backlink `intakeId` ← `intake.portalSubmissionId`

### 2. IntakeStatusMapping (ตาราง audit เต็มรูปแบบ ตามที่ยืนยัน)

```prisma
model IntakeStatusMapping {
  id              String    @id @default(uuid())
  intakeId        String
  internalStatus  String    // RECEIVED, ASSESSING, ACCEPTED_PENDING, ACCEPTED_APPROVED, REJECTED, CONVERTED, CLOSED
  externalStatus  String    // ส่งแล้ว / สำนักงานรับเรื่องแล้ว / ขอข้อมูลเพิ่ม / รอตกลงขอบเขต / รับดำเนินการ / ส่งผลงานแล้ว / ปิดงาน / ไม่รับดำเนินการ
  changedAt       DateTime  @default(now())
  changedById     String    // ผู้ที่ทำให้สถานะเปลี่ยน (ระบบหรือทนาย)
  reason          String?   @db.Text
  isCurrent       Boolean   @default(true)  // แถวล่าสุด = current, แถวเก่า = ประวัติ

  intake    Intake @relation(fields: [intakeId], references: [id], onDelete: Cascade)
  changedBy User   @relation(fields: [changedById], references: [id])

  @@index([intakeId, changedAt])
  @@index([intakeId, isCurrent])
}
```

**เหตุผลที่เป็นตาราง audit เต็มรูปแบบ**: ทุกครั้งที่สถานะเปลี่ยน insert แถวใหม่ (ไม่ update ทับ) แถวเก่าคง `isCurrent = false` — เก็บประวัติการเปลี่ยนสถานะทั้งหมดถาวรตาม requirement "เก็บตลอดไป" ต่างจาก enum เดี่ยวใน `Intake.externalStatus` ที่จะเห็นแค่สถานะปัจจุบันและไม่มี audit ว่าใครเปลี่ยนเมื่อไหร่

Query สถานะปัจจุบัน: `WHERE intakeId = ? AND isCurrent = true` (unique constraint แบบ partial index แนะนำให้บังคับว่ามีได้แถวเดียวที่ isCurrent=true ต่อ intake)

### 3. ContactCaseAccess

```prisma
model ContactCaseAccess {
  id              String    @id @default(uuid())
  clientContactId String
  caseId          String
  grantedAt       DateTime  @default(now())
  startDate       DateTime  @default(now())
  endDate         DateTime?
  grantedById     String
  revokedAt       DateTime?
  revokedById     String?
  notes           String?

  clientContact ClientContact @relation(fields: [clientContactId], references: [id], onDelete: Cascade)
  case          Case          @relation(fields: [caseId], references: [id], onDelete: Cascade)
  grantedBy     User          @relation("GrantedAccess", fields: [grantedById], references: [id])
  revokedBy     User?         @relation("RevokedAccess", fields: [revokedById], references: [id])

  @@unique([clientContactId, caseId])
  @@index([clientContactId])
  @@index([startDate, endDate])
}
```

รองรับ 3 สถานการณ์เปลี่ยนผู้ติดต่อ (คนติดต่อเปลี่ยน / เพิ่มผู้เกี่ยวข้อง / เปลี่ยนตัวลูกความจริง) ผ่าน `startDate`/`endDate` ต่อแฟ้ม — สำนักงานเป็นผู้อนุมัติ (`grantedById`) ตามที่ยืนยัน

### 4. DocumentPublication

```prisma
model DocumentPublication {
  id                    String    @id @default(uuid())
  documentId            String
  documentVersionId     String    // อ้าง DocumentVersion.id ที่มีอยู่แล้ว ไม่เก็บเลขเวอร์ชันลอย ๆ
  publishedAt           DateTime  @default(now())
  publishedById         String    // ทนายเจ้าของคดีคนเดียว (single-approver ตามที่ยืนยัน)
  visibleToClientFrom   DateTime  @default(now())
  title                 String?
  summary               String?   @db.Text
  eventDate             DateTime?
  recipientContacts     String[]  @default([])
  status                String    @default("PUBLISHED")
  isInternal            Boolean   @default(false)

  document        Document        @relation(fields: [documentId], references: [id], onDelete: Cascade)
  documentVersion DocumentVersion @relation(fields: [documentVersionId], references: [id])
  publishedBy     User            @relation(fields: [publishedById], references: [id])

  @@index([documentId, publishedAt])
}
```

ผูกกับ `DocumentVersion` ที่มีอยู่แล้วในระบบตายตัว (ไม่ใช่เลขเวอร์ชันลอย) — ร่างใหม่ไม่แทนที่ฉบับที่ลูกความเห็น การอ่าน/ดาวน์โหลดบันทึกผ่าน `AuditLog` เดิม (action `DOCUMENT_READ`/`DOCUMENT_DOWNLOAD`, metadata อ้าง `documentPublicationId`) ไม่สร้างตาราง audit แยกใหม่

### 5. ContactNotificationPreference

```prisma
model ContactNotificationPreference {
  id              String  @id @default(uuid())
  clientContactId String
  channel         String  // "EMAIL" | "LINE"
  isEnabled       Boolean @default(true)

  clientContact ClientContact @relation(fields: [clientContactId], references: [id], onDelete: Cascade)

  @@unique([clientContactId, channel])
}
```

### 6. TaskOnHold

```prisma
model TaskOnHold {
  id             String    @id @default(uuid())
  taskId         String    @unique
  reason         String    @db.Text
  startedAt      DateTime  @default(now())
  endedAt        DateTime?
  followerUserId String?
  lastFollowUpAt DateTime?
  nextFollowUpAt DateTime?

  task     Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
  follower User? @relation(fields: [followerUserId], references: [id])

  @@index([nextFollowUpAt])
}
```

ระดับงาน ไม่ใช่ระดับคดี — ไม่หยุดกำหนดเวลาทางกฎหมายอัตโนมัติ

### 7. ~~DocumentAccessAuditLog~~ — ตัดออก, reuse `AuditLog` เดิมแทน

ไม่สร้างตารางใหม่ ใช้ `AuditLog` ที่มีอยู่แล้ว (`apps/api/prisma/schema.prisma` model `AuditLog`: `firmId, userId?, action, metadata Json?, createdAt`) เพิ่ม action ใหม่:

- `DOCUMENT_READ` — metadata: `{ documentPublicationId, clientContactId }`
- `DOCUMENT_DOWNLOAD` — metadata: `{ documentPublicationId, clientContactId }`
- `INTAKE_STATUS_CHANGED` — metadata: `{ intakeId, from, to }`
- `CONTACT_ACCESS_GRANTED` / `CONTACT_ACCESS_REVOKED` — metadata: `{ clientContactId, caseId, grantedById }`

**งานที่ต้องเพิ่มจริง**: `AuditLog` เขียนอยู่แล้ว 11 จุดในโค้ดปัจจุบัน แต่ **ไม่มี endpoint อ่าน** เลย — ต้องสร้าง endpoint ใหม่ (เช่น `GET /admin/audit-logs?firmId=&action=&entityId=`) สำหรับให้สำนักงานตรวจสอบว่าใครอ่าน/ดาวน์โหลดอะไรเมื่อใด

## Field ที่ต้องเพิ่มในตารางเดิม

### Intake

```prisma
// ไม่เพิ่ม field intakeSourceChannel ใหม่ — ใช้ referralChannel เดิม (เพิ่ม PORTAL เข้า enum ReferralChannel ที่มีอยู่แล้ว)
portalSubmissionId  String?   @unique             // อ้างกลับไป PortalIntakeSubmission
clientRequestedDate DateTime? // แยกจากวันที่สำนักงานตกลง
officePlannedDate   DateTime?

statusMappings IntakeStatusMapping[]
```

**แก้ enum ที่มีอยู่แล้ว**:
```prisma
enum ReferralChannel {
  WALK_IN
  PHONE
  EMAIL
  LINE
  REFERRAL
  OTHER
  PORTAL  // เพิ่มค่าใหม่
}
```

### ClientContact

```prisma
department            String?   // "Legal" | "Finance" | "Management" — แยกฝ่ายโดยดีฟอลต์
lineUserId            String?   @unique
lineLinkCode          String?   @unique
lineLinkCodeExpiresAt DateTime?
lineConnectedAt       DateTime?
startDate             DateTime  @default(now())
endDate               DateTime?
isActive              Boolean   @default(true)
approvedById          String?   // สำนักงานอนุมัติ (ตามที่ยืนยัน)
approvedAt            DateTime?

caseAccess         ContactCaseAccess[]
notificationPrefs  ContactNotificationPreference[]
portalSubmissions  PortalIntakeSubmission[]
accessLogs         DocumentAccessAuditLog[]
```

### Case

```prisma
notesForClient   String?   @db.Text // สรุปภาษาลูกความ แยกจากบันทึกภายใน
lastPublishedAt  DateTime?

publications  DocumentPublication[]
contactAccess ContactCaseAccess[]
```

**หมายเหตุ**: ทนายเห็นทุกแฟ้มขององค์กรลูกความ (ยืนยันแล้ว) — สิทธิระดับทนายอยู่ที่ authorization layer ตามองค์กรลูกความโดยตรง ไม่ผ่าน `ContactCaseAccess` (ตารางนี้ใช้เฉพาะฝั่งผู้ติดต่อลูกค้าเท่านั้น)

## จุดเสี่ยงหลัก

| จุดเสี่ยง | ระดับ | การจัดการ |
|---|---|---|
| **`client-portal.service.ts` ปัจจุบันดึงทุกคดีของ `clientId` ตรง ๆ ไม่กรองรายแฟ้ม** — ต้องแก้ query จุดนี้ให้เช็ค `ContactCaseAccess` แทน มิฉะนั้นเปิด `portalEnabled` แล้วเห็นทุกแฟ้มทันที | 🔴 สูงสุด | แก้ `getCase()`/`getCases()` ใน `client-portal.service.ts` ให้ join กับ `ContactCaseAccess` เช็ค `startDate <= now AND (endDate IS NULL OR endDate >= now)` — ต้องทดสอบครบก่อนเปิด Portal จริง เพราะเป็นช่องโหว่สิทธิที่กระทบข้อมูลลูกความข้ามองค์กร |
| เพิ่มค่า `PORTAL` เข้า `ReferralChannel` enum ที่มีอยู่แล้ว | 🟢 ต่ำ | Prisma enum เพิ่มค่าใหม่ไม่กระทบข้อมูลเดิม (additive) |
| `IntakeStatusMapping` ต้องบังคับมีแถว `isCurrent=true` ได้แถวเดียวต่อ intake | 🟡 กลาง | partial unique index `WHERE isCurrent = true` |
| `PortalIntakeSubmission` กับ `Intake` แยกกัน อาจมี submission ที่ยังไม่ถูกแปลงเป็น Intake ค้างนาน | 🟡 กลาง | ต้องมี UI/รายงานเตือนเรื่องที่ค้างเกิน X วันยังไม่ถูกรับเข้า F01 |
| ตารางใหม่ทั้งหมด (Notification/Publication/OnHold/AuditLog) | 🟢 ต่ำ | Additive ล้วน rollback = drop table ไม่กระทบข้อมูลเดิม |

## ลำดับการสร้าง

1. **P0** (3–5 วัน): enums + models ใหม่ทั้งหมด (`PortalIntakeSubmission`, `IntakeStatusMapping`, `ContactCaseAccess`, `DocumentPublication`, `ContactNotificationPreference`, `TaskOnHold`, `DocumentAccessAuditLog`) + ขยาย Intake/ClientContact/Case
2. **P1** (3–4 วัน): backfill migration (`intakeSourceChannel`, `ClientContact.startDate`, `ContactCaseAccess` เปิดกว้างสำหรับผู้ติดต่อเดิม) + partial unique index บน `IntakeStatusMapping`
3. **P1** (สูงสุด, ต้องทดสอบละเอียด): query layer ตรวจสิทธิ `ContactCaseAccess` + `DocumentPublication` ทุกจุดที่ Portal ดึงข้อมูล
4. **P2** (3–5 วัน): UI — notification preference, publication approval, on-hold form, PortalIntakeSubmission intake queue

## ประเด็นที่ยังเปิดอยู่ (ไม่บล็อก แต่ต้องตัดสินใจตอน implement)

- Notification queuing: trigger event-driven หรือ scheduled job
- Case assignment (CaseAssignment.BUDDY) ส่งผลต่อ Portal visibility อัตโนมัติ หรือต้องมี `ContactCaseAccess` แยกทุกครั้ง
- Outlook draft integration ดึงข้อมูลจาก `DocumentPublication` + `Case.notesForClient` อย่างไร (รายละเอียดเชื่อมต่อ Outlook อยู่นอกขอบเขตเอกสารนี้)
