# Custom Fields (Case + Client) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any firm member add their own (personal) custom fields and let owners/managers add firm-wide custom fields on Cases and Clients, with required firm fields blocking stage advance.

**Architecture:** New `CustomFieldDefinition` table holds metadata; values stay in JSONB (`Case.customFields` existing, `Client.customFields` new) keyed by an immutable generated key. One pure rules module (`custom-field-rules.ts`) owns validation, visibility, redaction and patch-merge; every reader and writer goes through it. Legacy `CaseType.fieldSchema` and system keys are untouched (add-only).

**Tech Stack:** NestJS 11 + Prisma (Postgres 16 JSONB), Next.js 15 web, Expo mobile, Jest.

**Spec:** `docs/research/2026-11-14-case-custom-fields.md` (sections "TL;DR และ MVP" and "Owner decisions (2026-11-14)").

## Global Constraints

- Add-only: do not change existing `Case` columns, `CaseQueryDto` filters, `CaseType.fieldSchema`, or the system keys `incidentDate`, `estimatedDamage`, `chargeSection`, `prosecutor`.
- Visibility: `PERSONAL` = only the creator sees/edits the definition and its values; `FIRM` = everyone with access to the record. Anyone may create PERSONAL; FIRM create/edit/archive requires capability `manageFirmContent`.
- Required: only `FIRM` + `CASE` definitions may be `required`; required means "must be filled before advancing the stage" (draft case still opens). `0` and `false` count as filled.
- `isSensitive` is set by the field's creator; sensitive values are never sent to AI context, MCP, or the client portal.
- MVP types: `TEXT`, `LONG_TEXT`, `NUMBER`, `DATE` (`YYYY-MM-DD` string), `SELECT` (stores option id), `BOOLEAN`.
- Key is generated `cf_` + 8 lowercase base36 chars, immutable; label/option renames never touch stored values. Type is immutable after create.
- Limits: 100 non-archived definitions per firm per entityKind (FIRM), 30 PERSONAL per user per entityKind, 50 options per SELECT, TEXT ≤ 500 chars, LONG_TEXT ≤ 5000 chars.
- Pricing (owner-approved 2026-11-14): plan `FREE` (and not `planGrandfathered`) may hold at most 5 non-archived definitions per firm in total (all visibilities, both entities); the 6th create → 403 `{ code: PLAN_LIMIT_CUSTOM_FIELDS, message }` (new constant in `packages/shared/src/index.ts` beside `PLAN_LIMIT_CASES`; message names no price or link, App Store 3.1.1). All paid plans get the full feature. Value-change history is read through the existing Audit Log page, already gated by `hasAuditLogs` (Professional) — no new gate.
- Migrations: one additive migration; locally apply via `psql` + `prisma migrate resolve --applied` — never `migrate dev`, never a shadow DB.
- Tests: `pnpm --filter api exec jest --runInBand <path>`; rebuild `packages/shared` dist (`pnpm --filter @lawfirm/shared build`) before API tests.
- UI: lucide icons only; Thai copy through the thai-translate skill; every button has a hint; buttons/chips/tabs never wrap; mockups approved in Stitch before UI code (Task 8).
- Never commit from Codex runs; Claude reviews and commits.

## Review Focus

1. A user saves the case overview form (which sends `customFields` wholesale) while another user's PERSONAL value exists on the case → the other user's value must survive. (Task 4)
2. Required NUMBER field set to `0` or BOOLEAN set to `false` → counts as filled; stage advance allowed. (Task 6)
3. A field is archived while cases hold values → values kept in DB, hidden from forms, no longer required. (Tasks 3, 6)
4. User B opens a case/list/AI analysis where user A has PERSONAL values → those keys are absent from B's response. (Task 5)
5. A PATCH names a key from another firm, an archived field, or an unknown `cf_` key → 400, nothing written. (Task 4)

---

### Task 1: Schema + migration [Sol]

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (new enums + model; `Client.customFields Json?`; back-relations on `Firm`, `User`)
- Create: `apps/api/prisma/migrations/20261115000000_custom_field_definitions/migration.sql`

**Interfaces:**
- Produces:
```prisma
enum CustomFieldEntity { CASE CLIENT }
enum CustomFieldVisibility { FIRM PERSONAL }
enum CustomFieldType { TEXT LONG_TEXT NUMBER DATE SELECT BOOLEAN }
model CustomFieldDefinition {
  id          String                @id @default(uuid())
  firmId      String
  entityKind  CustomFieldEntity
  visibility  CustomFieldVisibility
  ownerUserId String?               // set iff PERSONAL
  key         String                // immutable "cf_xxxxxxxx"
  label       String
  type        CustomFieldType
  options     Json?                 // SELECT: [{ id: string, label: string, archived?: boolean }]
  required    Boolean   @default(false)
  caseTypeIds String[]              // CASE only; [] = all case types
  section     String?
  sortOrder   Int       @default(0)
  helpText    String?
  isSensitive Boolean   @default(false)
  archivedAt  DateTime?
  createdById String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  // relations: firm (Cascade), owner User? (Cascade), createdBy User
  @@unique([firmId, key])
  @@index([firmId, entityKind])
}
```

- [ ] **Step 1:** Edit schema; write the migration SQL by hand (CREATE TYPE ×3, CREATE TABLE, indexes, FKs, `ALTER TABLE "Client" ADD COLUMN "customFields" JSONB`).
- [ ] **Step 2:** Verify: `pnpm --filter api exec prisma validate` → "The schema ... is valid"; `pnpm --filter api exec prisma generate` succeeds.
- [ ] **Step 3:** Apply locally: `psql "$DATABASE_URL" -f <migration.sql>` then `pnpm --filter api exec prisma migrate resolve --applied 20261115000000_custom_field_definitions`. Expected: `\d "CustomFieldDefinition"` lists the columns.

### Task 2: Shared types + rules module [Sol]

**Files:**
- Modify: `packages/shared/src/index.ts` (add types below, next to `CaseFieldSchema`)
- Create: `apps/api/src/custom-fields/custom-field-rules.ts`
- Test: `apps/api/src/custom-fields/custom-field-rules.spec.ts`

**Interfaces:**
- Produces (shared):
```ts
export type CustomFieldEntity = 'CASE' | 'CLIENT';
export type CustomFieldVisibility = 'FIRM' | 'PERSONAL';
export type CustomFieldType = 'TEXT' | 'LONG_TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN';
export interface CustomFieldOption { id: string; label: string; archived?: boolean }
export interface CustomFieldDefinitionDto { id: string; entityKind: CustomFieldEntity; visibility: CustomFieldVisibility; ownerUserId: string | null; key: string; label: string; type: CustomFieldType; options: CustomFieldOption[]; required: boolean; caseTypeIds: string[]; section: string | null; sortOrder: number; helpText: string | null; isSensitive: boolean; archivedAt: string | null }
export type CustomFieldValue = string | number | boolean | null;
export const RESERVED_CUSTOM_FIELD_KEYS = ['incidentDate', 'estimatedDamage', 'chargeSection', 'prosecutor'] as const;
```
- Produces (api, pure, no Prisma):
  - `generateFieldKey(): string` → matches `/^cf_[a-z0-9]{8}$/`
  - `canSee(def, userId): boolean` — FIRM → true; PERSONAL → `def.ownerUserId === userId`
  - `validateValue(def, raw: unknown): { ok: true; value: CustomFieldValue } | { ok: false; error: string }` — `null`/`''` → `null`; type rules + length limits from Global Constraints; SELECT must be a non-archived option id; DATE must be valid `YYYY-MM-DD`.
  - `redactCustomFields(values: unknown, defs, userId, ctx: 'app' | 'ai' | 'portal' | 'mcp'): Record<string, unknown>` — drops keys of defs the user can't see; in `ai`/`portal`/`mcp` also drops `isSensitive` defs and all PERSONAL defs; keys with no definition (legacy/system) pass through unchanged.
  - `mergeCustomFieldPatch(existing: unknown, patch: Record<string, unknown>, defs, userId): { values: Record<string, unknown>; changes: { key: string; from: unknown; to: CustomFieldValue }[] }` — throws `BadRequestException` listing every bad key (unknown `cf_` key, not visible, archived, invalid value); reserved and non-`cf_` keys are copied as-is; untouched existing keys always preserved; `null` deletes the key.
  - `isFilled(def, value): boolean` — `0` and `false` filled; `null`, `undefined`, whitespace string not filled.

- [ ] **Step 1: Failing tests** in `custom-field-rules.spec.ts`:
  - `merge keeps another user's personal value`: existing `{cf_a: 'x', cf_b: 'mine-of-A'}`, defs cf_a FIRM, cf_b PERSONAL owner A, user B patches `{cf_a: 'y'}` → values `{cf_a: 'y', cf_b: 'mine-of-A'}`.
  - `merge rejects invisible/archived/unknown keys`: B patches `{cf_b: 1}` / archived key / `cf_zzzzzzzz` → throws, message contains each key.
  - `validateValue`: NUMBER `'12'` → error, `12` → ok; DATE `'2026-02-30'` → error; SELECT archived option → error; TEXT 501 chars → error.
  - `redact`: user B sees no cf_b; ctx `ai` drops sensitive FIRM key; `incidentDate` passes through.
  - `isFilled`: `0` true, `false` true, `'  '` false.
- [ ] **Step 2:** Run `pnpm --filter api exec jest --runInBand src/custom-fields/custom-field-rules.spec.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement; build shared (`pnpm --filter @lawfirm/shared build`).
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(custom-fields): shared types and value rules`.

### Task 3: Definitions CRUD API [Sol]

**Files:**
- Create: `apps/api/src/custom-fields/{custom-fields.module.ts,custom-fields.controller.ts,custom-fields.service.ts,dto/custom-field.dto.ts}`; register module in `apps/api/src/app.module.ts`
- Test: `apps/api/src/custom-fields/custom-fields.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 `generateFieldKey`, `canSee`, shared DTO type.
- Produces: `CustomFieldsService.listVisible(user: AuthUser, entityKind: CustomFieldEntity, opts?: { includeArchived?: boolean }): Promise<CustomFieldDefinitionDto[]>` (ordered `section, sortOrder, createdAt`) — used by Tasks 4–7.
- Routes (all `JwtAuthGuard`): `GET /custom-fields?entityKind=CASE&includeArchived=true`, `POST /custom-fields`, `PATCH /custom-fields/:id`, `POST /custom-fields/:id/archive`, `POST /custom-fields/:id/restore`, `PUT /custom-fields/order` (`{ ids: string[] }`).
- Create DTO: `entityKind, visibility, label (1–80), type, options?: {label}[] (SELECT only, 1–50), required?, caseTypeIds?, section? (≤60), helpText? (≤200), isSensitive?`. Update DTO: same minus `entityKind, visibility, type`; options update keeps ids, new options get ids, removed options become `archived: true`.

- [ ] **Step 1: Failing tests:** PERSONAL create by plain member → `ownerUserId = user.id`; FIRM create without `manageFirmContent` → 403; `required: true` on PERSONAL or CLIENT → 400; `caseTypeIds` from another firm → 400; editing another user's PERSONAL → 404; listVisible for user B excludes A's PERSONAL; 31st PERSONAL → 400; archive keeps row with `archivedAt`; FREE firm 6th definition → 403 `PLAN_LIMIT_CUSTOM_FIELDS`, FREE firm with 1 archived + 4 active can still create; grandfathered FREE unlimited.
- [ ] **Step 2:** Run spec → FAIL.
- [ ] **Step 3:** Implement (firm scoping via `user.firmId` on every query; capability check via `hasFirmCapability(user.firmRole, 'manageFirmContent')` for FIRM).
- [ ] **Step 4:** Run spec → PASS.
- [ ] **Step 5:** Commit `feat(custom-fields): definitions API`.

### Task 4: Value writes (Case + Client) + fix wholesale overwrite [Sol]

**Files:**
- Modify: `apps/api/src/cases/cases.service.ts` (`update()` near line 894/913), `apps/api/src/cases/cases.controller.ts`, `apps/api/src/clients/clients.service.ts`, `apps/api/src/clients/clients.controller.ts`
- Test: `apps/api/src/cases/case-custom-fields.spec.ts`, extend `apps/api/src/clients/clients.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 `mergeCustomFieldPatch`; Task 3 `listVisible` (with archived, for validation).
- Produces: `PATCH /cases/:id/custom-fields` and `PATCH /clients/:id/custom-fields`, body `{ values: Record<string, CustomFieldValue> }`, response `{ customFields: Record<string, unknown> }` (already redacted, ctx `app`). Case access via `caseAccess.canAccessCase`; client via existing firm scoping. Each change writes `auditLog` row `action: 'CUSTOM_FIELD_VALUE_CHANGED'`, `metadata: { entity, recordId, key, label, from, to }` — sensitive fields log `from/to` as `'[hidden]'`.
- `cases.service.update()`: when `dto.customFields` is present, compute values with `mergeCustomFieldPatch(before.customFields, dto.customFields, defs, user.id)` instead of writing the object as-is.

- [ ] **Step 1: Failing tests:** Review Focus #1 (overview save keeps A's personal value); #5 (foreign/archived/unknown key → 400, DB unchanged); audit row created per changed key; legacy `chargeSection` via overview still saved.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run + existing `cases.service.spec.ts`, `clients.service.spec.ts` → PASS.
- [ ] **Step 5:** Commit `feat(custom-fields): value writes with merge and audit`.

### Task 5: Read redaction [Sol]

**Files:**
- Modify: `apps/api/src/cases/cases.service.ts` (list select ~263, ~401; `findOne`), `apps/api/src/clients/clients.service.ts` (`findOne`, list), `apps/api/src/clients/client-360.service.ts`, `apps/api/src/intake/intake-precedent-analysis.service.ts:521` (ctx `ai`)
- Test: `apps/api/src/cases/case-custom-fields.spec.ts` (extend), `apps/api/src/intake/intake-precedent-analysis.service.spec.ts` if present else new spec

**Interfaces:** Consumes Task 2 `redactCustomFields`, Task 3 `listVisible`.

- [ ] **Step 1: Failing tests:** Review Focus #4 for case detail, case list, client detail, and AI precedent input (sensitive FIRM key absent too). Grep check: `grep -rn "customFields" apps/api/src/mcp apps/api/src/client-portal` returns nothing (document result in the commit message; if anything returns, redact with ctx `mcp`/`portal`).
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(custom-fields): redact personal and sensitive values on read`.

### Task 6: Stage-advance gate [Sol]

**Files:**
- Modify: `apps/api/src/cases/case-info.ts` (`missingCaseInfo`), `apps/api/src/cases/cases.service.ts` (`journeyState` ~436 and list ~327 pass definitions)
- Test: `apps/api/src/cases/case-info.spec.ts`

**Interfaces:**
- `missingCaseInfo(legalCase, fieldSchema, definitions: Pick<CustomFieldDefinitionDto,'key'|'label'|'required'|'caseTypeIds'|'archivedAt'|'visibility'|'entityKind'|'type'>[] = [])` — appends labels of FIRM, CASE, required, non-archived definitions whose `caseTypeIds` is empty or contains `legalCase.caseTypeId`, and that are not `isFilled`. Legacy behaviour unchanged.

- [ ] **Step 1: Failing tests:** required NUMBER `0` → not missing; BOOLEAN `false` → not missing; empty → label listed; archived → not listed; caseTypeIds mismatch → not listed; PERSONAL `required` (bad data) ignored; existing tests untouched.
- [ ] **Step 2–4:** fail → implement → pass (`case-info.spec.ts`, `case-progress*.spec.ts`).
- [ ] **Step 5:** Commit `feat(custom-fields): required firm fields gate stage advance`.

### Task 7: List filter [Sol]

**Files:** Modify `apps/api/src/cases/dto/case.dto.ts` (`CaseQueryDto`), `apps/api/src/cases/cases.service.ts` (list where), clients list DTO/service. Test: `apps/api/src/cases/case-custom-fields.spec.ts`.

**Interfaces:** query param `cf` = JSON string `{ "<key>": <value> | "__empty" }`, max 5 keys; only keys visible to the user; builds Prisma `customFields: { path: [key], equals: value }` (AND); `__empty` → `OR [{ path, equals: Prisma.AnyNull }, { NOT: { customFields: { path: [key], not: Prisma.AnyNull } } }]` — implementer verifies against the local DB. Range filters are out of scope (later phase).

- [ ] **Step 1: Failing tests:** invisible key → 400; malformed JSON → 400; SELECT option id equality builds expected where.
- [ ] **Step 2–4:** fail → implement → pass. Manual check against local DB: `GET /cases?cf={"cf_x":"opt1"}` returns only matching cases.
- [ ] **Step 5:** Commit `feat(custom-fields): filter cases and clients by custom field`.

### Task 8: Stitch mockups — approval gate [Claude]

- [ ] Run better-* skills + thai-translate on: (a) `/settings/custom-fields` (tabs สำนวน/ลูกความ; sections "ของฉัน" and "ของสำนักงาน"; create/edit drawer with type picker, options, required, case types, sensitive toggle; archive/restore; drag order), (b) case detail "ข้อมูลเพิ่มเติม" section with inline edit + missing-required badge, (c) Client360 panel section, (d) case list filter chip, (e) mobile case + client detail section.
- [ ] Show the user; wait for approval; download approved screens to scratchpad for Terra.

### Task 9: Web UI [Terra]

**Files:** Create `apps/web/src/app/(dashboard)/settings/custom-fields/page.tsx`, `apps/web/src/components/custom-fields/{CustomFieldInput.tsx,CustomFieldsSection.tsx,CustomFieldEditor.tsx}`; Modify `apps/web/src/lib/api.ts`, `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`, `apps/web/src/components/clients/Client360Panel.tsx`, cases list filter, settings nav. Keep `CaseOverviewForm.tsx` legacy fieldSchema inputs as-is.

**Interfaces:** Consumes Tasks 3, 4, 7 routes. `CustomFieldInput({ def, value, onChange, disabled })` renders by type; `CustomFieldsSection({ entityKind, recordId, values, caseTypeId? })` groups by `section`, inline-saves one key per PATCH, shows API error text.

- [ ] Steps: build to the approved mockups 1:1; `pnpm --filter web lint && pnpm --filter web exec tsc --noEmit` clean; component test for `CustomFieldInput` (NUMBER emits number, BOOLEAN emits boolean, empty emits null); commit.

### Task 10: Mobile [Terra]

**Files:** Modify `apps/mobile/app/case/[id].tsx` (or its section component), `apps/mobile/app/clients/[id].tsx`; create a shared `CustomFieldsSection` under the mobile components folder; reuse mobile API client.

- [ ] Steps: read + edit the 6 types (no builder on mobile); DATE uses the existing mobile date picker; typecheck clean; commit.

### Task 11: Verification [Claude → Terra E2E → Cursor]

- [ ] Claude diff review + full API jest for touched folders (`--runInBand`).
- [ ] Terra Playwright click-through on local web: member creates PERSONAL field, owner creates FIRM required NUMBER field for one case type, fill `0`, advance stage succeeds; second user cannot see first user's personal value; archive field → value hidden, advance not blocked. ≤12 screenshots + report in scratchpad.
- [ ] Cursor review (`auto`), route real findings back, re-run tests.

**Later phase (separate plan):** CSV export/import, document-template merge variables, MCP field discovery, number/date range filters, conditional visibility, multi-select, money/currency, sort by custom field.
