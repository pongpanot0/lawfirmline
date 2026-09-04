# Operations Hub (Workload & Pairing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give firm owners a single "Operations" page showing who holds how many active cases, who is nearing a deadline, and who has historically paired with whom — plus the ability to see and adjust that workload right where team assignment decisions are actually made (case creation, and editing an existing case's team).

**Architecture:** A new read-only `OperationsModule` (NestJS) computes workload and pairing aggregates in application code from existing `Case`/`CaseAssignment`/`Task`/`CalendarEvent` data (no schema changes). The existing `CasesModule` gets one new mutation endpoint (`PUT /cases/:id/assignments`) to replace an existing case's buddy list, plus a bug fix so changing `leadLawyerId` via `PATCH /cases/:id` validates firm membership like `create()` already does. On the frontend, a new `/operations` page (Workload + Pairing tabs, owner-only) is added, and the workload summary is reused (with graceful fallback for non-owners) inside the case-creation form's team step and a new inline "Manage Team" editor on the case detail page.

**Tech Stack:** NestJS + Prisma (apps/api), Next.js App Router + React + Tailwind (apps/web), existing `@lawfirm/shared` enum package.

**Spec:** This plan's spec is the decision log reached via `/grill-me` in this conversation (no separate spec doc was written — see "Global Constraints" below for the full decision set, copied verbatim from that conversation).

## Global Constraints

- Unit of "workload" is the **Case**, not the Task.
- Only **active cases** (`status != CLOSED`) count toward workload (Lead count, Buddy count, near-deadline count).
- **Pairing stats** count **all cases including CLOSED ones** (full history).
- A "near deadline" case = its nearest upcoming `CalendarEvent.startAt` OR any non-`DONE` `Task.dueDate` is within **N days** (default **7**, adjustable via a `nearDeadlineDays` query param — no new settings entity).
- Lead and Buddy are counted **separately** (two numbers), weighted equally (1 case = 1 point), summed only for sorting.
- Workload list default sort: **ascending by (leadCount + buddyCount)** — least busy first. Toggle to reverse client-side.
- Pairing = **every unique pair of people who were ever on the same case together** (lead↔buddy AND buddy↔buddy), counted once per shared case, sorted **descending by count**, rendered as a flat list ("A + B — N cases"), not a matrix.
- Case-level pairing (who's lead/buddy on *this* case) is shown via the existing `leadLawyer`/`assignments` case detail fields — no new work needed there beyond what's already rendered.
- **No auto-suggest / scoring algorithm.** Show numbers; humans decide.
- Access to the Operations page, the two new endpoints, and the case-detail "Manage Team" editor is restricted to **`FirmRole.OWNER` only** (the codebase's `Role.ADMIN` field is `@deprecated use firmRole` — do not build new authorization on it). Use the existing `FirmRoleGuard` + `@OwnerOnly()` pattern from `apps/api/src/saas/`, not `@Roles()`.
- Workload badges also appear in the case-creation form's lead/buddy pickers. Since that endpoint is owner-only but case creation is not, the frontend must **fetch-and-gracefully-degrade** (`.catch(() => [])`) so non-owners still get a working form, just without workload numbers.
- Existing cases can now have their **lead lawyer** (via existing `PATCH /cases/:id`) and **buddy list** (via new `PUT /cases/:id/assignments`, full-replace semantics) changed after creation — this was previously impossible. Both stay owner-only.
- **No new automated test infrastructure.** This repo has zero `.spec.ts` files and no Jest setup anywhere in `apps/api`; introducing Jest is out of scope for this feature (explicit decision — see conversation). Every task below is verified **manually** (`curl` against the running API, or a browser check against the running dev server) instead of a written test.
- No Prisma schema changes are required. All data already exists: `Case.leadLawyerId`, `Case.status`, `CaseAssignment` (with `AssignmentType.BUDDY`), `Task.dueDate`/`Task.status`, `CalendarEvent.startAt`.

---

## File Structure

**New backend module:**
- `apps/api/src/operations/operations.module.ts` — wires controller + service, registers `FirmRoleGuard` as a local provider (it's exported by `SaasModule` but that module isn't imported here to avoid pulling in its `forwardRef(() => AuthModule)` graph; `FirmRoleGuard`'s only dependency is Nest's built-in `Reflector`, so it's safe to re-provide).
- `apps/api/src/operations/operations.controller.ts` — 3 GET routes, all `@OwnerOnly()`.
- `apps/api/src/operations/operations.service.ts` — all aggregation logic (workload summary, workload detail, pairing).
- `apps/api/src/operations/dto/operations.dto.ts` — `WorkloadQueryDto`.

**Modified backend files:**
- `apps/api/src/cases/dto/case.dto.ts` — add `UpdateCaseAssignmentsDto`.
- `apps/api/src/cases/cases.service.ts` — fix `update()` to validate `leadLawyerId` firm membership; add `updateAssignments()`.
- `apps/api/src/cases/cases.controller.ts` — add `PUT /cases/:id/assignments`.
- `apps/api/src/cases/cases.module.ts` — add `FirmRoleGuard` to `providers`.
- `apps/api/src/app.module.ts` — import `OperationsModule`.

**New frontend files:**
- `apps/web/src/app/(dashboard)/operations/page.tsx` — the Operations page (Workload + Pairing tabs).

**Modified frontend files:**
- `apps/web/src/lib/api.ts` — add `WorkloadSummary`, `WorkloadCaseItem`, `WorkloadDetail`, `PairingEntry` types + `getWorkloadSummary`, `getWorkloadDetail`, `getPairing`, `updateCaseAssignments` functions.
- `apps/web/src/components/layout/LexFlowSidebar.tsx` — add an `Operations` nav item (`ownerOnly: true`).
- `apps/web/src/lib/i18n/dashboard.ts` — add `nav.operations` key (Thai + English).
- `apps/web/src/app/(dashboard)/cases/new/page.tsx` — fetch workload alongside lawyers; show it next to each name in the owner `<select>` and buddy checklist.
- `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` — add an inline "Manage Team" edit toggle (mirrors the existing `editingOverview` pattern) next to the Case Owner / Buddies display, owner-only.

---

### Task 1: Fix `leadLawyerId` validation gap + add buddy-replace endpoint (backend)

**Files:**
- Modify: `apps/api/src/cases/dto/case.dto.ts`
- Modify: `apps/api/src/cases/cases.service.ts:266-278` (the `update()` method)
- Modify: `apps/api/src/cases/cases.controller.ts`
- Modify: `apps/api/src/cases/cases.module.ts`

**Interfaces:**
- Consumes: existing `AssignmentType`, `AuthUser`, `CaseStatus`, `FirmRole` from `@lawfirm/shared`; existing `PrismaService`, `CaseAccessGuard`.
- Produces: `CasesService.updateAssignments(user: AuthUser, id: string, dto: UpdateCaseAssignmentsDto)` returning the same shape as `findOne()` (case with `caseInclude`). `PUT /cases/:id/assignments` route. Later tasks (frontend) call this via `api.updateCaseAssignments`.

- [ ] **Step 1: Add `UpdateCaseAssignmentsDto`**

In `apps/api/src/cases/dto/case.dto.ts`, add near the bottom (after `CaseQueryDto`):

```ts
export class UpdateCaseAssignmentsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  buddyIds!: string[];
}
```

(`IsArray`, `IsUUID` are already imported at the top of this file — no new imports needed.)

- [ ] **Step 2: Fix `update()` to validate `leadLawyerId` firm membership, and add `updateAssignments()`**

In `apps/api/src/cases/cases.service.ts`, replace the existing `update()` method (lines 266-278):

```ts
  async update(user: AuthUser, id: string, dto: UpdateCaseDto) {
    await this.findOne(user, id);

    if (dto.leadLawyerId) {
      const isMember = await this.prisma.firmMember.count({
        where: { firmId: user.firmId, userId: dto.leadLawyerId },
      });
      if (!isMember) {
        throw new BadRequestException('Lead lawyer must belong to your firm');
      }
    }

    const { customFields, ...rest } = dto;
    return this.prisma.case.update({
      where: { id },
      data: {
        ...rest,
        customFields: customFields as Prisma.InputJsonValue | undefined,
        closedAt: dto.closedAt ? new Date(dto.closedAt) : undefined,
      },
      include: this.caseInclude,
    });
  }

  async updateAssignments(user: AuthUser, id: string, dto: UpdateCaseAssignmentsDto) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id, firmId: user.firmId },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    const buddyIds = [
      ...new Set(dto.buddyIds.filter((uid) => uid !== legalCase.leadLawyerId)),
    ];

    if (buddyIds.length) {
      const firmMembers = await this.prisma.firmMember.count({
        where: { firmId: user.firmId, userId: { in: buddyIds } },
      });
      if (firmMembers !== buddyIds.length) {
        throw new BadRequestException('All assigned team members must belong to your firm');
      }
    }

    await this.prisma.$transaction([
      this.prisma.caseAssignment.deleteMany({
        where: { caseId: id, assignmentType: AssignmentType.BUDDY },
      }),
      ...(buddyIds.length
        ? [
            this.prisma.caseAssignment.createMany({
              data: buddyIds.map((userId) => ({
                caseId: id,
                userId,
                assignmentType: AssignmentType.BUDDY,
              })),
            }),
          ]
        : []),
    ]);

    return this.prisma.case.findUnique({ where: { id }, include: this.caseInclude });
  }
```

Add `UpdateCaseAssignmentsDto` to the existing DTO import line (line 11):

```ts
import { CreateCaseDto, UpdateCaseDto, CaseQueryDto, UpdateCaseAssignmentsDto } from './dto/case.dto';
```

- [ ] **Step 3: Add the `PUT /cases/:id/assignments` route, owner-only**

In `apps/api/src/cases/cases.controller.ts`:

Add `Put` to the `@nestjs/common` import (line 4 area):

```ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
```

Add two new imports below the existing guard imports:

```ts
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { OwnerOnly } from '../saas/decorators/saas.decorators';
```

Add `UpdateCaseAssignmentsDto` to the DTO import (same change as Step 2).

Add the route, right after the existing `update()` method:

```ts
  @Put(':id/assignments')
  @UseGuards(CaseAccessGuard, FirmRoleGuard)
  @OwnerOnly()
  updateAssignments(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCaseAssignmentsDto,
  ) {
    return this.casesService.updateAssignments(user, id, dto);
  }
```

- [ ] **Step 4: Register `FirmRoleGuard` as a provider in `CasesModule`**

`FirmRoleGuard` is only exported by `SaasModule`, which `CasesModule` doesn't import. Rather than import all of `SaasModule` (it pulls in `forwardRef(() => AuthModule)`), just add `FirmRoleGuard` directly as a provider — its only dependency is Nest's `Reflector`, which is always available.

In `apps/api/src/cases/cases.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { CaseActivitiesService } from './case-activities.service';
import { CaseActivitiesController } from './case-activities.controller';
import { CaseParticipantsService } from './case-participants.service';
import { CaseParticipantsController } from './case-participants.controller';
import { CalendarModule } from '../calendar/calendar.module';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';

@Module({
  imports: [CalendarModule],
  controllers: [CasesController, CaseActivitiesController, CaseParticipantsController],
  providers: [CasesService, CaseActivitiesService, CaseParticipantsService, FirmRoleGuard],
  exports: [CasesService],
})
export class CasesModule {}
```

- [ ] **Step 5: Manual verification**

Start the API (`cd apps/api && npm run start:dev`, or however this repo's dev server is normally started — check `package.json` `scripts` if unsure). As a firm **OWNER** user, get a JWT (log in via the existing `/auth/login` flow or reuse a token from the browser's localStorage `lawfirm_access_token`), then:

```bash
curl -s -X PUT http://localhost:3001/cases/<a-real-case-id>/assignments \
  -H "Authorization: Bearer <owner-token>" \
  -H "Content-Type: application/json" \
  -d '{"buddyIds": ["<some-other-firm-member-user-id>"]}' | jq .
```

Expected: 200 with the updated case, `assignments` now containing exactly that one buddy. Re-run with `{"buddyIds": []}` — expect `assignments: []`. Then repeat the same call using a **non-owner** user's token — expect `403 Forbidden`.

Also verify the `update()` fix: `PATCH /cases/:id` with `{"leadLawyerId": "<a-user-id-from-a-different-firm>"}` (if you have a second-firm test user) should now return `400 Bad Request` instead of silently succeeding.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cases/dto/case.dto.ts apps/api/src/cases/cases.service.ts apps/api/src/cases/cases.controller.ts apps/api/src/cases/cases.module.ts
git commit -m "feat(cases): validate leadLawyerId firm membership on update, add PUT /cases/:id/assignments

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Operations module — workload summary + detail (backend)

**Files:**
- Create: `apps/api/src/operations/dto/operations.dto.ts`
- Create: `apps/api/src/operations/operations.service.ts`
- Create: `apps/api/src/operations/operations.controller.ts`
- Create: `apps/api/src/operations/operations.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `AuthUser`, `CaseStatus`, `AssignmentType`, `Role`, `TaskStatus` from `@lawfirm/shared` (verify `TaskStatus` is exported the same way `CaseStatus`/`AssignmentType` are — it's a Prisma-generated enum re-exported by that package per the existing convention in `cases.service.ts`; if the import fails, fall back to `import { TaskStatus } from '../generated/prisma';` matching how `Prisma` itself is imported there).
- Produces: `GET /operations/workload?nearDeadlineDays=7` → `WorkloadSummary[]`; `GET /operations/workload/:userId?nearDeadlineDays=7` → `WorkloadDetail`. Shapes:
  ```ts
  interface WorkloadSummary {
    userId: string; firstName: string; lastName: string;
    leadCount: number; buddyCount: number; nearDeadlineCount: number;
  }
  interface WorkloadCaseItem {
    caseId: string; title: string; status: string;
    role: 'LEAD' | 'BUDDY'; nearestDeadlineDays: number | null;
  }
  interface WorkloadDetail {
    userId: string; firstName: string; lastName: string; cases: WorkloadCaseItem[];
  }
  ```
  Task 3 (frontend `api.ts`) mirrors these exact field names.

- [ ] **Step 1: `WorkloadQueryDto`**

Create `apps/api/src/operations/dto/operations.dto.ts`:

```ts
import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkloadQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nearDeadlineDays?: number = 7;
}
```

- [ ] **Step 2: `OperationsService` — shared case-fetch + deadline math + workload summary/detail**

Create `apps/api/src/operations/operations.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, AssignmentType, CaseStatus, Role, TaskStatus } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { WorkloadQueryDto } from './dto/operations.dto';

interface ActiveCaseRow {
  id: string;
  title: string;
  status: CaseStatus;
  leadLawyerId: string;
  assignments: { userId: string }[];
  tasks: { dueDate: Date | null }[];
  calendarEvents: { startAt: Date }[];
}

@Injectable()
export class OperationsService {
  constructor(private prisma: PrismaService) {}

  private async getActiveCases(firmId: string, now: Date): Promise<ActiveCaseRow[]> {
    return this.prisma.case.findMany({
      where: { firmId, status: { not: CaseStatus.CLOSED } },
      select: {
        id: true,
        title: true,
        status: true,
        leadLawyerId: true,
        assignments: {
          where: { assignmentType: AssignmentType.BUDDY },
          select: { userId: true },
        },
        tasks: {
          where: { status: { not: TaskStatus.DONE } },
          select: { dueDate: true },
        },
        calendarEvents: {
          where: { startAt: { gte: now } },
          select: { startAt: true },
        },
      },
    });
  }

  private nearestDeadlineDays(
    now: Date,
    events: { startAt: Date }[],
    tasks: { dueDate: Date | null }[],
  ): number | null {
    const dates = [
      ...events.map((e) => e.startAt),
      ...tasks.filter((t): t is { dueDate: Date } => t.dueDate !== null).map((t) => t.dueDate),
    ];
    if (!dates.length) return null;
    const nearest = dates.reduce((min, d) => (d < min ? d : min));
    return Math.floor((nearest.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  private async getFirmMembers(firmId: string) {
    return this.prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.LAWYER] },
        firmMembers: { some: { firmId } },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: 'asc' },
    });
  }

  async getWorkloadSummary(user: AuthUser, query: WorkloadQueryDto) {
    const nearDeadlineDays = query.nearDeadlineDays ?? 7;
    const now = new Date();
    const [cases, members] = await Promise.all([
      this.getActiveCases(user.firmId, now),
      this.getFirmMembers(user.firmId),
    ]);

    const summary = members.map((m) => {
      let leadCount = 0;
      let buddyCount = 0;
      let nearDeadlineCount = 0;

      for (const c of cases) {
        const isLead = c.leadLawyerId === m.id;
        const isBuddy = c.assignments.some((a) => a.userId === m.id);
        if (!isLead && !isBuddy) continue;

        if (isLead) leadCount++;
        if (isBuddy) buddyCount++;

        const days = this.nearestDeadlineDays(now, c.calendarEvents, c.tasks);
        if (days !== null && days <= nearDeadlineDays) nearDeadlineCount++;
      }

      return {
        userId: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        leadCount,
        buddyCount,
        nearDeadlineCount,
      };
    });

    return summary.sort((a, b) => a.leadCount + a.buddyCount - (b.leadCount + b.buddyCount));
  }

  async getWorkloadDetail(user: AuthUser, targetUserId: string, query: WorkloadQueryDto) {
    const nearDeadlineDays = query.nearDeadlineDays ?? 7;
    const now = new Date();

    const member = await this.prisma.user.findFirst({
      where: { id: targetUserId, firmMembers: { some: { firmId: user.firmId } } },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!member) throw new NotFoundException('User not found');

    const cases = await this.getActiveCases(user.firmId, now);
    const held = cases
      .filter(
        (c) => c.leadLawyerId === targetUserId || c.assignments.some((a) => a.userId === targetUserId),
      )
      .map((c) => {
        const days = this.nearestDeadlineDays(now, c.calendarEvents, c.tasks);
        return {
          caseId: c.id,
          title: c.title,
          status: c.status,
          role: (c.leadLawyerId === targetUserId ? 'LEAD' : 'BUDDY') as 'LEAD' | 'BUDDY',
          nearestDeadlineDays: days,
        };
      });

    void nearDeadlineDays; // reserved for a future "highlight near-deadline rows" UI need

    return {
      userId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      cases: held,
    };
  }

  async getPairing(user: AuthUser) {
    const cases = await this.prisma.case.findMany({
      where: { firmId: user.firmId },
      select: {
        leadLawyerId: true,
        assignments: {
          where: { assignmentType: AssignmentType.BUDDY },
          select: { userId: true },
        },
      },
    });

    const pairCounts = new Map<string, number>();
    for (const c of cases) {
      const participantIds = [...new Set([c.leadLawyerId, ...c.assignments.map((a) => a.userId)])];
      for (let i = 0; i < participantIds.length; i++) {
        for (let j = i + 1; j < participantIds.length; j++) {
          const key = [participantIds[i], participantIds[j]].sort().join(':');
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    if (pairCounts.size === 0) return [];

    const userIds = new Set<string>();
    for (const key of pairCounts.keys()) {
      const [a, b] = key.split(':');
      userIds.add(a);
      userIds.add(b);
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    return [...pairCounts.entries()]
      .map(([key, count]) => {
        const [userAId, userBId] = key.split(':');
        return {
          userAId,
          userAName: nameById.get(userAId) ?? 'Unknown',
          userBId,
          userBName: nameById.get(userBId) ?? 'Unknown',
          count,
        };
      })
      .sort((a, b) => b.count - a.count);
  }
}
```

Note: the `void nearDeadlineDays;` line above is a placeholder acknowledging the query param is accepted but not yet used to filter/highlight rows in the detail response (the frontend does that highlighting itself using `nearestDeadlineDays` + its own threshold input, per Task 6). Remove that line and actually thread `nearDeadlineDays` through if a future task wants server-side filtering.

- [ ] **Step 3: Controller**

Create `apps/api/src/operations/operations.controller.ts`:

```ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { OwnerOnly } from '../saas/decorators/saas.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { OperationsService } from './operations.service';
import { WorkloadQueryDto } from './dto/operations.dto';

@Controller('operations')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
@OwnerOnly()
export class OperationsController {
  constructor(private operationsService: OperationsService) {}

  @Get('workload')
  getWorkload(@CurrentUser() user: AuthUser, @Query() query: WorkloadQueryDto) {
    return this.operationsService.getWorkloadSummary(user, query);
  }

  @Get('workload/:userId')
  getWorkloadDetail(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Query() query: WorkloadQueryDto,
  ) {
    return this.operationsService.getWorkloadDetail(user, userId, query);
  }

  @Get('pairing')
  getPairing(@CurrentUser() user: AuthUser) {
    return this.operationsService.getPairing(user);
  }
}
```

- [ ] **Step 4: Module + wire into `AppModule`**

Create `apps/api/src/operations/operations.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';

@Module({
  controllers: [OperationsController],
  providers: [OperationsService, FirmRoleGuard],
})
export class OperationsModule {}
```

In `apps/api/src/app.module.ts`, add the import and add `OperationsModule` to the `imports` array (after `IntakeModule` is fine):

```ts
import { IntakeModule } from './intake/intake.module';
import { OperationsModule } from './operations/operations.module';
```

```ts
  imports: [
    // ...existing entries...
    IntakeModule,
    OperationsModule,
  ],
```

- [ ] **Step 5: Manual verification**

With the API running and an OWNER token:

```bash
curl -s "http://localhost:3001/operations/workload" -H "Authorization: Bearer <owner-token>" | jq .
curl -s "http://localhost:3001/operations/workload?nearDeadlineDays=3" -H "Authorization: Bearer <owner-token>" | jq .
curl -s "http://localhost:3001/operations/workload/<a-lawyer-user-id>" -H "Authorization: Bearer <owner-token>" | jq .
curl -s "http://localhost:3001/operations/pairing" -H "Authorization: Bearer <owner-token>" | jq .
```

Expected: `workload` returns one row per firm ADMIN/LAWYER user, sorted ascending by `leadCount+buddyCount`; `workload/:userId` returns that user's active cases with `role` and `nearestDeadlineDays`; `pairing` returns pairs sorted descending by `count`. Cross-check one row by hand against the case list in the app (e.g. `GET /cases` filtered by that lawyer) to confirm counts match. Then repeat one call with a non-owner token — expect `403`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/operations apps/api/src/app.module.ts
git commit -m "feat(operations): add workload and pairing aggregation endpoints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend API client — types and functions

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: backend response shapes from Task 2 (`WorkloadSummary[]`, `WorkloadDetail`, `PairingEntry[]`) and Task 1 (`PUT /cases/:id/assignments`).
- Produces: `api.getWorkloadSummary`, `api.getWorkloadDetail`, `api.getPairing`, `api.updateCaseAssignments` — consumed by Tasks 4, 5, 6, 7.

- [ ] **Step 1: Add types and functions**

In `apps/web/src/lib/api.ts`, add near the other list-item interfaces (e.g. right after `UserItem`, around line 139):

```ts
export interface WorkloadSummary {
  userId: string;
  firstName: string;
  lastName: string;
  leadCount: number;
  buddyCount: number;
  nearDeadlineCount: number;
}

export interface WorkloadCaseItem {
  caseId: string;
  title: string;
  status: string;
  role: 'LEAD' | 'BUDDY';
  nearestDeadlineDays: number | null;
}

export interface WorkloadDetail {
  userId: string;
  firstName: string;
  lastName: string;
  cases: WorkloadCaseItem[];
}

export interface PairingEntry {
  userAId: string;
  userAName: string;
  userBId: string;
  userBName: string;
  count: number;
}
```

Inside the exported `api = { ... }` object, add (near `getLawyers`):

```ts
  getWorkloadSummary: (token: string, nearDeadlineDays = 7) =>
    request<WorkloadSummary[]>(`/operations/workload?nearDeadlineDays=${nearDeadlineDays}`, { token }),

  getWorkloadDetail: (token: string, userId: string, nearDeadlineDays = 7) =>
    request<WorkloadDetail>(`/operations/workload/${userId}?nearDeadlineDays=${nearDeadlineDays}`, { token }),

  getPairing: (token: string) => request<PairingEntry[]>('/operations/pairing', { token }),

  updateCaseAssignments: (token: string, caseId: string, buddyIds: string[]) =>
    request(`/cases/${caseId}/assignments`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ buddyIds }),
    }),
```

- [ ] **Step 2: Manual verification**

`cd apps/web && npx tsc --noEmit` (or run whatever the existing typecheck script is — check `apps/web/package.json`) and confirm no new type errors from this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add API client functions for workload/pairing and case assignments

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Operations page — sidebar nav entry + i18n key

**Files:**
- Modify: `apps/web/src/components/layout/LexFlowSidebar.tsx`
- Modify: `apps/web/src/lib/i18n/dashboard.ts`

**Interfaces:**
- Consumes: existing `NAV_ITEMS`/`ownerOnly` filtering pattern.
- Produces: a working `/operations` link in the sidebar for OWNER users only. Task 5 creates the page it points to.

- [ ] **Step 1: Add the nav item**

In `apps/web/src/components/layout/LexFlowSidebar.tsx`, add `Users2` (or reuse an existing icon — `UsersRound` is already used for `/team`; pick a distinct one, e.g. `Gauge`) to the `lucide-react` import list, then add a new entry to `NAV_ITEMS` (place it right after `/team` since both are team-management pages):

```ts
import {
  LayoutDashboard,
  Briefcase,
  Users,
  CalendarDays,
  FolderOpen,
  Receipt,
  BarChart3,
  UsersRound,
  Gauge,
  Settings,
  Bell,
  CreditCard,
  Scale,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  X,
  Shield,
  Tags,
  ClipboardList,
} from 'lucide-react';
```

```ts
  { href: '/team', labelKey: 'team' as const, icon: UsersRound, ownerOnly: true },
  { href: '/operations', labelKey: 'operations' as const, icon: Gauge, ownerOnly: true },
```

- [ ] **Step 2: Add the i18n key**

In `apps/web/src/lib/i18n/dashboard.ts`, add `operations: 'ภาระงานทีม'` to the Thai `nav` object (right after `team: 'จัดการทีม'`, around line 37), and `operations: 'Operations'` to the English `nav` object (right after the matching `team` line, around line 322 — find it the same way you found the Thai one).

- [ ] **Step 3: Manual verification**

Run the web dev server, log in as an OWNER, confirm "ภาระงานทีม" appears in the sidebar between "จัดการทีม" and "แพ็กเกจ & ชำระเงิน" and links to `/operations` (it will 404 until Task 5 lands — that's expected at this point). Log in as a non-owner (or check `firmRole` in devtools) and confirm the item is hidden.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/LexFlowSidebar.tsx apps/web/src/lib/i18n/dashboard.ts
git commit -m "feat(web): add Operations nav entry (owner-only)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Operations page — Workload tab (list + per-lawyer detail)

**Files:**
- Create: `apps/web/src/app/(dashboard)/operations/page.tsx`

**Interfaces:**
- Consumes: `api.getWorkloadSummary`, `api.getWorkloadDetail` (Task 3); `PageHeader`, `Card`/`CardContent`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`, `Button` (all existing UI components).
- Produces: default export `OperationsPage` mounted at `/operations`. Task 6 extends this same file to add the Pairing tab.

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/(dashboard)/operations/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, WorkloadSummary, WorkloadDetail } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/misc';

export default function OperationsPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState('workload');
  const [summary, setSummary] = useState<WorkloadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [nearDeadlineDays, setNearDeadlineDays] = useState(7);
  const [sortDesc, setSortDesc] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkloadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getWorkloadSummary(token, nearDeadlineDays)
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, nearDeadlineDays]);

  useEffect(() => {
    if (!token || !selectedUserId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api
      .getWorkloadDetail(token, selectedUserId, nearDeadlineDays)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  }, [token, selectedUserId, nearDeadlineDays]);

  const sorted = [...summary].sort((a, b) => {
    const diff = a.leadCount + a.buddyCount - (b.leadCount + b.buddyCount);
    return sortDesc ? -diff : diff;
  });

  return (
    <div>
      <PageHeader title="Operations" description="ภาพรวมภาระงานและการจับคู่ทีมงาน" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="workload">Workload</TabsTrigger>
          <TabsTrigger value="pairing">Pairing</TabsTrigger>
        </TabsList>

        <TabsContent value="workload">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              ใกล้ deadline ภายใน
              <Input
                type="number"
                min={1}
                value={nearDeadlineDays}
                onChange={(e) => setNearDeadlineDays(Math.max(1, Number(e.target.value) || 7))}
                className="h-8 w-16"
              />
              วัน
            </label>
            <Button size="sm" variant="outline" onClick={() => setSortDesc((s) => !s)}>
              {sortDesc ? 'เรียง: มากไปน้อย' : 'เรียง: น้อยไปมาก'}
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <Card className="lg:col-span-7">
              <CardContent className="p-0">
                {loading ? (
                  <p className="p-6 text-sm text-muted-foreground">กำลังโหลด...</p>
                ) : sorted.length === 0 ? (
                  <EmptyState title="ไม่มีข้อมูลทนายในสำนักงาน" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ทนาย</TableHead>
                        <TableHead>Lead</TableHead>
                        <TableHead>Buddy</TableHead>
                        <TableHead>ใกล้ deadline</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((s) => (
                        <TableRow
                          key={s.userId}
                          className="cursor-pointer"
                          onClick={() => setSelectedUserId(s.userId)}
                          data-state={selectedUserId === s.userId ? 'selected' : undefined}
                        >
                          <TableCell className="font-medium">
                            {s.firstName} {s.lastName}
                          </TableCell>
                          <TableCell>{s.leadCount}</TableCell>
                          <TableCell>{s.buddyCount}</TableCell>
                          <TableCell>{s.nearDeadlineCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-5">
              <CardContent className="p-4">
                {!selectedUserId ? (
                  <p className="text-sm text-muted-foreground">เลือกทนายจากตารางเพื่อดูรายละเอียด</p>
                ) : detailLoading || !detail ? (
                  <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
                ) : (
                  <div className="space-y-3">
                    <p className="font-semibold">
                      {detail.firstName} {detail.lastName}
                    </p>
                    {detail.cases.length === 0 ? (
                      <p className="text-sm text-muted-foreground">ไม่มีคดี active</p>
                    ) : (
                      <ul className="space-y-2">
                        {detail.cases.map((c) => (
                          <li key={c.caseId} className="rounded-lg border border-border p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{c.title}</span>
                              <span className="rounded bg-muted px-2 py-0.5 text-xs">{c.role}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              สถานะ: {c.status} ·{' '}
                              {c.nearestDeadlineDays === null
                                ? 'ไม่มี deadline ใกล้ตัว'
                                : c.nearestDeadlineDays < 0
                                  ? `เลยกำหนดมาแล้ว ${Math.abs(c.nearestDeadlineDays)} วัน`
                                  : `อีก ${c.nearestDeadlineDays} วัน`}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pairing">
          <p className="text-sm text-muted-foreground">Pairing tab — see Task 6.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run the web dev server, log in as OWNER, go to `/operations`. Confirm: the table lists firm lawyers sorted ascending by lead+buddy count; clicking a row loads their detail panel on the right with per-case role and day counts; changing the "ใกล้ deadline ภายใน" number refetches and changes the `nearDeadlineCount` column; the sort toggle button flips the table order. Cross-check one lawyer's numbers against `GET /cases` filtered manually.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/operations/page.tsx"
git commit -m "feat(web): add Operations page workload tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Operations page — Pairing tab

**Files:**
- Modify: `apps/web/src/app/(dashboard)/operations/page.tsx`

**Interfaces:**
- Consumes: `api.getPairing` (Task 3).
- Produces: filled-in Pairing tab content (replaces the placeholder from Task 5).

- [ ] **Step 1: Add pairing state + fetch**

In the same file, add imports/state alongside the existing ones:

```ts
import { api, WorkloadSummary, WorkloadDetail, PairingEntry } from '@/lib/api';
```

```ts
  const [pairing, setPairing] = useState<PairingEntry[]>([]);
  const [pairingLoading, setPairingLoading] = useState(true);
```

```ts
  useEffect(() => {
    if (!token) return;
    setPairingLoading(true);
    api.getPairing(token).then(setPairing).catch(console.error).finally(() => setPairingLoading(false));
  }, [token]);
```

- [ ] **Step 2: Replace the placeholder `TabsContent value="pairing"`**

```tsx
        <TabsContent value="pairing">
          <Card>
            <CardContent className="p-0">
              {pairingLoading ? (
                <p className="p-6 text-sm text-muted-foreground">กำลังโหลด...</p>
              ) : pairing.length === 0 ? (
                <EmptyState title="ยังไม่มีคู่ทำงานร่วมกัน" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>คู่</TableHead>
                      <TableHead>จำนวนคดีร่วมกัน</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pairing.map((p) => (
                      <TableRow key={`${p.userAId}:${p.userBId}`}>
                        <TableCell className="font-medium">
                          {p.userAName} + {p.userBName}
                        </TableCell>
                        <TableCell>{p.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
```

- [ ] **Step 3: Manual verification**

On `/operations`, switch to the Pairing tab. Confirm rows are sorted descending by count, and that the top pair matches what you'd expect from manually checking two lawyers who share several cases (active + closed) in `/cases`.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/operations/page.tsx"
git commit -m "feat(web): add Operations page pairing tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Workload badges in the case-creation form

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cases/new/page.tsx`

**Interfaces:**
- Consumes: `api.getWorkloadSummary` (Task 3), gracefully degrading to `[]` on failure (non-owner users get `403`).
- Produces: no new exports — this is a leaf UI change to an existing page.

- [ ] **Step 1: Fetch workload alongside the other form data**

Add `WorkloadSummary` to the existing `@/lib/api` import (line 7):

```ts
import { api, UserItem, CaseTypeItem, ClientItem, CourtItem, ApiError, WorkloadSummary } from '@/lib/api';
```

Add state near the other `useState` declarations (around line 38-44):

```ts
  const [workload, setWorkload] = useState<WorkloadSummary[]>([]);
```

In the existing data-loading `useEffect` (lines 75-94), add the workload fetch to the `Promise.all` with its own `.catch(() => [])` so a non-owner's 403 doesn't break the rest of the form:

```ts
  useEffect(() => {
    if (!token) return;
    setLoadingTypes(true);
    Promise.all([
      api.getLawyers(token),
      api.getCaseTypes(token),
      api.getClients(token).catch(() => [] as ClientItem[]),
      api.getCourts(token).catch(() => [] as CourtItem[]),
      api.getNextOwnRef(token).catch(() => ({ ownRef: '' })),
      api.getWorkloadSummary(token).catch(() => [] as WorkloadSummary[]),
    ])
      .then(([lawyerList, types, clientList, courtList, nextRef, workloadList]) => {
        setLawyers(lawyerList);
        setCaseTypes(types);
        setClients(clientList);
        setCourts(courtList);
        setNextOwnRef(nextRef.ownRef);
        setWorkload(workloadList);
      })
      .catch(() => setError('Failed to load case form data. Please refresh and try again.'))
      .finally(() => setLoadingTypes(false));
  }, [token]);
```

- [ ] **Step 2: Add a small formatting helper + use it in both selectors**

Add near the top of the component body (after the `selectedType`/`fieldSchema` derivations, around line 73):

```ts
  const workloadLabel = (userId: string) => {
    const w = workload.find((x) => x.userId === userId);
    if (!w) return '';
    return ` (Lead ${w.leadCount}, Buddy ${w.buddyCount}, ใกล้ deadline ${w.nearDeadlineCount})`;
  };
```

Update the Case Owner `<select>` options (around line 563-567):

```tsx
                {lawyers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.firstName} {l.lastName}
                    {workloadLabel(l.id)}
                  </option>
                ))}
```

Update the buddy checklist labels (around line 578-585):

```tsx
                  .map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.buddyIds.includes(l.id)}
                        onChange={() => toggleBuddy(l.id)}
                      />
                      {l.firstName} {l.lastName}
                      {workloadLabel(l.id)}
                    </label>
                  ))}
```

- [ ] **Step 3: Manual verification**

As OWNER, open "Create New Case", go to the Team step, and confirm each lawyer's name in both the owner dropdown and buddy checklist is followed by `(Lead N, Buddy N, ใกล้ deadline N)` matching the `/operations` page numbers. Then log in as a non-owner LAWYER and confirm the same step still works (names show, no crash, just no parenthetical — since `workload` stays `[]`).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/cases/new/page.tsx"
git commit -m "feat(web): show workload next to each lawyer when assigning a new case

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: "Manage Team" inline editor on the case detail page (owner-only)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`

**Interfaces:**
- Consumes: `api.updateCase` (existing, for `leadLawyerId`), `api.updateCaseAssignments` (Task 3, for `buddyIds`), `api.getLawyers` (existing), `api.getWorkloadSummary` (Task 3, same graceful-degrade pattern as Task 7), `useAuth()` for `user.firmRole`.
- Produces: no new exports — leaf UI change. This is the last task; nothing downstream depends on it.

- [ ] **Step 1: Add state**

Add `useAuth` destructuring of `user` (the file currently only pulls `token` at line 64 — check and extend it) and new imports/state near the existing `editingOverview` block (around line 75-89):

```ts
  const { token, user } = useAuth();
```

```ts
  const [editingTeam, setEditingTeam] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [workload, setWorkload] = useState<WorkloadSummary[]>([]);
  const [teamForm, setTeamForm] = useState({ leadLawyerId: '', buddyIds: [] as string[] });
```

Add `UserItem`, `WorkloadSummary` to the existing `@/lib/api` import block (lines 27-35):

```ts
import {
  api,
  CaseDetail,
  TaskItem,
  CaseActivityItem,
  CaseTypeItem,
  CourtItem,
  UserItem,
  WorkloadSummary,
  ApiError,
} from '@/lib/api';
```

- [ ] **Step 2: Load lawyers + workload when entering edit mode**

Add a handler near `startEditOverview` (search the file for that function to place this consistently):

```ts
  const startEditTeam = () => {
    if (!legalCase) return;
    setTeamForm({
      leadLawyerId: legalCase.leadLawyer ? '' : '', // placeholder — see Step 3 note
      buddyIds: legalCase.assignments.map((a) => a.userId ?? ''),
    });
    setTeamError('');
    if (token && lawyers.length === 0) {
      Promise.all([
        api.getLawyers(token),
        api.getWorkloadSummary(token).catch(() => [] as WorkloadSummary[]),
      ]).then(([l, w]) => {
        setLawyers(l);
        setWorkload(w);
      });
    }
    setEditingTeam(true);
  };
```

> **Note for the implementer:** `CaseDetail['leadLawyer']` and `CaseDetail['assignments'][number]['user']` (per `apps/web/src/lib/api.ts`) currently only carry `firstName`/`lastName`/`email`/`role` — **not** the `id`. Before writing `startEditTeam`, check `apps/web/src/lib/api.ts` for the exact `CaseDetail` interface and, if `leadLawyer.id` / `assignments[].user.id` / `assignments[].userId` are missing, add them there (mirroring `CaseItem.leadLawyer`) and confirm the backend's `caseInclude` (`apps/api/src/cases/cases.service.ts:24-38`) already selects `id: true` on both `leadLawyer` and `assignments.user` (it does, per Step 1's read of that file) — so this is a frontend type-only fix, not a backend change.

Once that's confirmed, `startEditTeam` becomes:

```ts
  const startEditTeam = () => {
    if (!legalCase) return;
    setTeamForm({
      leadLawyerId: legalCase.leadLawyer.id,
      buddyIds: legalCase.assignments.map((a) => a.user.id),
    });
    setTeamError('');
    if (token && lawyers.length === 0) {
      Promise.all([
        api.getLawyers(token),
        api.getWorkloadSummary(token).catch(() => [] as WorkloadSummary[]),
      ]).then(([l, w]) => {
        setLawyers(l);
        setWorkload(w);
      });
    }
    setEditingTeam(true);
  };

  const workloadLabel = (userId: string) => {
    const w = workload.find((x) => x.userId === userId);
    if (!w) return '';
    return ` (Lead ${w.leadCount}, Buddy ${w.buddyCount}, ใกล้ deadline ${w.nearDeadlineCount})`;
  };

  const handleSaveTeam = async () => {
    if (!token || !id || !teamForm.leadLawyerId) return;
    setSavingTeam(true);
    setTeamError('');
    try {
      await api.updateCase(token, id, { leadLawyerId: teamForm.leadLawyerId });
      const buddyIds = teamForm.buddyIds.filter((uid) => uid !== teamForm.leadLawyerId);
      const updated = (await api.updateCaseAssignments(token, id, buddyIds)) as CaseDetail;
      setCase(updated);
      setEditingTeam(false);
    } catch (err) {
      setTeamError(err instanceof ApiError ? err.message : 'บันทึกทีมไม่สำเร็จ');
    } finally {
      setSavingTeam(false);
    }
  };
```

- [ ] **Step 3: Replace the read-only Case Owner / Buddies block with the edit toggle**

Find the existing block (originally around lines 591-604, but Task 1-7 don't touch this file so line numbers should still match):

```tsx
              <div>
                <p className="text-xs text-muted-foreground">Case Owner / เจ้าของเคส</p>
                <p className="font-medium">{legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}</p>
              </div>
              {legalCase.assignments.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Buddies / ผู้ช่วย</p>
                  <p className="font-medium">
                    {legalCase.assignments
                      .map((a) => `${a.user.firstName} ${a.user.lastName}`)
                      .join(', ')}
                  </p>
                </div>
              )}
```

Replace it with:

```tsx
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">ทีมของคดี</p>
                  {!editingTeam && user?.firmRole === 'OWNER' && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={startEditTeam}>
                      <Pencil className="h-3 w-3" />
                      แก้ไขทีม
                    </Button>
                  )}
                </div>

                {!editingTeam ? (
                  <>
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">Case Owner / เจ้าของเคส</p>
                      <p className="font-medium">
                        {legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}
                      </p>
                    </div>
                    {legalCase.assignments.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">Buddies / ผู้ช่วย</p>
                        <p className="font-medium">
                          {legalCase.assignments
                            .map((a) => `${a.user.firstName} ${a.user.lastName}`)
                            .join(', ')}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-2 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Case Owner / เจ้าของเคส
                      </label>
                      <select
                        value={teamForm.leadLawyerId}
                        onChange={(e) =>
                          setTeamForm((f) => ({
                            ...f,
                            leadLawyerId: e.target.value,
                            buddyIds: f.buddyIds.filter((uid) => uid !== e.target.value),
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        {lawyers.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.firstName} {l.lastName}
                            {workloadLabel(l.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Buddies / ผู้ช่วย
                      </label>
                      <div className="mt-1 space-y-1">
                        {lawyers
                          .filter((l) => l.id !== teamForm.leadLawyerId)
                          .map((l) => (
                            <label key={l.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={teamForm.buddyIds.includes(l.id)}
                                onChange={() =>
                                  setTeamForm((f) => ({
                                    ...f,
                                    buddyIds: f.buddyIds.includes(l.id)
                                      ? f.buddyIds.filter((x) => x !== l.id)
                                      : [...f.buddyIds, l.id],
                                  }))
                                }
                              />
                              {l.firstName} {l.lastName}
                              {workloadLabel(l.id)}
                            </label>
                          ))}
                      </div>
                    </div>
                    {teamError && <p className="text-xs text-destructive">{teamError}</p>}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" disabled={savingTeam} onClick={handleSaveTeam}>
                        {savingTeam ? 'กำลังบันทึก...' : 'บันทึก'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTeam(false)}
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                )}
              </div>
```

- [ ] **Step 4: Manual verification**

As OWNER, open a case detail page, confirm the "ทีมของคดี" box shows current lead + buddies with a "แก้ไขทีม" button. Click it, confirm lawyer names show workload parentheticals, change the lead and toggle a buddy, save, confirm the page reflects the new team and a fresh `GET /cases/:id` (reload the page) shows the same. As a non-owner, confirm the "แก้ไขทีม" button does not render at all.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/cases/[id]/page.tsx"
git commit -m "feat(web): allow owners to edit an existing case's team inline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** every decision in the Global Constraints section maps to a task — case-level workload counting (Task 2), near-deadline threshold (Task 2, adjustable via query param), lead/buddy split (Task 2, 5), pairing across all cases including closed (Task 2, 6), owner-only access (Tasks 1, 2, 8 guards; Task 4 nav gating), workload-in-creation-form (Task 7), reassignment on existing cases (Tasks 1, 8), no schema changes (confirmed throughout), no new test infra (manual verification steps throughout).
- **Placeholder scan:** the one "TODO-shaped" spot is the `CaseDetail` type-shape check flagged explicitly in Task 8 Step 2 — it's not a vague "add validation later," it's a concrete instruction (check a specific interface, add `id` fields mirroring an existing pattern if missing) with the fallback already verified against the backend's actual `caseInclude`.
- **Type consistency:** `WorkloadSummary`/`WorkloadCaseItem`/`WorkloadDetail`/`PairingEntry` field names are identical between the backend service (Task 2) and the frontend `api.ts` types (Task 3), and reused verbatim in Tasks 5, 6, 7, 8.
