# ผู้ช่วยร่างอีเมลปิดคดี (Phase 1: Clipboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ทนายสร้างร่างอีเมลสรุปปิดงานจากข้อมูลคดีจริง (ขอบเขต, เหตุการณ์ที่เลือก, ผลคดี) แก้ไขได้ อนุมัติได้ และคัดลอกไปวางใน Outlook ได้ — ยังไม่เชื่อม Microsoft Graph ในแผนนี้ (Graph/OAuth เป็นแผนแยกภายหลัง ตามที่ยืนยันไว้ในผล feasibility review)

**Architecture:** เพิ่ม Prisma model `ClosingEmailDraft` เก็บร่างต่อคดี (สถานะ DRAFT/APPROVED) พร้อม service คำนวณข้อมูลจากคดี+เหตุการณ์ (`CaseActivity`) มาประกอบเป็นเนื้อหาอีเมลด้วย template แบบ regex-substitution เดียวกับที่ `TemplatesService` ใช้อยู่แล้ว ฝั่งหน้าเว็บเป็นหน้าใหม่ใต้ case detail แบบสองคอลัมน์ (เลือกข้อมูล / preview แก้ไขได้) พร้อมปุ่มคัดลอกไปคลิปบอร์ด

**Tech Stack:** NestJS 11 + Prisma 6 (apps/api), Next.js (apps/web), Jest + `@nestjs/testing` (ต้องติดตั้งใหม่ — ยังไม่มีในโปรเจกต์)

**Spec:**
- `docs/research/2026-09-05-customer-portal-consolidated-requirements.md` (ส่วนที่ 6 และ 11)
- `docs/research/2026-09-05-operations-outlook-customer-portal-requirements.md` (ส่วนที่ 3 "ผู้ช่วยร่างอีเมลปิดคดี")
- `docs/research/2026-09-05-customer-portal-schema-design.md`

## Global Constraints

- ข้อมูลจริงต้องมีที่มาเสมอ ห้ามเดาวัน ผลคดี หรือสถานะถึงที่สุด (จากสเปก ส่วนที่ 3 ข้อ 5)
- การสร้างร่างไม่เท่ากับส่งแล้ว — Phase 1 นี้ไม่มีการส่งอีเมลอัตโนมัติเลย (คัดลอกเท่านั้น)
- สถานะร่างต้องแยกชัด: `DRAFT` (บันทึกร่าง) / `APPROVED` (ทนายอนุมัติแล้ว) — ไม่รวมสถานะ Outlook/ส่งแล้ว/เผยแพร่ Portal ในแผนนี้ (อยู่แผนถัดไป)
- ผู้อนุมัติคือทนายเจ้าของคดีคนเดียว ไม่มีชั้นตรวจเพิ่ม (ยืนยันแล้วในสเปก)
- Endpoint ทั้งหมดต้องผ่าน `JwtAuthGuard`, `RolesGuard`, `CaseAccessGuard` และจำกัด `Role.ADMIN, Role.LAWYER` เหมือน endpoint `close` ที่มีอยู่แล้ว (`apps/api/src/cases/cases.controller.ts:73-82`)
- ห้ามแก้ `CloseCaseDto`/`cases.service.ts#close()` — ฟีเจอร์นี้ทำงานอิสระจากการปิดแฟ้ม (ใช้ก่อนปิดแฟ้มได้ ตามสเปกข้อ "โดยไม่ต้องเปลี่ยนสถานะแฟ้มเป็นปิดทันที")
- โปรเจกต์นี้ไม่มี Jest มาก่อน (ยืนยันจาก `docs/superpowers/plans/2026-09-04-operations-hub.md` และ `2026-07-25-client-portal.md` ซึ่งทั้งคู่เลือกใช้ manual verification แทน) — แผนนี้เลือกติดตั้ง Jest ใหม่ตั้งแต่ Task 1 เพราะ logic การประกอบอีเมล (`renderDraft`) มีกิ่งเงื่อนไขมากพอที่ manual curl ตรวจไม่ครอบคลุม ถือเป็น ruling ของแผนนี้ ไม่ใช่การผูกมัดแผนอื่น

---

## File Structure

**Create:**
- `apps/api/jest.config.js` — Jest config สำหรับ apps/api (ยังไม่มีไฟล์นี้ในโปรเจกต์)
- `apps/api/src/closing-email/closing-email.module.ts`
- `apps/api/src/closing-email/closing-email.service.ts` — รวมข้อมูลคดี+เหตุการณ์ และ render เนื้อหา
- `apps/api/src/closing-email/closing-email.service.spec.ts`
- `apps/api/src/closing-email/closing-email.controller.ts`
- `apps/api/src/closing-email/dto/closing-email.dto.ts`
- `apps/api/prisma/migrations/<timestamp>_add_closing_email_draft/migration.sql` (auto-generated โดย `prisma migrate dev`)
- `apps/web/src/app/(dashboard)/cases/[id]/closing-report/page.tsx`

**Modify:**
- `apps/api/package.json` — เพิ่ม devDependencies (`jest`, `ts-jest`, `@types/jest`, `@nestjs/testing`) และ script `test`
- `apps/api/prisma/schema.prisma` — เพิ่ม model `ClosingEmailDraft` + enum `ClosingEmailDraftStatus`
- `apps/api/src/app.module.ts` — import `ClosingEmailModule`
- `apps/web/src/lib/api.ts` — เพิ่ม client methods
- `apps/web/src/app/(dashboard)/cases/[id]/page.tsx:346-352` — เพิ่มแท็บ `closing-report` เข้า `tabs` array

---

### Task 1: ติดตั้ง Jest ให้ apps/api (ยังไม่มี test infra ในโปรเจกต์)

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/jest.config.js`
- Test: `apps/api/src/app.controller.spec.ts` (smoke test ยืนยันว่า Jest รันได้)

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces: คำสั่ง `pnpm --filter api test` ใช้รัน Jest ได้ทุก task ถัดไป

- [ ] **Step 1: ติดตั้ง dependency**

Run:
```bash
pnpm --filter api add -D jest ts-jest @types/jest @nestjs/testing
```

- [ ] **Step 2: สร้าง `apps/api/jest.config.js`**

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
};
```

- [ ] **Step 3: เพิ่ม script `test` ใน `apps/api/package.json`**

เพิ่มบรรทัดนี้ในบล็อก `"scripts"`:
```json
"test": "jest --config jest.config.js"
```

- [ ] **Step 4: เขียน smoke test ที่ล้มเหลวก่อน**

ก่อนเขียนไฟล์นี้ ให้ตรวจว่าไฟล์ controller หลักของแอปชื่ออะไรจริงด้วย `ls apps/api/src/*.controller.ts` แล้วแก้ import ให้ตรง — ตัวอย่างสมมติว่าเป็น `app.controller.ts` / `AppController`:

`apps/api/src/app.controller.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
```

- [ ] **Step 5: รันแล้วดูว่าผ่าน**

Run: `pnpm --filter api test`
Expected: PASS (1 test, `AppController > should be defined`)

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/jest.config.js apps/api/src/app.controller.spec.ts
git commit -m "test: set up Jest for apps/api

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: เพิ่ม Prisma model `ClosingEmailDraft`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Consumes: `Case` model (`caseId` FK), `User` model (`createdById`/`approvedById` FK)
- Produces: `prisma.closingEmailDraft` client methods (`create`, `findMany`, `findUnique`, `update`) ที่ Task 3–4 ใช้

- [ ] **Step 1: เพิ่ม enum และ model ต่อท้ายไฟล์ schema (หลัง model `InsuranceClaim` บรรทัดสุดท้าย)**

```prisma
enum ClosingEmailDraftStatus {
  DRAFT
  APPROVED
}

model ClosingEmailDraft {
  id                 String                  @id @default(uuid())
  caseId             String
  createdById        String
  subject            String
  bodyText           String                  @db.Text
  selectedActivityIds String[]               @default([])
  missingDataNotes   String[]                @default([])
  status             ClosingEmailDraftStatus @default(DRAFT)
  approvedById       String?
  approvedAt         DateTime?
  createdAt          DateTime                @default(now())
  updatedAt          DateTime                @updatedAt

  case        Case  @relation(fields: [caseId], references: [id], onDelete: Cascade)
  createdBy   User  @relation("ClosingEmailDraftCreator", fields: [createdById], references: [id])
  approvedBy  User? @relation("ClosingEmailDraftApprover", fields: [approvedById], references: [id])

  @@index([caseId, createdAt])
}
```

- [ ] **Step 2: เพิ่ม relation กลับใน model `Case` และ `User`**

ใน `model Case { ... }` เพิ่มบรรทัด (ในกลุ่ม relation ต่อจาก `insuranceClaim`):
```prisma
  closingEmailDrafts ClosingEmailDraft[]
```

ใน `model User { ... }` เพิ่มบรรทัด (ในกลุ่ม relation ต่อจาก `assessedIntakes`):
```prisma
  createdClosingEmailDrafts  ClosingEmailDraft[] @relation("ClosingEmailDraftCreator")
  approvedClosingEmailDrafts ClosingEmailDraft[] @relation("ClosingEmailDraftApprover")
```

- [ ] **Step 3: สร้าง migration**

Run:
```bash
pnpm --filter api prisma migrate dev --name add_closing_email_draft
```
Expected: migration สร้างสำเร็จ ไม่มี error, `prisma generate` รันอัตโนมัติต่อท้าย

- [ ] **Step 4: ตรวจว่า Prisma Client รู้จัก model ใหม่**

Run:
```bash
cd apps/api && node -e "const {PrismaClient}=require('./src/generated/prisma');console.log(typeof new PrismaClient().closingEmailDraft)"
```
Expected: พิมพ์ `object`

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add ClosingEmailDraft model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `ClosingEmailService.gatherCaseData()` — รวบรวมข้อมูลคดีและเหตุการณ์

**Files:**
- Create: `apps/api/src/closing-email/closing-email.service.ts`
- Test: `apps/api/src/closing-email/closing-email.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`prisma.case.findUnique`, `prisma.caseActivity.findMany` — pattern เดียวกับ `apps/api/src/cases/case-activities.service.ts:27-35`)
- Produces:
```ts
interface CaseActivitySummary {
  id: string;
  title: string;
  description: string | null;
  activityAt: Date;
}

interface ClosingEmailCaseData {
  caseId: string;
  ownRef: string;
  customerRef: string | null;
  clientName: string | null;
  title: string;
  courtName: string | null;
  closingSummary: string | null;
  closedAt: Date | null;
  activities: CaseActivitySummary[];
  missingDataNotes: string[];
}

class ClosingEmailService {
  gatherCaseData(caseId: string): Promise<ClosingEmailCaseData>
}
```
Task 4 (render) และ Task 5 (controller) เรียกใช้ signature นี้ตรง ๆ

- [ ] **Step 1: เขียน test ที่ล้มเหลวก่อน**

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ClosingEmailService } from './closing-email.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClosingEmailService.gatherCaseData', () => {
  let service: ClosingEmailService;
  const mockPrisma = {
    case: { findUnique: jest.fn() },
    caseActivity: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClosingEmailService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(ClosingEmailService);
  });

  it('throws NotFoundException when case does not exist', async () => {
    mockPrisma.case.findUnique.mockResolvedValue(null);
    await expect(service.gatherCaseData('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns case data with activities and no missing-data notes when closingSummary and courtName are present', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      ownRef: 'CASE-001',
      customerRef: 'CUST-1',
      clientName: 'บริษัท ทดสอบ จำกัด',
      title: 'คดีทดสอบ',
      courtName: 'ศาลแพ่ง',
      closingSummary: 'สรุปคดี',
      closedAt: new Date('2026-08-01'),
    });
    mockPrisma.caseActivity.findMany.mockResolvedValue([
      {
        id: 'act-1',
        title: 'ยื่นฟ้อง',
        description: 'ยื่นคำฟ้องต่อศาล',
        activityAt: new Date('2026-01-15'),
      },
    ]);

    const result = await service.gatherCaseData('case-1');

    expect(result.ownRef).toBe('CASE-001');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].title).toBe('ยื่นฟ้อง');
    expect(result.missingDataNotes).toEqual([]);
  });

  it('flags missing data when closingSummary is null', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      ownRef: 'CASE-001',
      customerRef: null,
      clientName: null,
      title: 'คดีทดสอบ',
      courtName: null,
      closingSummary: null,
      closedAt: null,
    });
    mockPrisma.caseActivity.findMany.mockResolvedValue([]);

    const result = await service.gatherCaseData('case-1');

    expect(result.missingDataNotes).toContain(
      'ยังไม่มีสรุปผลคดี (closingSummary) — กรอกก่อนส่งอีเมลจริง',
    );
  });
});
```

- [ ] **Step 2: รัน test เพื่อดูว่าล้มเหลว**

Run: `pnpm --filter api test -- closing-email.service.spec.ts`
Expected: FAIL — `Cannot find module './closing-email.service'`

- [ ] **Step 3: เขียน implementation ให้ผ่าน**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CaseActivitySummary {
  id: string;
  title: string;
  description: string | null;
  activityAt: Date;
}

export interface ClosingEmailCaseData {
  caseId: string;
  ownRef: string;
  customerRef: string | null;
  clientName: string | null;
  title: string;
  courtName: string | null;
  closingSummary: string | null;
  closedAt: Date | null;
  activities: CaseActivitySummary[];
  missingDataNotes: string[];
}

@Injectable()
export class ClosingEmailService {
  constructor(private readonly prisma: PrismaService) {}

  async gatherCaseData(caseId: string): Promise<ClosingEmailCaseData> {
    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
    });
    if (!legalCase) {
      throw new NotFoundException('ไม่พบคดีนี้');
    }

    const activities = await this.prisma.caseActivity.findMany({
      where: { caseId },
      orderBy: { activityAt: 'desc' },
    });

    const missingDataNotes: string[] = [];
    if (!legalCase.closingSummary) {
      missingDataNotes.push(
        'ยังไม่มีสรุปผลคดี (closingSummary) — กรอกก่อนส่งอีเมลจริง',
      );
    }
    if (!legalCase.closedAt) {
      missingDataNotes.push(
        'คดียังไม่ถูกปิด — วันที่ปิดคดีในอีเมลจะยังว่างอยู่',
      );
    }

    return {
      caseId: legalCase.id,
      ownRef: legalCase.ownRef,
      customerRef: legalCase.customerRef,
      clientName: legalCase.clientName,
      title: legalCase.title,
      courtName: legalCase.courtName,
      closingSummary: legalCase.closingSummary,
      closedAt: legalCase.closedAt,
      activities: activities.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        activityAt: a.activityAt,
      })),
      missingDataNotes,
    };
  }
}
```

- [ ] **Step 4: รัน test เพื่อดูว่าผ่าน**

Run: `pnpm --filter api test -- closing-email.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/closing-email/closing-email.service.ts apps/api/src/closing-email/closing-email.service.spec.ts
git commit -m "feat(api): gather case data for closing email draft

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `ClosingEmailService.renderDraft()` — ประกอบเนื้อหาอีเมลจากเหตุการณ์ที่เลือก

**Files:**
- Modify: `apps/api/src/closing-email/closing-email.service.ts`
- Modify: `apps/api/src/closing-email/closing-email.service.spec.ts`

**Interfaces:**
- Consumes: `gatherCaseData()` จาก Task 3
- Produces:
```ts
interface RenderedClosingEmail {
  subject: string;
  bodyText: string;
}

class ClosingEmailService {
  renderDraft(data: ClosingEmailCaseData, selectedActivityIds: string[]): RenderedClosingEmail
}
```
Task 5 (controller) เรียก `gatherCaseData()` แล้วส่งผลเข้า `renderDraft()` ตรง ๆ

- [ ] **Step 1: เขียน test ที่ล้มเหลวก่อน (เพิ่มต่อท้ายไฟล์ spec เดิม)**

```ts
describe('ClosingEmailService.renderDraft', () => {
  let service: ClosingEmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClosingEmailService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(ClosingEmailService);
  });

  it('builds subject and body including only selected activities', () => {
    const data = {
      caseId: 'case-1',
      ownRef: 'CASE-001',
      customerRef: 'CUST-1',
      clientName: 'บริษัท ทดสอบ จำกัด',
      title: 'คดีทดสอบ',
      courtName: 'ศาลแพ่ง',
      closingSummary: 'ศาลพิพากษาให้ชนะคดี',
      closedAt: new Date('2026-08-01'),
      activities: [
        {
          id: 'act-1',
          title: 'ยื่นฟ้อง',
          description: 'ยื่นคำฟ้องต่อศาล',
          activityAt: new Date('2026-01-15'),
        },
        {
          id: 'act-2',
          title: 'บันทึกภายใน',
          description: 'ไม่ควรถูกรวม',
          activityAt: new Date('2026-02-01'),
        },
      ],
      missingDataNotes: [],
    };

    const result = service.renderDraft(data, ['act-1']);

    expect(result.subject).toContain('CASE-001');
    expect(result.subject).toContain('บริษัท ทดสอบ จำกัด');
    expect(result.bodyText).toContain('ยื่นฟ้อง');
    expect(result.bodyText).toContain('ศาลพิพากษาให้ชนะคดี');
    expect(result.bodyText).not.toContain('ไม่ควรถูกรวม');
  });
});
```

- [ ] **Step 2: รัน test เพื่อดูว่าล้มเหลว**

Run: `pnpm --filter api test -- closing-email.service.spec.ts`
Expected: FAIL — `service.renderDraft is not a function`

- [ ] **Step 3: เพิ่ม method `renderDraft` ต่อท้าย class ใน `closing-email.service.ts`**

```ts
export interface RenderedClosingEmail {
  subject: string;
  bodyText: string;
}
```
(เพิ่ม interface นี้ต่อจาก `ClosingEmailCaseData`)

ในคลาส `ClosingEmailService` เพิ่ม method:
```ts
  renderDraft(
    data: ClosingEmailCaseData,
    selectedActivityIds: string[],
  ): RenderedClosingEmail {
    const selectedSet = new Set(selectedActivityIds);
    const chosenActivities = data.activities.filter((a) =>
      selectedSet.has(a.id),
    );

    const subject = `สรุปงาน: ${data.title} (${data.ownRef}) — ${data.clientName ?? ''}`;

    const timelineLines = chosenActivities
      .sort((a, b) => a.activityAt.getTime() - b.activityAt.getTime())
      .map(
        (a) =>
          `- ${a.activityAt.toLocaleDateString('th-TH')}: ${a.title}${
            a.description ? ` — ${a.description}` : ''
          }`,
      )
      .join('\n');

    const bodyText = [
      `เรียน ${data.clientName ?? 'ลูกความ'}`,
      '',
      `เรื่อง: ${data.title} (เลขอ้างอิงสำนักงาน ${data.ownRef}${
        data.customerRef ? `, เลขอ้างอิงลูกความ ${data.customerRef}` : ''
      })`,
      data.courtName ? `ศาล: ${data.courtName}` : '',
      '',
      'ลำดับการดำเนินงานที่สำคัญ:',
      timelineLines || '(ยังไม่ได้เลือกเหตุการณ์)',
      '',
      'ผลที่ได้รับ:',
      data.closingSummary ?? '(ยังไม่มีสรุปผลคดี)',
      '',
      'หากมีข้อสงสัยประการใด ติดต่อทนายเจ้าของคดีได้ตามช่องทางเดิม',
    ]
      .filter((line) => line !== '')
      .join('\n');

    return { subject, bodyText };
  }
```

- [ ] **Step 4: รัน test เพื่อดูว่าผ่าน**

Run: `pnpm --filter api test -- closing-email.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/closing-email/closing-email.service.ts apps/api/src/closing-email/closing-email.service.spec.ts
git commit -m "feat(api): render closing email draft from selected activities

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: DTO + Controller + Module — เปิด endpoint สร้าง/แก้/อนุมัติร่าง

**Files:**
- Create: `apps/api/src/closing-email/dto/closing-email.dto.ts`
- Create: `apps/api/src/closing-email/closing-email.controller.ts`
- Create: `apps/api/src/closing-email/closing-email.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ClosingEmailService.gatherCaseData()`, `renderDraft()` จาก Task 3–4; `PrismaService`; guard/decorator ของ `cases.controller.ts` (ดูรายละเอียดใน Step 2)
- Produces:
  - `POST /cases/:caseId/closing-email-drafts` → body `{ selectedActivityIds: string[] }` → สร้าง draft ใหม่ status `DRAFT` พร้อม render แล้ว
  - `GET /cases/:caseId/closing-email-drafts` → list ของคดีนั้น เรียงจากใหม่ไปเก่า
  - `PATCH /cases/:caseId/closing-email-drafts/:draftId` → แก้ `subject`/`bodyText` เอง (ทนายแก้มือ)
  - `POST /cases/:caseId/closing-email-drafts/:draftId/approve` → เปลี่ยนสถานะเป็น `APPROVED`

- [ ] **Step 1: สร้าง DTO**

`apps/api/src/closing-email/dto/closing-email.dto.ts`:
```ts
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClosingEmailDraftDto {
  @IsArray()
  @IsString({ each: true })
  selectedActivityIds!: string[];
}

export class UpdateClosingEmailDraftDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  subject?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bodyText?: string;
}
```

- [ ] **Step 2: เปิด `apps/api/src/cases/cases.controller.ts` ก่อนเขียนไฟล์นี้ — คัดลอก import path จริงของ `JwtAuthGuard`, `RolesGuard`, `CaseAccessGuard`, `Roles`, `CurrentUser`, `AuthUser`, `Role` มาใช้เป๊ะ ๆ (อย่าเดา path เอง) แล้วเขียน controller**

โครงที่ต้องได้ (แทนที่ import ด้วย path จริงที่เจอ):
```ts
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
// TODO: แทนที่ทุก import ด้านล่างด้วย path จริงจาก cases.controller.ts
// import { JwtAuthGuard } from '<path จริง>';
// import { RolesGuard } from '<path จริง>';
// import { CaseAccessGuard } from '<path จริง>';
// import { Roles } from '<path จริง>';
// import { Role } from '<path จริง>';
// import { CurrentUser } from '<path จริง>';
// import { AuthUser } from '<path จริง>';
import { PrismaService } from '../prisma/prisma.service';
import { ClosingEmailDraftStatus } from '../generated/prisma';
import { ClosingEmailService } from './closing-email.service';
import {
  CreateClosingEmailDraftDto,
  UpdateClosingEmailDraftDto,
} from './dto/closing-email.dto';

@Controller('cases/:caseId/closing-email-drafts')
@UseGuards(JwtAuthGuard, RolesGuard, CaseAccessGuard)
@Roles(Role.ADMIN, Role.LAWYER)
export class ClosingEmailController {
  constructor(
    private readonly closingEmailService: ClosingEmailService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateClosingEmailDraftDto,
  ) {
    const data = await this.closingEmailService.gatherCaseData(caseId);
    const rendered = this.closingEmailService.renderDraft(
      data,
      dto.selectedActivityIds,
    );

    return this.prisma.closingEmailDraft.create({
      data: {
        caseId,
        createdById: user.id,
        subject: rendered.subject,
        bodyText: rendered.bodyText,
        selectedActivityIds: dto.selectedActivityIds,
        missingDataNotes: data.missingDataNotes,
      },
    });
  }

  @Get()
  findAll(@Param('caseId') caseId: string) {
    return this.prisma.closingEmailDraft.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch(':draftId')
  async update(
    @Param('draftId') draftId: string,
    @Body() dto: UpdateClosingEmailDraftDto,
  ) {
    const draft = await this.prisma.closingEmailDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft) throw new NotFoundException('ไม่พบร่างอีเมลนี้');

    return this.prisma.closingEmailDraft.update({
      where: { id: draftId },
      data: {
        subject: dto.subject ?? draft.subject,
        bodyText: dto.bodyText ?? draft.bodyText,
      },
    });
  }

  @Post(':draftId/approve')
  async approve(
    @CurrentUser() user: AuthUser,
    @Param('draftId') draftId: string,
  ) {
    const draft = await this.prisma.closingEmailDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft) throw new NotFoundException('ไม่พบร่างอีเมลนี้');

    return this.prisma.closingEmailDraft.update({
      where: { id: draftId },
      data: {
        status: ClosingEmailDraftStatus.APPROVED,
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });
  }
}
```

- [ ] **Step 3: สร้าง module — เปิด `apps/api/src/cases/cases.module.ts` ดูก่อนว่า `PrismaService` ใช้ต้อง import `PrismaModule` หรือเป็น `@Global()` แล้วทำตามแบบเดียวกัน**

```ts
import { Module } from '@nestjs/common';
import { ClosingEmailController } from './closing-email.controller';
import { ClosingEmailService } from './closing-email.service';

@Module({
  controllers: [ClosingEmailController],
  providers: [ClosingEmailService],
})
export class ClosingEmailModule {}
```
(เพิ่ม `imports: [PrismaModule]` เฉพาะถ้า `cases.module.ts` ทำแบบนั้นจริง)

- [ ] **Step 4: เพิ่ม `ClosingEmailModule` เข้า `apps/api/src/app.module.ts`**

เพิ่ม import และใส่ใน `imports: [...]` array (ดูตำแหน่งที่ module อื่น เช่น `CasesModule` ถูก import อยู่ แล้วเพิ่มบรรทัดเดียวกันรูปแบบ)

- [ ] **Step 5: build เพื่อตรวจ compile error**

Run: `pnpm --filter api build`
Expected: build สำเร็จไม่มี TypeScript error (ถ้ามี error เรื่อง import path ให้แก้ตาม path จริงที่เจอใน step 2)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/closing-email apps/api/src/app.module.ts
git commit -m "feat(api): expose closing email draft endpoints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: หน้าเว็บ "เตรียมรายงานปิดงาน" — เลือกเหตุการณ์ + preview + คัดลอก

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/app/(dashboard)/cases/[id]/closing-report/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx:346-352`

**Interfaces:**
- Consumes: endpoint จาก Task 5 (`POST/GET/PATCH /cases/:caseId/closing-email-drafts...`)
- Produces: หน้าใหม่ที่ผู้ใช้เข้าถึงผ่านแท็บ "รายงานปิดงาน" ในหน้ารายละเอียดคดี

- [ ] **Step 1: เปิด `apps/web/src/lib/api.ts` ดูรูปแบบ HTTP helper จริง (method `closeCase` ที่บรรทัด 614-619) แล้วเพิ่ม method รูปแบบเดียวกันเป๊ะ ๆ (ชื่อ helper ภายในอาจไม่ใช่ `apiFetch` — ใช้ชื่อจริงที่เจอ)**

```ts
export interface ClosingEmailDraft {
  id: string;
  caseId: string;
  subject: string;
  bodyText: string;
  selectedActivityIds: string[];
  missingDataNotes: string[];
  status: 'DRAFT' | 'APPROVED';
  createdAt: string;
}

export interface CaseActivityOption {
  id: string;
  title: string;
  description: string | null;
  activityAt: string;
}

// เพิ่ม 4 ฟังก์ชันนี้ตามรูปแบบ HTTP helper จริงที่ใช้ใน closeCase():
// createClosingEmailDraft(token, caseId, selectedActivityIds) -> POST /cases/:caseId/closing-email-drafts
// listClosingEmailDrafts(token, caseId) -> GET /cases/:caseId/closing-email-drafts
// updateClosingEmailDraft(token, caseId, draftId, { subject?, bodyText? }) -> PATCH /cases/:caseId/closing-email-drafts/:draftId
// approveClosingEmailDraft(token, caseId, draftId) -> POST /cases/:caseId/closing-email-drafts/:draftId/approve
```

เพิ่มทั้ง 4 ฟังก์ชันเข้า object `api` ที่ export อยู่ (ตามรูปแบบที่ `closeCase` ถูกเพิ่มเข้าไปแล้ว) — ถ้าไม่มี client method สำหรับดึง `CaseActivity` ของคดีอยู่แล้ว ให้เพิ่ม `getCaseActivities(token, caseId)` คู่กันด้วย (ผูกกับ endpoint ที่มีอยู่แล้วฝั่ง backend `case-activities.service.ts#findByCase`)

- [ ] **Step 2: สร้างหน้าใหม่ `apps/web/src/app/(dashboard)/cases/[id]/closing-report/page.tsx`**

เปิด `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` ดูก่อนว่า auth token ดึงมาจาก hook ชื่ออะไรจริง (เช่น `useAuth`) แล้วใช้ชื่อจริงแทนในโค้ดด้านล่าง:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type ClosingEmailDraft, type CaseActivityOption } from '@/lib/api';
// TODO: import auth hook ตัวจริงจากโปรเจกต์ (ดู page.tsx เดียวกันนี้)

export default function ClosingReportPage() {
  const { id: caseId } = useParams<{ id: string }>();
  const { token } = useAuth(); // แทนที่ด้วย hook จริง
  const [activities, setActivities] = useState<CaseActivityOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<ClosingEmailDraft | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token || !caseId) return;
    api.getCaseActivities(token, caseId).then(setActivities);
  }, [token, caseId]);

  const toggleActivity = (activityId: string) => {
    setSelectedIds((prev) =>
      prev.includes(activityId)
        ? prev.filter((id) => id !== activityId)
        : [...prev, activityId],
    );
  };

  const handleGenerate = async () => {
    if (!token || !caseId) return;
    const created = await api.createClosingEmailDraft(token, caseId, selectedIds);
    setDraft(created);
  };

  const handleCopy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(`หัวข้อ: ${draft.subject}\n\n${draft.bodyText}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApprove = async () => {
    if (!token || !caseId || !draft) return;
    const approved = await api.approveClosingEmailDraft(token, caseId, draft.id);
    setDraft(approved);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>เหตุการณ์ที่จะนำมาใช้</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.map((activity) => (
            <label key={activity.id} className="flex items-start gap-2 py-1">
              <input
                type="checkbox"
                checked={selectedIds.includes(activity.id)}
                onChange={() => toggleActivity(activity.id)}
              />
              <span>
                {new Date(activity.activityAt).toLocaleDateString('th-TH')} —{' '}
                {activity.title}
              </span>
            </label>
          ))}
          <button
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white"
            onClick={handleGenerate}
          >
            สร้างร่าง
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ตัวอย่างอีเมล</CardTitle>
        </CardHeader>
        <CardContent>
          {draft ? (
            <>
              {draft.missingDataNotes.length > 0 && (
                <div className="mb-2 rounded bg-yellow-50 p-2 text-sm text-yellow-800">
                  {draft.missingDataNotes.map((note) => (
                    <div key={note}>⚠ {note}</div>
                  ))}
                </div>
              )}
              <input
                className="mb-2 w-full border p-2"
                value={draft.subject}
                onChange={(e) =>
                  setDraft({ ...draft, subject: e.target.value })
                }
              />
              <textarea
                className="h-64 w-full border p-2"
                value={draft.bodyText}
                onChange={(e) =>
                  setDraft({ ...draft, bodyText: e.target.value })
                }
              />
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded bg-gray-600 px-4 py-2 text-white"
                  onClick={handleCopy}
                >
                  {copied ? 'คัดลอกแล้ว' : 'คัดลอกไปคลิปบอร์ด'}
                </button>
                <button
                  className="rounded bg-green-600 px-4 py-2 text-white"
                  onClick={handleApprove}
                  disabled={draft.status === 'APPROVED'}
                >
                  {draft.status === 'APPROVED' ? 'อนุมัติแล้ว' : 'อนุมัติ'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-gray-500">เลือกเหตุการณ์แล้วกด "สร้างร่าง"</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: เพิ่มแท็บใน `apps/web/src/app/(dashboard)/cases/[id]/page.tsx:346-352`**

แก้ array `tabs` จาก:
```ts
const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks', href: `/cases/${id}/tasks` },
  { id: 'calendar', label: 'Calendar', href: `/cases/${id}/calendar` },
  { id: 'documents', label: 'Documents', href: `/cases/${id}/documents` },
  { id: 'billing', label: 'Billing', href: `/cases/${id}/billing` },
];
```
เป็น:
```ts
const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks', href: `/cases/${id}/tasks` },
  { id: 'calendar', label: 'Calendar', href: `/cases/${id}/calendar` },
  { id: 'documents', label: 'Documents', href: `/cases/${id}/documents` },
  { id: 'billing', label: 'Billing', href: `/cases/${id}/billing` },
  {
    id: 'closing-report',
    label: 'รายงานปิดงาน',
    href: `/cases/${id}/closing-report`,
  },
];
```

- [ ] **Step 4: รัน dev server แล้วตรวจด้วยตาว่าหน้าโหลดได้**

Run: `pnpm --filter web dev` แล้วเปิดเบราว์เซอร์ที่ `/cases/<some-case-id>/closing-report`
Expected: เห็นสองคอลัมน์ตามที่ออกแบบ ไม่มี error ใน console

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts "apps/web/src/app/(dashboard)/cases/[id]/closing-report" "apps/web/src/app/(dashboard)/cases/[id]/page.tsx"
git commit -m "feat(web): add closing report drafting page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Checklist (ทำหลังจบทุก task)

- [ ] ทุก endpoint ผ่าน `CaseAccessGuard` + `Roles(ADMIN, LAWYER)` ตรงตาม Global Constraints
- [ ] ไม่มีจุดใดส่งอีเมลออกจริงหรือเรียก Microsoft Graph — Phase 1 คัดลอกอย่างเดียว
- [ ] `missingDataNotes` แสดงเตือนเมื่อขาดข้อมูล ไม่ใช่ error ที่บล็อกการสร้างร่าง
- [ ] สถานะ `DRAFT`/`APPROVED` เก็บใน DB จริง ไม่ใช่ state ฝั่ง frontend อย่างเดียว
- [ ] ทุก import path ที่ทำเครื่องหมาย "ต้องเปิดไฟล์จริงดูก่อน" ถูกตรวจสอบแล้วก่อน commit

## งานที่ไม่รวมในแผนนี้ (อยู่แผนถัดไป)

- OAuth เชื่อม Outlook.com + Microsoft Graph (สร้าง Draft จริงในกล่องอีเมลทนาย)
- เชื่อมโยงกับ `DocumentTemplate` เพื่อให้สำนักงานปรับแม่แบบเอง (ตอนนี้ hardcode ในโค้ด)
- เผยแพร่รายงานบน Customer Portal (ต้องรอ `DocumentPublication` จากแผน Portal ที่ยังไม่เขียน — Client Portal เวอร์ชันปัจจุบันเป็น read-only ยังไม่มี publish workflow)
