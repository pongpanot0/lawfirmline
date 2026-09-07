# Task Visibility by Role — Design Spec

**Date:** 2026-09-06
**Status:** Approved, pending implementation plan

Request: on every page that lists tasks, an `OWNER` should see every task in the firm, a `SENIOR_LAWYER` should see every `LAWYER`'s tasks (firm-wide), and a `LAWYER` should see only their own tasks. Today there is no `SENIOR_LAWYER`/`LAWYER` firm role at all (`FirmRole` is only `OWNER`/`ASSISTANT`), and task listing has no role-based filter — `findByCase` returns every task on an accessible case, and `findMine` (standalone `/todos`) always returns only the caller's own tasks regardless of role.

## Scope

**In scope:**
- Add `SENIOR_LAWYER` and `LAWYER` to `FirmRole` (schema + shared enum + migration). `ASSISTANT` is unaffected in meaning and is subject to the same "own tasks only" rule as `LAWYER`.
- A single shared task-visibility filter, applied to every task-listing read path: case task board, case detail's embedded task panel, standalone `/todos`, and dashboard task counts.
- Expand `CaseAccessService` so `SENIOR_LAWYER` can open any case that has a `LAWYER` staffed on it (lead or buddy) — needed so the task filter has a case to apply within.
- A role-assignment endpoint (`PATCH /saas/members/:userId/role`) and Team-page UI, since no way to assign the new roles exists today (invite only offers `ASSISTANT`, and there's no edit-role control on an existing member).
- Fix the two binary owner/assistant label ternaries (`team/page.tsx`'s `firmRoleLabel`, `LexFlowSidebar.tsx`'s nav role label) so a 3rd/4th role doesn't silently mislabel as "Assistant".

**Out of scope:**
- Per-case seniority (`Case.leadLawyerId` / `Buddy` assignments) is untouched — this adds a firm-wide tier on top, not a replacement.
- Data backfill/migration of existing members — new enum values are additive; existing rows stay `OWNER`/`ASSISTANT` until an owner explicitly reassigns someone via the new UI.
- Operations on-hold list (`/operations`) — already `@OwnerOnly()`, so the filter always resolves to "no restriction" there; no code change needed.
- Any change to `Role` (the separate legacy ADMIN/LAWYER enum on `User`) — unrelated to `FirmRole`.

## Role model

```prisma
enum FirmRole {
  OWNER
  SENIOR_LAWYER
  LAWYER
  ASSISTANT
}
```
Mirrored in `packages/shared/src/index.ts`. Requires a Prisma migration (additive enum values, no column changes).

## Case-level access expansion

`CaseAccessService.getCaseFilterForUser` and `canAccessCase` (`apps/api/src/common/services/case-access.service.ts`) currently grant non-owner access via `leadLawyerId === user.id`, buddy `assignments`, or an assigned `task`. Add a `SENIOR_LAWYER`-only branch: also match any case whose lead lawyer or any buddy assignment belongs to a user whose `FirmMember.role` (for the same `firmId`) is `LAWYER`.

```ts
getCaseFilterForUser(user: AuthUser): Prisma.CaseWhereInput {
  const tenantFilter = { firmId: user.firmId };
  if (user.firmRole === FirmRole.OWNER) return tenantFilter;

  const staffedOrAssigned = [
    { leadLawyerId: user.id },
    { assignments: { some: { userId: user.id } } },
    { tasks: { some: { assigneeId: user.id } } },
  ];

  if (user.firmRole === FirmRole.SENIOR_LAWYER) {
    return {
      ...tenantFilter,
      OR: [
        ...staffedOrAssigned,
        { leadLawyer: { firmMemberships: { some: { firmId: user.firmId, role: FirmRole.LAWYER } } } },
        { assignments: { some: { user: { firmMemberships: { some: { firmId: user.firmId, role: FirmRole.LAWYER } } } } } },
      ],
    };
  }

  return { ...tenantFilter, OR: staffedOrAssigned };
}
```
`canAccessCase` gets the equivalent boolean version. `LAWYER`/`ASSISTANT` behavior is unchanged.

## Task visibility filter

New method on `CaseAccessService` (kept alongside the analogous case filter rather than a new service, since both are "shape a Prisma `where` by role" helpers used by the same callers):

```ts
getTaskFilterForUser(user: AuthUser): Prisma.TaskWhereInput {
  if (user.firmRole === FirmRole.OWNER) return {};
  if (user.firmRole === FirmRole.SENIOR_LAWYER) {
    return {
      OR: [
        { assigneeId: user.id },
        { assignee: { firmMemberships: { some: { firmId: user.firmId, role: FirmRole.LAWYER } } } },
      ],
    };
  }
  // LAWYER / ASSISTANT
  return { assigneeId: user.id };
}
```

Applied (AND-merged with each call site's existing predicates) at:

- `TasksService.findByCase(caseId, user)` — `tasks.controller.ts` passes `@CurrentUser()` through.
- `TasksService.findMine(user)` (standalone `/todos`) — additionally scoped to `caseId: null` and, regardless of role, `assignee: { firmMemberships: { some: { firmId: user.firmId } } }` so a match can't cross firm boundaries (today's version avoided this only because it always filtered to `assigneeId: user.id`).
- `CasesService.findOne` — the embedded `tasks` include gets `where: taskFilter` so the case detail page's task panel matches what the tasks tab shows.
- `DashboardService` — `myTasks`/`overdueTasks` counts merge in the filter, replacing the current ad-hoc `isOwner` widening (`dashboard.service.ts:46-62`) with a call to the shared helper.

No change to `OperationsService.getOnHoldTasks` (owner-only endpoint, filter always resolves to `{}`).

## Role assignment

**Backend:**
- `PATCH /saas/members/:userId/role` in `saas.controller.ts`, `@OwnerOnly()`.
- `UpdateMemberRoleDto { role: FirmRole }` (`@IsEnum(FirmRole)`) in `saas.dto.ts`.
- `TenantService.updateMemberRole(firmId, userId, role, actingUser)` — rejects (same pattern as `removeMember`'s last-owner guard) if it would demote the firm's only remaining `OWNER`.
- `InviteUserDto.role` already accepts any `FirmRole`; no backend change needed there.

**Frontend (`team/page.tsx`):**
- Invite `<select>` offers all 4 roles instead of only `ASSISTANT`.
- Each member row gets an owner-only role `<select>` (disabled for the acting user's own row and for the last remaining owner) that calls the new endpoint.
- `firmRoleLabel()` becomes a 4-way lookup instead of the `OWNER : ASSISTANT` ternary.
- `LexFlowSidebar.tsx`'s nav role-label ternary gets the same 4-way lookup, with new Thai/English strings for "Senior Lawyer"/"Lawyer" added to the existing locale dict.

## Testing

- Extend `apps/api/src/tasks/tasks.service.spec.ts` with listing/visibility cases: `OWNER` sees all, `SENIOR_LAWYER` sees own + all `LAWYER` tasks, `LAWYER`/`ASSISTANT` see only their own, for both `findByCase` and `findMine`.
- Extend `apps/api/src/common/services/case-access.service.spec.ts` (or equivalent) for the new `SENIOR_LAWYER` case-access branch.
- Add a test for `TenantService.updateMemberRole`'s last-owner guard.
- Manual QA: Team page role assignment end-to-end, and the four task-listing surfaces (`/todos`, case tasks tab, case detail panel, dashboard counts) as each role.
