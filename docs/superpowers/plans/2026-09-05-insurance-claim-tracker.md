# Insurance Claim Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stage-tracked `InsuranceClaim` sidecar to `Case` that auto-calculates the ม.882 limitation deadline from the incident date and auto-creates the task/deadline each stage transition requires.

**Architecture:** Additive Prisma model 1:1 with `Case` (mirrors how `Intake` relates to `Case`), a nested NestJS module under `cases/:caseId/insurance-claim` reusing the existing `TasksService`/`CalendarService`/`CaseActivity` primitives for automation, and one new tab on the case detail page.

**Tech Stack:** NestJS + Prisma (Postgres) on the API, Next.js App Router + Tailwind on the web app, shared TS types/enums in `packages/shared`.

**Spec:** [docs/superpowers/specs/2026-09-05-insurance-claim-tracker-design.md](../specs/2026-09-05-insurance-claim-tracker-design.md)

## Global Constraints

- No new automated test infrastructure. This repo has zero `.spec.ts`/`.test.ts` files and no `jest` config in any workspace — imposing one is out of scope for this feature. Each task's "verify" step is a manual check (curl against the running dev API, or the browser) instead of an automated test, matching how every other module in this codebase (`cases`, `tasks`, `calendar`, `case-types`) already ships without tests.
- Stage order is fixed: `CLAIM_FILED, DENIED_OR_PARTIAL, DEMAND_SENT, OIC_COMPLAINT, SUIT_FILED`. A transition is valid only if the target's index in that array is strictly greater than the current stage's index (forward-only, skipping allowed).
- Limitation deadline = `incidentDate + 2 years` exactly (ปพพ. ม.882), no other adjustment.
- Every new backend file follows the existing per-module pattern seen in `apps/api/src/case-types/` and `apps/api/src/cases/case-participants.*`: DTO with `class-validator` decorators, service takes `PrismaService` + collaborators, controller guarded with `JwtAuthGuard` (+ `CaseAccessGuard` for anything nested under `cases/:caseId/...`).
- Run all `pnpm` commands from the repo root unless a step says otherwise. Run `prisma` commands from `apps/api`.

---

### Task 1: Prisma schema — `InsuranceClaim` model + migration + shared enum mirror

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `packages/shared/src/index.ts`
- Create (generated): `apps/api/prisma/migrations/<timestamp>_insurance_claim_tracker/migration.sql`

**Interfaces:**
- Produces: Prisma model `InsuranceClaim` with fields `id, caseId, insurerName, policyNumber, claimNumber, incidentDate, claimedDate, denialReason, stage, demandLetterSentAt, demandLetterDeadline, oicComplaintNumber, oicComplaintDate, oicOutcome, limitationEventId, createdById, createdAt, updatedAt`; Prisma enum `InsuranceClaimStage`; TS enum `InsuranceClaimStage` and `const INSURANCE_CLAIM_STAGE_ORDER: InsuranceClaimStage[]` exported from `@lawfirm/shared`, consumed by Task 4 and Task 8.

- [ ] **Step 1: Add the `InsuranceClaimStage` enum and `InsuranceClaim` model to the Prisma schema**

Open `apps/api/prisma/schema.prisma`. Add this enum near the other case-related enums (right after `enum ParticipantSide { ... }`, around line 108):

```prisma
enum InsuranceClaimStage {
  CLAIM_FILED
  DENIED_OR_PARTIAL
  DEMAND_SENT
  OIC_COMPLAINT
  SUIT_FILED
}
```

Add the model at the end of the file (after `model InvoiceLineItem { ... }`):

```prisma
model InsuranceClaim {
  id                   String              @id @default(uuid())
  caseId               String              @unique
  insurerName          String
  policyNumber         String?
  claimNumber          String?
  incidentDate         DateTime
  claimedDate          DateTime?
  denialReason         String?             @db.Text
  stage                InsuranceClaimStage @default(CLAIM_FILED)
  demandLetterSentAt   DateTime?
  demandLetterDeadline DateTime?
  oicComplaintNumber   String?
  oicComplaintDate     DateTime?
  oicOutcome           String?             @db.Text
  limitationEventId    String?
  createdById          String
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  case      Case @relation(fields: [caseId], references: [id], onDelete: Cascade)
  createdBy User @relation(fields: [createdById], references: [id])

  @@index([caseId])
}
```

Now wire the two back-relations. In `model Case { ... }`, add one line to the relations block (right after `knowledge      CaseKnowledge[]`):

```prisma
  insuranceClaim InsuranceClaim?
```

In `model User { ... }`, add one line to the relations block (right after `assessedIntakes     Intake[]             @relation("IntakeAssessor")`):

```prisma
  insuranceClaims     InsuranceClaim[]
```

- [ ] **Step 2: Generate and apply the migration**

Run from `apps/api`:

```bash
cd apps/api
pnpm prisma migrate dev --name insurance_claim_tracker
```

Expected: prisma prints `Your database is now in sync with your schema` and creates `apps/api/prisma/migrations/<timestamp>_insurance_claim_tracker/migration.sql` containing `CREATE TYPE "InsuranceClaimStage"` and `CREATE TABLE "InsuranceClaim"`.

- [ ] **Step 3: Verify the generated Prisma client has the new model**

```bash
grep -n "InsuranceClaim" apps/api/src/generated/prisma/index.d.ts | head -5
```

Expected: matches, confirming `PrismaService.insuranceClaim` is now typed.

- [ ] **Step 4: Mirror the enum and stage order into the shared package**

Open `packages/shared/src/index.ts`. Add this near the other mirrored enums (right after `export enum ParticipantSide { ... }`):

```typescript
export enum InsuranceClaimStage {
  CLAIM_FILED = 'CLAIM_FILED',
  DENIED_OR_PARTIAL = 'DENIED_OR_PARTIAL',
  DEMAND_SENT = 'DEMAND_SENT',
  OIC_COMPLAINT = 'OIC_COMPLAINT',
  SUIT_FILED = 'SUIT_FILED',
}

export const INSURANCE_CLAIM_STAGE_ORDER: InsuranceClaimStage[] = [
  InsuranceClaimStage.CLAIM_FILED,
  InsuranceClaimStage.DENIED_OR_PARTIAL,
  InsuranceClaimStage.DEMAND_SENT,
  InsuranceClaimStage.OIC_COMPLAINT,
  InsuranceClaimStage.SUIT_FILED,
]

export const INSURANCE_CLAIM_STAGE_LABELS: Record<InsuranceClaimStage, string> = {
  [InsuranceClaimStage.CLAIM_FILED]: 'ยื่นเคลม',
  [InsuranceClaimStage.DENIED_OR_PARTIAL]: 'ถูกปฏิเสธ/จ่ายไม่ครบ',
  [InsuranceClaimStage.DEMAND_SENT]: 'ทวงถาม/สงวนสิทธิ์',
  [InsuranceClaimStage.OIC_COMPLAINT]: 'ร้องเรียน คปภ.',
  [InsuranceClaimStage.SUIT_FILED]: 'ยื่นฟ้อง',
}
```

- [ ] **Step 5: Rebuild the shared package**

```bash
pnpm --filter @lawfirm/shared build
```

Expected: builds cleanly, `packages/shared/dist/index.d.ts` now contains `InsuranceClaimStage`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared/src/index.ts packages/shared/dist
git commit -m "feat(db): add InsuranceClaim model and stage enum"
```

---

### Task 2: Insurance claim DTOs

**Files:**
- Create: `apps/api/src/insurance-claims/dto/insurance-claim.dto.ts`

**Interfaces:**
- Consumes: `InsuranceClaimStage` from `@lawfirm/shared` (Task 1).
- Produces: `CreateInsuranceClaimDto`, `UpdateInsuranceClaimDto`, `AdvanceStageDto` classes, consumed by Task 5 (service) and Task 6 (controller).

- [ ] **Step 1: Write the DTO file**

```typescript
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { InsuranceClaimStage } from '@lawfirm/shared';

export class CreateInsuranceClaimDto {
  @IsString()
  insurerName!: string;

  @IsOptional()
  @IsString()
  policyNumber?: string;

  @IsOptional()
  @IsString()
  claimNumber?: string;

  @IsDateString()
  incidentDate!: string;

  @IsOptional()
  @IsDateString()
  claimedDate?: string;
}

export class UpdateInsuranceClaimDto {
  @IsOptional()
  @IsString()
  insurerName?: string;

  @IsOptional()
  @IsString()
  policyNumber?: string;

  @IsOptional()
  @IsString()
  claimNumber?: string;

  @IsOptional()
  @IsDateString()
  incidentDate?: string;

  @IsOptional()
  @IsDateString()
  claimedDate?: string;

  @IsOptional()
  @IsString()
  denialReason?: string;

  @IsOptional()
  @IsDateString()
  demandLetterSentAt?: string;

  @IsOptional()
  @IsDateString()
  demandLetterDeadline?: string;

  @IsOptional()
  @IsString()
  oicComplaintNumber?: string;

  @IsOptional()
  @IsDateString()
  oicComplaintDate?: string;

  @IsOptional()
  @IsString()
  oicOutcome?: string;
}

export class AdvanceStageDto {
  @IsEnum(InsuranceClaimStage)
  stage!: InsuranceClaimStage;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/api
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: no errors referencing `insurance-claim.dto.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/insurance-claims/dto/insurance-claim.dto.ts
git commit -m "feat(api): add insurance claim DTOs"
```

---

### Task 3: `LimitationDeadlineService`

**Files:**
- Create: `apps/api/src/insurance-claims/limitation-deadline.service.ts`

**Interfaces:**
- Consumes: `CalendarService.create(dto)` / `CalendarService.update(id, dto)` (existing, `apps/api/src/calendar/calendar.service.ts:62,113`); `PrismaService.case.update`.
- Produces: `LimitationDeadlineService.applyIncidentDate(caseId: string, incidentDate: Date, existingEventId?: string | null): Promise<string>` — returns the `CalendarEvent.id` to store as `InsuranceClaim.limitationEventId`. Consumed by Task 5.

- [ ] **Step 1: Write the service**

```typescript
import { Injectable } from '@nestjs/common';
import { EventType } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CalendarService } from '../calendar/calendar.service';

const LIMITATION_YEARS = 2;
const REMINDER_MINUTES = [90 * 1440, 30 * 1440, 7 * 1440];

@Injectable()
export class LimitationDeadlineService {
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
  ) {}

  computeDeadline(incidentDate: Date): Date {
    const deadline = new Date(incidentDate);
    deadline.setFullYear(deadline.getFullYear() + LIMITATION_YEARS);
    return deadline;
  }

  async applyIncidentDate(
    caseId: string,
    incidentDate: Date,
    existingEventId?: string | null,
  ): Promise<string> {
    const deadline = this.computeDeadline(incidentDate);

    await this.prisma.case.update({
      where: { id: caseId },
      data: { limitationDeadline: deadline },
    });

    if (existingEventId) {
      const updated = await this.calendarService.update(existingEventId, {
        startAt: deadline.toISOString(),
      });
      return updated.id;
    }

    const created = await this.calendarService.create({
      caseId,
      title: 'อายุความฟ้องคดี (ม.882)',
      startAt: deadline.toISOString(),
      type: EventType.DEADLINE,
      reminderMinutes: REMINDER_MINUTES,
    });
    return created.id;
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/api
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: no errors referencing `limitation-deadline.service.ts`.

- [ ] **Step 3: Manually verify the date math**

```bash
node -e "
const d = new Date('2026-01-15T00:00:00.000Z');
d.setFullYear(d.getFullYear() + 2);
console.log(d.toISOString());
"
```

Expected: `2028-01-15T00:00:00.000Z`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/insurance-claims/limitation-deadline.service.ts
git commit -m "feat(api): add LimitationDeadlineService for ม.882 deadline calc"
```

---

### Task 4: Stage transition rules + task-automation map

**Files:**
- Create: `apps/api/src/insurance-claims/stage-automation.ts`

**Interfaces:**
- Consumes: `InsuranceClaimStage`, `INSURANCE_CLAIM_STAGE_ORDER` from `@lawfirm/shared` (Task 1).
- Produces: `getAllowedNextStages(current: InsuranceClaimStage): InsuranceClaimStage[]`, `isValidTransition(current: InsuranceClaimStage, target: InsuranceClaimStage): boolean`, `STAGE_TASK_TEMPLATES: Partial<Record<InsuranceClaimStage, { title: string; dueInDays: number }[]>>`. All consumed by Task 5.

- [ ] **Step 1: Write the module**

```typescript
import { InsuranceClaimStage, INSURANCE_CLAIM_STAGE_ORDER } from '@lawfirm/shared';

export function getAllowedNextStages(current: InsuranceClaimStage): InsuranceClaimStage[] {
  const currentIndex = INSURANCE_CLAIM_STAGE_ORDER.indexOf(current);
  return INSURANCE_CLAIM_STAGE_ORDER.slice(currentIndex + 1);
}

export function isValidTransition(
  current: InsuranceClaimStage,
  target: InsuranceClaimStage,
): boolean {
  return getAllowedNextStages(current).includes(target);
}

export interface StageTaskTemplate {
  title: string;
  dueInDays: number;
}

export const STAGE_TASK_TEMPLATES: Partial<Record<InsuranceClaimStage, StageTaskTemplate[]>> = {
  [InsuranceClaimStage.DEMAND_SENT]: [
    { title: 'ส่งหนังสือทวงถามพร้อมสงวนสิทธิ์เรียกร้องค่าเสียหาย', dueInDays: 7 },
  ],
  [InsuranceClaimStage.OIC_COMPLAINT]: [
    { title: 'ยื่นเรื่องร้องเรียนต่อ คปภ. (e-Complaint)', dueInDays: 7 },
  ],
  [InsuranceClaimStage.SUIT_FILED]: [
    { title: 'เตรียมคำฟ้องและยื่นฟ้องต่อศาลที่มีเขตอำนาจ', dueInDays: 14 },
  ],
};
```

- [ ] **Step 2: Verify the transition logic manually**

```bash
cd apps/api
pnpm exec ts-node -e "
import { getAllowedNextStages, isValidTransition } from './src/insurance-claims/stage-automation';
import { InsuranceClaimStage } from '@lawfirm/shared';
console.log(getAllowedNextStages(InsuranceClaimStage.CLAIM_FILED));
console.log(isValidTransition(InsuranceClaimStage.CLAIM_FILED, InsuranceClaimStage.DEMAND_SENT));
console.log(isValidTransition(InsuranceClaimStage.DEMAND_SENT, InsuranceClaimStage.CLAIM_FILED));
"
```

Expected: first line lists all four later stages (skip-forward allowed), second line `true` (skipping DENIED_OR_PARTIAL is allowed), third line `false` (backward move rejected). If `ts-node` isn't available, compile with `pnpm exec tsc --noEmit` instead and inspect the logic by reading it — the two functions are pure and short enough to verify by inspection.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/insurance-claims/stage-automation.ts
git commit -m "feat(api): add insurance claim stage transition rules and task templates"
```

---

### Task 5: `InsuranceClaimsService`

**Files:**
- Create: `apps/api/src/insurance-claims/insurance-claims.service.ts`

**Interfaces:**
- Consumes: `PrismaService`, `LimitationDeadlineService.applyIncidentDate` (Task 3), `TasksService.create(user, caseId, dto, source?)` (existing, `apps/api/src/tasks/tasks.service.ts:52`), `isValidTransition`/`getAllowedNextStages`/`STAGE_TASK_TEMPLATES` (Task 4), `CreateInsuranceClaimDto`/`UpdateInsuranceClaimDto`/`AdvanceStageDto` (Task 2).
- Produces: `InsuranceClaimsService.findByCase(caseId)`, `.create(user, caseId, dto)`, `.update(user, caseId, dto)`, `.advanceStage(user, caseId, dto)`. Consumed by Task 6 (controller).

- [ ] **Step 1: Write the service**

```typescript
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { TasksService } from '../tasks/tasks.service';
import { LimitationDeadlineService } from './limitation-deadline.service';
import { getAllowedNextStages, isValidTransition, STAGE_TASK_TEMPLATES } from './stage-automation';
import { CreateInsuranceClaimDto, UpdateInsuranceClaimDto, AdvanceStageDto } from './dto/insurance-claim.dto';

@Injectable()
export class InsuranceClaimsService {
  constructor(
    private prisma: PrismaService,
    private tasksService: TasksService,
    private limitationDeadlineService: LimitationDeadlineService,
  ) {}

  async findByCase(caseId: string) {
    const claim = await this.prisma.insuranceClaim.findUnique({ where: { caseId } });
    if (!claim) throw new NotFoundException('No insurance claim tracked for this case');
    return claim;
  }

  async create(user: AuthUser, caseId: string, dto: CreateInsuranceClaimDto) {
    const existing = await this.prisma.insuranceClaim.findUnique({ where: { caseId } });
    if (existing) throw new ConflictException('This case already has an insurance claim tracked');

    const incidentDate = new Date(dto.incidentDate);
    const eventId = await this.limitationDeadlineService.applyIncidentDate(caseId, incidentDate);

    const claim = await this.prisma.insuranceClaim.create({
      data: {
        caseId,
        insurerName: dto.insurerName,
        policyNumber: dto.policyNumber,
        claimNumber: dto.claimNumber,
        incidentDate,
        claimedDate: dto.claimedDate ? new Date(dto.claimedDate) : undefined,
        limitationEventId: eventId,
        createdById: user.id,
      },
    });

    await this.prisma.caseActivity.create({
      data: {
        caseId,
        title: `เริ่มติดตามเคลมประกัน: ${dto.insurerName}`,
        type: ActivityType.DEADLINE,
        createdById: user.id,
      },
    });

    return claim;
  }

  async update(user: AuthUser, caseId: string, dto: UpdateInsuranceClaimDto) {
    const claim = await this.findByCase(caseId);

    let limitationEventId = claim.limitationEventId;
    let incidentDate = claim.incidentDate;
    if (dto.incidentDate) {
      incidentDate = new Date(dto.incidentDate);
      limitationEventId = await this.limitationDeadlineService.applyIncidentDate(
        caseId,
        incidentDate,
        limitationEventId,
      );
    }

    return this.prisma.insuranceClaim.update({
      where: { caseId },
      data: {
        insurerName: dto.insurerName,
        policyNumber: dto.policyNumber,
        claimNumber: dto.claimNumber,
        incidentDate,
        claimedDate: dto.claimedDate ? new Date(dto.claimedDate) : undefined,
        denialReason: dto.denialReason,
        demandLetterSentAt: dto.demandLetterSentAt ? new Date(dto.demandLetterSentAt) : undefined,
        demandLetterDeadline: dto.demandLetterDeadline
          ? new Date(dto.demandLetterDeadline)
          : undefined,
        oicComplaintNumber: dto.oicComplaintNumber,
        oicComplaintDate: dto.oicComplaintDate ? new Date(dto.oicComplaintDate) : undefined,
        oicOutcome: dto.oicOutcome,
        limitationEventId,
      },
    });
  }

  async advanceStage(user: AuthUser, caseId: string, dto: AdvanceStageDto) {
    const claim = await this.findByCase(caseId);

    if (!isValidTransition(claim.stage, dto.stage)) {
      throw new ConflictException(
        `Cannot move from ${claim.stage} to ${dto.stage}. Allowed next stages: ${getAllowedNextStages(claim.stage).join(', ')}`,
      );
    }

    const updated = await this.prisma.insuranceClaim.update({
      where: { caseId },
      data: { stage: dto.stage },
    });

    const templates = STAGE_TASK_TEMPLATES[dto.stage] ?? [];
    for (const template of templates) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + template.dueInDays);
      await this.tasksService.create(user, caseId, {
        title: template.title,
        dueDate: dueDate.toISOString(),
      });
    }

    await this.prisma.caseActivity.create({
      data: {
        caseId,
        title: `เปลี่ยนสถานะเคลมประกันเป็น: ${dto.stage}`,
        type: ActivityType.FILING,
        createdById: user.id,
      },
    });

    return updated;
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/api
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: no errors referencing `insurance-claims.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/insurance-claims/insurance-claims.service.ts
git commit -m "feat(api): add InsuranceClaimsService with stage automation"
```

---

### Task 6: Controller + module + app registration

**Files:**
- Create: `apps/api/src/insurance-claims/insurance-claims.controller.ts`
- Create: `apps/api/src/insurance-claims/insurance-claims.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/cases/cases.service.ts`

**Interfaces:**
- Consumes: `InsuranceClaimsService` (Task 5), `JwtAuthGuard`/`CaseAccessGuard` (existing, `apps/api/src/common/guards/`).
- Produces: HTTP routes `GET/POST/PATCH /cases/:caseId/insurance-claim` and `POST /cases/:caseId/insurance-claim/advance-stage`, consumed by Task 7 (frontend api client).

- [ ] **Step 1: Write the controller**

```typescript
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InsuranceClaimsService } from './insurance-claims.service';
import { CreateInsuranceClaimDto, UpdateInsuranceClaimDto, AdvanceStageDto } from './dto/insurance-claim.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';

@Controller('cases/:caseId/insurance-claim')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class InsuranceClaimsController {
  constructor(private insuranceClaimsService: InsuranceClaimsService) {}

  @Get()
  findByCase(@Param('caseId') caseId: string) {
    return this.insuranceClaimsService.findByCase(caseId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateInsuranceClaimDto,
  ) {
    return this.insuranceClaimsService.create(user, caseId, dto);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: UpdateInsuranceClaimDto,
  ) {
    return this.insuranceClaimsService.update(user, caseId, dto);
  }

  @Post('advance-stage')
  advanceStage(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: AdvanceStageDto,
  ) {
    return this.insuranceClaimsService.advanceStage(user, caseId, dto);
  }
}
```

- [ ] **Step 2: Write the module**

```typescript
import { Module } from '@nestjs/common';
import { InsuranceClaimsService } from './insurance-claims.service';
import { InsuranceClaimsController } from './insurance-claims.controller';
import { LimitationDeadlineService } from './limitation-deadline.service';
import { CalendarModule } from '../calendar/calendar.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [CalendarModule, TasksModule],
  controllers: [InsuranceClaimsController],
  providers: [InsuranceClaimsService, LimitationDeadlineService],
  exports: [InsuranceClaimsService],
})
export class InsuranceClaimsModule {}
```

- [ ] **Step 3: Register the module in `app.module.ts`**

Open `apps/api/src/app.module.ts`. Add the import near the other feature-module imports (right after `import { CaseTypesModule } from './case-types/case-types.module';`):

```typescript
import { InsuranceClaimsModule } from './insurance-claims/insurance-claims.module';
```

Add `InsuranceClaimsModule` to the `imports: [...]` array in the `@Module({...})` decorator, next to `CaseTypesModule`.

- [ ] **Step 4: Include the claim on the case detail response**

Open `apps/api/src/cases/cases.service.ts`. In the `findOne` method's `include` block (around line 83-101), add one line after `participants: { orderBy: { createdAt: 'asc' } },`:

```typescript
        insuranceClaim: true,
```

- [ ] **Step 5: Start the API and verify the routes manually**

```bash
cd apps/api
pnpm dev
```

In another terminal, with a valid access token and an existing `caseId` (grab both from the browser devtools of a logged-in session, or via the login endpoint):

```bash
TOKEN="<paste access token>"
CASE_ID="<paste an existing case id>"

curl -s -X POST "http://localhost:3001/cases/$CASE_ID/insurance-claim" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"insurerName\":\"บมจ. ทดสอบประกันภัย\",\"incidentDate\":\"2026-01-15\"}"
```

Expected: `201` with a JSON body containing `"stage":"CLAIM_FILED"` and `"insurerName":"บมจ. ทดสอบประกันภัย"`.

```bash
curl -s "http://localhost:3001/cases/$CASE_ID/insurance-claim" -H "Authorization: Bearer $TOKEN"
```

Expected: the same claim back.

```bash
curl -s -X POST "http://localhost:3001/cases/$CASE_ID/insurance-claim/advance-stage" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"stage":"DEMAND_SENT"}'
```

Expected: `201` with `"stage":"DEMAND_SENT"`. Then check that the automation ran:

```bash
curl -s "http://localhost:3001/cases/$CASE_ID" -H "Authorization: Bearer $TOKEN" | grep -o '"title":"[^"]*ทวงถาม[^"]*"'
```

Expected: a match, confirming the `Task` was auto-created. Also check the case's `calendarEvents` in the same response for one titled `อายุความฟ้องคดี (ม.882)`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/insurance-claims/insurance-claims.controller.ts apps/api/src/insurance-claims/insurance-claims.module.ts apps/api/src/app.module.ts apps/api/src/cases/cases.service.ts
git commit -m "feat(api): wire up insurance claim routes and include on case detail"
```

---

### Task 7: Frontend API client

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: `request<T>()` helper (existing, `apps/web/src/lib/api.ts:52`), the routes from Task 6.
- Produces: `InsuranceClaimItem` interface, `api.getInsuranceClaim`, `api.createInsuranceClaim`, `api.updateInsuranceClaim`, `api.advanceInsuranceClaimStage`. Consumed by Task 8.

- [ ] **Step 1: Add the `InsuranceClaimItem` interface**

Open `apps/web/src/lib/api.ts`. Add this near `CaseItem` (right after its closing brace, around line 202):

```typescript
export interface InsuranceClaimItem {
  id: string;
  caseId: string;
  insurerName: string;
  policyNumber?: string | null;
  claimNumber?: string | null;
  incidentDate: string;
  claimedDate?: string | null;
  denialReason?: string | null;
  stage: import('@lawfirm/shared').InsuranceClaimStage;
  demandLetterSentAt?: string | null;
  demandLetterDeadline?: string | null;
  oicComplaintNumber?: string | null;
  oicComplaintDate?: string | null;
  oicOutcome?: string | null;
}
```

- [ ] **Step 2: Add the four API functions**

In the `export const api = { ... }` object, add these entries near `getCaseActivities`/`createCaseActivity` (around line 730):

```typescript
  getInsuranceClaim: (token: string, caseId: string) =>
    request<InsuranceClaimItem>(`/cases/${caseId}/insurance-claim`, { token }),

  createInsuranceClaim: (token: string, caseId: string, data: Record<string, unknown>) =>
    request<InsuranceClaimItem>(`/cases/${caseId}/insurance-claim`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  updateInsuranceClaim: (token: string, caseId: string, data: Record<string, unknown>) =>
    request<InsuranceClaimItem>(`/cases/${caseId}/insurance-claim`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(data),
    }),

  advanceInsuranceClaimStage: (token: string, caseId: string, stage: string) =>
    request<InsuranceClaimItem>(`/cases/${caseId}/insurance-claim/advance-stage`, {
      method: 'POST',
      token,
      body: JSON.stringify({ stage }),
    }),
```

- [ ] **Step 3: Verify it compiles**

```bash
cd apps/web
pnpm exec tsc --noEmit
```

Expected: no errors referencing `api.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add insurance claim API client functions"
```

---

### Task 8: Insurance tab page + tab bar entry

**Files:**
- Create: `apps/web/src/app/(dashboard)/cases/[id]/insurance/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`

**Interfaces:**
- Consumes: `api.getInsuranceClaim`/`createInsuranceClaim`/`advanceInsuranceClaimStage` (Task 7), `InsuranceClaimStage`/`INSURANCE_CLAIM_STAGE_ORDER`/`INSURANCE_CLAIM_STAGE_LABELS` from `@lawfirm/shared` (Task 1), `useAuth` (existing, `apps/web/src/lib/auth`), `formatDate` (existing, `apps/web/src/lib/utils`).

- [ ] **Step 1: Write the tab page**

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  InsuranceClaimStage,
  INSURANCE_CLAIM_STAGE_ORDER,
  INSURANCE_CLAIM_STAGE_LABELS,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, InsuranceClaimItem } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function CaseInsurancePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [claim, setClaim] = useState<InsuranceClaimItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ insurerName: '', policyNumber: '', claimNumber: '', incidentDate: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!token || !id) return;
    setLoading(true);
    api
      .getInsuranceClaim(token, id)
      .then(setClaim)
      .catch(() => setClaim(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token, id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createInsuranceClaim(token, id, {
        insurerName: form.insurerName,
        policyNumber: form.policyNumber || undefined,
        claimNumber: form.claimNumber || undefined,
        incidentDate: form.incidentDate,
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างรายการติดตามเคลมไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvance = async (stage: InsuranceClaimStage) => {
    if (!token || !id) return;
    const label = INSURANCE_CLAIM_STAGE_LABELS[stage];
    if (!window.confirm(`เปลี่ยนสถานะเป็น "${label}"? ระบบจะสร้างงาน/เตือนที่เกี่ยวข้องให้อัตโนมัติ`)) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.advanceInsuranceClaimStage(token, id, stage);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div>
      <Link href={`/cases/${id}`} className="text-sm text-brand-600 hover:underline">
        ← Back to case
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-slate-900">ติดตามเคลมประกัน</h1>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {!claim ? (
        <form onSubmit={handleCreate} className="max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">คดีนี้ยังไม่มีการติดตามเคลมประกัน</p>
          <div>
            <label className="block text-sm font-medium text-slate-700">บริษัทประกัน</label>
            <input
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.insurerName}
              onChange={(e) => setForm({ ...form, insurerName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">เลขกรมธรรม์</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.policyNumber}
              onChange={(e) => setForm({ ...form, policyNumber: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">เลขเคลม</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.claimNumber}
              onChange={(e) => setForm({ ...form, claimNumber: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">วันวินาศภัย</label>
            <input
              required
              type="date"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.incidentDate}
              onChange={(e) => setForm({ ...form, incidentDate: e.target.value })}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            เริ่มติดตามเคลมประกัน
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              {INSURANCE_CLAIM_STAGE_ORDER.filter(
                (s) => s !== InsuranceClaimStage.DENIED_OR_PARTIAL || claim.stage === InsuranceClaimStage.DENIED_OR_PARTIAL,
              ).map((stage, i, arr) => {
                const currentIndex = INSURANCE_CLAIM_STAGE_ORDER.indexOf(claim.stage);
                const stageIndex = INSURANCE_CLAIM_STAGE_ORDER.indexOf(stage);
                const done = stageIndex <= currentIndex;
                return (
                  <div key={stage} className="flex flex-1 items-center">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        done ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {i + 1}
                    </div>
                    <span className="ml-2 text-xs text-slate-600">{INSURANCE_CLAIM_STAGE_LABELS[stage]}</span>
                    {i < arr.length - 1 && <div className="mx-2 h-px flex-1 bg-slate-200" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">บริษัทประกัน</p>
              <p className="font-medium text-slate-900">{claim.insurerName}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">เลขกรมธรรม์ / เลขเคลม</p>
              <p className="font-medium text-slate-900">{claim.policyNumber ?? '—'} / {claim.claimNumber ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">วันวินาศภัย</p>
              <p className="font-medium text-slate-900">{formatDate(claim.incidentDate)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-medium text-slate-700">เปลี่ยนสถานะ</p>
            <div className="flex flex-wrap gap-2">
              {INSURANCE_CLAIM_STAGE_ORDER.filter(
                (s) => INSURANCE_CLAIM_STAGE_ORDER.indexOf(s) > INSURANCE_CLAIM_STAGE_ORDER.indexOf(claim.stage),
              ).map((stage) => (
                <button
                  key={stage}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleAdvance(stage)}
                  className="rounded-md border border-brand-600 px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                >
                  → {INSURANCE_CLAIM_STAGE_LABELS[stage]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the tab to the case detail page**

Open `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`. In the `tabs` array (around line 346-352), add one entry after `billing`:

```typescript
    { id: 'insurance', label: 'Insurance', href: `/cases/${id}/insurance` },
```

- [ ] **Step 3: Verify in the browser**

```bash
pnpm --filter @lawfirm/web dev
```

Open `http://localhost:3000/cases/<any-case-id>/insurance` (or click the new "Insurance" tab from a case detail page). Expected: the empty-state form appears if the case has no claim yet. Fill it in and submit — expected: the stage stepper appears showing step 1 (`ยื่นเคลม`) highlighted, with a "→ ทวงถาม/สงวนสิทธิ์" button and others available. Click it, confirm the dialog, and expected: the stepper advances to step 3 highlighted (step 2 `ถูกปฏิเสธ/จ่ายไม่ครบ` is skipped and hidden since it was never reached). Go to the case's "Tasks" tab — expected: a new task "ส่งหนังสือทวงถามพร้อมสงวนสิทธิ์เรียกร้องค่าเสียหาย" appears. Go to "Calendar" — expected: an event "อายุความฟ้องคดี (ม.882)" appears dated 2 years after the incident date you entered.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/cases/[id]/insurance/page.tsx" "apps/web/src/app/(dashboard)/cases/[id]/page.tsx"
git commit -m "feat(web): add insurance claim tracker tab to case detail"
```
