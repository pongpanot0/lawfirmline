# Case Opens at Acceptance (งานก่อนฟ้อง = คดี) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปิด Case ทันทีที่สำนักงานตัดสินใจ "รับดำเนินการ" (decide → accepted) ในเฟส `PRE_LITIGATION` แทนการรอกด "แปลงเป็นคดี" ตอนจะฟ้อง — งานก่อนฟ้อง (โนติส เจรจา เอกสาร เวลา บิล playbook) จึงเกาะอยู่บน Case ตั้งแต่ต้น พร้อมเพิ่ม `partyRole` (โจทก์/จำเลย) บนทั้ง Intake และ Case

**Architecture:** ย้าย conflict gate + การสร้าง case จาก `convertToCase` มาไว้ใน `decide()` โดย extract logic เดิมเป็น `openCaseFromIntake` ที่ใช้ร่วมกันทั้งสองทาง Case ที่เปิดจาก intake เริ่มที่ stage `PRE_LITIGATION` (enum มีอยู่แล้ว) การ "ยื่นฟ้อง" คือการเลื่อน case stage เป็น `FILING` ผ่าน UI stage เดิม endpoint `/intake/:id/convert` คงไว้เพื่อ intake เก่าที่ ACCEPTED ค้างอยู่ก่อน deploy งานโนติส/ใบเสนอราคาบน intake ยังใช้ endpoint เดิม (intake ผูก 1:1 กับ case ผ่าน `case.intakeId`) แต่เข้าถึงจากหน้า case ได้

**Tech Stack:** NestJS + Prisma (apps/api), Next.js (apps/web), Jest

**Spec:** inline ด้านล่าง (ตกลงกันในบทสนทนา ไม่มี spec doc แยก)

## Spec (behavioral)

1. `POST /intake/:id/decide` ด้วย decision ฝั่งรับ (`FILE_SUIT`, `NEGOTIATE_FIRST`, `SEND_NOTICE`, `COMPLAIN_TO_AUTHORITY`):
   - ต้องผ่าน conflict gate เดิม (`assertConflictCleared`) — ข้ามได้ด้วย `conflictOverrideReason`
   - เปิด case ใหม่ทันที stage `PRE_LITIGATION` (หรือ attach เข้าคดีเดิมถ้ามี `relatedCaseId`) ด้วย logic เดิมของ convertToCase ทั้งหมด (ownRef, ไฟล์, precedent, insurance claim, buddy, deadline event, task แรก)
   - intake → `status=CONVERTED`, `stage=CLOSED`, `decision`/`decisionNotes` บันทึกตามเดิม
   - DTO รับ field เพิ่ม: `title`, `leadLawyerId`, `caseTypeId`, `claimedAmount`, `conflictOverrideReason`
   - response ต้องมี case ที่เปิด (web ใช้ redirect + apply playbook)
2. `CONSULTATION_ONLY` / `DO_NOT_FILE` / `PENDING`: พฤติกรรมเดิมทุกประการ ไม่เปิด case
3. idempotent: decide ซ้ำบน intake ที่มี case แล้ว → คืน intake+case เดิม ไม่สร้างซ้ำ
4. `POST /intake/:id/convert` ยังทำงานเหมือนเดิม (สำหรับ intake ACCEPTED ที่ค้างจากก่อน deploy) — web แสดงปุ่มแปลงเฉพาะ `status===ACCEPTED && !case`
5. `partyRole` (`PLAINTIFF`|`DEFENDANT`, nullable) เพิ่มบน Intake และ Case, แก้ไขได้จากฟอร์ม intake และหน้า case, copy จาก intake → case ตอนเปิดคดี
6. หน้า case ที่ `stage=PRE_LITIGATION` และมี `intakeId` แสดงแผง "งานก่อนฟ้อง" สรุปสถานะโนติส + ลิงก์ไปหน้า intake; หน้า intake ที่ CONVERTED ยังใช้งานโนติส/quote ได้ (backend ไม่เคยบล็อกอยู่แล้ว — งานคือเลิกซ่อน UI) พร้อม banner ลิงก์ไปคดี

## Global Constraints

- Prisma migration: สร้างไฟล์ด้วย `npx prisma migrate diff` / เขียน SQL เอง แล้ว apply กับ worktree DB ด้วย `psql` + `prisma migrate resolve --applied` — **ห้าม `prisma migrate dev`** (ดู memory: worktree preview setup)
- Schema conflicts กับ main เป็น additive — merge แบบ union
- ข้อความ UI เป็นภาษาไทยตามสไตล์ไฟล์เดิม
- ทุก commit ลงท้าย `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- รัน test: `cd apps/api && npx jest <file>` (rebuild `packages/shared/dist` ก่อนถ้า import พัง — ดู memory: test env gotchas)

---

### Task 1: Schema — `PartyRole` บน Intake + Case

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_party_role/migration.sql`

**Interfaces:**
- Produces: enum `PartyRole { PLAINTIFF DEFENDANT }`, field `partyRole PartyRole?` บน `model Intake` และ `model Case`

- [ ] **Step 1: เพิ่มใน schema.prisma**

```prisma
enum PartyRole {
  PLAINTIFF
  DEFENDANT
}
```

และใน `model Intake` (ใกล้ `opposingParty`) กับ `model Case` (ใกล้ `clientName`):

```prisma
  /// ฝ่ายเรา — โจทก์หรือจำเลย ให้ AI และทีมรู้มุมที่ต้องทำงาน
  partyRole PartyRole?
```

- [ ] **Step 2: สร้าง migration SQL**

```sql
CREATE TYPE "PartyRole" AS ENUM ('PLAINTIFF', 'DEFENDANT');
ALTER TABLE "Intake" ADD COLUMN "partyRole" "PartyRole";
ALTER TABLE "Case" ADD COLUMN "partyRole" "PartyRole";
```

(เช็คชื่อตารางจริงจาก `@@map` ใน schema ก่อน — ถ้าไม่มี `@@map` ใช้ชื่อ model ตรง ๆ)

- [ ] **Step 3: Apply กับ worktree DB ผ่าน psql แล้ว `npx prisma migrate resolve --applied <name>` และ `npx prisma generate`**
- [ ] **Step 4: `npx tsc --noEmit` ใน apps/api ผ่าน**
- [ ] **Step 5: Commit** `feat(db): add partyRole (โจทก์/จำเลย) to Intake and Case`

### Task 2: Backend refactor — extract `openCaseFromIntake` (ไม่เปลี่ยนพฤติกรรม)

**Files:**
- Modify: `apps/api/src/intake/intake.service.ts:895-1070`
- Test: `apps/api/src/intake/intake.service.spec.ts` (ของเดิมต้องผ่านครบ)

**Interfaces:**
- Produces: `private async openCaseFromIntake(user: AuthUser, intake: <return type ของ findOne>, dto: { title?: string; leadLawyerId?: string; caseTypeId?: string; claimedAmount?: number; conflictOverrideReason?: string }): Promise<Case>` — ทำทุกอย่างตั้งแต่ gen ownRef ถึงสร้าง task แรก (บรรทัด 914–1069 เดิม) รวม `partyRole: intake.partyRole` ใน `case.create`
- Consumes: `PartyRole` จาก Task 1

- [ ] **Step 1: ย้าย body ของ convertToCase (หลัง conflict gate/relatedCaseId branch) ไปเป็น `openCaseFromIntake`; `convertToCase` เหลือ: idempotency check → `assertConflictCleared` → relatedCaseId ? `attachToExistingCase` : `openCaseFromIntake`**
- [ ] **Step 2: เพิ่ม `partyRole: intake.partyRole ?? undefined` ใน `prisma.case.create` data**
- [ ] **Step 3: รัน `npx jest intake.service.spec.ts` — ผ่านครบ (spec เดิม cover convert path อยู่แล้ว)**
- [ ] **Step 4: Commit** `refactor(intake): extract openCaseFromIntake from convertToCase, carry partyRole`

### Task 3: Backend — decide ฝั่งรับ → เปิดคดีทันที stage PRE_LITIGATION

**Files:**
- Modify: `apps/api/src/intake/intake.service.ts` (`decide()`, `openCaseFromIntake`), `apps/api/src/intake/dto/intake.dto.ts` (`DecideIntakeDto`)
- Test: `apps/api/src/intake/intake.service.spec.ts`

**Interfaces:**
- Consumes: `openCaseFromIntake`, `attachToExistingCase`, `assertConflictCleared` (มีอยู่แล้วที่ intake.service.ts:880)
- Produces: `decide()` คืน intake (include เดิม) ที่มี `case` ผูกแล้วเมื่อ accepted; `DecideIntakeDto` เพิ่ม optional: `title`, `leadLawyerId` (UUID), `caseTypeId` (UUID), `claimedAmount` (number ≥0), `conflictOverrideReason` (string)

- [ ] **Step 1: เขียน failing tests** (ตามสไตล์ mock prisma ของ spec เดิมในไฟล์)

```typescript
describe('decide opens the case at acceptance', () => {
  it('FILE_SUIT with cleared conflict opens a PRE_LITIGATION case and converts the intake', async () => {
    // arrange: intake ไม่มี case, conflictCheck.latestForIntake → { result: 'CLEAR' }
    // act: service.decide(user, id, { decision: IntakeDecision.FILE_SUIT })
    // assert: prisma.case.create ถูกเรียกด้วย stage: 'PRE_LITIGATION'
    //         intake.update ถูกเรียกด้วย status: 'CONVERTED', stage: IntakeStage.CLOSED
  });
  it('rejects acceptance when conflict is not cleared and no override reason', async () => {
    // latestForIntake → { result: 'HIT' } → expect BadRequestException, case.create ไม่ถูกเรียก
  });
  it('CONSULTATION_ONLY does not open a case (unchanged behavior)', async () => {});
  it('accepted decision with relatedCaseId attaches instead of creating', async () => {});
  it('decide on an intake that already has a case returns it without creating another', async () => {});
});
```

- [ ] **Step 2: รัน test → FAIL**
- [ ] **Step 3: Implement**

ใน `DecideIntakeDto` เพิ่ม field ตาม Produces (ใช้ decorator ชุดเดียวกับ `ConvertToCaseDto` ที่ dto/intake.dto.ts:503)

ใน `decide()`:

```typescript
async decide(user: AuthUser, id: string, dto: DecideIntakeDto) {
  const intake = await this.findOne(user, id);

  const acceptedDecisions: IntakeDecision[] = [/* เดิม */];
  const accepted = acceptedDecisions.includes(dto.decision);

  if (accepted) {
    // เปิดคดีทันทีที่รับดำเนินการ — งานก่อนฟ้องคือคดีแล้ว ไม่ใช่ lead
    if (!intake.case) {
      await this.assertConflictCleared(user, intake.id, dto.conflictOverrideReason);
    }
    await this.prisma.intake.update({
      where: { id },
      data: { decidedAt: new Date(), decision: dto.decision as any,
              decisionNotes: dto.decisionNotes, clientDecision: dto.clientDecision },
    });
    if (!intake.case) {
      if (intake.relatedCaseId) await this.attachToExistingCase(user, intake, dto);
      else await this.openCaseFromIntake(user, intake, dto);
    }
    // openCaseFromIntake/attachToExistingCase ตั้ง status=CONVERTED + stage=CLOSED เองแล้ว
    return this.findOne(user, id);
  }

  // ฝั่งไม่รับ / ปรึกษาอย่างเดียว — พฤติกรรมเดิมทุกบรรทัด
  ...
}
```

ใน `openCaseFromIntake` เปลี่ยน `case.create` ให้ตั้ง `stage: 'PRE_LITIGATION' as any, stageChangedAt: new Date()` (ค่า default เดิมคือ INTAKE_REVIEW — คดีที่ผ่าน intake มาแล้วไม่ต้อง review ซ้ำ)

- [ ] **Step 4: รัน `npx jest intake.service.spec.ts intake-gates.spec.ts intake-status-mapping.spec.ts` → PASS ทั้งหมด (ถ้า gate spec เดิม assert ว่า decide ไม่แตะ conflict — อัปเดต spec ให้ตรง behavior ใหม่ พร้อมคอมเมนต์ว่า gate ย้ายมาที่ decide)**
- [ ] **Step 5: Commit** `feat(intake): open case at acceptance in PRE_LITIGATION stage, conflict gate at decide`

### Task 4: Web — ฟอร์ม partyRole (intake + case)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/intake/new/page.tsx`, `apps/web/src/app/(dashboard)/intake/[id]/page.tsx` (ส่วนแก้ไขรายละเอียด modal `details`), `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` (ส่วนแก้ไขข้อมูลคดี), `apps/web/src/lib/api.ts` (types)
- Modify: `apps/api/src/intake/dto/intake.dto.ts` (Create/Update intake DTO), `apps/api/src/cases/dto/case.dto.ts` (Create/Update case DTO) — เพิ่ม `@IsOptional() @IsEnum(PartyRole) partyRole?: PartyRole`

**Interfaces:**
- Consumes: `partyRole` จาก Task 1
- Produces: dropdown 3 ค่า: ไม่ระบุ / โจทก์ (ฝ่ายเราฟ้อง) / จำเลย (ฝ่ายเราถูกฟ้อง) — ใช้ select ธรรมดาตามสไตล์ฟอร์มเดิมในไฟล์

- [ ] **Step 1: เพิ่ม field ใน DTO ทั้ง 4 จุด + ตรวจว่า service `update`/`create` ของ intake และ cases ส่ง field ผ่าน (ถ้า service ใช้ spread ของ dto อยู่แล้วก็ไม่ต้องแก้ — อ่านโค้ดก่อน)**
- [ ] **Step 2: เพิ่ม select ในฟอร์ม intake new + intake details modal + case edit พร้อม label "ฝ่ายเรา" และ options ข้างบน; แสดง badge "โจทก์"/"จำเลย" ใน header ของหน้า intake และหน้า case เมื่อมีค่า**
- [ ] **Step 3: ตรวจด้วย preview (launch.json ports 3011/3015): แก้ intake หนึ่งรายการ ตั้งเป็นโจทก์ → reload เห็นค่า; เปิดคดีจาก intake → case ได้ partyRole ตาม**
- [ ] **Step 4: Commit** `feat: partyRole โจทก์/จำเลย on intake and case forms`

### Task 5: Web — decide modal เปิดคดีจริง (กลืน convert modal)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/intake/[id]/page.tsx` (`handleDecide` :480, modal `decide` :1452, convert modal :1885), `apps/web/src/lib/api.ts` (`decideIntake` payload type)

**Interfaces:**
- Consumes: `decide` endpoint ใหม่ (Task 3) — response คือ intake ที่มี `case.id`
- Produces: decide modal ฝั่งรับมี field: ชื่อคดี (default จาก intake.title), ทนายเจ้าของคดี, จำนวนเงินที่เรียกร้อง, playbook picker (ย้าย JSX จาก convert modal เดิม :1606), ช่องเหตุผล override conflict (แสดงเมื่อ API ตอบ 400 conflict)

- [ ] **Step 1: ขยาย `handleDecide`:** เมื่อ decision เป็นฝั่งรับ → เรียก `api.decideIntake(token, id, { decision, decisionNotes, title, leadLawyerId, claimedAmount, conflictOverrideReason })`; จาก response เอา `case.id` → ถ้าเลือก playbook เรียก `setupRequest(token, `/cases/${caseId}/apply`, { releaseId })` (pattern เดียวกับ :839-841) → `router.push(`/cases/${caseId}`)`. decision ฝั่งอื่นเหมือนเดิม
- [ ] **Step 2: ย้าย field UI จาก convert modal มาไว้ใน decide modal (แสดงเฉพาะเมื่อเลือก decision ฝั่งรับ); ถ้า API ตอบ error มีคำว่า conflict ให้เปิดช่อง `conflictOverrideReason` แล้วส่งซ้ำ**
- [ ] **Step 3: ปุ่ม "แปลงเป็นคดี" เดิม: แสดงเฉพาะ `intake.status === 'ACCEPTED' && !intake.case` (ทางหนีสำหรับ intake เก่าก่อน deploy) — convert modal เดิมคงไว้เพื่อ path นี้**
- [ ] **Step 4: ตรวจ preview: เดินครบ flow รับเรื่องใหม่ → assess → decide FILE_SUIT พร้อม playbook → ต้อง land ที่หน้าคดี stage "ก่อนฟ้อง" มี task แรก + playbook applied**
- [ ] **Step 5: Commit** `feat(web): decide modal opens the case directly, convert kept for legacy accepted intakes`

### Task 6: Web — แผงงานก่อนฟ้องบนหน้าคดี + intake ที่ converted ยังทำงานได้

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`, `apps/web/src/app/(dashboard)/intake/[id]/page.tsx`
- ตรวจ: `apps/web/src/lib/stage-labels.ts` (label ของ `PRE_LITIGATION` ต้องมี — ถ้าไม่มีเพิ่ม "ก่อนฟ้อง / เจรจา")

**Interfaces:**
- Consumes: `case.intakeId` (มีใน schema แล้ว, ตรวจว่า API คืน field นี้ + notice fields ของ intake)

- [ ] **Step 1: หน้า case เมื่อ `intake` ผูกอยู่และ stage ยังไม่ถึง FILING: แสดง card "งานก่อนฟ้อง" — สถานะโนติส (noticeIssuedAt/noticeDeadline/noticeResult จาก intake), สถานะเจรจา (preLitigationStatus), ปุ่มลิงก์ "จัดการโนติส/ใบเสนอราคา →" ไป `/intake/{intakeId}`** (v1 ลิงก์ไปหน้า intake — ยังไม่ย้าย UI โนติสทั้งชุดมา; ceiling รู้อยู่, ย้ายเมื่อทีมบ่นว่าสลับหน้าบ่อย)
- [ ] **Step 2: หน้า intake เมื่อ `status === 'CONVERTED'`: เลิก disable ปุ่มโนติส/quote (backend ไม่บล็อกอยู่แล้ว — grep เงื่อนไข `status !== 'CONVERTED'`/`disabled` ในไฟล์ก่อน) + banner บนหัว "เรื่องนี้เปิดเป็นคดีแล้ว → [ownRef]" ลิงก์ไปหน้าคดี ซ่อนปุ่ม assess/decide**
- [ ] **Step 3: ตรวจ preview: จากคดีที่เพิ่งเปิด กดเข้าโนติส ออกหนังสือได้ กลับมาเห็นสถานะบน card คดี**
- [ ] **Step 4: Commit** `feat(web): pre-litigation panel on case page, converted intake stays workable`

### Task 7: Docs + regression

**Files:**
- Modify: `docs/` ไฟล์ intake/case flow ที่มีอยู่ (grep "convert" ใน docs/ ก่อน), เพิ่มเคสใน josh-qa case bank ถ้าโปรเจกต์นี้มี pattern เดียวกัน (ถ้าไม่มี ข้าม)
- Test: รัน suite intake + cases ทั้งหมดใน worktree

- [ ] **Step 1: อัปเดต docs ให้ตรง flow ใหม่: decide=เปิดคดี, convert=legacy, partyRole**
- [ ] **Step 2: `npx jest src/intake src/cases` ผ่านครบ**
- [ ] **Step 3: Commit** `docs: intake opens case at acceptance`

## Self-Review notes

- Spec ข้อ 3 (idempotent) → Task 3 test สุดท้าย; ข้อ 4 → Task 5 Step 3; ข้อ 5 → Tasks 1,2,4; ข้อ 6 → Task 6
- `attachToExistingCase` รับ dto type `ConvertToCaseDto` — `DecideIntakeDto` ใหม่มี field superset จึงส่งผ่านได้ (structural typing) แต่ implementer Task 3 ต้องเช็ค signature จริง
- ไม่มี data migration อัตโนมัติ: intake ACCEPTED ค้างเก่าใช้ปุ่มแปลง legacy (Task 5 Step 3)
