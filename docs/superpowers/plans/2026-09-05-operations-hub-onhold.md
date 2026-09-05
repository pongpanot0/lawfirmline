# Operations Hub — On-Hold Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ทนาย/ผู้รับผิดชอบงานตั้งสถานะ "On hold" ให้งาน (Task) พร้อมเหตุผล ผู้ติดตาม และวันติดตามถัดไป และให้ owner เห็นรายการงาน On hold ทั้งสำนักงานในหน้า Operations Hub ที่มีอยู่แล้ว

**Architecture:** เพิ่ม Prisma model `TaskOnHold` (แยกจาก `Task.status` เดิม — ไม่ผสมเข้า enum หลักตามที่ตัดสินใจไว้ในเอกสาร schema design) ผูก 1:1 กับ `Task` งานตั้ง/เคลียร์ on-hold อยู่ใน `TasksModule` ที่มีอยู่แล้ว (ใช้ guard เดิม `JwtAuthGuard + CaseAccessGuard` ระดับเคส) ส่วนรายการรวมทั้งสำนักงานอยู่ใน `OperationsModule` ที่มีอยู่แล้ว (ใช้ guard เดิม `JwtAuthGuard + FirmRoleGuard + @OwnerOnly()`) ฝั่งเว็บเพิ่มแท็บ "On Hold" ในหน้า `/operations` เดิม ใช้ pattern `Tabs`/`Table` เดียวกับแท็บ Workload/Pairing

**Tech Stack:** NestJS 11 + Prisma 6 (apps/api), Next.js (apps/web), Jest (มีอยู่แล้วจาก plan ก่อนหน้า)

**Spec:**
- `docs/research/2026-09-05-customer-portal-consolidated-requirements.md` (ส่วนที่ 2 "Operations Hub" ในเอกสาร operations-outlook-customer-portal-requirements.md, นิยาม On hold)
- `docs/research/2026-09-05-customer-portal-schema-design.md` (ส่วนที่ 6 model `TaskOnHold`)
- `docs/superpowers/plans/2026-09-04-operations-hub.md` (แผนเดิมที่ implement workload/pairing ไปแล้ว — เป็นฐานให้ต่อยอด)

## Global Constraints

- On-hold เป็นสถานะระดับ**งาน (Task)** ไม่ใช่ระดับคดี — คดีเดียวมีได้ทั้งงาน on-hold และงานที่ยังทำต่อได้ (ตามสเปก)
- **ห้ามเพิ่มค่าใน `TaskStatus` enum** — on-hold เป็น relation แยก ไม่ใช่ enum value ใหม่ (ตัดสินใจไว้แล้วในเอกสาร schema design เพื่อไม่ผสมสถานะหลักกับสถานะรอ)
- งาน On hold **ต้องยังมีเจ้าของ (`assigneeId`)** และ**ไม่หยุด/ขยายกำหนดเวลาทางกฎหมายอัตโนมัติ** — ไม่แตะ `Task.dueDate` เมื่อตั้ง on-hold
- งานเกินกำหนด (`dueDate` ผ่านมาแล้ว) ต้องยังแสดงว่าเกินกำหนด แม้อยู่สถานะ on-hold — ห้ามซ่อน/mask
- Endpoint ตั้ง/เคลียร์ on-hold ใช้ guard เดิมของ `TasksController` (`JwtAuthGuard, CaseAccessGuard`) — ระดับเคส ไม่ใช่ owner-only
- Endpoint รายการรวมทั้งสำนักงาน (`GET /operations/onhold`) ใช้ guard เดิมของ `OperationsController` (`JwtAuthGuard, FirmRoleGuard` + `@OwnerOnly()`) — เหมือน `/operations/workload` และ `/operations/pairing` ทุกประการ
- Import guard/decorator จาก path จริง: `JwtAuthGuard` จาก `../common/guards/jwt-auth.guard`, `CaseAccessGuard` จาก `../common/guards/case-access.guard`, `FirmRoleGuard` จาก `../saas/guards/firm-role.guard`, `OwnerOnly` จาก `../saas/decorators/saas.decorators`, `CurrentUser` จาก `../common/decorators/current-user.decorator` — **ห้ามเดา path จาก `common/` สำหรับ `FirmRoleGuard`/`OwnerOnly` เพราะอยู่ใน `saas/` จริง**

---

## File Structure

**Create:**
- `apps/api/src/tasks/dto/task-on-hold.dto.ts` — `StartTaskOnHoldDto`, `UpdateTaskOnHoldDto`
- `apps/api/src/tasks/tasks.service.spec.ts` — unit test สำหรับ on-hold methods (ไฟล์นี้ยังไม่มี test อยู่ก่อน)
- `apps/api/src/operations/operations.service.spec.ts` — unit test สำหรับ `getOnHoldTasks`
- `apps/web/src/app/(dashboard)/operations/onhold-actions.tsx` — client component ปุ่ม start/resume on-hold ใช้ซ้ำในตาราง

**Modify:**
- `apps/api/prisma/schema.prisma` — เพิ่ม model `TaskOnHold` + back-relation
- `apps/api/src/tasks/tasks.service.ts` — เพิ่ม method `startOnHold`, `updateOnHold`, `resumeFromOnHold`, `findOne`/`findByCase` ต้อง include on-hold data ด้วย
- `apps/api/src/tasks/tasks.controller.ts` — เพิ่ม route `PATCH /cases/:caseId/tasks/:taskId/hold`, `POST /cases/:caseId/tasks/:taskId/hold/resume`
- `apps/api/src/operations/operations.service.ts` — เพิ่ม method `getOnHoldTasks(user)`
- `apps/api/src/operations/operations.controller.ts` — เพิ่ม route `GET /operations/onhold`
- `apps/web/src/lib/api.ts` — เพิ่ม type `OnHoldTaskEntry` + client methods `getOnHoldTasks`, `startTaskOnHold`, `resumeTaskFromOnHold`
- `apps/web/src/app/(dashboard)/operations/page.tsx` — เพิ่มแท็บ "On Hold" (`TabsTrigger` + `TabsContent`)

---

### Task 1: เพิ่ม Prisma model `TaskOnHold`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Consumes: `Task` model (`taskId` FK unique), `User` model (`followerUserId`/`createdBy` FK)
- Produces: `prisma.taskOnHold` client methods ที่ Task 2 ใช้ต่อ, field `Task.onHold: TaskOnHold?` (back-relation) ที่ Task 2 ใช้ตอน `include`

- [ ] **Step 1: เพิ่ม model ต่อท้ายไฟล์ schema (หลัง model สุดท้าย เช่นเดียวกับที่ทำมาก่อนหน้านี้ในโปรเจกต์)**

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
  notes          String?   @db.Text
  createdById    String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  task      Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
  follower  User? @relation("TaskOnHoldFollower", fields: [followerUserId], references: [id])
  createdBy User  @relation("TaskOnHoldCreator", fields: [createdById], references: [id])

  @@index([nextFollowUpAt])
  @@index([endedAt])
}
```

- [ ] **Step 2: เพิ่ม back-relation ใน `model Task { ... }` (ต่อจาก `createdBy User @relation("TaskCreator", ...)`)**

```prisma
  onHold TaskOnHold?
```

- [ ] **Step 3: เพิ่ม back-relation ใน `model User { ... }` (ต่อจากกลุ่ม relation ที่มีอยู่)**

```prisma
  followedTaskOnHolds TaskOnHold[] @relation("TaskOnHoldFollower")
  createdTaskOnHolds  TaskOnHold[] @relation("TaskOnHoldCreator")
```

- [ ] **Step 4: สร้าง migration**

Run:
```bash
cd apps/api && pnpm prisma migrate dev --name add_task_on_hold
```
Expected: migration สร้างและ apply สำเร็จ ไม่มี drift error (เช็ค `pnpm prisma migrate status` ก่อนถ้าไม่แน่ใจว่า DB สะอาดอยู่แล้ว — ถ้าเจอ drift ใด ๆ **ห้ามใช้ `migrate reset` เอง หยุดและรายงานทันที**)

- [ ] **Step 5: ตรวจว่า Prisma Client รู้จัก model ใหม่**

Run:
```bash
cd apps/api && node -e "const {PrismaClient}=require('./src/generated/prisma');console.log(typeof new PrismaClient().taskOnHold)"
```
Expected: พิมพ์ `object`

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add TaskOnHold model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `TasksService` — เพิ่ม `startOnHold`, `updateOnHold`, `resumeFromOnHold`

**Files:**
- Modify: `apps/api/src/tasks/tasks.service.ts`
- Create: `apps/api/src/tasks/dto/task-on-hold.dto.ts`
- Create: `apps/api/src/tasks/tasks.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`prisma.task.findUnique`, `prisma.taskOnHold.create/update/findUnique`), `AuthUser` type (มีอยู่แล้ว ใช้ใน `create()`/`update()` เดิม)
- Produces:
```ts
interface TaskOnHold {
  id: string;
  taskId: string;
  reason: string;
  startedAt: Date;
  endedAt: Date | null;
  followerUserId: string | null;
  lastFollowUpAt: Date | null;
  nextFollowUpAt: Date | null;
  notes: string | null;
}

class TasksService {
  startOnHold(taskId: string, user: AuthUser, dto: StartTaskOnHoldDto): Promise<TaskOnHold>
  updateOnHold(taskId: string, dto: UpdateTaskOnHoldDto): Promise<TaskOnHold>
  resumeFromOnHold(taskId: string): Promise<TaskOnHold>
}
```
Task 3 (controller) เรียกทั้ง 3 method นี้ตรง ๆ ด้วย signature เดียวกัน

- [ ] **Step 1: สร้าง DTO**

`apps/api/src/tasks/dto/task-on-hold.dto.ts`:
```ts
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class StartTaskOnHoldDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsUUID()
  followerUserId?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;
}

export class UpdateTaskOnHoldDto {
  @IsOptional()
  @IsUUID()
  followerUserId?: string;

  @IsOptional()
  @IsDateString()
  lastFollowUpAt?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

- [ ] **Step 2: เขียน test ที่ล้มเหลวก่อน**

`apps/api/src/tasks/tasks.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TasksService on-hold', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { findUnique: jest.fn() },
    taskOnHold: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TasksService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(TasksService);
  });

  describe('startOnHold', () => {
    it('throws NotFoundException when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);
      await expect(
        service.startOnHold('missing-task', user, { reason: 'รอลูกความ' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when task is already on hold', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        onHold: { id: 'hold-1', endedAt: null },
      });
      await expect(
        service.startOnHold('task-1', user, { reason: 'รอศาล' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a TaskOnHold row when task exists and is not already on hold', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1', onHold: null });
      mockPrisma.taskOnHold.create.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        reason: 'รอลูกความส่งเอกสาร',
        startedAt: new Date('2026-09-05'),
        endedAt: null,
        followerUserId: 'user-1',
        lastFollowUpAt: null,
        nextFollowUpAt: null,
        notes: null,
      });

      const result = await service.startOnHold('task-1', user, {
        reason: 'รอลูกความส่งเอกสาร',
        followerUserId: 'user-1',
      });

      expect(mockPrisma.taskOnHold.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          reason: 'รอลูกความส่งเอกสาร',
          followerUserId: 'user-1',
          nextFollowUpAt: undefined,
          createdById: 'user-1',
        },
      });
      expect(result.reason).toBe('รอลูกความส่งเอกสาร');
    });
  });

  describe('resumeFromOnHold', () => {
    it('throws NotFoundException when no active on-hold record exists', async () => {
      mockPrisma.taskOnHold.findUnique.mockResolvedValue(null);
      await expect(service.resumeFromOnHold('task-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the on-hold record is already ended', async () => {
      mockPrisma.taskOnHold.findUnique.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        endedAt: new Date('2026-09-01'),
      });
      await expect(service.resumeFromOnHold('task-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sets endedAt when the on-hold record is active', async () => {
      mockPrisma.taskOnHold.findUnique.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        endedAt: null,
      });
      mockPrisma.taskOnHold.update.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        endedAt: new Date('2026-09-05'),
      });

      const result = await service.resumeFromOnHold('task-1');

      expect(mockPrisma.taskOnHold.update).toHaveBeenCalledWith({
        where: { id: 'hold-1' },
        data: { endedAt: expect.any(Date) },
      });
      expect(result.endedAt).not.toBeNull();
    });
  });
});
```

- [ ] **Step 3: รัน test เพื่อดูว่าล้มเหลว**

Run: `cd apps/api && pnpm test -- tasks.service.spec.ts`
Expected: FAIL — `service.startOnHold is not a function` (หรือคล้ายกัน)

- [ ] **Step 4: เพิ่ม method ใน `apps/api/src/tasks/tasks.service.ts`**

เปิดไฟล์ดูโครงสร้างเดิมก่อน (มี `taskInclude` และ constructor รับ `PrismaService` อยู่แล้ว) แล้วเพิ่ม import ที่หัวไฟล์:
```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
```
(ปรับ import เดิมถ้ามีอยู่แล้วบางส่วน อย่า import ซ้ำ)

เพิ่ม method ต่อท้าย class:
```ts
  async startOnHold(taskId: string, user: AuthUser, dto: StartTaskOnHoldDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { onHold: true },
    });
    if (!task) {
      throw new NotFoundException('ไม่พบงานนี้');
    }
    if (task.onHold && !task.onHold.endedAt) {
      throw new BadRequestException('งานนี้อยู่ในสถานะ On hold อยู่แล้ว');
    }

    return this.prisma.taskOnHold.create({
      data: {
        taskId,
        reason: dto.reason,
        followerUserId: dto.followerUserId,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
        createdById: user.id,
      },
    });
  }

  async updateOnHold(taskId: string, dto: UpdateTaskOnHoldDto) {
    const hold = await this.prisma.taskOnHold.findUnique({ where: { taskId } });
    if (!hold || hold.endedAt) {
      throw new NotFoundException('ไม่พบสถานะ On hold ที่ยังใช้งานอยู่สำหรับงานนี้');
    }

    return this.prisma.taskOnHold.update({
      where: { id: hold.id },
      data: {
        followerUserId: dto.followerUserId ?? hold.followerUserId,
        lastFollowUpAt: dto.lastFollowUpAt ? new Date(dto.lastFollowUpAt) : hold.lastFollowUpAt,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : hold.nextFollowUpAt,
        notes: dto.notes ?? hold.notes,
      },
    });
  }

  async resumeFromOnHold(taskId: string) {
    const hold = await this.prisma.taskOnHold.findUnique({ where: { taskId } });
    if (!hold) {
      throw new NotFoundException('ไม่พบสถานะ On hold สำหรับงานนี้');
    }
    if (hold.endedAt) {
      throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะ On hold');
    }

    return this.prisma.taskOnHold.update({
      where: { id: hold.id },
      data: { endedAt: new Date() },
    });
  }
```

เพิ่ม import ของ DTO ที่หัวไฟล์:
```ts
import { StartTaskOnHoldDto, UpdateTaskOnHoldDto } from './dto/task-on-hold.dto';
```

- [ ] **Step 5: รัน test เพื่อดูว่าผ่าน**

Run: `cd apps/api && pnpm test -- tasks.service.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: รันชุด test ทั้งหมดเพื่อยืนยันไม่มี regression**

Run: `cd apps/api && pnpm test`
Expected: PASS ทุกไฟล์ (รวมของ Task ก่อนหน้านี้ทั้งหมด)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tasks/tasks.service.ts apps/api/src/tasks/tasks.service.spec.ts apps/api/src/tasks/dto/task-on-hold.dto.ts
git commit -m "feat(api): add task on-hold service methods

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `OperationsService.getOnHoldTasks` + เปิด endpoint ทั้งสองฝั่ง

**Files:**
- Modify: `apps/api/src/operations/operations.service.ts`
- Modify: `apps/api/src/operations/operations.controller.ts`
- Modify: `apps/api/src/tasks/tasks.controller.ts`
- Create: `apps/api/src/operations/operations.service.spec.ts`

**Interfaces:**
- Consumes: `TasksService.startOnHold/updateOnHold/resumeFromOnHold` จาก Task 2; `PrismaService`
- Produces:
```ts
interface OnHoldTaskEntry {
  taskId: string;
  taskTitle: string;
  caseId: string | null;
  caseTitle: string | null;
  caseOwnRef: string | null;
  assigneeName: string | null;
  reason: string;
  startedAt: Date;
  followerName: string | null;
  lastFollowUpAt: Date | null;
  nextFollowUpAt: Date | null;
  dueDate: Date | null;
  isOverdue: boolean;
}

class OperationsService {
  getOnHoldTasks(user: AuthUser): Promise<OnHoldTaskEntry[]>
}
```
`GET /operations/onhold` (Task 3) คืนค่าเป็น `OnHoldTaskEntry[]` ตรง ๆ — Task 4 (frontend) map field ชื่อนี้ตรง ๆ

- [ ] **Step 1: เขียน test ที่ล้มเหลวก่อน**

`apps/api/src/operations/operations.service.spec.ts`:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { OperationsService } from './operations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OperationsService.getOnHoldTasks', () => {
  let service: OperationsService;
  const mockPrisma = {
    taskOnHold: { findMany: jest.fn() },
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [OperationsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(OperationsService);
  });

  it('returns only active on-hold entries scoped to the firm, flagging overdue tasks', async () => {
    const now = Date.now();
    mockPrisma.taskOnHold.findMany.mockResolvedValue([
      {
        taskId: 'task-1',
        reason: 'รอลูกความส่งเอกสาร',
        startedAt: new Date('2026-08-01'),
        lastFollowUpAt: null,
        nextFollowUpAt: new Date('2026-09-10'),
        task: {
          id: 'task-1',
          title: 'เตรียมคำให้การ',
          dueDate: new Date(now - 86400000),
          case: { id: 'case-1', title: 'คดีทดสอบ', ownRef: 'CASE-001', firmId: 'firm-1' },
          assignee: { firstName: 'สมชาย', lastName: 'ใจดี' },
        },
        follower: { firstName: 'สมหญิง', lastName: 'รักงาน' },
      },
    ]);

    const result = await service.getOnHoldTasks(user);

    expect(mockPrisma.taskOnHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          endedAt: null,
          task: expect.objectContaining({ case: { firmId: 'firm-1' } }),
        }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].isOverdue).toBe(true);
    expect(result[0].caseOwnRef).toBe('CASE-001');
    expect(result[0].followerName).toBe('สมหญิง รักงาน');
  });
});
```

- [ ] **Step 2: รัน test เพื่อดูว่าล้มเหลว**

Run: `cd apps/api && pnpm test -- operations.service.spec.ts`
Expected: FAIL — `service.getOnHoldTasks is not a function`

- [ ] **Step 3: เพิ่ม method ใน `apps/api/src/operations/operations.service.ts`**

เปิดไฟล์เดิมดู pattern ของ `getPairing(user)` ก่อน (ใช้ `user.firmId` กรอง) แล้วเพิ่ม method ต่อท้าย class:
```ts
  async getOnHoldTasks(user: AuthUser) {
    const now = new Date();
    const holds = await this.prisma.taskOnHold.findMany({
      where: {
        endedAt: null,
        task: { case: { firmId: user.firmId } },
      },
      include: {
        task: {
          include: {
            case: { select: { id: true, title: true, ownRef: true } },
            assignee: { select: { firstName: true, lastName: true } },
          },
        },
        follower: { select: { firstName: true, lastName: true } },
      },
      orderBy: { nextFollowUpAt: 'asc' },
    });

    return holds.map((hold) => ({
      taskId: hold.taskId,
      taskTitle: hold.task.title,
      caseId: hold.task.case?.id ?? null,
      caseTitle: hold.task.case?.title ?? null,
      caseOwnRef: hold.task.case?.ownRef ?? null,
      assigneeName: hold.task.assignee
        ? `${hold.task.assignee.firstName} ${hold.task.assignee.lastName}`
        : null,
      reason: hold.reason,
      startedAt: hold.startedAt,
      followerName: hold.follower
        ? `${hold.follower.firstName} ${hold.follower.lastName}`
        : null,
      lastFollowUpAt: hold.lastFollowUpAt,
      nextFollowUpAt: hold.nextFollowUpAt,
      dueDate: hold.task.dueDate,
      isOverdue: hold.task.dueDate ? hold.task.dueDate.getTime() < now.getTime() : false,
    }));
  }
```

**หมายเหตุ**: ตรวจว่า `AuthUser` type ที่ import อยู่ในไฟล์นี้แล้วมี field `firmId` จริง (ดูจาก `getWorkloadSummary`/`getPairing` เดิมที่ใช้ `user.firmId` อยู่แล้ว — ถ้าไม่มีให้ตรวจจาก `getFirmMembers` ว่าดึง `firmId` มาจากไหน แล้วใช้แบบเดียวกัน)

- [ ] **Step 4: รัน test เพื่อดูว่าผ่าน**

Run: `cd apps/api && pnpm test -- operations.service.spec.ts`
Expected: PASS (1 test)

- [ ] **Step 5: เปิด `apps/api/src/operations/operations.controller.ts` เพิ่ม route**

เพิ่มต่อจาก route `pairing` เดิม (รูปแบบเดียวกับ `getPairing`):
```ts
  @Get('onhold')
  getOnHoldTasks(@CurrentUser() user: AuthUser) {
    return this.operationsService.getOnHoldTasks(user);
  }
```

- [ ] **Step 6: เปิด `apps/api/src/tasks/tasks.controller.ts` เพิ่ม route ตั้ง/แก้/เคลียร์ on-hold**

เปิดไฟล์ดู pattern ของ route `PATCH /:taskId` เดิมก่อน (ใช้ `@Param('taskId')`, `@Body()`) แล้วเพิ่มต่อท้าย class (ก่อน route `DELETE`):
```ts
  @Patch(':taskId/hold')
  startOnHold(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: StartTaskOnHoldDto,
  ) {
    return this.tasksService.startOnHold(taskId, user, dto);
  }

  @Patch(':taskId/hold/follow-up')
  updateOnHold(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskOnHoldDto,
  ) {
    return this.tasksService.updateOnHold(taskId, dto);
  }

  @Post(':taskId/hold/resume')
  resumeFromOnHold(@Param('taskId') taskId: string) {
    return this.tasksService.resumeFromOnHold(taskId);
  }
```
เพิ่ม import ที่หัวไฟล์ตามที่ต้องใช้เพิ่ม (`Post` จาก `@nestjs/common` ถ้ายังไม่ import, `StartTaskOnHoldDto`/`UpdateTaskOnHoldDto` จาก `./dto/task-on-hold.dto`)

- [ ] **Step 7: build เพื่อตรวจ compile error**

Run: `cd apps/api && pnpm build`
Expected: build สำเร็จไม่มี TypeScript error

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/operations apps/api/src/tasks
git commit -m "feat(api): expose on-hold endpoints in tasks and operations

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: หน้าเว็บ Operations Hub — แท็บ "On Hold"

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/(dashboard)/operations/page.tsx`
- Create: `apps/web/src/app/(dashboard)/operations/onhold-actions.tsx`

**Interfaces:**
- Consumes: `GET /operations/onhold`, `PATCH /cases/:caseId/tasks/:taskId/hold`, `POST /cases/:caseId/tasks/:taskId/hold/resume` จาก Task 3

**หมายเหตุสำคัญ**: route ตั้ง/เคลียร์ on-hold อยู่ใต้ `cases/:caseId/tasks/:taskId/hold` (ต้องมี `caseId`) แต่รายการที่ owner เห็นในหน้า Operations Hub มาจาก `GET /operations/onhold` ซึ่งคืน `caseId` มาด้วยอยู่แล้ว (ดู `OnHoldTaskEntry.caseId` จาก Task 3) — ใช้ค่านั้นประกอบ URL ตอนเรียก resume ได้เลย ถ้า `caseId` เป็น `null` (งาน standalone ไม่ผูกคดี) ให้ซ่อนปุ่ม resume และแสดงข้อความ "จัดการงานนี้ผ่านหน้ารายการงานของฉัน" แทน (Task 2/3 ไม่ได้จำกัดว่า Task ต้องผูก case — ดู `Task.caseId String?` เป็น optional)

- [ ] **Step 1: เพิ่ม type + client methods ใน `apps/web/src/lib/api.ts`**

เปิดไฟล์ดูตำแหน่งที่ `WorkloadSummary`/`PairingEntry` interface ประกาศอยู่ (บรรทัดประมาณ 141-170) แล้วเพิ่มต่อท้ายกลุ่มนั้น:
```ts
export interface OnHoldTaskEntry {
  taskId: string;
  taskTitle: string;
  caseId: string | null;
  caseTitle: string | null;
  caseOwnRef: string | null;
  assigneeName: string | null;
  reason: string;
  startedAt: string;
  followerName: string | null;
  lastFollowUpAt: string | null;
  nextFollowUpAt: string | null;
  dueDate: string | null;
  isOverdue: boolean;
}
```

เปิดดูตำแหน่งที่ `getWorkloadSummary`/`getPairing` ถูกเพิ่มเข้า object `api` (บรรทัดประมาณ 647-653) แล้วเพิ่มต่อท้ายกลุ่มเดียวกัน:
```ts
  getOnHoldTasks: (token: string) =>
    request<OnHoldTaskEntry[]>('/operations/onhold', { token }),

  resumeTaskFromOnHold: (token: string, caseId: string, taskId: string) =>
    request<{ id: string }>(`/cases/${caseId}/tasks/${taskId}/hold/resume`, {
      method: 'POST',
      token,
    }),
```

- [ ] **Step 2: สร้าง `apps/web/src/app/(dashboard)/operations/onhold-actions.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface OnHoldResumeButtonProps {
  token: string;
  caseId: string | null;
  taskId: string;
  onResumed: () => void;
}

export function OnHoldResumeButton({
  token,
  caseId,
  taskId,
  onResumed,
}: OnHoldResumeButtonProps) {
  const [loading, setLoading] = useState(false);

  if (!caseId) {
    return (
      <span className="text-xs text-muted-foreground">
        จัดการผ่านหน้ารายการงานของฉัน
      </span>
    );
  }

  const handleResume = async () => {
    setLoading(true);
    try {
      await api.resumeTaskFromOnHold(token, caseId, taskId);
      onResumed();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="rounded bg-green-600 px-3 py-1 text-xs text-white disabled:opacity-50"
      onClick={handleResume}
      disabled={loading}
    >
      {loading ? 'กำลังดำเนินการ...' : 'เคลียร์ On hold'}
    </button>
  );
}
```

- [ ] **Step 3: เปิด `apps/web/src/app/(dashboard)/operations/page.tsx` เพิ่มแท็บ**

เปิดไฟล์ดูโครงสร้าง `useState('workload')`, `useEffect` ของแท็บ pairing, และ `TabsList`/`TabsContent` เดิมทั้งหมดก่อน (207 บรรทัด) แล้วทำตามรูปแบบเดียวกันเป๊ะ ๆ:

1. เพิ่ม import: `import { OnHoldResumeButton } from './onhold-actions';` และ `import { type OnHoldTaskEntry } from '@/lib/api';`
2. เพิ่ม state: `const [onHold, setOnHold] = useState<OnHoldTaskEntry[]>([]);` และ `const [onHoldLoading, setOnHoldLoading] = useState(true);`
3. เพิ่มฟังก์ชันโหลดข้อมูลแยก (เพื่อให้ `OnHoldResumeButton` เรียก reload ได้หลัง resume):
```tsx
  const loadOnHold = () => {
    if (!token || !isOwner) return;
    setOnHoldLoading(true);
    api
      .getOnHoldTasks(token)
      .then(setOnHold)
      .catch(console.error)
      .finally(() => setOnHoldLoading(false));
  };
```
4. เพิ่ม `useEffect(loadOnHold, [token, isOwner]);` คู่กับ `useEffect` ของแท็บ pairing เดิม
5. เพิ่ม `<TabsTrigger value="onhold">On Hold</TabsTrigger>` ต่อท้าย `TabsList` เดิม
6. เพิ่ม `TabsContent` ใหม่ต่อท้าย block ของ pairing เดิม:
```tsx
        <TabsContent value="onhold">
          <Card>
            <CardContent className="p-0">
              {onHoldLoading ? (
                <p className="p-6 text-sm text-muted-foreground">กำลังโหลด...</p>
              ) : onHold.length === 0 ? (
                <EmptyState title="ไม่มีงาน On hold ในขณะนี้" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>งาน</TableHead>
                      <TableHead>คดี</TableHead>
                      <TableHead>ผู้รับผิดชอบ</TableHead>
                      <TableHead>เหตุผล</TableHead>
                      <TableHead>ผู้ติดตาม</TableHead>
                      <TableHead>วันติดตามถัดไป</TableHead>
                      <TableHead>กำหนดส่ง</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onHold.map((item) => (
                      <TableRow key={item.taskId}>
                        <TableCell>{item.taskTitle}</TableCell>
                        <TableCell>
                          {item.caseOwnRef ?? '-'} {item.caseTitle ?? ''}
                        </TableCell>
                        <TableCell>{item.assigneeName ?? '-'}</TableCell>
                        <TableCell>{item.reason}</TableCell>
                        <TableCell>{item.followerName ?? '-'}</TableCell>
                        <TableCell>
                          {item.nextFollowUpAt
                            ? new Date(item.nextFollowUpAt).toLocaleDateString('th-TH')
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {item.dueDate ? (
                            <span className={item.isOverdue ? 'text-red-600 font-medium' : ''}>
                              {new Date(item.dueDate).toLocaleDateString('th-TH')}
                              {item.isOverdue ? ' (เกินกำหนด)' : ''}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <OnHoldResumeButton
                            token={token!}
                            caseId={item.caseId}
                            taskId={item.taskId}
                            onResumed={loadOnHold}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
```

**หมายเหตุ**: ชื่อ component `TableHeader`/`TableRow`/`TableHead`/`TableBody`/`TableCell` เป็นการเดาจาก shadcn convention ทั่วไป — เปิดไฟล์ `page.tsx` เดิมดูว่า import จริงชื่ออะไรจาก `@/components/ui/table` แล้วใช้ชื่อจริงให้ตรง ห้ามเดาเอง ตัวแปร `isOwner`/`token` ก็เช่นกัน ให้ใช้ชื่อจริงที่มีอยู่แล้วในไฟล์ (ไฟล์นี้มี gate ที่บรรทัด 63-65 อยู่แล้วตามที่สำรวจไว้ ใช้ variable เดียวกัน)

- [ ] **Step 4: build เพื่อตรวจ compile error**

Run: `cd apps/web && pnpm build`
Expected: build สำเร็จไม่มี TypeScript error, route `/operations` ยังอยู่ในรายการ

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts "apps/web/src/app/(dashboard)/operations"
git commit -m "feat(web): add On Hold tab to Operations Hub

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Checklist (ทำหลังจบทุก task)

- [ ] On-hold ไม่แตะ `Task.dueDate` หรือ `Task.status` เลย — เป็น relation แยกล้วน ๆ
- [ ] `GET /operations/onhold` กรองด้วย `firmId` ของ user เสมอ ไม่เห็นข้ามสำนักงาน
- [ ] Route ตั้ง/เคลียร์ on-hold ใช้ guard ระดับเคส (`CaseAccessGuard`) ไม่ใช่ owner-only
- [ ] `isOverdue` คำนวณจาก `dueDate` จริงเสมอ ไม่ถูกซ่อนเพราะอยู่สถานะ on-hold
- [ ] ทดสอบ regression: `pnpm --filter api test` ทั้งชุดผ่านหมด (ของเดิม + ใหม่)

## งานที่ไม่รวมในแผนนี้ (ขอบเขตถัดไป)

- UI ตั้ง on-hold จากหน้ารายละเอียดงาน/คดีโดยตรง (แผนนี้ให้จัดการผ่าน API เท่านั้นสำหรับการ "เริ่ม" on-hold ยกเว้นการ "เคลียร์" ที่ทำได้จากหน้า Operations Hub) — เพิ่ม UI เต็มรูปแบบในหน้าแฟ้มคดี/งาน เป็นงานถัดไป
- การแจ้งเตือนอัตโนมัติเมื่อถึงวันติดตาม (`nextFollowUpAt`) — ต้องรอ requirement ช่องทางแจ้งเตือน (อีเมล/LINE) ที่ยืนยันไว้แล้วสำหรับ Portal นำมาใช้ร่วมกัน
