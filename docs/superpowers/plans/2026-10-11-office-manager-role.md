# OFFICE_MANAGER Firm Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `FirmRole.OFFICE_MANAGER` that runs the office (cases, documents, invoices and payments, leave, invites up to SENIOR_LAWYER, operations, reports), but cannot approve or pay money out, manage members, or touch the subscription.

**Architecture:** One capability map in `packages/shared` (`FIRM_CAPABILITIES` plus `hasFirmCapability`) replaces about 100 scattered `firmRole === OWNER` checks in API, web and mobile. The API gets a `@RequireCapability(cap)` decorator, handled by the existing `FirmRoleGuard`. Every owner check is sorted into one capability using the mapping tables below. Owner-only powers map to capabilities that only OWNER holds, so behaviour for existing roles does not change.

**Tech Stack:** NestJS 11 + Prisma (PostgreSQL), Next.js 15, Expo, pnpm workspace, jest.

**Spec:** `docs/superpowers/specs/2026-10-11-office-manager-role.md` (read it first; the capability table there is the source of truth).

## Global Constraints

- The role value is exactly `OFFICE_MANAGER`. Labels: Thai `ผู้จัดการสำนักงาน`, English `Office manager`.
- `FIRM_ROLE_RANK.OFFICE_MANAGER = 2`.
- OFFICE_MANAGER capabilities: `viewAllCases, manageInvoices, viewPettyCash, approveLeave, inviteMembers, runOperations, viewFirmReports, manageFirmContent`. OWNER has every capability. No other role has any capability.
- An office manager may invite only `SENIOR_LAWYER | LAWYER | ASSISTANT | EXTERNAL`.
- Existing roles must behave exactly as before. The one exception is `GET /ai-usage/summary`, which becomes `viewFirmReports` only.
- Database:
  - Never run `prisma migrate dev` or `prisma migrate deploy` on the shared local DB.
  - Apply with `psql "$DATABASE_URL" -f <migration.sql>`, then `pnpm --filter api exec prisma migrate resolve --applied <folder>`, then `pnpm --filter api exec prisma generate`.
- After editing `packages/shared`, run `pnpm --filter @lawfirm/shared build`. API and web consume `dist`.
- In this worktree, call git as `/usr/bin/git` (a hook rewrites plain `git`).
- End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **OFFICE_MANAGER calls an owner-only money route** (`PATCH /expenses/:id/status`, `PATCH /expense-claims/:id/status`, cash-advance issue). Expected: 403. Pinned in Task 3 tests.
2. **OFFICE_MANAGER invites `OWNER` or `OFFICE_MANAGER`.** Expected: 403 with no invitation row created. They also cannot change a member's role or remove a member. Pinned in Task 4 tests.
3. **OFFICE_MANAGER requests leave.** Expected: it stays PENDING (no self-approval), and owners plus other office managers are notified. Pinned in Task 3 tests.
4. **Existing SENIOR_LAWYER / LAWYER / ASSISTANT scopes.** Expected: unchanged, so existing case-access specs stay green unmodified. Task 5 adds an OFFICE_MANAGER case alongside.
5. **Web/mobile role-label maps typed `Record<string, …>`** silently render `undefined` for the new role. Expected: every label map shows `ผู้จัดการสำนักงาน`. Task 6 and Task 7 grep checks.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/firm-capabilities.ts` (new) | `FirmCapability` type, `FIRM_CAPABILITIES`, `hasFirmCapability`, `canInviteFirmRole`, `FIRM_ROLE_LABELS` |
| `packages/shared/src/index.ts` | `FirmRole.OFFICE_MANAGER`, rank, re-export of the new module |
| `apps/api/prisma/schema.prisma` + new migration | Enum value |
| `apps/api/src/saas/decorators/saas.decorators.ts`, `saas/guards/firm-role.guard.ts` | `@RequireCapability` |
| API module files listed in Tasks 3–5 | Swap owner checks for capabilities |
| Web files listed in Task 6 | Gating and labels |
| Mobile files listed in Task 7 | Gating and labels |

---

### Task 1: Shared capability map + enum + migration

**Files:**
- Create: `packages/shared/src/firm-capabilities.ts`
- Modify: `packages/shared/src/index.ts:9-29`
- Modify: `apps/api/prisma/schema.prisma:16-22`
- Create: `apps/api/prisma/migrations/20261011120000_office_manager_role/migration.sql`
- Test: `apps/api/src/common/firm-capabilities.spec.ts`

**Interfaces:**
- Produces:
  - `type FirmCapability`
  - `FIRM_CAPABILITIES: Record<FirmCapability, readonly FirmRole[]>`
  - `hasFirmCapability(role: FirmRole | string | null | undefined, cap: FirmCapability): boolean`
  - `canInviteFirmRole(inviter: FirmRole | string, target: FirmRole): boolean`
  - `FIRM_ROLE_LABELS: Record<FirmRole, { th: string; en: string }>`
  - `rolesWithCapability(cap: FirmCapability): FirmRole[]`

- [ ] **Step 1: Write the failing test** `apps/api/src/common/firm-capabilities.spec.ts`

```ts
import { FirmRole, FIRM_ROLE_RANK, hasFirmCapability, canInviteFirmRole, FIRM_ROLE_LABELS, rolesWithCapability } from '@lawfirm/shared';

describe('firm capabilities', () => {
  it('OWNER has every capability', () => {
    for (const cap of ['viewAllCases', 'manageInvoices', 'approveExpenses', 'issueCashAdvance', 'manageMembers', 'manageSubscription', 'deleteCase', 'reassignCaseLead'] as const) {
      expect(hasFirmCapability(FirmRole.OWNER, cap)).toBe(true);
    }
  });

  it('OFFICE_MANAGER runs the office but cannot move money out or manage members', () => {
    const om = FirmRole.OFFICE_MANAGER;
    for (const cap of ['viewAllCases', 'manageInvoices', 'viewPettyCash', 'approveLeave', 'inviteMembers', 'runOperations', 'viewFirmReports', 'manageFirmContent'] as const) {
      expect(hasFirmCapability(om, cap)).toBe(true);
    }
    for (const cap of ['approveExpenses', 'issueCashAdvance', 'manageMembers', 'manageSubscription', 'deleteCase', 'reassignCaseLead'] as const) {
      expect(hasFirmCapability(om, cap)).toBe(false);
    }
  });

  it('lawyers, assistants and externals have no capabilities', () => {
    for (const role of [FirmRole.SENIOR_LAWYER, FirmRole.LAWYER, FirmRole.ASSISTANT, FirmRole.EXTERNAL]) {
      expect(hasFirmCapability(role, 'viewAllCases')).toBe(false);
      expect(hasFirmCapability(role, 'manageInvoices')).toBe(false);
    }
    expect(hasFirmCapability(undefined, 'viewAllCases')).toBe(false);
    expect(hasFirmCapability('NONSENSE', 'viewAllCases')).toBe(false);
  });

  it('office manager invites up to SENIOR_LAWYER only', () => {
    const om = FirmRole.OFFICE_MANAGER;
    expect(canInviteFirmRole(om, FirmRole.SENIOR_LAWYER)).toBe(true);
    expect(canInviteFirmRole(om, FirmRole.LAWYER)).toBe(true);
    expect(canInviteFirmRole(om, FirmRole.ASSISTANT)).toBe(true);
    expect(canInviteFirmRole(om, FirmRole.EXTERNAL)).toBe(true);
    expect(canInviteFirmRole(om, FirmRole.OWNER)).toBe(false);
    expect(canInviteFirmRole(om, FirmRole.OFFICE_MANAGER)).toBe(false);
    expect(canInviteFirmRole(FirmRole.OWNER, FirmRole.OWNER)).toBe(true);
    expect(canInviteFirmRole(FirmRole.LAWYER, FirmRole.ASSISTANT)).toBe(false);
  });

  it('rank and labels', () => {
    expect(FIRM_ROLE_RANK[FirmRole.OFFICE_MANAGER]).toBe(2);
    expect(FIRM_ROLE_LABELS[FirmRole.OFFICE_MANAGER]).toEqual({ th: 'ผู้จัดการสำนักงาน', en: 'Office manager' });
    expect(rolesWithCapability('approveLeave')).toEqual([FirmRole.OWNER, FirmRole.OFFICE_MANAGER]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter api test -- firm-capabilities`
Expected: FAIL (`OFFICE_MANAGER` / `hasFirmCapability` not exported)

- [ ] **Step 3: Implement**

`packages/shared/src/index.ts`: add `OFFICE_MANAGER = 'OFFICE_MANAGER',` to `enum FirmRole` after `SENIOR_LAWYER`. Add `[FirmRole.OFFICE_MANAGER]: 2,` to `FIRM_ROLE_RANK`. Add `export * from './firm-capabilities';` next to the other `export *` lines at the top.

`packages/shared/src/firm-capabilities.ts`:

```ts
import { FirmRole } from './index';

/**
 * What a firm member may do beyond their own cases. OWNER holds all of them;
 * OFFICE_MANAGER runs the office but cannot pay money out, manage members or the subscription.
 * Every "owner-only" check in api/web/mobile asks one of these instead of comparing to OWNER.
 */
export type FirmCapability =
  | 'viewAllCases'
  | 'manageInvoices'
  | 'viewPettyCash'
  | 'approveLeave'
  | 'inviteMembers'
  | 'runOperations'
  | 'viewFirmReports'
  | 'manageFirmContent'
  | 'approveExpenses'
  | 'issueCashAdvance'
  | 'manageMembers'
  | 'manageSubscription'
  | 'deleteCase'
  | 'reassignCaseLead';

const OFFICE = [FirmRole.OWNER, FirmRole.OFFICE_MANAGER] as const;
const OWNER = [FirmRole.OWNER] as const;

export const FIRM_CAPABILITIES: Record<FirmCapability, readonly FirmRole[]> = {
  viewAllCases: OFFICE,
  manageInvoices: OFFICE,
  viewPettyCash: OFFICE,
  approveLeave: OFFICE,
  inviteMembers: OFFICE,
  runOperations: OFFICE,
  viewFirmReports: OFFICE,
  manageFirmContent: OFFICE,
  approveExpenses: OWNER,
  issueCashAdvance: OWNER,
  manageMembers: OWNER,
  manageSubscription: OWNER,
  deleteCase: OWNER,
  reassignCaseLead: OWNER,
};

export function hasFirmCapability(role: FirmRole | string | null | undefined, cap: FirmCapability): boolean {
  return !!role && (FIRM_CAPABILITIES[cap] as readonly string[]).includes(role);
}

export function rolesWithCapability(cap: FirmCapability): FirmRole[] {
  return [...FIRM_CAPABILITIES[cap]];
}

const OFFICE_MANAGER_INVITABLE: readonly FirmRole[] = [
  FirmRole.SENIOR_LAWYER,
  FirmRole.LAWYER,
  FirmRole.ASSISTANT,
  FirmRole.EXTERNAL,
];

/** May `inviter` invite someone into `target` role? Owners invite anyone; office managers up to SENIOR_LAWYER. */
export function canInviteFirmRole(inviter: FirmRole | string, target: FirmRole): boolean {
  if (inviter === FirmRole.OWNER) return true;
  if (inviter === FirmRole.OFFICE_MANAGER) return OFFICE_MANAGER_INVITABLE.includes(target);
  return false;
}

export const FIRM_ROLE_LABELS: Record<FirmRole, { th: string; en: string }> = {
  [FirmRole.OWNER]: { th: 'เจ้าของสำนักงาน', en: 'Owner' },
  [FirmRole.SENIOR_LAWYER]: { th: 'ทนายอาวุโส', en: 'Senior lawyer' },
  [FirmRole.OFFICE_MANAGER]: { th: 'ผู้จัดการสำนักงาน', en: 'Office manager' },
  [FirmRole.LAWYER]: { th: 'ทนายความ', en: 'Lawyer' },
  [FirmRole.ASSISTANT]: { th: 'ผู้ช่วย', en: 'Assistant' },
  [FirmRole.EXTERNAL]: { th: 'ผู้รับงานภายนอก', en: 'External' },
};
```

If the circular `import { FirmRole } from './index'` breaks at runtime (enum `undefined` at module load), move `enum FirmRole` into a new `packages/shared/src/firm-role.ts`, have both `index.ts` (via `export * from './firm-role'`) and `firm-capabilities.ts` import from it, and delete the original enum declaration from `index.ts`.

`apps/api/prisma/schema.prisma` `enum FirmRole`: add `OFFICE_MANAGER` after `SENIOR_LAWYER`.

`migration.sql`:

```sql
-- AlterEnum
ALTER TYPE "FirmRole" ADD VALUE 'OFFICE_MANAGER';
```

- [ ] **Step 4: Build shared, apply the migration, regenerate, run the test**

```bash
pnpm --filter @lawfirm/shared build
cd apps/api && set -a && . ./.env && set +a && psql "$DATABASE_URL" -f prisma/migrations/20261011120000_office_manager_role/migration.sql && pnpm exec prisma migrate resolve --applied 20261011120000_office_manager_role && pnpm exec prisma generate
pnpm --filter api test -- firm-capabilities
```

If the worktree has no `apps/api/.env`, copy `/Users/pongpanot_s/Documents/dev/lawfirm/apps/api/.env` first.
Expected: PASS.

- [ ] **Step 5: Typecheck the whole repo for exhaustive-`Record<FirmRole,…>` breakages**

Run: `pnpm --filter api exec tsc --noEmit -p tsconfig.json && pnpm --filter web exec tsc --noEmit`
For every error `Property 'OFFICE_MANAGER' is missing in type`, add the entry using `FIRM_ROLE_LABELS[FirmRole.OFFICE_MANAGER].th` (or the `.en`/object form the map uses). Do not change behaviour anywhere else.

- [ ] **Step 6: Commit**

```bash
/usr/bin/git add packages/shared/src apps/api/prisma apps/api/src/common/firm-capabilities.spec.ts
/usr/bin/git commit -m "feat(roles): add OFFICE_MANAGER firm role and shared capability map"
```

---

### Task 2: `@RequireCapability` decorator in FirmRoleGuard

**Files:**
- Modify: `apps/api/src/saas/decorators/saas.decorators.ts`
- Modify: `apps/api/src/saas/guards/firm-role.guard.ts`
- Test: `apps/api/src/saas/guards/firm-role.guard.spec.ts` (create)

**Interfaces:**
- Consumes: `hasFirmCapability`, `FirmCapability` from Task 1
- Produces: `RequireCapability(cap: FirmCapability)` decorator, exported from `saas/decorators/saas.decorators.ts`. Routes using it must have `FirmRoleGuard` in `@UseGuards` (after `JwtAuthGuard`).

- [ ] **Step 1: Write the failing test**

```ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirmRole } from '@lawfirm/shared';
import { FirmRoleGuard } from './firm-role.guard';
import { REQUIRE_CAPABILITY_KEY } from '../decorators/saas.decorators';

function ctx(firmRole: FirmRole): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', firmId: 'f', firmRole } }) }),
  } as any;
}

describe('FirmRoleGuard capability', () => {
  const reflector = new Reflector();
  const guard = new FirmRoleGuard(reflector);

  function withMeta(meta: Record<string, unknown>) {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => meta[key]);
  }

  it('allows OFFICE_MANAGER on an office capability', () => {
    withMeta({ [REQUIRE_CAPABILITY_KEY]: 'manageInvoices' });
    expect(guard.canActivate(ctx(FirmRole.OFFICE_MANAGER))).toBe(true);
  });

  it('blocks OFFICE_MANAGER on an owner capability', () => {
    withMeta({ [REQUIRE_CAPABILITY_KEY]: 'approveExpenses' });
    expect(() => guard.canActivate(ctx(FirmRole.OFFICE_MANAGER))).toThrow(ForbiddenException);
  });

  it('blocks LAWYER on an office capability', () => {
    withMeta({ [REQUIRE_CAPABILITY_KEY]: 'manageInvoices' });
    expect(() => guard.canActivate(ctx(FirmRole.LAWYER))).toThrow(ForbiddenException);
  });

  it('still enforces @OwnerOnly for OFFICE_MANAGER', () => {
    withMeta({ ownerOnly: true });
    expect(() => guard.canActivate(ctx(FirmRole.OFFICE_MANAGER))).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter api test -- firm-role.guard`. Expected: FAIL (`REQUIRE_CAPABILITY_KEY` missing).

- [ ] **Step 3: Implement**

`saas.decorators.ts` append:

```ts
import { FirmCapability } from '@lawfirm/shared';

export const REQUIRE_CAPABILITY_KEY = 'requireCapability';
/** Route needs this firm capability (see packages/shared firm-capabilities). Pair with FirmRoleGuard. */
export const RequireCapability = (cap: FirmCapability) => SetMetadata(REQUIRE_CAPABILITY_KEY, cap);
```

(Merge the `FirmCapability` import into the existing `@lawfirm/shared` import line.)

`firm-role.guard.ts`: read the metadata the same way as `ownerOnly`, and after the ownerOnly check add:

```ts
    const capability = this.reflector.getAllAndOverride<FirmCapability>(REQUIRE_CAPABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (capability && !hasFirmCapability(user.firmRole, capability)) {
      throw new ForbiddenException('Insufficient permissions');
    }
```

- [ ] **Step 4: Run** `pnpm --filter api test -- firm-role.guard`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(roles): RequireCapability decorator on FirmRoleGuard`

---

### Task 3: Money and leave: billing, collections, cash advance, petty cash, leave

**Files (modify):**
- `apps/api/src/billing/billing.controller.ts`
- `apps/api/src/billing/billing.service.ts`
- `apps/api/src/billing/collections.service.ts`
- `apps/api/src/billing/cash-advance.service.ts`
- `apps/api/src/notifications/line-conversation/flows/line-advance-flow.service.ts`
- `apps/api/src/leave/leave.controller.ts`
- `apps/api/src/leave/leave.service.ts`

Tests: add cases to the existing `*.spec.ts` next to each service (`ls apps/api/src/billing/*.spec.ts apps/api/src/leave/*.spec.ts`). Follow each file's existing mock style.

**Interfaces:** Consumes `RequireCapability` (Task 2), `hasFirmCapability`, `rolesWithCapability` (Task 1).

**Mapping (do exactly this; line numbers are as of commit `decb472`):**

| Site | Today | Becomes |
|---|---|---|
| billing.controller `@Roles(Role.ADMIN)` getPettyCash (:59) | ADMIN | `@RequireCapability('viewPettyCash')` |
| billing.controller `@OwnerOnly` getFinanceSummary (:81), getFirmInvoices (:88), getStandaloneInvoices (:263), getReceivables (:275), getInvoicePrintData (:282), markInvoiceSent (:289), recordInvoicePayment (:296), listInvoicePayments (:307), sendInvoiceReminder (:314), ownerWorklist (:321), collectionInvoice (:328), collectionFollowUp (:335) | OwnerOnly | `@RequireCapability('manageInvoices')` |
| billing.controller `@Roles(Role.ADMIN)` updateExpenseClaimStatus (:153), updateExpenseStatus (:173) | ADMIN | `@RequireCapability('approveExpenses')` |
| billing.service :143, :447, :463, :478 (`isOwner` → expense scope), :517, :610, :623, :728, :768, :789, :802 | `=== OWNER` | `hasFirmCapability(user.firmRole, 'approveExpenses')` |
| billing.service :491 (petty-cash balance inside the expense summary) | `isOwner` | `hasFirmCapability(user.firmRole, 'viewPettyCash')` |
| collections.service :33 | OWNER | `manageInvoices` |
| cash-advance.service :16, :50, :56 | OWNER | `issueCashAdvance` |
| line-advance-flow :41 | OWNER | `issueCashAdvance` |
| leave.controller `@OwnerOnly` (:18, :38) | OwnerOnly | `@RequireCapability('approveLeave')` |
| leave.service :42, :148, :175 | OWNER | `approveLeave` |
| leave.service :114 (auto-approve own leave) | OWNER | **unchanged** (OWNER only) |
| leave.service :289 (notify approvers) | `role: FirmRole.OWNER` | `role: { in: rolesWithCapability('approveLeave') }` |

Make sure every controller using `@RequireCapability` has `FirmRoleGuard` in `@UseGuards`; add it if missing. Remove now-unused `OwnerOnly`/`Roles`/`Role` imports.

- [ ] **Step 1: Write failing tests**
  - Collections spec: an `OFFICE_MANAGER` user can call `recordPayment` (assert it does not throw `ForbiddenException`); a `LAWYER` still gets `ForbiddenException`.
  - Billing spec: an `OFFICE_MANAGER` updating expense status gets `ForbiddenException` (`billing.service` :802 path); `getExpenses` for `OFFICE_MANAGER` filters to `userId: user.id`.
  - Leave spec:
    - `OFFICE_MANAGER` can `approve` another member's leave.
    - `OFFICE_MANAGER` creating their own ANNUAL leave gets status `PENDING`.
    - The approver-notification query uses `role: { in: ['OWNER','OFFICE_MANAGER'] }`.
  - Cash advance spec: `OFFICE_MANAGER` `issue` throws `ForbiddenException`.
- [ ] **Step 2: Run** `pnpm --filter api test -- billing collections leave cash-advance`. Expected: the new cases FAIL.
- [ ] **Step 3: Apply the mapping table.**
- [ ] **Step 4: Run the same command.** Expected: all PASS, including the pre-existing cases (they must pass unmodified).
- [ ] **Step 5: Commit** `feat(roles): office manager on invoices/collections/leave; money-out stays owner`

---

### Task 4: Members, invitations, operations, reports, audit, AI usage

**Files (modify):**
- `apps/api/src/saas/saas.controller.ts`
- `apps/api/src/saas/tenant.service.ts`
- `apps/api/src/saas/invitation.service.ts`
- `apps/api/src/saas/subscription.service.ts` (no change in behaviour; only confirm it uses `isOwner`)
- `apps/api/src/operations/operations.controller.ts`
- `apps/api/src/operations/daily-operations.controller.ts`
- `apps/api/src/operations/daily-operations.service.ts`
- `apps/api/src/reports/reports.service.ts`
- `apps/api/src/dashboard/dashboard.service.ts`
- `apps/api/src/audit-log/audit-log.controller.ts`
- `apps/api/src/rag/ai-usage.controller.ts`

**Mapping:**

| Site | Becomes |
|---|---|
| saas.controller `@OwnerOnly` on billing history/checkout/promptpay/invoice QR/status/cancel (:58–:114) | `@RequireCapability('manageSubscription')` |
| saas.controller invite (:128), listMembers (:136), listInvitations (:144), cancelInvitation (:172) | `@RequireCapability('inviteMembers')` |
| saas.controller removeMember (:152), updateMemberRole (:160) | `@RequireCapability('manageMembers')` |
| saas.controller :193 firm settings | `hasFirmCapability(user.firmRole, 'manageSubscription')` |
| tenant.service `listMembers` :161 | `inviteMembers` |
| tenant.service `removeMember` :193, `updateMemberRole` :234 | `manageMembers` (keep `isOwner()` helper for the last-owner checks at :207/:245) |
| invitation.service `invite` :25 | `hasFirmCapability(user.firmRole,'inviteMembers')`, **then** `if (!canInviteFirmRole(user.firmRole, dto.role ?? FirmRole.ASSISTANT)) throw new ForbiddenException('ไม่มีสิทธิ์เชิญตำแหน่งนี้')` before any DB write |
| invitation.service `listPending` :236, `cancel` :246 | `inviteMembers` |
| operations.controller `@OwnerOnly` (class, :12), daily-operations.controller (:12) | `@RequireCapability('runOperations')` (keep the per-route radar/people endpoints that are open today open) |
| daily-operations.service :42 | `runOperations` |
| daily-operations.service :155 (task titles visible) | `viewAllCases` |
| reports.service :24, :155 | `viewFirmReports` |
| dashboard.service :87 (expense scope) | `approveExpenses` |
| audit-log.controller `@Roles(Role.ADMIN)` | `@UseGuards(JwtAuthGuard, FirmRoleGuard)` + `@RequireCapability('viewFirmReports')` |
| ai-usage.controller (no check today) | add `FirmRoleGuard` + `@RequireCapability('viewFirmReports')` |

Note: `operations.controller` class-level `@OwnerOnly()` — check whether any route inside is meant to be open (radar/people, per `daily-operations.controller.ts:25-30`). Keep those open exactly as today.

- [ ] **Step 1: Write failing tests** (in the existing `invitation.service.spec.ts` / `tenant.service.spec.ts`; create one if none exists, following `case-access.service.spec.ts` style):
  - `OFFICE_MANAGER` inviting `SENIOR_LAWYER` succeeds.
  - `OFFICE_MANAGER` inviting `OWNER` throws `ForbiddenException`, and `prisma.invitation.create`/`upsert` was not called.
  - `OFFICE_MANAGER` inviting `OFFICE_MANAGER` throws.
  - `OFFICE_MANAGER` `updateMemberRole` throws; `removeMember` throws.
  - `OFFICE_MANAGER` `listMembers` succeeds.
  - `reports.service` summary for `OFFICE_MANAGER` returns `scope: 'firm'`.
- [ ] **Step 2: Run** `pnpm --filter api test -- invitation tenant reports operations`. Expected: new cases FAIL.
- [ ] **Step 3: Apply the mapping.**
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(roles): office manager invites up to senior, runs operations and reports; ai-usage gated`

---

### Task 5: Case visibility, tasks, clients, portal, documents, templates/SOPs/case types, practice setup

**Files (modify):**
- `apps/api/src/common/services/case-access.service.ts`
- `apps/api/src/tasks/tasks.service.ts`
- `apps/api/src/clients/client-360.service.ts`
- `apps/api/src/client-portal/portal-workroom.service.ts`
- `apps/api/src/client-portal/client-portal-invite.controller.ts`
- `apps/api/src/client-portal/client-annual-reports.controller.ts`
- `apps/api/src/cases/cases.controller.ts`
- `apps/api/src/cases/cases.service.ts`
- `apps/api/src/cases/contact-case-access.controller.ts`
- `apps/api/src/documents/documents.controller.ts`
- `apps/api/src/documents/document-publication.controller.ts`
- `apps/api/src/templates/templates.controller.ts`
- `apps/api/src/sops/sops.controller.ts`
- `apps/api/src/case-types/case-types.controller.ts`
- `apps/api/src/practice-setup/practice-setup.service.ts`

**Mapping:**

| Site | Becomes |
|---|---|
| case-access.service :31, :68, :99, :138, :156, :176 (`=== OWNER` → whole firm) | `hasFirmCapability(user.firmRole, 'viewAllCases')` |
| case-access.service :215 (`OWNER \|\| SENIOR_LAWYER` email threads) | `hasFirmCapability(user.firmRole,'viewAllCases') \|\| user.firmRole === FirmRole.SENIOR_LAWYER` |
| tasks.service :165 (standalone task visible) | `viewAllCases` |
| tasks.service :191 `assertLeadOrOwner`, :650 (status change on others' tasks) | `runOperations` |
| tasks.service :362, :390, :487 (`[OWNER, SENIOR_LAWYER]` may assign) | add `FirmRole.OFFICE_MANAGER` to the list |
| tasks.service :331, :613, :620, :762; task-detail.service (all) | **unchanged** (review and recurrence stay legal/owner) |
| client-360.service :110 | `viewAllCases` |
| portal-workroom.service :20 (visibility) | `viewAllCases \|\| SENIOR_LAWYER` |
| portal-workroom.service :113 | **unchanged** |
| client-portal-invite.controller `@FirmRoles(OWNER, SENIOR_LAWYER)` | `@FirmRoles(FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.OFFICE_MANAGER)` |
| client-annual-reports.controller class `@OwnerOnly` | `@RequireCapability('manageFirmContent')` |
| cases.controller :77 `@OwnerOnly` (PUT assignments) | `@RequireCapability('reassignCaseLead')` |
| cases.controller :118 `@Roles(Role.ADMIN)` (delete) | keep `@Roles` removed, add `@RequireCapability('deleteCase')` (ensure FirmRoleGuard) |
| cases.service :463 | `reassignCaseLead`; :770 → `deleteCase` |
| contact-case-access.controller :23, :34 | `@RequireCapability('manageFirmContent')` |
| documents.controller :101, document-publication.controller :27, :39 | `@RequireCapability('manageFirmContent')` |
| templates.controller, sops.controller `@OwnerOnly` | `@RequireCapability('manageFirmContent')` |
| case-types.controller `@Roles(Role.ADMIN)` :36, :42, :48 | `@RequireCapability('manageFirmContent')` |
| practice-setup.service :74 `owner()` | throw unless `manageFirmContent` |
| users.controller `@Roles(Role.ADMIN)`; intake.controller :69, :75; case-comments :222; outlook :56; notification recipient queries (assignment-notifier :130, document-review :44, portal-case-helpers :18, client-portal-documents :85); cargo-claims :171; date-suggestions :57; workflows.* | **unchanged** |

- [ ] **Step 1: Write failing tests**
  - In `case-access.service.spec.ts` (do not edit existing cases), add: `returns only a firm filter for OFFICE_MANAGER` → `{ firmId: 'firm-1', deletedAt: null }`.
  - Add the same for the financials filter and the intake/client filters (`case-access.clients-intake.spec.ts`).
  - In the tasks spec: `OFFICE_MANAGER` can assign a todo to a `LAWYER`; `OFFICE_MANAGER` cannot be picked as reviewer.
- [ ] **Step 2: Run** `pnpm --filter api test -- case-access tasks`. Expected: new cases FAIL.
- [ ] **Step 3: Apply the mapping.**
- [ ] **Step 4: Run the full API suite** `pnpm --filter api test`. Expected: all PASS.
- [ ] **Step 5: Final grep.**
  Run: `grep -rnE "FirmRole\.OWNER|OwnerOnly\(\)" apps/api/src | grep -v spec`
  Every remaining hit must be in the "unchanged" rows above, `firm-role.guard.ts`, `roles.guard.ts`, `tenant.service` last-owner checks, `subscription.service`, `saas-auth.service`, or leave.service :114.
- [ ] **Step 6: Commit** `feat(roles): office manager sees all cases and manages firm content`

---

### Task 6: Web gating and labels

**Files (modify):** every web file from `grep -rlnE "'OWNER'|FirmRole\.OWNER|isOwner|ownerOnly" apps/web/src`. Main ones:
- `components/layout/SamnuanSidebar.tsx`
- `app/(dashboard)/operations/page.tsx`
- `app/(dashboard)/team/page.tsx`
- `app/(dashboard)/expenses/page.tsx`
- `app/(dashboard)/dashboard/page.tsx`
- `app/(dashboard)/leaves/page.tsx`
- `app/(dashboard)/invoices/page.tsx`
- `app/(dashboard)/admin/reimbursements/page.tsx`
- `app/(dashboard)/admin/audit-log/page.tsx`
- `app/(dashboard)/admin/case-types/page.tsx`
- `app/(dashboard)/settings/page.tsx`
- `app/(dashboard)/getting-started/page.tsx`
- `app/(dashboard)/sops/page.tsx`
- `app/(dashboard)/reports/page.tsx`
- `app/(dashboard)/clients/page.tsx`
- `components/operations/PersonWorkloadDrawer.tsx`
- `components/operations/WorkAssignmentForm.tsx`
- `components/cases/CaseTasksPanel.tsx`
- `components/tasks/TaskDetailDrawer.tsx`
- `app/(dashboard)/todos/page.tsx`
- `lib/daily-workboard.ts`
- `lib/i18n/dashboard.ts`

**Rule:** replace each owner comparison with `hasFirmCapability(user.firmRole, <cap>)`, using the API capability that guards the endpoint the UI calls.

| UI | Capability |
|---|---|
| Sidebar `ownerOnly: true` items | Replace the `ownerOnly` boolean with `capability?: FirmCapability`: `/reports` and `/ai-usage` → `viewFirmReports`, `/team` → `inviteMembers` |
| `/dashboard` redirect to `/operations` | `runOperations` |
| Operations daily board / KPIs | `runOperations` |
| Team page | Invite form, member list and pending invites → `inviteMembers`. Role change / remove buttons → `manageMembers`. The invite role picker lists only `ROLE_OPTIONS.filter(o => canInviteFirmRole(user.firmRole, o.value))`, and gains `{ value: FirmRole.OFFICE_MANAGER, labelKey: 'roleOfficeManager' }` |
| Expenses approve/requester UI, reimbursements page | `approveExpenses` |
| Leaves pending queue | `approveLeave` |
| Invoices receivables panel, firm list | `manageInvoices` |
| Audit log | `viewFirmReports` |
| Case types, SOP edit, getting-started, settings cards for templates/practice | `manageFirmContent` |
| Settings cards for subscription/firm settings | `manageSubscription` |
| Assigning tasks (PersonWorkloadDrawer, WorkAssignmentForm, CaseTasksPanel, TaskDetailDrawer, todos) | wherever the code checks `OWNER \|\| SENIOR_LAWYER` to allow assigning, add `FirmRole.OFFICE_MANAGER` |
| Role labels | add `roleOfficeManager: 'ผู้จัดการสำนักงาน (Office manager)'` (th) / `'Office manager'` (en) in `lib/i18n/dashboard.ts`; map OFFICE_MANAGER in team page `roleLabel` switch, `SamnuanSidebar` role chip, `lib/daily-workboard.ts ROLE_LABELS`, `sops/page.tsx`, `intake/[id]/page.tsx`, `workflow-ui.ts`, `CasePlaybook.tsx`, `QuickFlowCanvas.tsx` (use `FIRM_ROLE_LABELS`) |

Leave `account/billing`, `ExpiredPlanPicker`, `admin/holidays|courts|deadline-rules` (platform admin) as they are, unless they compare to OWNER for subscription → then `manageSubscription`.

- [ ] **Step 1:** Apply the table.
- [ ] **Step 2: Typecheck** `pnpm --filter web exec tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Label grep**
  Run: `grep -rnE "ASSISTANT: ['{]" apps/web/src | while read l; do f=${l%%:*}; grep -q OFFICE_MANAGER "$f" || echo "MISSING $f"; done`
  Expected: no output.
- [ ] **Step 4: Run web unit tests if present** `pnpm --filter web test --if-present`
- [ ] **Step 5: Commit** `feat(web): capability-based gating and office manager role labels`

---

### Task 7: Mobile gating and labels

**Files (modify):** every file from `grep -rlnE "'OWNER'|FirmRole\.OWNER|isOwner" apps/mobile/app apps/mobile/src`, including:
- `more.tsx`
- `owner-finance.tsx`
- `owner-decisions.tsx`
- `team-week.tsx`
- `reports.tsx`
- `person/[id].tsx`
- `(tabs)/team.tsx`
- `(tabs)/index.tsx`
- `(tabs)/tasks.tsx`
- `task/new.tsx`
- `task/blocker.tsx`
- `case/new.tsx`
- `case/[id].tsx`
- `case/[id]/close.tsx`
- `expenses/*`
- `invoice/[id].tsx`
- `event/[id]/team.tsx`
- `court-day/[eventId].tsx`
- `src/workflow.ts`
- `src/components/ReassignSheet.tsx`
- `src/components/TaskWorkView.tsx`
- `src/components/PersonWorkloadView.tsx`

**Rule:** same as Task 6.

| Screen | Capability |
|---|---|
| `owner-finance` | `manageInvoices` |
| `owner-decisions` | Read the screen. Expense/claim/advance approvals → `approveExpenses`; leave approvals → `approveLeave`. If it mixes both, gate each section separately |
| `team-week` | `runOperations \|\| SENIOR_LAWYER` |
| `more.tsx` `/operations` | `runOperations` |
| `reports.tsx` finance/KPI cards | `viewFirmReports` |
| Assign/reassign (person, ReassignSheet, task/new, case/new lead/buddy) | assign → add OFFICE_MANAGER where OWNER/SENIOR is allowed; changing case lead/buddies → `reassignCaseLead` |
| Expense approvals and claims | `approveExpenses` |
| Labels (`PersonWorkloadView` ROLES etc.) | use `FIRM_ROLE_LABELS[role]?.th` when the file already imports `@lawfirm/shared`; otherwise add `OFFICE_MANAGER: 'ผู้จัดการสำนักงาน'` |

- [ ] **Step 1:** Apply.
- [ ] **Step 2: Typecheck** `pnpm --filter mobile exec tsc --noEmit` (if the package name differs, use `cd apps/mobile && pnpm exec tsc --noEmit`). Expected: no new errors versus `decb472`. Record the baseline error count before editing.
- [ ] **Step 3: Run mobile tests if present** `cd apps/mobile && pnpm test --if-present -- --watchAll=false`
- [ ] **Step 4: Commit** `feat(mobile): capability-based gating and office manager labels`

---

### Task 8: Seed account + end-to-end check in the browser

**Files:**
- Modify: `apps/api/prisma/seed.ts` (add `office@lawfirm.com`, password `password123`, FirmMember role `OFFICE_MANAGER`, same pattern as the existing assistant at `:118`)
- Modify: `README.md` demo-accounts table

- [ ] **Step 1:** Add the seed user. Insert it into the local DB by running only the relevant upsert through a one-off script, or by running `pnpm --filter api prisma db seed` only if the seed is idempotent (check for upserts first).
- [ ] **Step 2:** Start the worktree preview (see memory: api on a free port with `.env` copied, web `.env.local` pointing to it) and log in as `office@lawfirm.com`. Verify:
  - The sidebar shows Reports, Team, Operations board, Invoices with receivables, Leaves pending, all cases.
  - Team invite picker offers SENIOR_LAWYER/LAWYER/ASSISTANT/EXTERNAL only, with no role-change or remove buttons.
  - Expenses shows only own items; no approve button. `/admin/reimbursements` is blocked.
  - Recording a payment on an invoice works.
  - Approving a leave works.
- [ ] **Step 3:** Commit `chore(seed): demo office manager account`

---

## Self-review notes
- Spec coverage:
  - Decisions 1–4 → Tasks 5, 3, 3, 4.
  - Labels → Tasks 1, 6, 7.
  - Rank → Task 1.
  - ai-usage fix → Task 4.
  - Non-goals untouched.
- Types: `FirmCapability` names are identical across all tasks. `RequireCapability`/`REQUIRE_CAPABILITY_KEY` are defined in Task 2 and used in Tasks 3–5.
