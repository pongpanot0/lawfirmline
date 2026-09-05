# Client Portal — ส่งเรื่องใหม่และติดตามสถานะ (Phase C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ลูกความส่งเรื่องใหม่ผ่าน Client Portal ได้เลขอ้างอิง เห็นรายการเรื่องที่ส่งพร้อมสถานะภาษาลูกความ และให้สำนักงานเห็น/รับเรื่องเหล่านั้นเข้าสู่ F01 Intake pipeline เดียวกับช่องทางอื่น (ตาม requirements ส่วนที่ 3 ในเอกสาร consolidated requirements — "ไหลเข้า F01 pipeline เดียวกัน")

**Architecture:** เพิ่ม Prisma model `PortalIntakeSubmission` (แยกจาก `Intake` — เก็บ field เฉพาะฝั่งลูกความ เช่น `referenceNumber`, `urgencyFlag`, `withdrawnByClient`) ตามที่ตัดสินใจไว้แล้วในเอกสาร schema design ฝั่งลูกความส่งผ่าน `ClientPortalIntakeService` ใหม่ (อยู่ใน `client-portal` module เดิม ใช้ guard เดิม `ClientPortalGuard`) ฝั่งสำนักงานเห็นรายการและ "รับเข้า F01" ผ่าน `IntakeService.convertPortalSubmission()` ใหม่ (เพิ่มใน `intake` module เดิม ใช้ guard staff เดิม) เมื่อรับเข้าแล้วสร้าง `Intake` จริงพร้อม `referralChannel: PORTAL` (ค่าใหม่ในenum เดิม) และ `portalSubmissionId` ผูกกลับ สถานะภาษาลูกความคำนวณจาก pure mapping function (ไม่ใช่ audit table เต็มรูปแบบ — ดู Global Constraints ข้อสุดท้าย)

**Tech Stack:** NestJS 11 + Prisma 6 (apps/api), Next.js (apps/web), Jest (มีอยู่แล้ว)

**Spec:**
- `docs/research/2026-09-05-customer-portal-consolidated-requirements.md` (ส่วนที่ 2, 3, 4 — โครงหน้าจอ, การรับงานฝั่งสำนักงาน, status mapping)
- `docs/research/2026-09-05-customer-portal-schema-design.md` (ส่วนที่ 2 model `PortalIntakeSubmission`, `IntakeStatusMapping`)

## Global Constraints

- เรื่องที่ลูกความส่งไม่ถือว่าสำนักงานตกลงรับดำเนินการแล้ว — `PortalIntakeSubmission` สร้างแล้ว ≠ `Intake` ถูกสร้าง จนกว่าสำนักงานจะกด "รับเข้า F01" เอง
- **แยก `clientRequestedDate` (วันที่ลูกความต้องการ) จาก `officePlannedDate`** เมื่อแปลงเป็น Intake เสมอ — ห้ามใช้ field เดียวกัน
- `PortalIntakeSubmission` ต้องผูกกับ `clientId` ผ่าน `portalUser.clientId` เท่านั้น (จาก JWT) ห้ามรับ `clientId` จาก body ที่ client ส่งมาเอง (ป้องกันการปลอมเป็นลูกความรายอื่น)
- ผู้ติดต่อเห็นเฉพาะเรื่องที่ตนเองส่ง (`clientContactId` ตรงกับ `portalUser.clientContactId`) — **ไม่ใช่ทุกเรื่องขององค์กร** (ตรงกับหลัก "ไม่เปิดให้ผู้ติดต่อทุกคนเพียงเพราะอยู่บริษัทเดียวกัน" — v1 ยังไม่มี `ContactCaseAccess` เต็มรูปแบบ ดังนั้นใช้กติกาง่ายสุดคือ "เห็นเฉพาะที่ตัวเองส่ง" ไปก่อน)
- **เพิ่มค่า `PORTAL` เข้า `ReferralChannel` enum เดิม** — ห้ามสร้าง field ใหม่แยกสำหรับแหล่งที่มา (ตัดสินใจไว้แล้วในเอกสาร schema design)
- **ตัดสินใจ (ruling) ของแผนนี้**: `IntakeStatusMapping` ในเอกสาร schema design ออกแบบเป็นตาราง audit เต็มรูปแบบ (insert แถวใหม่ทุกครั้งที่สถานะเปลี่ยน) แต่แผนนี้เลือกทำเป็น **pure mapping function** (`mapInternalStatusToExternal(intake)`) แทนในรุ่นแรก เพราะการ insert audit row ทุกจุดที่ `IntakeService` เปลี่ยนสถานะ (assess/decide/convert/notice — มี 5 จุดที่มีอยู่แล้ว) เป็นงาน cross-cutting ที่ควรแยกเป็นแผนของตัวเอง ไม่ผูกกับงาน intake ครั้งนี้ — ฟังก์ชัน pure ยังให้ผลลัพธ์ตรงตาม requirement (สถานะภาษาลูกความต่างจาก enum ภายใน) เพียงไม่มีประวัติการเปลี่ยนสถานะเก็บถาวร ซึ่งเป็นขอบเขตที่ตัดออกอย่างมีเหตุผล ไม่ใช่ลืมทำ
- Import guard/decorator จาก path จริงเท่านั้น: staff ใช้ `JwtAuthGuard, RolesGuard` จาก `../common/guards/...` (ตาม `intake.controller.ts`), portal ใช้ `ClientPortalGuard` จาก `../client-portal/client-portal.guard.ts` และ `CurrentPortalUser` จาก `../client-portal/current-portal-user.decorator.ts` (ตาม `client-portal.controller.ts`) — **ห้ามเดา path เอง เปิดไฟล์จริงดูก่อนทุกครั้ง**

---

## File Structure

**Create:**
- `apps/api/src/client-portal/dto/portal-intake.dto.ts` — `SubmitPortalIntakeDto`
- `apps/api/src/client-portal/client-portal-intake.service.ts` — `submit()`, `listMine()`
- `apps/api/src/client-portal/client-portal-intake.service.spec.ts`
- `apps/api/src/client-portal/client-portal-intake.controller.ts` — `POST /client-portal/intake`, `GET /client-portal/intake`
- `apps/api/src/intake/intake-status-mapping.ts` — pure function `mapInternalStatusToExternal(intake)`
- `apps/api/src/intake/intake-status-mapping.spec.ts`
- `apps/api/src/intake/dto/portal-submission.dto.ts` — `ConvertPortalSubmissionDto`
- `apps/web/src/app/(client-portal)/portal/intake/new/page.tsx` — ฟอร์มส่งเรื่องใหม่
- `apps/web/src/app/(client-portal)/portal/intake/page.tsx` — รายการเรื่องที่ส่งพร้อมสถานะ
- `apps/web/src/app/(dashboard)/intake/portal-submissions/page.tsx` — หน้าสำนักงานดูรายการที่ลูกความส่งมา + ปุ่มรับเข้า F01

**Modify:**
- `apps/api/prisma/schema.prisma` — เพิ่ม model `PortalIntakeSubmission`, เพิ่ม `PORTAL` เข้า `ReferralChannel`, เพิ่ม `portalSubmissionId` ใน `Intake`
- `apps/api/src/client-portal/client-portal.module.ts` — เพิ่ม controller/service ใหม่
- `apps/api/src/intake/intake.service.ts` — เพิ่ม `convertPortalSubmission()`, `listPortalSubmissions()`
- `apps/api/src/intake/intake.controller.ts` — เพิ่ม route `GET /intake/portal-submissions`, `POST /intake/portal-submissions/:id/convert`
- `apps/web/src/lib/portal-api.ts` — เพิ่ม `submitIntake`, `getMyIntakeSubmissions`
- `apps/web/src/app/(client-portal)/portal/page.tsx` — เพิ่มปุ่ม "ส่งเรื่องใหม่"
- `apps/web/src/lib/api.ts` — เพิ่ม `listPortalSubmissions`, `convertPortalSubmission` (staff client)

---

### Task 1: Prisma — `PortalIntakeSubmission` + enum `PORTAL` + `Intake.portalSubmissionId`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `prisma.portalIntakeSubmission` client methods, `ReferralChannel.PORTAL` enum value, `Intake.portalSubmissionId: String? @unique`

- [ ] **Step 1: เพิ่ม `PORTAL` เข้า enum ที่มีอยู่แล้ว**

หา `enum ReferralChannel { WALK_IN PHONE EMAIL LINE REFERRAL OTHER }` แล้วเพิ่มค่าใหม่:
```prisma
enum ReferralChannel {
  WALK_IN
  PHONE
  EMAIL
  LINE
  REFERRAL
  OTHER
  PORTAL
}
```

- [ ] **Step 2: เพิ่ม model ต่อท้ายไฟล์ schema**

```prisma
model PortalIntakeSubmission {
  id                  String    @id @default(uuid())
  clientId            String
  clientContactId     String
  referenceNumber     String    @unique
  title               String
  detail              String    @db.Text
  clientRequestedDate DateTime?
  urgencyFlag         Boolean   @default(false)
  submittedAt         DateTime  @default(now())
  withdrawnByClient   Boolean   @default(false)
  withdrawnAt         DateTime?
  withdrawnReason     String?
  intakeId            String?   @unique
  createdAt           DateTime  @default(now())

  client        Client         @relation(fields: [clientId], references: [id], onDelete: Cascade)
  clientContact ClientContact  @relation(fields: [clientContactId], references: [id], onDelete: Cascade)
  intake        Intake?        @relation(fields: [intakeId], references: [id])

  @@index([clientId, submittedAt])
  @@index([clientContactId, submittedAt])
  @@index([withdrawnByClient])
}
```

- [ ] **Step 3: เพิ่ม field `portalSubmissionId` ใน `model Intake { ... }` (ต่อจาก field ที่มีอยู่แล้ว เช่น `deadlineDate`)**

```prisma
  portalSubmissionId String? @unique
```

- [ ] **Step 4: เพิ่ม back-relation ใน `model Client { ... }` และ `model ClientContact { ... }`**

ใน `Client`:
```prisma
  portalIntakeSubmissions PortalIntakeSubmission[]
```

ใน `ClientContact`:
```prisma
  portalIntakeSubmissions PortalIntakeSubmission[]
```

- [ ] **Step 5: สร้าง migration**

Run:
```bash
cd apps/api && pnpm prisma migrate dev --name add_portal_intake_submission
```
Expected: apply สำเร็จไม่มี drift error — ถ้าเจอ drift **ห้าม `migrate reset` เอง หยุดและรายงานทันที**

- [ ] **Step 6: ตรวจ Prisma Client**

Run:
```bash
cd apps/api && node -e "const {PrismaClient}=require('./src/generated/prisma');const p=new PrismaClient();console.log(typeof p.portalIntakeSubmission, p.referralChannel !== undefined || 'enum-not-exported-as-value-ok')"
```
Expected: บรรทัดแรกพิมพ์ `object`

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add PortalIntakeSubmission model and PORTAL referral channel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `ClientPortalIntakeService` — ลูกความส่งเรื่องใหม่และดูรายการของตน

**Files:**
- Create: `apps/api/src/client-portal/dto/portal-intake.dto.ts`
- Create: `apps/api/src/client-portal/client-portal-intake.service.ts`
- Create: `apps/api/src/client-portal/client-portal-intake.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `PortalIdentity` type (`{ clientContactId, clientId, firmId, name, email }` จาก `client-portal-jwt.strategy.ts`)
- Produces:
```ts
class ClientPortalIntakeService {
  submit(portalUser: PortalIdentity, dto: SubmitPortalIntakeDto): Promise<PortalIntakeSubmission>
  listMine(portalUser: PortalIdentity): Promise<PortalIntakeSubmissionWithStatus[]>
}
```
Task 3 (controller) เรียกทั้งสอง method ตรง ๆ

- [ ] **Step 1: สร้าง DTO**

`apps/api/src/client-portal/dto/portal-intake.dto.ts`:
```ts
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitPortalIntakeDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  detail!: string;

  @IsOptional()
  @IsDateString()
  clientRequestedDate?: string;

  @IsOptional()
  @IsBoolean()
  urgencyFlag?: boolean;
}
```

- [ ] **Step 2: เขียน test ที่ล้มเหลวก่อน**

`apps/api/src/client-portal/client-portal-intake.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ClientPortalIntakeService } from './client-portal-intake.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClientPortalIntakeService', () => {
  let service: ClientPortalIntakeService;
  const mockPrisma = {
    portalIntakeSubmission: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  const portalUser = {
    clientContactId: 'contact-1',
    clientId: 'client-1',
    firmId: 'firm-1',
    name: 'ทดสอบ',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientPortalIntakeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(ClientPortalIntakeService);
  });

  describe('submit', () => {
    it('creates a submission scoped to the authenticated contact and client, never trusting a client-supplied clientId', async () => {
      mockPrisma.portalIntakeSubmission.count.mockResolvedValue(0);
      mockPrisma.portalIntakeSubmission.create.mockResolvedValue({
        id: 'sub-1',
        referenceNumber: 'REQ-000001',
        clientId: 'client-1',
        clientContactId: 'contact-1',
        title: 'ขอคำปรึกษาเรื่องสัญญา',
        detail: 'รายละเอียด',
        urgencyFlag: false,
        withdrawnByClient: false,
        submittedAt: new Date('2026-09-05'),
      });

      const result = await service.submit(portalUser, {
        title: 'ขอคำปรึกษาเรื่องสัญญา',
        detail: 'รายละเอียด',
      });

      expect(mockPrisma.portalIntakeSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: 'client-1',
            clientContactId: 'contact-1',
            title: 'ขอคำปรึกษาเรื่องสัญญา',
          }),
        }),
      );
      expect(result.referenceNumber).toMatch(/^REQ-\d{6}$/);
    });
  });

  describe('listMine', () => {
    it('only returns submissions belonging to the authenticated contact', async () => {
      mockPrisma.portalIntakeSubmission.findMany.mockResolvedValue([
        { id: 'sub-1', clientContactId: 'contact-1', intakeId: null, intake: null },
      ]);

      await service.listMine(portalUser);

      expect(mockPrisma.portalIntakeSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientContactId: 'contact-1' }),
        }),
      );
    });
  });
});
```

- [ ] **Step 3: รัน test เพื่อดูว่าล้มเหลว**

Run: `cd apps/api && pnpm test -- client-portal-intake.service.spec.ts`
Expected: FAIL — `Cannot find module './client-portal-intake.service'`

- [ ] **Step 4: เขียน implementation**

`apps/api/src/client-portal/client-portal-intake.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SubmitPortalIntakeDto } from './dto/portal-intake.dto';

@Injectable()
export class ClientPortalIntakeService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(portalUser: PortalIdentity, dto: SubmitPortalIntakeDto) {
    const count = await this.prisma.portalIntakeSubmission.count();
    const referenceNumber = `REQ-${String(count + 1).padStart(6, '0')}`;

    return this.prisma.portalIntakeSubmission.create({
      data: {
        clientId: portalUser.clientId,
        clientContactId: portalUser.clientContactId,
        referenceNumber,
        title: dto.title,
        detail: dto.detail,
        clientRequestedDate: dto.clientRequestedDate
          ? new Date(dto.clientRequestedDate)
          : undefined,
        urgencyFlag: dto.urgencyFlag ?? false,
      },
    });
  }

  async listMine(portalUser: PortalIdentity) {
    return this.prisma.portalIntakeSubmission.findMany({
      where: { clientContactId: portalUser.clientContactId },
      include: {
        intake: { select: { id: true, status: true, decision: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }
}
```

**หมายเหตุ**: `count()` แบบตรง ๆ เพื่อสร้างเลขอ้างอิงมีความเสี่ยง race condition เล็กน้อยในทางทฤษฎี (สอง request พร้อมกันได้เลขซ้ำ) — ยอมรับความเสี่ยงนี้ในรุ่นแรกเพราะ traffic ต่ำ (ผู้ติดต่อคนเดียวส่งเรื่องพร้อมกันสองแท็บพร้อมกันนาน ๆ ครั้ง) ถ้าต้องการความถูกต้อง 100% ในอนาคตให้เปลี่ยนเป็น DB sequence — ไม่ใช่ scope ของแผนนี้

- [ ] **Step 5: รัน test เพื่อดูว่าผ่าน**

Run: `cd apps/api && pnpm test -- client-portal-intake.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: รันชุด test ทั้งหมดยืนยันไม่มี regression**

Run: `cd apps/api && pnpm test`
Expected: PASS ทุกไฟล์

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/client-portal/client-portal-intake.service.ts apps/api/src/client-portal/client-portal-intake.service.spec.ts apps/api/src/client-portal/dto/portal-intake.dto.ts
git commit -m "feat(api): add client-portal intake submission service

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `IntakeService.convertPortalSubmission()` + status mapping function

**Files:**
- Modify: `apps/api/src/intake/intake.service.ts`
- Create: `apps/api/src/intake/dto/portal-submission.dto.ts`
- Create: `apps/api/src/intake/intake-status-mapping.ts`
- Create: `apps/api/src/intake/intake-status-mapping.spec.ts`

**Interfaces:**
- Consumes: `PortalIntakeSubmission` model จาก Task 1, `AuthUser` (staff)
- Produces:
```ts
interface IntakeLike {
  status: 'RECEIVED' | 'ASSESSING' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED';
  decision: 'FILE_SUIT' | 'DO_NOT_FILE' | 'NEGOTIATE_FIRST' | 'SEND_NOTICE' | 'COMPLAIN_TO_AUTHORITY' | 'PENDING' | null;
}

function mapInternalStatusToExternal(intake: IntakeLike): string

class IntakeService {
  listPortalSubmissions(user: AuthUser): Promise<PortalIntakeSubmission[]>
  convertPortalSubmission(user: AuthUser, submissionId: string, dto: ConvertPortalSubmissionDto): Promise<Intake>
}
```
Task 4 (controller ฝั่ง client-portal) เรียก `mapInternalStatusToExternal` เพื่อ map `intake.status` ที่ include มาจาก `listMine()` (Task 2) — ต้อง export function นี้จาก `apps/api/src/intake/intake-status-mapping.ts` ให้ module อื่น import ได้

- [ ] **Step 1: เขียน test ของ `mapInternalStatusToExternal` ก่อน (pure function ทดสอบง่ายสุด)**

`apps/api/src/intake/intake-status-mapping.spec.ts`:
```ts
import { mapInternalStatusToExternal } from './intake-status-mapping';

describe('mapInternalStatusToExternal', () => {
  it('maps RECEIVED to "สำนักงานรับเรื่องแล้ว"', () => {
    expect(mapInternalStatusToExternal({ status: 'RECEIVED', decision: null })).toBe(
      'สำนักงานรับเรื่องแล้ว',
    );
  });

  it('maps ASSESSING to "รอตกลงขอบเขต"', () => {
    expect(mapInternalStatusToExternal({ status: 'ASSESSING', decision: null })).toBe(
      'รอตกลงขอบเขต',
    );
  });

  it('maps ACCEPTED to "รับดำเนินการ"', () => {
    expect(mapInternalStatusToExternal({ status: 'ACCEPTED', decision: 'FILE_SUIT' })).toBe(
      'รับดำเนินการ',
    );
  });

  it('maps REJECTED to "ไม่รับดำเนินการ"', () => {
    expect(mapInternalStatusToExternal({ status: 'REJECTED', decision: 'DO_NOT_FILE' })).toBe(
      'ไม่รับดำเนินการ',
    );
  });

  it('maps CONVERTED to "รับดำเนินการ" (case opened, still in progress from the client\'s view)', () => {
    expect(mapInternalStatusToExternal({ status: 'CONVERTED', decision: 'FILE_SUIT' })).toBe(
      'รับดำเนินการ',
    );
  });
});
```

- [ ] **Step 2: รัน test เพื่อดูว่าล้มเหลว**

Run: `cd apps/api && pnpm test -- intake-status-mapping.spec.ts`
Expected: FAIL — `Cannot find module './intake-status-mapping'`

- [ ] **Step 3: เขียน implementation**

`apps/api/src/intake/intake-status-mapping.ts`:
```ts
export interface IntakeLike {
  status: 'RECEIVED' | 'ASSESSING' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED';
  decision:
    | 'FILE_SUIT'
    | 'DO_NOT_FILE'
    | 'NEGOTIATE_FIRST'
    | 'SEND_NOTICE'
    | 'COMPLAIN_TO_AUTHORITY'
    | 'PENDING'
    | null;
}

const STATUS_LABELS: Record<IntakeLike['status'], string> = {
  RECEIVED: 'สำนักงานรับเรื่องแล้ว',
  ASSESSING: 'รอตกลงขอบเขต',
  ACCEPTED: 'รับดำเนินการ',
  REJECTED: 'ไม่รับดำเนินการ',
  CONVERTED: 'รับดำเนินการ',
};

export function mapInternalStatusToExternal(intake: IntakeLike): string {
  return STATUS_LABELS[intake.status];
}
```

- [ ] **Step 4: รัน test เพื่อดูว่าผ่าน**

Run: `cd apps/api && pnpm test -- intake-status-mapping.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: สร้าง DTO**

`apps/api/src/intake/dto/portal-submission.dto.ts`:
```ts
import { IsDateString, IsOptional } from 'class-validator';

export class ConvertPortalSubmissionDto {
  @IsOptional()
  @IsDateString()
  officePlannedDate?: string;
}
```

- [ ] **Step 6: เพิ่ม method ใน `apps/api/src/intake/intake.service.ts`**

เปิดไฟล์ดู `intakeInclude` และ method `create()`/`convertToCase()` เดิมก่อน แล้วเพิ่ม import ที่หัวไฟล์:
```ts
import { ReferralChannel } from '../generated/prisma';
```
(ปรับ import เดิมถ้ามีการ import enum จาก path เดียวกันอยู่แล้ว — อย่า import ซ้ำ)

เพิ่ม method ต่อท้าย class:
```ts
  async listPortalSubmissions(user: AuthUser) {
    return this.prisma.portalIntakeSubmission.findMany({
      where: { client: { firmId: user.firmId }, intakeId: null, withdrawnByClient: false },
      include: {
        clientContact: { select: { name: true, email: true } },
        client: { select: { name: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async convertPortalSubmission(
    user: AuthUser,
    submissionId: string,
    dto: ConvertPortalSubmissionDto,
  ) {
    const submission = await this.prisma.portalIntakeSubmission.findFirst({
      where: { id: submissionId, client: { firmId: user.firmId } },
    });
    if (!submission) {
      throw new NotFoundException('ไม่พบเรื่องที่ส่งจาก Portal นี้');
    }
    if (submission.intakeId) {
      throw new BadRequestException('เรื่องนี้ถูกรับเข้าระบบไปแล้ว');
    }

    const intake = await this.prisma.intake.create({
      data: {
        firmId: user.firmId,
        receivedById: user.id,
        receivedDate: new Date(),
        title: submission.title,
        description: submission.detail,
        referralChannel: ReferralChannel.PORTAL,
        clientId: submission.clientId,
        deadlineDate: dto.officePlannedDate ? new Date(dto.officePlannedDate) : undefined,
        portalSubmissionId: submission.id,
      },
    });

    await this.prisma.portalIntakeSubmission.update({
      where: { id: submission.id },
      data: { intakeId: intake.id },
    });

    return intake;
  }
```

เพิ่ม import ของ exception/DTO ที่หัวไฟล์ตามที่ต้องใช้เพิ่ม (`NotFoundException`, `BadRequestException` จาก `@nestjs/common` ถ้ายังไม่ได้ import; `ConvertPortalSubmissionDto` จาก `./dto/portal-submission.dto`)

**หมายเหตุ**: `clientRequestedDate` ของ submission ไม่ได้ copy เข้า `Intake.deadlineDate` — `deadlineDate` ใน `Intake` คือเส้นตายทางกฎหมาย/ภายใน ไม่ใช่ "วันที่ลูกความต้องการ" ปล่อยว่างไว้ ให้ทนายกรอกเองตอนประเมินคดี (ตรงตาม Global Constraint ที่ห้ามปนสอง field นี้)

- [ ] **Step 7: build เพื่อตรวจ compile error**

Run: `cd apps/api && pnpm build`
Expected: build สำเร็จไม่มี error

- [ ] **Step 8: รันชุด test ทั้งหมดยืนยันไม่มี regression**

Run: `cd apps/api && pnpm test`
Expected: PASS ทุกไฟล์

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/intake apps/api/src/generated
git commit -m "feat(api): convert portal intake submissions into F01 intake

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: เปิด endpoint ทั้งสองฝั่ง (client-portal + staff intake)

**Files:**
- Create: `apps/api/src/client-portal/client-portal-intake.controller.ts`
- Modify: `apps/api/src/client-portal/client-portal.module.ts`
- Modify: `apps/api/src/intake/intake.controller.ts`

**Interfaces:**
- Consumes: `ClientPortalIntakeService` จาก Task 2, `IntakeService.listPortalSubmissions/convertPortalSubmission` + `mapInternalStatusToExternal` จาก Task 3
- Produces:
  - `POST /client-portal/intake` → `SubmitPortalIntakeDto` → `PortalIntakeSubmission`
  - `GET /client-portal/intake` → รายการพร้อม `externalStatus` (คำนวณจาก `mapInternalStatusToExternal` เมื่อมี `intake` ผูกอยู่ ไม่มีก็เป็น `"ส่งแล้ว"`)
  - `GET /intake/portal-submissions` (staff)
  - `POST /intake/portal-submissions/:id/convert` (staff)

- [ ] **Step 1: เปิด `apps/api/src/client-portal/client-portal.controller.ts` ดู pattern จริงก่อนเขียน controller ใหม่ (import `ClientPortalGuard`, `CurrentPortalUser`, `@UseGuards`, `@SkipSubscription` จาก path จริง)**

`apps/api/src/client-portal/client-portal-intake.controller.ts`:
```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
// TODO: คัดลอก import ต่อไปนี้จาก path จริงใน client-portal.controller.ts
// import { ClientPortalGuard } from './client-portal.guard';
// import { CurrentPortalUser } from './current-portal-user.decorator';
// import { PortalIdentity } from './client-portal-jwt.strategy';
// import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { ClientPortalIntakeService } from './client-portal-intake.service';
import { SubmitPortalIntakeDto } from './dto/portal-intake.dto';
import { mapInternalStatusToExternal } from '../intake/intake-status-mapping';

@Controller('client-portal/intake')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientPortalIntakeController {
  constructor(private readonly intakeService: ClientPortalIntakeService) {}

  @Post()
  submit(@CurrentPortalUser() user: PortalIdentity, @Body() dto: SubmitPortalIntakeDto) {
    return this.intakeService.submit(user, dto);
  }

  @Get()
  async listMine(@CurrentPortalUser() user: PortalIdentity) {
    const submissions = await this.intakeService.listMine(user);
    return submissions.map((s) => ({
      id: s.id,
      referenceNumber: s.referenceNumber,
      title: s.title,
      submittedAt: s.submittedAt,
      withdrawnByClient: s.withdrawnByClient,
      externalStatus: s.intake ? mapInternalStatusToExternal(s.intake) : 'ส่งแล้ว',
    }));
  }
}
```

- [ ] **Step 2: เปิด `apps/api/src/client-portal/client-portal.module.ts` เพิ่ม controller/service ใหม่ใน `controllers`/`providers` array**

- [ ] **Step 3: เปิด `apps/api/src/intake/intake.controller.ts` ดู pattern route เดิม (guard `JwtAuthGuard, RolesGuard` ระดับ class) แล้วเพิ่ม route ใหม่**

```ts
  @Get('portal-submissions')
  listPortalSubmissions(@CurrentUser() user: AuthUser) {
    return this.intakeService.listPortalSubmissions(user);
  }

  @Post('portal-submissions/:id/convert')
  convertPortalSubmission(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConvertPortalSubmissionDto,
  ) {
    return this.intakeService.convertPortalSubmission(user, id, dto);
  }
```
เพิ่ม import `ConvertPortalSubmissionDto` จาก `./dto/portal-submission.dto`

**หมายเหตุ**: วางสอง route นี้**ก่อน** route `GET /intake/:id` และ `PATCH /intake/:id` ในไฟล์ (ถ้ามี wildcard param route อยู่ก่อน) เพื่อไม่ให้ NestJS จับ `portal-submissions` เป็นค่าของ `:id` โดยไม่ตั้งใจ — เปิดไฟล์ดูลำดับ route จริงก่อนแทรก

- [ ] **Step 4: build เพื่อตรวจ compile error**

Run: `cd apps/api && pnpm build`
Expected: build สำเร็จไม่มี error

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/client-portal apps/api/src/intake
git commit -m "feat(api): expose portal intake submission endpoints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: หน้าเว็บฝั่งลูกความ — ส่งเรื่องใหม่และดูรายการ

**Files:**
- Modify: `apps/web/src/lib/portal-api.ts`
- Create: `apps/web/src/app/(client-portal)/portal/intake/new/page.tsx`
- Create: `apps/web/src/app/(client-portal)/portal/intake/page.tsx`
- Modify: `apps/web/src/app/(client-portal)/portal/page.tsx`

**Interfaces:**
- Consumes: `POST /client-portal/intake`, `GET /client-portal/intake` จาก Task 4

- [ ] **Step 1: เปิด `apps/web/src/lib/portal-api.ts` ดู pattern `request<T>` จริงก่อนเพิ่ม method**

เพิ่มต่อท้าย object `portalApi`:
```ts
export interface PortalIntakeSubmissionEntry {
  id: string;
  referenceNumber: string;
  title: string;
  submittedAt: string;
  withdrawnByClient: boolean;
  externalStatus: string;
}

// เพิ่มเข้า object portalApi ตามรูปแบบ request<T> เดิม:
// submitIntake: (token, dto: {title, detail, clientRequestedDate?, urgencyFlag?}) -> POST /client-portal/intake
// getMyIntakeSubmissions: (token) -> GET /client-portal/intake, คืนค่า PortalIntakeSubmissionEntry[]
```

- [ ] **Step 2: สร้าง `apps/web/src/app/(client-portal)/portal/intake/new/page.tsx`**

เปิด `apps/web/src/app/(client-portal)/portal/cases/[id]/page.tsx` ดู convention จริงก่อน (`usePortalAuth()`, layout, component imports) แล้วทำฟอร์มตามรูปแบบเดียวกัน:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { portalApi } from '@/lib/portal-api';
// TODO: import usePortalAuth จาก path จริงที่ cases/[id]/page.tsx ใช้

export default function NewIntakePage() {
  const router = useRouter();
  const { token } = usePortalAuth(); // แทนที่ด้วย hook จริง
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [clientRequestedDate, setClientRequestedDate] = useState('');
  const [urgencyFlag, setUrgencyFlag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const result = await portalApi.submitIntake(token, {
        title,
        detail,
        clientRequestedDate: clientRequestedDate || undefined,
        urgencyFlag,
      });
      setReferenceNumber(result.referenceNumber);
    } finally {
      setSubmitting(false);
    }
  };

  if (referenceNumber) {
    return (
      <div className="min-h-screen w-full bg-background p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-lg font-medium">ส่งเรื่องสำเร็จ</p>
            <p className="mt-2">เลขอ้างอิงของท่านคือ: {referenceNumber}</p>
            <button
              className="mt-4 rounded bg-blue-600 px-4 py-2 text-white"
              onClick={() => router.push('/portal/intake')}
            >
              ดูรายการเรื่องที่ส่ง
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background p-6">
      <Card>
        <CardHeader>
          <CardTitle>ส่งเรื่องใหม่</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="block text-sm font-medium">หัวข้อ</label>
          <input
            className="mb-4 w-full border p-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="block text-sm font-medium">รายละเอียด</label>
          <textarea
            className="mb-4 h-32 w-full border p-2"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          <label className="block text-sm font-medium">วันที่ต้องการ (ถ้ามี)</label>
          <input
            type="date"
            className="mb-4 w-full border p-2"
            value={clientRequestedDate}
            onChange={(e) => setClientRequestedDate(e.target.value)}
          />
          <label className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={urgencyFlag}
              onChange={(e) => setUrgencyFlag(e.target.checked)}
            />
            เรื่องเร่งด่วน
          </label>
          <button
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            onClick={handleSubmit}
            disabled={submitting || !title || !detail}
          >
            {submitting ? 'กำลังส่ง...' : 'ส่งเรื่อง'}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: สร้าง `apps/web/src/app/(client-portal)/portal/intake/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { portalApi, type PortalIntakeSubmissionEntry } from '@/lib/portal-api';
// TODO: import usePortalAuth จาก path จริง

export default function MyIntakeSubmissionsPage() {
  const { token } = usePortalAuth(); // แทนที่ด้วย hook จริง
  const [items, setItems] = useState<PortalIntakeSubmissionEntry[]>([]);

  useEffect(() => {
    if (!token) return;
    portalApi.getMyIntakeSubmissions(token).then(setItems).catch(console.error);
  }, [token]);

  return (
    <div className="min-h-screen w-full bg-background p-6">
      <Link href="/portal">← กลับหน้าหลัก</Link>
      <h1 className="my-4 text-xl font-semibold">เรื่องที่ส่ง</h1>
      {items.map((item) => (
        <Card key={item.id} className="mb-3">
          <CardContent className="p-4">
            <p className="font-medium">
              {item.referenceNumber} — {item.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {new Date(item.submittedAt).toLocaleDateString('th-TH')} · {item.externalStatus}
              {item.withdrawnByClient ? ' · ไม่ได้ใช้' : ''}
            </p>
          </CardContent>
        </Card>
      ))}
      {items.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีเรื่องที่ส่ง</p>}
    </div>
  );
}
```

- [ ] **Step 4: เปิด `apps/web/src/app/(client-portal)/portal/page.tsx` เพิ่มปุ่ม "ส่งเรื่องใหม่"**

เปิดไฟล์ดูส่วน header (บรรทัดประมาณ 36-44 ตามที่สำรวจไว้: welcome message + ปุ่ม sign-out) แล้วเพิ่มปุ่มลิงก์ไปหน้าใหม่ในกลุ่มเดียวกัน:
```tsx
<Link href="/portal/intake/new" className="rounded bg-blue-600 px-4 py-2 text-white">
  ส่งเรื่องใหม่
</Link>
```
เพิ่มลิงก์ไปหน้า `/portal/intake` (รายการที่ส่ง) ไว้ใกล้ ๆ กันด้วย

- [ ] **Step 5: build เพื่อตรวจ compile error**

Run: `cd apps/web && pnpm build`
Expected: build สำเร็จ, route `/portal/intake` และ `/portal/intake/new` ปรากฏในรายการ

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/portal-api.ts "apps/web/src/app/(client-portal)/portal"
git commit -m "feat(web): add client-portal intake submission pages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: หน้าเว็บฝั่งสำนักงาน — รายการเรื่องจาก Portal + ปุ่มรับเข้า F01

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/app/(dashboard)/intake/portal-submissions/page.tsx`

**Interfaces:**
- Consumes: `GET /intake/portal-submissions`, `POST /intake/portal-submissions/:id/convert` จาก Task 4

- [ ] **Step 1: เปิด `apps/web/src/lib/api.ts` ดู pattern `request<T>` และ auth hook ที่ใช้ในหน้า dashboard ทั่วไป (เช่น operations page ที่มีอยู่แล้ว) แล้วเพิ่ม client methods**

```ts
export interface PortalSubmissionStaffEntry {
  id: string;
  referenceNumber: string;
  title: string;
  detail: string;
  submittedAt: string;
  urgencyFlag: boolean;
  clientContact: { name: string; email: string | null };
  client: { name: string };
}

// เพิ่มเข้า object api:
// listPortalSubmissions: (token) -> GET /intake/portal-submissions
// convertPortalSubmission: (token, submissionId, officePlannedDate?) -> POST /intake/portal-submissions/:id/convert
```

- [ ] **Step 2: สร้าง `apps/web/src/app/(dashboard)/intake/portal-submissions/page.tsx`**

เปิด `apps/web/src/app/(dashboard)/operations/page.tsx` (เพิ่งแก้ใน task ก่อนหน้าของแผนอื่น) ดู pattern `useAuth`/`Table`/`Card` จริงก่อน แล้วทำหน้าตามรูปแบบเดียวกัน:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { api, type PortalSubmissionStaffEntry } from '@/lib/api';
// TODO: import useAuth และ Table components จาก path จริงที่ operations/page.tsx ใช้

export default function PortalSubmissionsPage() {
  const { token } = useAuth(); // แทนที่ด้วย hook จริง
  const [items, setItems] = useState<PortalSubmissionStaffEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    api
      .listPortalSubmissions(token)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const handleConvert = async (id: string) => {
    if (!token) return;
    await api.convertPortalSubmission(token, id);
    load();
  };

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">เรื่องที่ส่งจาก Customer Portal</h1>
      {loading ? (
        <p>กำลังโหลด...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">ไม่มีเรื่องรอรับเข้า</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">เลขอ้างอิง</th>
              <th className="p-2">หัวข้อ</th>
              <th className="p-2">ลูกความ</th>
              <th className="p-2">ผู้ส่ง</th>
              <th className="p-2">วันที่ส่ง</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="p-2">
                  {item.referenceNumber}
                  {item.urgencyFlag && (
                    <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      เร่งด่วน
                    </span>
                  )}
                </td>
                <td className="p-2">{item.title}</td>
                <td className="p-2">{item.client.name}</td>
                <td className="p-2">{item.clientContact.name}</td>
                <td className="p-2">
                  {new Date(item.submittedAt).toLocaleDateString('th-TH')}
                </td>
                <td className="p-2">
                  <button
                    className="rounded bg-blue-600 px-3 py-1 text-xs text-white"
                    onClick={() => handleConvert(item.id)}
                  >
                    รับเข้า F01
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: build เพื่อตรวจ compile error**

Run: `cd apps/web && pnpm build`
Expected: build สำเร็จ, route `/intake/portal-submissions` ปรากฏในรายการ

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts "apps/web/src/app/(dashboard)/intake"
git commit -m "feat(web): add staff page for portal intake submissions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Checklist (ทำหลังจบทุก task)

- [ ] `PortalIntakeSubmission.clientId`/`clientContactId` มาจาก JWT (`portalUser`) เท่านั้น ไม่เคยรับจาก request body
- [ ] ผู้ติดต่อเห็นเฉพาะเรื่องที่ตัวเองส่ง (`clientContactId` filter) ไม่ใช่ทุกเรื่องของ `clientId`
- [ ] `clientRequestedDate` ไม่เคยถูกเขียนทับ `Intake.deadlineDate`
- [ ] Route staff (`/intake/portal-submissions*`) ผ่าน guard เดิมของ `IntakeController` (`JwtAuthGuard, RolesGuard`)
- [ ] Route portal (`/client-portal/intake*`) ผ่าน guard เดิมของ client-portal (`ClientPortalGuard`)
- [ ] `pnpm --filter api test` ทั้งชุดผ่านหมด (ของเดิม + ใหม่)

## งานที่ไม่รวมในแผนนี้ (ขอบเขตถัดไป — Phase C2)

- `ContactCaseAccess` (สิทธิรายแฟ้มเต็มรูปแบบ, รองรับ 3 สถานการณ์เปลี่ยนผู้ติดต่อ) — v1 ใช้กติกาง่าย "เห็นเฉพาะที่ตัวเองส่ง" ไปก่อน
- `DocumentPublication` (เผยแพร่ผลงาน/เอกสาร/รายงานปิดงานให้ลูกความ) — Client Portal ปัจจุบันมี `visibleToClient` แบบง่ายอยู่แล้ว (จากแผนเดิม) ยังไม่ต้องขยาย
- `IntakeStatusMapping` แบบ audit table เต็มรูปแบบ (เก็บประวัติการเปลี่ยนสถานะทุกครั้ง) — ใช้ pure function แทนตามที่ตัดสินใจไว้ใน Global Constraints
- แจ้งเตือนผ่านอีเมล/LINE เมื่อสถานะเปลี่ยนหรือส่งเรื่องสำเร็จ — ต้องมี notification infra ก่อน (`ContactNotificationPreference` + LINE binding) เป็นแผนแยก
- ข้อความรับ-ส่งในเรื่องเดิม (threaded messaging ระหว่างสำนักงาน-ลูกความ) — เป็นแผนถัดไปเช่นกัน
- Soft-delete/withdraw เรื่องที่ส่งแล้ว (`withdrawnByClient`) — schema มี field รองรับแล้วแต่ endpoint ยังไม่เปิดในแผนนี้ (เก็บ scope เฉพาะ submit + list + convert)
