# Task Detail (Jira-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every task (personal `/todos` and case tasks) subtasks, priority, labels, file attachments and comments, opened in a right-side drawer from the Kanban board.

**Architecture:** Extend the existing `Task` model (self-relation for subtasks, `priority`, `labels`) and add `TaskAttachment` + `TaskComment`. One new NestJS controller `/tasks/:taskId/*` serves both task kinds through a shared `assertAccess` in `TasksService`; existing list/create/update routes gain the new fields. On the web a `TaskDetailDrawer` driven by the `?task=<id>` search param is mounted by both boards.

**Tech Stack:** NestJS 10 + Prisma (Postgres), `FileStorageService` (local/S3), class-validator DTOs, Jest (`apps/api`); Next.js 15 app router, Tailwind, `node --test` (`apps/web`); `@lawfirm/shared` for enums shared across api/web.

**Spec:** `docs/superpowers/specs/2026-09-11-task-detail-jira-design.md`

## Global Constraints

- Subtasks are one level deep: a task with `parentId` cannot receive subtasks (400).
- A subtask inherits `caseId` from its parent.
- `labels`: trimmed, de-duplicated (case-sensitive), max 10 per task, max 30 chars each; longer/more → 400.
- Attachments: ≤ 10 MB (`limits.fileSize` on the interceptor), MIME allowlist = pdf, png, jpeg, gif, webp, docx, xlsx, txt; anything else → 400 `'รองรับเฉพาะ PDF, รูปภาพ, DOCX, XLSX, TXT'`.
- Attachment delete: uploader or firm OWNER. Comment delete: author or firm OWNER.
- Board lists (`GET /todos`, `GET /cases/:caseId/tasks`) return top-level tasks only (`parentId: null`).
- All new UI copy has Thai + English keys under `taskDetail` in `apps/web/src/lib/i18n/dashboard.ts`.
- Dates shown with `formatDate` from `@/lib/utils` (already Bangkok-pinned).
- Run api tests with `cd apps/api && npx jest src/tasks` and web tests with `cd apps/web && npm test`. Typecheck web with `cd apps/web && npx tsc --noEmit -p tsconfig.json` (must stay clean; `apps/api` has pre-existing intake typecheck errors — ignore those, rely on jest).
- Commit after every task with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Never run `prisma migrate deploy` (other branches have unapplied migrations); apply this plan's migration with `prisma migrate dev --name task_detail_fields` only from Task 1, and run `prisma generate`.

---

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/index.ts` | `TaskPriority` enum, `TASK_PRIORITY_LABELS`, `normalizeTaskLabels()` |
| `apps/api/prisma/schema.prisma` + migration | enum, Task columns, `TaskAttachment`, `TaskComment` |
| `apps/api/src/tasks/dto/task.dto.ts` | `priority`, `labels` on create/update |
| `apps/api/src/tasks/dto/task-detail.dto.ts` | `CreateSubtaskDto`, `CreateTaskCommentDto` |
| `apps/api/src/tasks/tasks.service.ts` | `assertAccess`, list filter + counts, label/priority handling |
| `apps/api/src/tasks/task-detail.service.ts` | detail, subtasks, attachments, comments |
| `apps/api/src/tasks/task-detail.controller.ts` | `/tasks/:taskId/*` |
| `apps/api/src/tasks/tasks.module.ts` | wire the two above |
| `apps/web/src/lib/api.ts` | types + client functions |
| `apps/web/src/components/KanbanBoard.tsx` | `onOpen`, priority bar, labels, counters |
| `apps/web/src/components/tasks/TaskDetailDrawer.tsx` | the drawer |
| `apps/web/src/components/tasks/useTaskParam.ts` | read/set `?task=` |
| `apps/web/src/app/(dashboard)/todos/page.tsx`, `apps/web/src/components/cases/CaseTasksPanel.tsx` | mount drawer, priority in quick-create |
| `apps/web/src/lib/i18n/dashboard.ts` | `taskDetail` keys th/en |

---

### Task 1: Shared enum + label normalizer + schema migration

**Files:**
- Modify: `packages/shared/src/index.ts` (after `TaskLogAction` enum, ~line 236)
- Modify: `apps/api/prisma/schema.prisma` (`model Task`, `model User`)
- Create: `apps/api/prisma/migrations/<timestamp>_task_detail_fields/migration.sql` (generated)
- Test: `apps/api/src/tasks/task-labels.spec.ts`

**Interfaces:**
- Produces: `TaskPriority` (`LOW|MEDIUM|HIGH`), `TASK_PRIORITY_LABELS`, `normalizeTaskLabels(input: unknown): string[]` (throws `Error('TASK_LABELS_TOO_MANY')` / `Error('TASK_LABEL_TOO_LONG')`), Prisma models `TaskAttachment`, `TaskComment`, Task fields `parentId`, `priority`, `labels`.

- [ ] **Step 1: Write the failing normalizer test**

`apps/api/src/tasks/task-labels.spec.ts`:
```ts
import { normalizeTaskLabels } from '@lawfirm/shared';

describe('normalizeTaskLabels', () => {
  it('trims, drops blanks and de-duplicates', () => {
    expect(normalizeTaskLabels([' ศาล ', '', 'เอกสาร', 'ศาล'])).toEqual(['ศาล', 'เอกสาร']);
  });
  it('returns [] for non-arrays', () => {
    expect(normalizeTaskLabels(undefined)).toEqual([]);
    expect(normalizeTaskLabels('x')).toEqual([]);
  });
  it('rejects more than 10 labels', () => {
    const many = Array.from({ length: 11 }, (_, i) => `l${i}`);
    expect(() => normalizeTaskLabels(many)).toThrow('TASK_LABELS_TOO_MANY');
  });
  it('rejects a label over 30 chars', () => {
    expect(() => normalizeTaskLabels(['a'.repeat(31)])).toThrow('TASK_LABEL_TOO_LONG');
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd apps/api && npx jest src/tasks/task-labels.spec.ts`
Expected: FAIL — `normalizeTaskLabels` is not exported.

- [ ] **Step 3: Add enum + normalizer to shared**

In `packages/shared/src/index.ts`, after the `TaskLogAction` enum:
```ts
export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.HIGH]: 'สูง',
  [TaskPriority.MEDIUM]: 'กลาง',
  [TaskPriority.LOW]: 'ต่ำ',
};

export const TASK_LABEL_MAX_COUNT = 10;
export const TASK_LABEL_MAX_LENGTH = 30;

/**
 * Labels are free text typed by lawyers; this is the one place their shape is
 * decided so the API and the chip input agree. Throws with a stable code so
 * callers can map it to their own error copy.
 */
export function normalizeTaskLabels(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    if (label.length > TASK_LABEL_MAX_LENGTH) throw new Error('TASK_LABEL_TOO_LONG');
    seen.add(label);
    out.push(label);
  }
  if (out.length > TASK_LABEL_MAX_COUNT) throw new Error('TASK_LABELS_TOO_MANY');
  return out;
}
```
Then `cd packages/shared && pnpm build`.

- [ ] **Step 4: Run the test, expect pass**

Run: `cd apps/api && npx jest src/tasks/task-labels.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Extend the Prisma schema**

In `apps/api/prisma/schema.prisma`, add before `model Task`:
```prisma
enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}
```
Inside `model Task`, after `source TaskSource @default(WEB)`:
```prisma
  parentId    String?
  priority    TaskPriority @default(MEDIUM)
  labels      String[]     @default([])
```
and after `assignmentLogs TaskAssignmentLog[]`:
```prisma
  parent      Task?            @relation("TaskSubtasks", fields: [parentId], references: [id], onDelete: Cascade)
  subtasks    Task[]           @relation("TaskSubtasks")
  attachments TaskAttachment[]
  comments    TaskComment[]
```
and in the Task `@@index` block add `@@index([parentId])`.

After `model Task { … }` add:
```prisma
model TaskAttachment {
  id           String   @id @default(uuid())
  taskId       String
  filename     String
  storagePath  String
  mimeType     String
  size         Int
  uploadedById String
  createdAt    DateTime @default(now())

  task       Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  uploadedBy User @relation("TaskAttachmentUploader", fields: [uploadedById], references: [id])

  @@index([taskId])
}

model TaskComment {
  id        String   @id @default(uuid())
  taskId    String
  authorId  String
  body      String   @db.Text
  createdAt DateTime @default(now())

  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User @relation("TaskCommentAuthor", fields: [authorId], references: [id])

  @@index([taskId, createdAt])
}
```
In `model User`, next to `createdTasks Task[] @relation("TaskCreator")`:
```prisma
  taskAttachments            TaskAttachment[]          @relation("TaskAttachmentUploader")
  taskComments               TaskComment[]             @relation("TaskCommentAuthor")
```

- [ ] **Step 6: Create and apply the migration**

Run: `cd apps/api && npx prisma migrate dev --name task_detail_fields --create-only` then inspect the generated SQL (must contain `CREATE TYPE "TaskPriority"`, three `ALTER TABLE "Task" ADD COLUMN`, `CREATE TABLE "TaskAttachment"`, `CREATE TABLE "TaskComment"`, the FK with `ON DELETE CASCADE`). Then apply **only this migration** with:
```bash
cd apps/api && psql "$(grep DATABASE_URL .env | cut -d'"' -f2)" -f prisma/migrations/*_task_detail_fields/migration.sql && npx prisma migrate resolve --applied "$(ls prisma/migrations | grep task_detail_fields)" && npx prisma generate
```
(`migrate dev` without `--create-only` would also apply unrelated pending migrations from other branches; do not.)

- [ ] **Step 7: Verify the client compiles**

Run: `cd apps/api && npx jest src/tasks`
Expected: PASS (existing suites + labels).

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/index.ts apps/api/prisma apps/api/src/tasks/task-labels.spec.ts
git commit -m "feat(tasks): priority, labels, subtask parent, attachment and comment models"
```

---

### Task 2: TasksService — access rule, board lists, priority/labels on create & update

**Files:**
- Modify: `apps/api/src/tasks/dto/task.dto.ts`
- Modify: `apps/api/src/tasks/tasks.service.ts`
- Test: `apps/api/src/tasks/tasks.service.detail.spec.ts` (new file)

**Interfaces:**
- Consumes: `TaskPriority`, `normalizeTaskLabels` from `@lawfirm/shared`.
- Produces: `TasksService.assertAccess(taskId, user): Promise<TaskRecord>` (returns the task row incl. `caseId`, `parentId`, `assigneeId`, `createdById`); `TasksService.boardInclude`; list items carry `priority`, `labels`, `subtaskCount`, `subtaskDoneCount`, `attachmentCount`, `commentCount`; `create`/`update` accept `priority`, `labels`; `TasksService.labelsFromDto(labels?: unknown): string[] | undefined` (maps normalizer errors to `BadRequestException`).

- [ ] **Step 1: Write failing tests**

`apps/api/src/tasks/tasks.service.detail.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmRole, TaskPriority } from '@lawfirm/shared';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';

describe('TasksService detail support', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    case: { findUnique: jest.fn() },
    caseAssignment: { upsert: jest.fn() },
    caseActivity: { create: jest.fn() },
    taskAssignmentLog: { create: jest.fn() },
  };
  const mockCaseAccess = { getTaskFilterForUser: jest.fn().mockReturnValue({}), canAccessCase: jest.fn() };
  const lawyer = { id: 'u1', firmId: 'f1', firmRole: FirmRole.LAWYER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCaseAccess.getTaskFilterForUser.mockReturnValue({});
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  describe('assertAccess', () => {
    it('404s when the task is missing', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);
      await expect(service.assertAccess('t1', lawyer)).rejects.toThrow(NotFoundException);
    });
    it('allows a standalone task for its assignee', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: null, assigneeId: 'u1', createdById: 'u9' });
      await expect(service.assertAccess('t1', lawyer)).resolves.toMatchObject({ id: 't1' });
    });
    it('forbids a standalone task for a stranger', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: null, assigneeId: 'u2', createdById: 'u9' });
      await expect(service.assertAccess('t1', lawyer)).rejects.toThrow(ForbiddenException);
    });
    it('uses case access for a case task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: 'c1', assigneeId: null, createdById: 'u9' });
      mockCaseAccess.canAccessCase.mockResolvedValue(false);
      await expect(service.assertAccess('t1', lawyer)).rejects.toThrow(ForbiddenException);
      expect(mockCaseAccess.canAccessCase).toHaveBeenCalledWith(lawyer, 'c1');
    });
  });

  describe('board lists', () => {
    it('findMine returns top-level tasks only, with counts', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        {
          id: 't1', priority: TaskPriority.HIGH, labels: ['ศาล'],
          subtasks: [{ status: 'DONE' }, { status: 'TODO' }],
          _count: { attachments: 2, comments: 1 },
        },
      ]);
      const [item] = await service.findMine(lawyer);
      expect(mockPrisma.task.findMany.mock.calls[0][0].where).toMatchObject({ caseId: null, parentId: null });
      expect(item).toMatchObject({ subtaskCount: 2, subtaskDoneCount: 1, attachmentCount: 2, commentCount: 1 });
      expect((item as any).subtasks).toBeUndefined();
      expect((item as any)._count).toBeUndefined();
    });
    it('findByCase filters parentId null too', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      await service.findByCase('c1', lawyer);
      expect(mockPrisma.task.findMany.mock.calls[0][0].where).toMatchObject({ caseId: 'c1', parentId: null });
    });
  });

  describe('labels and priority', () => {
    it('create stores normalized labels and priority', async () => {
      mockPrisma.task.create.mockResolvedValue({ id: 't1' });
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1' });
      await service.create(lawyer, null, { title: 'x', labels: [' a ', 'a'], priority: TaskPriority.LOW } as any);
      expect(mockPrisma.task.create.mock.calls[0][0].data).toMatchObject({ labels: ['a'], priority: TaskPriority.LOW });
    });
    it('update rejects too many labels with 400', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: null, assigneeId: 'u1' });
      const many = Array.from({ length: 11 }, (_, i) => `l${i}`);
      await expect(service.update('t1', { labels: many } as any, lawyer)).rejects.toThrow(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `cd apps/api && npx jest src/tasks/tasks.service.detail.spec.ts`
Expected: FAIL (`assertAccess` missing, `where` lacks `parentId`, counts missing).

- [ ] **Step 3: Extend the DTOs**

`apps/api/src/tasks/dto/task.dto.ts` — add to both `CreateTaskDto` and `UpdateTaskDto`:
```ts
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];
```
Update the imports: `import { IsArray, IsEnum, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';` and `import { TaskPriority, TaskStatus } from '@lawfirm/shared';`.

- [ ] **Step 4: Implement in TasksService**

In `apps/api/src/tasks/tasks.service.ts`:

Imports: add `TaskPriority, normalizeTaskLabels` to the `@lawfirm/shared` import.

Add after `taskInclude`:
```ts
  /**
   * Board cards need the counts, not the rows: a parent with 12 subtasks
   * would otherwise ship 12 nested objects per card.
   */
  private boardInclude = {
    ...this.taskInclude,
    subtasks: { select: { status: true } },
    _count: { select: { attachments: true, comments: true } },
  };

  private toBoardItem<T extends { subtasks: { status: string }[]; _count: { attachments: number; comments: number } }>(
    task: T,
  ) {
    const { subtasks, _count, ...rest } = task;
    return {
      ...rest,
      subtaskCount: subtasks.length,
      subtaskDoneCount: subtasks.filter((s) => s.status === TaskStatus.DONE).length,
      attachmentCount: _count.attachments,
      commentCount: _count.comments,
    };
  }

  /** Maps the shared normalizer's codes onto API errors; `undefined` means "field not sent". */
  labelsFromDto(labels?: unknown): string[] | undefined {
    if (labels === undefined) return undefined;
    try {
      return normalizeTaskLabels(labels);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      throw new BadRequestException(
        code === 'TASK_LABELS_TOO_MANY' ? 'ใส่ label ได้ไม่เกิน 10 รายการ' : 'label ยาวได้ไม่เกิน 30 ตัวอักษร',
      );
    }
  }

  /**
   * The one access rule for `/tasks/:id/*`: a case task follows case
   * membership, a personal task its assignee/creator, and the firm owner
   * sees both. Returns the row so callers do not fetch it twice.
   */
  async assertAccess(taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.caseId) {
      if (!(await this.caseAccess.canAccessCase(user, task.caseId))) {
        throw new ForbiddenException('You do not have access to this task');
      }
      return task;
    }
    if (user.firmRole === FirmRole.OWNER) return task;
    if (task.assigneeId !== user.id && task.createdById !== user.id) {
      throw new ForbiddenException('You do not have access to this task');
    }
    return task;
  }
```

Change `findByCase` and `findMine`:
```ts
  async findByCase(caseId: string, user: AuthUser) {
    const tasks = await this.prisma.task.findMany({
      where: { caseId, parentId: null, ...this.caseAccess.getTaskFilterForUser(user) },
      include: this.boardInclude,
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((task) => this.toBoardItem(task));
  }

  async findMine(user: AuthUser) {
    const tasks = await this.prisma.task.findMany({
      where: {
        caseId: null,
        parentId: null,
        assignee: { firmMembers: { some: { firmId: user.firmId } } },
        ...this.caseAccess.getTaskFilterForUser(user),
      },
      include: this.boardInclude,
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((task) => this.toBoardItem(task));
  }
```

In `create`, the `data` block gains:
```ts
        priority: dto.priority ?? TaskPriority.MEDIUM,
        labels: this.labelsFromDto(dto.labels) ?? [],
```
In `update`, replace the final `prisma.task.update` call's `data` with:
```ts
      data: {
        ...dto,
        labels: this.labelsFromDto(dto.labels),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
```
(Prisma ignores `undefined` keys, so an omitted `labels` leaves the column alone.)

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest src/tasks`
Expected: PASS, including the older `tasks.service.spec.ts` (its `findMany` mocks return plain objects — if `toBoardItem` throws on a missing `subtasks`, make it tolerant: `const subtasks = task.subtasks ?? []; const count = task._count ?? { attachments: 0, comments: 0 };`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tasks
git commit -m "feat(tasks): shared access rule, board counts, priority and labels"
```

---

### Task 3: TaskDetailService — detail, subtasks, comments, attachments

**Files:**
- Create: `apps/api/src/tasks/dto/task-detail.dto.ts`
- Create: `apps/api/src/tasks/task-detail.service.ts`
- Test: `apps/api/src/tasks/task-detail.service.spec.ts`

**Interfaces:**
- Consumes: `TasksService.assertAccess`, `TasksService.labelsFromDto`, `FileStorageService.put/delete/openDownloadStream`.
- Produces:
  - `CreateSubtaskDto { title: string; assigneeId?: string; dueDate?: string; priority?: TaskPriority }`
  - `CreateTaskCommentDto { body: string }` (1–4000 chars)
  - `TaskDetailService.getDetail(taskId, user)`
  - `createSubtask(taskId, user, dto)`
  - `addComment(taskId, user, dto)`, `deleteComment(taskId, commentId, user)`
  - `uploadAttachment(taskId, user, file: Express.Multer.File)`, `deleteAttachment(taskId, attachmentId, user)`, `getAttachmentForDownload(taskId, attachmentId, user): Promise<{ storagePath; filename; mimeType }>`
  - `TASK_ATTACHMENT_MIME_TYPES` set.

- [ ] **Step 1: Write the DTOs**

`apps/api/src/tasks/dto/task-detail.dto.ts`:
```ts
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { TaskPriority } from '@lawfirm/shared';

export class CreateSubtaskDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}

export class CreateTaskCommentDto {
  @IsString()
  @Length(1, 4000)
  body!: string;
}
```

- [ ] **Step 2: Write failing service tests**

`apps/api/src/tasks/task-detail.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { TaskDetailService } from './task-detail.service';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../common/services/file-storage.service';

describe('TaskDetailService', () => {
  let service: TaskDetailService;
  const mockPrisma = {
    task: { findUnique: jest.fn(), create: jest.fn() },
    taskComment: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    taskAttachment: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  };
  const mockTasks = { assertAccess: jest.fn(), findOne: jest.fn() };
  const mockStorage = { put: jest.fn(), delete: jest.fn() };
  const lawyer = { id: 'u1', firmId: 'f1', firmRole: FirmRole.LAWYER } as any;
  const owner = { id: 'u0', firmId: 'f1', firmRole: FirmRole.OWNER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TaskDetailService,
        { provide: TasksService, useValue: mockTasks },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(TaskDetailService);
  });

  it('createSubtask inherits caseId and refuses nesting', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 'p1', caseId: 'c1', parentId: null });
    mockPrisma.task.create.mockResolvedValue({ id: 's1' });
    mockTasks.findOne.mockResolvedValue({ id: 's1' });
    await service.createSubtask('p1', lawyer, { title: 'sub' });
    expect(mockPrisma.task.create.mock.calls[0][0].data).toMatchObject({ parentId: 'p1', caseId: 'c1', createdById: 'u1' });

    mockTasks.assertAccess.mockResolvedValue({ id: 's1', caseId: 'c1', parentId: 'p1' });
    await expect(service.createSubtask('s1', lawyer, { title: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('uploadAttachment rejects disallowed mime types before touching storage', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: null, parentId: null });
    const file = { mimetype: 'application/x-msdownload', size: 10, buffer: Buffer.from('x'), originalname: 'a.exe' } as any;
    await expect(service.uploadAttachment('t1', lawyer, file)).rejects.toThrow(BadRequestException);
    expect(mockStorage.put).not.toHaveBeenCalled();
  });

  it('uploadAttachment stores the file then the row, and removes the file if the row fails', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: null, parentId: null });
    mockStorage.put.mockResolvedValue('tasks/t1/abc.pdf');
    mockPrisma.taskAttachment.create.mockRejectedValue(new Error('db down'));
    const file = { mimetype: 'application/pdf', size: 10, buffer: Buffer.from('x'), originalname: 'a.pdf' } as any;
    await expect(service.uploadAttachment('t1', lawyer, file)).rejects.toThrow('db down');
    expect(mockStorage.delete).toHaveBeenCalledWith('tasks/t1/abc.pdf');
  });

  it('deleteComment allows author and owner, forbids others', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: null, parentId: null });
    mockPrisma.taskComment.findFirst.mockResolvedValue({ id: 'c1', taskId: 't1', authorId: 'u2' });
    await expect(service.deleteComment('t1', 'c1', lawyer)).rejects.toThrow(ForbiddenException);
    await expect(service.deleteComment('t1', 'c1', owner)).resolves.toEqual({ deleted: true });
  });
});
```

- [ ] **Step 3: Run, expect failure**

Run: `cd apps/api && npx jest src/tasks/task-detail.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the service**

`apps/api/src/tasks/task-detail.service.ts`:
```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import { AuthUser, FirmRole, TaskPriority } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { TasksService } from './tasks.service';
import { CreateSubtaskDto, CreateTaskCommentDto } from './dto/task-detail.dto';

export const TASK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const TASK_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const person = { select: { id: true, firstName: true, lastName: true } };

@Injectable()
export class TaskDetailService {
  private readonly logger = new Logger(TaskDetailService.name);

  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
    private fileStorage: FileStorageService,
  ) {}

  async getDetail(taskId: string, user: AuthUser) {
    await this.tasks.assertAccess(taskId, user);
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: person,
        createdBy: person,
        onHold: true,
        parent: { select: { id: true, title: true } },
        case: { select: { id: true, ownRef: true, title: true } },
        subtasks: {
          orderBy: { createdAt: 'asc' },
          include: { assignee: person },
        },
        attachments: {
          orderBy: { createdAt: 'asc' },
          include: { uploadedBy: person },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: person },
        },
        assignmentLogs: {
          orderBy: { createdAt: 'asc' },
          include: { fromUser: person, toUser: person, performedBy: person },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async createSubtask(taskId: string, user: AuthUser, dto: CreateSubtaskDto) {
    const parent = await this.tasks.assertAccess(taskId, user);
    if (parent.parentId) {
      throw new BadRequestException('งานย่อยมีได้ชั้นเดียว สร้างงานย่อยจากงานหลักเท่านั้น');
    }
    const created = await this.prisma.task.create({
      data: {
        parentId: parent.id,
        caseId: parent.caseId,
        title: dto.title.trim(),
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        createdById: user.id,
      },
    });
    return this.tasks.findOne(created.id);
  }

  async addComment(taskId: string, user: AuthUser, dto: CreateTaskCommentDto) {
    await this.tasks.assertAccess(taskId, user);
    return this.prisma.taskComment.create({
      data: { taskId, authorId: user.id, body: dto.body.trim() },
      include: { author: person },
    });
  }

  async deleteComment(taskId: string, commentId: string, user: AuthUser) {
    await this.tasks.assertAccess(taskId, user);
    const comment = await this.prisma.taskComment.findFirst({ where: { id: commentId, taskId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== user.id && user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('ลบได้เฉพาะความคิดเห็นของตัวเอง');
    }
    await this.prisma.taskComment.delete({ where: { id: commentId } });
    return { deleted: true };
  }

  async uploadAttachment(taskId: string, user: AuthUser, file: Express.Multer.File | undefined) {
    await this.tasks.assertAccess(taskId, user);
    if (!file) throw new BadRequestException('กรุณาแนบไฟล์');
    if (!TASK_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('รองรับเฉพาะ PDF, รูปภาพ, DOCX, XLSX, TXT');
    }
    if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('ไฟล์มีขนาดใหญ่เกิน 10MB');
    }
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const key = path.posix.join(
      'tasks',
      taskId,
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`,
    );
    const storagePath = await this.fileStorage.put(key, file.buffer, file.mimetype);
    try {
      return await this.prisma.taskAttachment.create({
        data: {
          taskId,
          filename: file.originalname,
          storagePath,
          mimeType: file.mimetype,
          size: file.size,
          uploadedById: user.id,
        },
        include: { uploadedBy: person },
      });
    } catch (error) {
      // No row means no way to ever delete the bytes from the UI; clean up now.
      await this.fileStorage.delete(storagePath).catch(() => undefined);
      throw error;
    }
  }

  async deleteAttachment(taskId: string, attachmentId: string, user: AuthUser) {
    await this.tasks.assertAccess(taskId, user);
    const attachment = await this.prisma.taskAttachment.findFirst({ where: { id: attachmentId, taskId } });
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.uploadedById !== user.id && user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('ลบได้เฉพาะไฟล์ที่ตัวเองอัปโหลด');
    }
    try {
      await this.fileStorage.delete(attachment.storagePath);
    } catch (err) {
      this.logger.warn(`Failed to remove ${attachment.storagePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await this.prisma.taskAttachment.delete({ where: { id: attachmentId } });
    return { deleted: true };
  }

  async getAttachmentForDownload(taskId: string, attachmentId: string, user: AuthUser) {
    await this.tasks.assertAccess(taskId, user);
    const attachment = await this.prisma.taskAttachment.findFirst({ where: { id: attachmentId, taskId } });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return { storagePath: attachment.storagePath, filename: attachment.filename, mimeType: attachment.mimeType };
  }
}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `cd apps/api && npx jest src/tasks/task-detail.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tasks/dto/task-detail.dto.ts apps/api/src/tasks/task-detail.service.ts apps/api/src/tasks/task-detail.service.spec.ts
git commit -m "feat(tasks): task detail service — subtasks, comments, attachments"
```

---

### Task 4: `/tasks/:taskId` controller and module wiring

**Files:**
- Create: `apps/api/src/tasks/task-detail.controller.ts`
- Modify: `apps/api/src/tasks/tasks.module.ts`
- Test: `apps/api/src/tasks/task-detail.controller.spec.ts`

**Interfaces:**
- Consumes: `TaskDetailService`, `FileStorageService.openDownloadStream`, `safeMimeType`, `buildContentDispositionHeader`.
- Produces routes listed in the spec table.

- [ ] **Step 1: Write the failing controller test**

`apps/api/src/tasks/task-detail.controller.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { Readable } from 'stream';
import { TaskDetailController } from './task-detail.controller';
import { TaskDetailService } from './task-detail.service';
import { FileStorageService } from '../common/services/file-storage.service';

describe('TaskDetailController download', () => {
  it('streams with nosniff, safe mime and attachment disposition', async () => {
    const detail = {
      getAttachmentForDownload: jest.fn().mockResolvedValue({
        storagePath: 'tasks/t1/a.pdf',
        filename: 'สัญญา.pdf',
        mimeType: 'application/pdf',
      }),
    };
    const storage = { openDownloadStream: jest.fn().mockResolvedValue(Readable.from(['x'])) };
    const module = await Test.createTestingModule({
      controllers: [TaskDetailController],
      providers: [
        { provide: TaskDetailService, useValue: detail },
        { provide: FileStorageService, useValue: storage },
      ],
    }).compile();
    const controller = module.get(TaskDetailController);
    const res = { setHeader: jest.fn(), on: jest.fn(), once: jest.fn(), emit: jest.fn(), write: jest.fn(), end: jest.fn() } as any;
    await controller.download({ id: 'u1' } as any, 't1', 'a1', res);
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader.mock.calls.find((c: string[]) => c[0] === 'Content-Disposition')?.[1]).toContain('attachment');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `cd apps/api && npx jest src/tasks/task-detail.controller.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the controller**

`apps/api/src/tasks/task-detail.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FileStorageService } from '../common/services/file-storage.service';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { TaskDetailService, TASK_ATTACHMENT_MAX_BYTES } from './task-detail.service';
import { CreateSubtaskDto, CreateTaskCommentDto } from './dto/task-detail.dto';

/**
 * One address for a task whichever board it came from. Access is decided per
 * task in TasksService.assertAccess, so no case guard is mounted here.
 */
@Controller('tasks/:taskId')
@UseGuards(JwtAuthGuard)
export class TaskDetailController {
  constructor(
    private detail: TaskDetailService,
    private fileStorage: FileStorageService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string) {
    return this.detail.getDetail(taskId, user);
  }

  @Post('subtasks')
  createSubtask(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: CreateSubtaskDto,
  ) {
    return this.detail.createSubtask(taskId, user, dto);
  }

  @Post('comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskCommentDto,
  ) {
    return this.detail.addComment(taskId, user, dto);
  }

  @Delete('comments/:commentId')
  deleteComment(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.detail.deleteComment(taskId, commentId, user);
  }

  @Post('attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TASK_ATTACHMENT_MAX_BYTES } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.detail.uploadAttachment(taskId, user, file);
  }

  @Delete('attachments/:attachmentId')
  deleteAttachment(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.detail.deleteAttachment(taskId, attachmentId, user);
  }

  @Get('attachments/:attachmentId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const file = await this.detail.getAttachmentForDownload(taskId, attachmentId, user);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(file.mimeType));
    res.setHeader('Content-Disposition', buildContentDispositionHeader(file.filename));
    const stream = await this.fileStorage.openDownloadStream(file.storagePath);
    stream.pipe(res);
  }
}
```

`apps/api/src/tasks/tasks.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TodosController } from './todos.controller';
import { TaskDetailController } from './task-detail.controller';
import { TaskDetailService } from './task-detail.service';

@Module({
  controllers: [TasksController, TodosController, TaskDetailController],
  providers: [TasksService, TaskDetailService],
  exports: [TasksService],
})
export class TasksModule {}
```
(`FileStorageService` comes from the global `CommonModule` the same way `documents.module.ts` gets it — check `apps/api/src/documents/documents.module.ts`; if it imports `CommonModule` explicitly, add `imports: [CommonModule]` here too.)

- [ ] **Step 4: Run tests, then smoke the route**

Run: `cd apps/api && npx jest src/tasks`
Expected: PASS.

Smoke: with the API running from this worktree is not possible (port 3001 is the main checkout's). Instead confirm the module compiles: `cd apps/api && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "intake/intake.service" | grep "error" ; echo done` — expected: only `done` (no task-related errors).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tasks
git commit -m "feat(tasks): /tasks/:id detail, subtask, comment and attachment routes"
```

---

### Task 5: Web API client types and functions

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`TaskItem` ~line 382; add functions after `deleteIntakeAttachment` ~line 1667)
- Test: `apps/web/src/lib/task-detail.test.ts`

**Interfaces:**
- Produces (exported from `@/lib/api`):
```ts
export interface TaskPerson { id: string; firstName: string; lastName: string }
export interface TaskAttachmentItem { id: string; filename: string; mimeType: string; size: number; createdAt: string; uploadedBy: TaskPerson }
export interface TaskCommentItem { id: string; body: string; createdAt: string; author: TaskPerson }
export interface TaskSubtaskItem { id: string; title: string; status: TaskStatus; dueDate?: string | null; priority: TaskPriority; assignee?: TaskPerson | null }
export interface TaskDetail extends TaskItem { parent?: { id: string; title: string } | null; case?: { id: string; ownRef: string; title: string } | null; subtasks: TaskSubtaskItem[]; attachments: TaskAttachmentItem[]; comments: TaskCommentItem[] }
api.getTaskDetail(token, taskId): Promise<TaskDetail>
api.updateAnyTask(token, task: { id; caseId?: string | null }, data): Promise<TaskItem>   // routes to /todos/:id or /cases/:caseId/tasks/:id
api.createSubtask(token, taskId, data: { title; assigneeId?; dueDate?; priority? }): Promise<TaskItem>
api.uploadTaskAttachment(token, taskId, file: File): Promise<TaskAttachmentItem>
api.deleteTaskAttachment(token, taskId, attachmentId)
api.addTaskComment(token, taskId, body: string): Promise<TaskCommentItem>
api.deleteTaskComment(token, taskId, commentId)
taskAttachmentDownloadUrl(taskId, attachmentId): string
```
- Also `apps/web/src/lib/task-detail.ts` exporting `taskUpdatePath(task: { id: string; caseId?: string | null }): string`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/task-detail.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { taskUpdatePath, formatBytes } from './task-detail.ts';

test('taskUpdatePath routes personal tasks to /todos and case tasks to the case', () => {
  assert.equal(taskUpdatePath({ id: 't1', caseId: null }), '/todos/t1');
  assert.equal(taskUpdatePath({ id: 't1' }), '/todos/t1');
  assert.equal(taskUpdatePath({ id: 't1', caseId: 'c9' }), '/cases/c9/tasks/t1');
});

test('formatBytes picks a readable unit', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
});
```

- [ ] **Step 2: Run, expect failure**

Run: `cd apps/web && npx tsx --test src/lib/task-detail.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the helper**

`apps/web/src/lib/task-detail.ts`:
```ts
/**
 * A task is patched through whichever board owns it: personal tasks live
 * under /todos, case tasks under their case. The drawer serves both.
 */
export function taskUpdatePath(task: { id: string; caseId?: string | null }): string {
  return task.caseId ? `/cases/${task.caseId}/tasks/${task.id}` : `/todos/${task.id}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd apps/web && npx tsx --test src/lib/task-detail.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Extend `api.ts`**

Replace the `TaskItem` interface with:
```ts
export interface TaskPerson {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TaskItem {
  id: string;
  caseId?: string | null;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status: import('@lawfirm/shared').TaskStatus;
  priority: import('@lawfirm/shared').TaskPriority;
  labels: string[];
  dueDate?: string | null;
  createdById?: string;
  assignee?: TaskPerson | null;
  subtaskCount?: number;
  subtaskDoneCount?: number;
  attachmentCount?: number;
  commentCount?: number;
  assignmentLogs?: Array<{
    action: import('@lawfirm/shared').TaskLogAction;
    note?: string | null;
    stageDueDate?: string | null;
    createdAt: string;
    fromUser?: { firstName: string; lastName: string } | null;
    toUser: { firstName: string; lastName: string };
  }>;
}

export interface TaskAttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: TaskPerson;
}

export interface TaskCommentItem {
  id: string;
  body: string;
  createdAt: string;
  author: TaskPerson;
}

export interface TaskSubtaskItem {
  id: string;
  title: string;
  status: import('@lawfirm/shared').TaskStatus;
  dueDate?: string | null;
  priority: import('@lawfirm/shared').TaskPriority;
  assignee?: TaskPerson | null;
}

export interface TaskDetail extends TaskItem {
  parent?: { id: string; title: string } | null;
  case?: { id: string; ownRef: string; title: string } | null;
  subtasks: TaskSubtaskItem[];
  attachments: TaskAttachmentItem[];
  comments: TaskCommentItem[];
}
```
Add near the top (after `API_URL`): `import { taskUpdatePath } from './task-detail';` and
```ts
export function taskAttachmentDownloadUrl(taskId: string, attachmentId: string) {
  return `${API_URL}/tasks/${taskId}/attachments/${attachmentId}/download`;
}
```
Add to the `api` object after `deleteIntakeAttachment`:
```ts
  getTaskDetail: (token: string, taskId: string) =>
    request<TaskDetail>(`/tasks/${taskId}`, { token }),

  updateAnyTask: (token: string, task: { id: string; caseId?: string | null }, data: Record<string, unknown>) =>
    request<TaskItem>(taskUpdatePath(task), { method: 'PATCH', token, body: JSON.stringify(data) }),

  createSubtask: (
    token: string,
    taskId: string,
    data: { title: string; assigneeId?: string; dueDate?: string; priority?: string },
  ) => request<TaskItem>(`/tasks/${taskId}/subtasks`, { method: 'POST', token, body: JSON.stringify(data) }),

  uploadTaskAttachment: (token: string, taskId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<TaskAttachmentItem>(`/tasks/${taskId}/attachments`, { method: 'POST', token, body: form });
  },

  deleteTaskAttachment: (token: string, taskId: string, attachmentId: string) =>
    request(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE', token }),

  addTaskComment: (token: string, taskId: string, body: string) =>
    request<TaskCommentItem>(`/tasks/${taskId}/comments`, { method: 'POST', token, body: JSON.stringify({ body }) }),

  deleteTaskComment: (token: string, taskId: string, commentId: string) =>
    request(`/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE', token }),
```
Check how `uploadIntakeAttachment` passes `FormData` through `request` (it must skip the JSON content-type) and mirror it exactly.

- [ ] **Step 6: Typecheck and run web tests**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json && npm test`
Expected: clean typecheck (adding required `priority`/`labels` to `TaskItem` may break object literals in tests/mocks — fix them by adding `priority: TaskPriority.MEDIUM, labels: []`), tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib
git commit -m "feat(web): task detail API client and helpers"
```

---

### Task 6: Kanban card — open on click, priority bar, labels, counters

**Files:**
- Modify: `apps/web/src/components/KanbanBoard.tsx` (`Task` interface line 10, `KanbanBoardProps` line 19, `renderTask` ~line 128)
- Modify: `apps/web/src/lib/i18n/dashboard.ts` (`todos` th ~line 687 and en ~line 1501)

**Interfaces:**
- Consumes: `TaskItem` fields from Task 5.
- Produces: `KanbanBoardProps.onOpen?: (taskId: string) => void`.

- [ ] **Step 1: Extend the card's `Task` type and props**

```ts
interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
  dueDate?: string | null;
  assignee?: { id: string; firstName: string; lastName: string } | null;
  subtaskCount?: number;
  subtaskDoneCount?: number;
  attachmentCount?: number;
  commentCount?: number;
}
```
Add to `KanbanBoardProps`:
```ts
  /** Title click opens the task's detail drawer; omitted keeps titles inert. */
  onOpen?: (taskId: string) => void;
```
Import `TaskPriority` from `@lawfirm/shared` and add `onOpen` to the destructured props.

- [ ] **Step 2: Render priority, labels, counters**

Replace the card's opening `<div …>` and title `<p>` in `renderTask` with:
```tsx
        const priorityBar =
          task.priority === TaskPriority.HIGH
            ? 'border-l-4 border-l-rose-500'
            : task.priority === TaskPriority.LOW
              ? 'border-l-4 border-l-muted-foreground/30'
              : '';
        const labels = task.labels ?? [];
        const counters = [
          task.subtaskCount ? `☑ ${task.subtaskDoneCount ?? 0}/${task.subtaskCount}` : null,
          task.attachmentCount ? `📎 ${task.attachmentCount}` : null,
          task.commentCount ? `💬 ${task.commentCount}` : null,
        ].filter(Boolean);

        return (
          <div key={task.id} className={`rounded-lg border bg-card p-3 shadow-soft ${priorityBar}`}>
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(task.id)}
                className="text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
              >
                {task.title}
              </button>
            ) : (
              <p className="text-sm font-medium text-foreground">{task.title}</p>
            )}
            {labels.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {labels.slice(0, 3).map((label) => (
                  <span key={label} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {label}
                  </span>
                ))}
                {labels.length > 3 && (
                  <span className="text-[11px] text-muted-foreground">+{labels.length - 3}</span>
                )}
              </div>
            )}
```
Keep the existing description/assignee/dueDate lines, and right after the dueDate block add:
```tsx
            {counters.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">{counters.join(' · ')}</p>
            )}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/KanbanBoard.tsx
git commit -m "feat(web): kanban card shows priority, labels, counters and opens detail"
```

---

### Task 7: `TaskDetailDrawer` component + i18n keys

**Files:**
- Create: `apps/web/src/components/tasks/useTaskParam.ts`
- Create: `apps/web/src/components/tasks/TaskDetailDrawer.tsx`
- Modify: `apps/web/src/lib/i18n/dashboard.ts` (add `taskDetail` block to th and en; key type is inferred from the th object so both must have identical keys)

**Interfaces:**
- Consumes: Task 5 API functions and types; `useDashboardT()`; `formatDate`, `formatDateTime` from `@/lib/utils`; `formatBytes` from `@/lib/task-detail`; `normalizeTaskLabels`, `TaskPriority`, `TASK_PRIORITY_LABELS`, `TaskStatus` from `@lawfirm/shared`.
- Produces:
  - `useTaskParam(): { taskId: string | null; open: (id: string) => void; close: () => void }`
  - `<TaskDetailDrawer taskId={string | null} users={UserItem[]} onClose={() => void} onChanged={() => void} />`

- [ ] **Step 1: i18n keys**

Add to the th dictionary (after `todos: { … },`):
```ts
    taskDetail: {
      title: 'รายละเอียดงาน',
      close: 'ปิด',
      backToParent: '← กลับไปงานหลัก',
      loadFailed: 'โหลดรายละเอียดงานไม่สำเร็จ',
      forbidden: 'ไม่มีสิทธิ์ดูงานนี้',
      status: 'สถานะ',
      priority: 'ความสำคัญ',
      assignee: 'ผู้รับผิดชอบ',
      unassigned: 'ยังไม่มอบหมาย',
      dueDate: 'ครบกำหนด',
      labels: 'Label',
      labelPlaceholder: 'พิมพ์แล้วกด Enter',
      description: 'รายละเอียด',
      descriptionPlaceholder: 'อธิบายงาน ขั้นตอน หรือสิ่งที่ต้องส่งมอบ',
      save: 'บันทึก',
      saved: 'บันทึกแล้ว',
      saveFailed: 'บันทึกไม่สำเร็จ',
      subtasks: 'งานย่อย',
      addSubtask: 'เพิ่มงานย่อย',
      subtaskPlaceholder: 'ชื่องานย่อย...',
      noSubtasks: 'ยังไม่มีงานย่อย',
      attachments: 'ไฟล์แนบ',
      dropHint: 'ลากไฟล์มาวาง หรือคลิกเลือกไฟล์',
      fileTypesHint: 'PDF, รูปภาพ, DOCX, XLSX, TXT · ไม่เกิน 10MB',
      uploading: 'กำลังอัปโหลด…',
      uploadFailed: 'อัปโหลดไม่สำเร็จ',
      download: 'ดาวน์โหลด',
      delete: 'ลบ',
      noAttachments: 'ยังไม่มีไฟล์แนบ',
      comments: 'ความคืบหน้า / ความคิดเห็น',
      commentPlaceholder: 'บันทึกความคืบหน้า…',
      addComment: 'บันทึก',
      noComments: 'ยังไม่มีบันทึก',
      history: 'ประวัติการมอบหมาย',
      caseLink: 'คดี',
      createdBy: 'สร้างโดย {name}',
      confirmDeleteAttachment: 'ลบไฟล์นี้?',
      confirmDeleteComment: 'ลบความคิดเห็นนี้?',
    },
```
and the English equivalent in the en dictionary (`title: 'Task detail'`, `close: 'Close'`, `backToParent: '← Back to parent task'`, `loadFailed: 'Could not load the task'`, `forbidden: 'You cannot view this task'`, `status: 'Status'`, `priority: 'Priority'`, `assignee: 'Assignee'`, `unassigned: 'Unassigned'`, `dueDate: 'Due'`, `labels: 'Labels'`, `labelPlaceholder: 'Type and press Enter'`, `description: 'Description'`, `descriptionPlaceholder: 'Describe the work, steps or deliverables'`, `save: 'Save'`, `saved: 'Saved'`, `saveFailed: 'Save failed'`, `subtasks: 'Subtasks'`, `addSubtask: 'Add subtask'`, `subtaskPlaceholder: 'Subtask title…'`, `noSubtasks: 'No subtasks yet'`, `attachments: 'Attachments'`, `dropHint: 'Drop a file or click to choose'`, `fileTypesHint: 'PDF, images, DOCX, XLSX, TXT · up to 10MB'`, `uploading: 'Uploading…'`, `uploadFailed: 'Upload failed'`, `download: 'Download'`, `delete: 'Delete'`, `noAttachments: 'No attachments yet'`, `comments: 'Progress / comments'`, `commentPlaceholder: 'Write an update…'`, `addComment: 'Post'`, `noComments: 'No comments yet'`, `history: 'Assignment history'`, `caseLink: 'Case'`, `createdBy: 'Created by {name}'`, `confirmDeleteAttachment: 'Delete this file?'`, `confirmDeleteComment: 'Delete this comment?'`).

Also add to both `todos` blocks: `priority: 'ความสำคัญ'` / `'Priority'`.

- [ ] **Step 2: `useTaskParam`**

`apps/web/src/components/tasks/useTaskParam.ts`:
```ts
'use client';
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * The open task lives in the URL (`?task=<id>`) so a task can be linked and
 * the browser's back button closes the drawer. Other params are preserved
 * (the case page keeps its `tab`).
 */
export function useTaskParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const taskId = searchParams.get('task');

  const setParam = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id) next.set('task', id);
      else next.delete('task');
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return {
    taskId,
    open: (id: string) => setParam(id),
    close: () => setParam(null),
  };
}
```

- [ ] **Step 3: The drawer**

`apps/web/src/components/tasks/TaskDetailDrawer.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Paperclip, Trash2, Download } from 'lucide-react';
import {
  normalizeTaskLabels,
  TASK_PRIORITY_LABELS,
  TaskPriority,
  TaskStatus,
} from '@lawfirm/shared';
import { api, ApiError, TaskDetail, UserItem, taskAttachmentDownloadUrl } from '@/lib/api';
import { formatBytes } from '@/lib/task-detail';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/utils';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { Button } from '@/components/ui/button';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

interface Props {
  taskId: string | null;
  users: UserItem[];
  onClose: () => void;
  /** Called after any write so the board behind the drawer can refresh. */
  onChanged: () => void;
  /** Open another task in the same drawer (a subtask, or back to the parent). */
  onNavigate: (taskId: string) => void;
}

const STATUS_OPTIONS: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE];

export function TaskDetailDrawer({ taskId, users, onClose, onChanged, onNavigate }: Props) {
  const d = useDashboardT();
  const { token } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [comment, setComment] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!token || !taskId) return;
    setError('');
    try {
      const detail = await api.getTaskDetail(token, taskId);
      setTask(detail);
      setTitle(detail.title);
      setDescription(detail.description ?? '');
    } catch (err) {
      setTask(null);
      setError(err instanceof ApiError && err.status === 403 ? d.taskDetail.forbidden : d.taskDetail.loadFailed);
    }
  }, [token, taskId, d]);

  useEffect(() => {
    setTask(null);
    setNotice('');
    void load();
  }, [load]);

  // Escape closes; the body stops scrolling while the drawer is up.
  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [taskId, onClose]);

  /** Every write goes through here: same error copy, same refresh, same board reload. */
  const run = async (action: () => Promise<unknown>, successNotice = '') => {
    if (!token || !task || busy) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await action();
      await load();
      onChanged();
      if (successNotice) setNotice(successNotice);
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : d.taskDetail.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const patch = (data: Record<string, unknown>, successNotice = '') =>
    run(() => api.updateAnyTask(token!, { id: task!.id, caseId: task!.caseId }, data), successNotice);

  const addLabel = () => {
    if (!task) return;
    const draft = labelDraft.trim();
    if (!draft) return;
    try {
      const labels = normalizeTaskLabels([...task.labels, draft]);
      setLabelDraft('');
      void patch({ labels });
    } catch (err) {
      setError(err instanceof Error && err.message === 'TASK_LABELS_TOO_MANY' ? 'ใส่ label ได้ไม่เกิน 10 รายการ' : 'label ยาวได้ไม่เกิน 30 ตัวอักษร');
    }
  };

  const upload = async (files: FileList | null) => {
    if (!token || !task || !files?.length) return;
    setUploadError('');
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        await api.uploadTaskAttachment(token, task.id, file);
      }
      await load();
      onChanged();
    } catch (err) {
      setUploadError(err instanceof ApiError && err.message ? err.message : d.taskDetail.uploadFailed);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  if (!taskId) return null;

  const statusLabel: Record<TaskStatus, string> = {
    [TaskStatus.TODO]: d.todos.columnTodo,
    [TaskStatus.IN_PROGRESS]: d.todos.columnInProgress,
    [TaskStatus.PENDING_REVIEW]: d.todos.columnPendingReview,
    [TaskStatus.NEEDS_REVISION]: d.todos.columnNeedsRevision,
    [TaskStatus.DONE]: d.todos.columnDone,
  };
  const field = 'mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const label = 'text-xs font-medium text-muted-foreground';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={d.taskDetail.title}>
      <button type="button" aria-label={d.taskDetail.close} onClick={onClose} className="flex-1 bg-black/30" />
      <aside className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            {task?.parent && (
              <button type="button" onClick={() => onNavigate(task.parent!.id)} className="text-xs text-primary hover:underline">
                {d.taskDetail.backToParent} {task.parent.title}
              </button>
            )}
            {task?.case && (
              <p className="text-xs text-muted-foreground">
                {d.taskDetail.caseLink}:{' '}
                <Link href={`/cases/${task.case.id}`} className="text-primary hover:underline">
                  {task.case.ownRef} · {task.case.title}
                </Link>
              </p>
            )}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => task && title.trim() && title.trim() !== task.title && patch({ title: title.trim() }, d.taskDetail.saved)}
              disabled={!task || busy}
              aria-label={d.taskDetail.title}
              className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 text-lg font-semibold hover:border-input focus:border-input focus:outline-none"
            />
          </div>
          <button type="button" onClick={onClose} aria-label={d.taskDetail.close} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <p role="alert" className="mx-4 mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="mx-4 mt-3 text-xs text-muted-foreground">{notice}</p>}

        {task && (
          <div className="space-y-6 p-4">
            <section className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="td-status" className={label}>{d.taskDetail.status}</label>
                <select id="td-status" value={task.status} disabled={busy || !STATUS_OPTIONS.includes(task.status)} onChange={(e) => patch({ status: e.target.value })} className={field}>
                  {(STATUS_OPTIONS.includes(task.status) ? STATUS_OPTIONS : [task.status]).map((s) => (
                    <option key={s} value={s}>{statusLabel[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className={label}>{d.taskDetail.priority}</span>
                <div className="mt-1 flex gap-1">
                  {[TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW].map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={busy}
                      aria-pressed={task.priority === p}
                      onClick={() => task.priority !== p && patch({ priority: p })}
                      className={`rounded-full border px-3 py-1 text-xs ${task.priority === p ? (p === TaskPriority.HIGH ? 'border-rose-500 bg-rose-500/10 text-rose-600' : 'border-primary bg-primary/10 text-primary') : 'border-border text-muted-foreground hover:bg-muted'}`}
                    >
                      {TASK_PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="td-assignee" className={label}>{d.taskDetail.assignee}</label>
                <select id="td-assignee" value={task.assignee?.id ?? ''} disabled={busy} onChange={(e) => e.target.value && patch({ assigneeId: e.target.value })} className={field}>
                  <option value="">{d.taskDetail.unassigned}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="td-due" className={label}>{d.taskDetail.dueDate}</label>
                <input id="td-due" type="date" disabled={busy} value={task.dueDate ? bangkokDateInputValue(task.dueDate) : ''} onChange={(e) => e.target.value && patch({ dueDate: e.target.value })} className={field} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="td-label" className={label}>{d.taskDetail.labels}</label>
                <div className="mt-1 flex flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2 py-1.5">
                  {task.labels.map((l) => (
                    <span key={l} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      {l}
                      <button type="button" aria-label={`${d.taskDetail.delete} ${l}`} disabled={busy} onClick={() => patch({ labels: task.labels.filter((x) => x !== l) })} className="text-muted-foreground hover:text-foreground">×</button>
                    </span>
                  ))}
                  <input
                    id="td-label"
                    value={labelDraft}
                    disabled={busy}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
                    placeholder={d.taskDetail.labelPlaceholder}
                    className="min-w-[8rem] flex-1 bg-transparent px-1 text-sm focus:outline-none"
                  />
                </div>
              </div>
            </section>

            <section>
              <label htmlFor="td-desc" className={label}>{d.taskDetail.description}</label>
              <textarea id="td-desc" rows={4} value={description} disabled={busy} onChange={(e) => setDescription(e.target.value)} placeholder={d.taskDetail.descriptionPlaceholder} className={field} />
              {description !== (task.description ?? '') && (
                <Button size="sm" className="mt-2" disabled={busy} onClick={() => patch({ description }, d.taskDetail.saved)}>{d.taskDetail.save}</Button>
              )}
            </section>

            {!task.parentId && (
              <section>
                <h3 className="text-sm font-semibold">{d.taskDetail.subtasks} {task.subtasks.length > 0 && <span className="text-xs font-normal text-muted-foreground">{task.subtasks.filter((s) => s.status === TaskStatus.DONE).length}/{task.subtasks.length}</span>}</h3>
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {task.subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={s.title}
                        checked={s.status === TaskStatus.DONE}
                        disabled={busy}
                        onChange={(e) => run(() => api.updateAnyTask(token!, { id: s.id, caseId: task.caseId }, { status: e.target.checked ? TaskStatus.DONE : TaskStatus.TODO }))}
                        className="h-4 w-4"
                      />
                      <button type="button" onClick={() => onNavigate(s.id)} className={`flex-1 text-left hover:text-primary hover:underline ${s.status === TaskStatus.DONE ? 'text-muted-foreground line-through' : ''}`}>
                        {s.title}
                      </button>
                      {s.assignee && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{s.assignee.firstName}</span>}
                      {s.dueDate && <span className="text-xs text-muted-foreground">{formatDate(s.dueDate)}</span>}
                    </li>
                  ))}
                  {task.subtasks.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">{d.taskDetail.noSubtasks}</li>}
                </ul>
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = subtaskTitle.trim();
                    if (!t) return;
                    setSubtaskTitle('');
                    void run(() => api.createSubtask(token!, task.id, { title: t }));
                  }}
                >
                  <input value={subtaskTitle} disabled={busy} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder={d.taskDetail.subtaskPlaceholder} className={`${field} mt-0`} />
                  <Button type="submit" size="sm" variant="outline" disabled={busy || !subtaskTitle.trim()}>{d.taskDetail.addSubtask}</Button>
                </form>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold">{d.taskDetail.attachments}</h3>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}
                onClick={() => fileInput.current?.click()}
                className="mt-2 cursor-pointer rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground hover:bg-muted/50"
              >
                <Paperclip className="mx-auto mb-1 h-4 w-4" />
                {busy ? d.taskDetail.uploading : d.taskDetail.dropHint}
                <p className="mt-1">{d.taskDetail.fileTypesHint}</p>
                <input ref={fileInput} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.txt" onChange={(e) => void upload(e.target.files)} />
              </div>
              {uploadError && <p role="alert" className="mt-2 text-xs text-destructive">{uploadError}</p>}
              <ul className="mt-2 space-y-1">
                {task.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(a.size)} · {a.uploadedBy.firstName}</span>
                    <a href={taskAttachmentDownloadUrl(task.id, a.id)} target="_blank" rel="noreferrer" aria-label={d.taskDetail.download} className="rounded p-1 hover:bg-muted"><Download className="h-4 w-4" /></a>
                    <button type="button" aria-label={d.taskDetail.delete} disabled={busy} onClick={() => window.confirm(d.taskDetail.confirmDeleteAttachment) && run(() => api.deleteTaskAttachment(token!, task.id, a.id))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
                {task.attachments.length === 0 && <li className="text-xs text-muted-foreground">{d.taskDetail.noAttachments}</li>}
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-semibold">{d.taskDetail.comments}</h3>
              <ul className="mt-2 space-y-2">
                {task.comments.map((c) => (
                  <li key={c.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{c.author.firstName} {c.author.lastName} · {formatDateTime(c.createdAt)}</span>
                      <button type="button" aria-label={d.taskDetail.delete} disabled={busy} onClick={() => window.confirm(d.taskDetail.confirmDeleteComment) && run(() => api.deleteTaskComment(token!, task.id, c.id))} className="hover:text-destructive">×</button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
                {task.comments.length === 0 && <li className="text-xs text-muted-foreground">{d.taskDetail.noComments}</li>}
              </ul>
              <form
                className="mt-2 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = comment.trim();
                  if (!body) return;
                  setComment('');
                  void run(() => api.addTaskComment(token!, task.id, body));
                }}
              >
                <textarea rows={2} value={comment} disabled={busy} onChange={(e) => setComment(e.target.value)} placeholder={d.taskDetail.commentPlaceholder} className={`${field} mt-0`} />
                <Button type="submit" size="sm" disabled={busy || !comment.trim()}>{d.taskDetail.addComment}</Button>
              </form>
            </section>

            {task.assignmentLogs && task.assignmentLogs.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold">{d.taskDetail.history}</h3>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {task.assignmentLogs.map((log, i) => (
                    <li key={i}>
                      {formatDateTime(log.createdAt)} · {log.action} → {log.toUser.firstName} {log.toUser.lastName}
                      {log.note ? ` — ${log.note}` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
```
Note: the attachment download `<a>` hits the API with no bearer header; check how `documents` downloads are done on the web (search `download` in `apps/web/src/app/(dashboard)/cases/[id]/documents/page.tsx`). If they fetch with the token and open a blob URL, copy that pattern into a small `downloadTaskAttachment(token, taskId, attachmentId, filename)` in `@/lib/task-detail` and use a `<button>` instead of `<a>`.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: clean (fix any i18n key typos — the `en` object must define every key the `th` object does).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/tasks apps/web/src/lib/i18n/dashboard.ts
git commit -m "feat(web): task detail drawer with subtasks, attachments, comments"
```

---

### Task 8: Mount the drawer on `/todos` and the case tasks tab; priority in quick-create

**Files:**
- Modify: `apps/web/src/app/(dashboard)/todos/page.tsx`
- Modify: `apps/web/src/components/cases/CaseTasksPanel.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` only if `CaseTasksPanel` is not already inside a `Suspense` (`useSearchParams` needs one — the case page already calls `useSearchParams` itself, so it is).

**Interfaces:**
- Consumes: `useTaskParam`, `TaskDetailDrawer`, `KanbanBoard.onOpen`.

- [ ] **Step 1: `/todos`**

In `todos/page.tsx`:
- imports: `import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer'; import { useTaskParam } from '@/components/tasks/useTaskParam'; import { TASK_PRIORITY_LABELS, TaskPriority } from '@lawfirm/shared';`
- state: `const [newPriority, setNewPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);` and `const taskParam = useTaskParam();`
- `handleCreate` body: add `priority: newPriority,` to the `createTodo` payload and reset with `setNewPriority(TaskPriority.MEDIUM)`.
- quick-create form: after the assignee `<select>` add
```tsx
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                aria-label={d.todos.priority}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                {[TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW].map((p) => (
                  <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>
                ))}
              </select>
```
- `<KanbanBoard … onOpen={taskParam.open} />`
- after the board (inside the page's root `<div>`):
```tsx
      <TaskDetailDrawer
        taskId={taskParam.taskId}
        users={users}
        onClose={taskParam.close}
        onChanged={loadTasks}
        onNavigate={taskParam.open}
      />
```
- Because the page is a client component using `useSearchParams` via the hook, wrap the default export: rename the current component to `TodosPageContent` and export
```tsx
export default function TodosPage() {
  const d = useDashboardT();
  return (
    <Suspense fallback={<PageLoading title={d.todos.loading} lines={4} />}>
      <TodosPageContent />
    </Suspense>
  );
}
```
(`import { Suspense, useEffect, useState } from 'react';`) — this mirrors `cases/page.tsx`.

- [ ] **Step 2: Case tasks tab**

In `CaseTasksPanel.tsx` do the same four things: import drawer + hook + priority enum, `newPriority` state + select in the form + `priority` in `api.createTask` payload, `onOpen={taskParam.open}` on the board, and render `<TaskDetailDrawer taskId={taskParam.taskId} users={users} onClose={taskParam.close} onChanged={loadTasks} onNavigate={taskParam.open} />` after the board (use whatever the panel's reload function is called — read the file; it is the function passed to the retry button).

- [ ] **Step 3: Typecheck and unit tests**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json && npm test`
Expected: clean, all pass.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/todos/page.tsx" apps/web/src/components/cases/CaseTasksPanel.tsx
git commit -m "feat(web): open task detail from both boards; priority on quick-create"
```

---

### Task 9: Browser verification and completion note

**Files:**
- Modify: `.claude/completions/2026-09-11-e2e-ux-review.md` (append a "Task detail" section)

- [ ] **Step 1: Run the API from this worktree**

The main checkout's API on port 3001 does not have the new routes. Start this worktree's API on 3011 (`.claude/launch.json` has a second `api` entry on 3011; if `preview_start` picks the 3001 one, run `cd apps/api && PORT=3011 pnpm dev` through the preview tool with a renamed launch entry `api-worktree`) and point `apps/web/.env.local` back to `http://localhost:3011`, then restart the `web` preview (port 3015).

- [ ] **Step 2: Walk the flow**

On `http://demo-law-firm.localhost:3015` as `admin@lawfirm.com` / `password123`:
1. `/todos` → create a task with priority สูง → card shows a red left bar.
2. Click the title → drawer opens, URL has `?task=`; back button closes it.
3. Add label "ศาล" + Enter → chip appears on card after close.
4. Add two subtasks, tick one → card shows `☑ 1/2`.
5. Upload a PDF → appears in list; download link streams; delete works.
6. Post a comment → card shows `💬 1`.
7. Open a case → tab งาน → same flow on a case task; `/tasks/:id` GET shows `case.ownRef` link in the drawer.
8. Resize to 375 px: the drawer is full-width and scrolls.
9. `read_console_messages` shows no errors other than pre-existing 401s from unrelated polling.

- [ ] **Step 3: Record and commit**

Append to the completion doc a short "Task detail (Jira-style) — implemented" list of what shipped and how it was verified, then:
```bash
git add .claude/completions/2026-09-11-e2e-ux-review.md
git commit -m "docs: record task detail implementation and verification"
```

---

## Self-review

- Spec coverage: model (T1), access + lists + labels/priority (T2), subtasks/comments/attachments (T3), routes incl. download (T4), client (T5), card (T6), drawer sections 1–7 (T7), mounting + `?task=` + quick-create priority (T8), verification (T9). "Board parent-only" is T2; "subtask navigation with back link" is T7 header. Error handling for upload orphan is T3; 403 copy is T7.
- Type consistency: `assertAccess` returns the task row (T2) and T3 reads `parentId`/`caseId` from it; `updateAnyTask({id, caseId})` (T5) is what T7 calls; `onOpen(taskId)` (T6) is wired to `taskParam.open` (T8); `onNavigate` prop (T7) is passed in T8.
- Gaps deliberately left: notifications, @mentions, moving subtasks, reordering (spec "Not in scope").
