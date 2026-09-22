# Cargo Claim Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one Cargo Claim workspace that works from either Intake or direct Case creation, carries a 16-item document matrix, and accepts only lawyer-confirmed source-backed AI suggestions.

**Architecture:** Add a shared `CargoClaim` aggregate with optional unique Intake and Case links plus relational document requirements. A dedicated API module owns access checks, idempotent creation, updates, and checklist state; Intake and Case creation call that service. One reusable React panel renders the aggregate in Intake/Case contexts.

**Tech Stack:** Prisma/PostgreSQL, NestJS/class-validator, Next.js/React/TypeScript, Node test runner/Jest, existing document intelligence pipeline.

**Spec:** `docs/superpowers/specs/2026-09-22-cargo-claim-workspace-design.md`

## Global Constraints

- Preserve all non-Cargo Intake and Case behavior.
- Direct Case must not require an Intake.
- Intake and its paired Case must share one CargoClaim record.
- Never auto-confirm AI suggestions or time-bar conclusions.
- Keep existing user files and unrelated working-tree changes untouched.

---

### Task 1: Cargo domain and checklist catalog

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260922190000_cargo_claim_workspace/migration.sql`
- Create: `packages/shared/src/cargo-claim.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/cargo-claim.test.ts`

**Interfaces:**
- Produces `CARGO_DOCUMENT_REQUIREMENTS`, `CargoDocumentCode`, `CargoReviewStatus` and Prisma `CargoClaim`/`CargoDocumentRequirement`.

- [ ] Write a failing catalog test asserting 16 unique stable codes and conditional requiredness.
- [ ] Run `pnpm --filter @lawfirm/shared test -- cargo-claim` and verify RED.
- [ ] Add the catalog/types, Prisma models and reversible migration.
- [ ] Run shared tests and `pnpm --filter api prisma generate`.
- [ ] Commit domain changes.

### Task 2: Cargo API with access control

**Files:**
- Create: `apps/api/src/cargo-claims/dto/cargo-claim.dto.ts`
- Create: `apps/api/src/cargo-claims/cargo-claims.service.ts`
- Create: `apps/api/src/cargo-claims/cargo-claims.controller.ts`
- Create: `apps/api/src/cargo-claims/cargo-claims.module.ts`
- Create: `apps/api/src/cargo-claims/cargo-claims.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces `ensureForIntake`, `ensureForCase`, `attachCase`, `findForIntake`, `findForCase`, `updateForIntake`, `updateForCase`, and checklist update endpoints.

- [ ] Write failing service tests for idempotent ensure, shared Intake/Case id, 16 seeded requirements, and access rejection.
- [ ] Run the focused Jest spec and verify RED.
- [ ] Implement DTO validation, service, routes and module.
- [ ] Run focused tests and API typecheck.
- [ ] Commit API changes.

### Task 3: Connect Intake and direct Case creation

**Files:**
- Modify: `apps/api/src/intake/dto/intake.dto.ts`
- Modify: `apps/api/src/intake/intake.service.ts`
- Modify: `apps/api/src/intake/intake.module.ts`
- Modify: `apps/api/src/cases/dto/case.dto.ts`
- Modify: `apps/api/src/cases/cases.service.ts`
- Modify: `apps/api/src/cases/cases.module.ts`
- Test: `apps/api/src/cargo-claims/cargo-creation.spec.ts`

**Interfaces:**
- Intake accepts `cargoClaim`; Case accepts `cargoClaimEnabled` and `cargoClaim`; conversion calls `attachCase`.

- [ ] Write failing creation tests for TRANSPORT Intake and direct Cargo Case.
- [ ] Run the focused spec and verify RED.
- [ ] Implement nested DTOs and creation hooks without changing non-Cargo paths.
- [ ] Run focused Intake/Case/Cargo tests and API typecheck.
- [ ] Commit creation-path changes.

### Task 4: Reusable Cargo UI

**Files:**
- Create: `apps/web/src/components/cargo/CargoClaimFields.tsx`
- Create: `apps/web/src/components/cargo/CargoClaimPanel.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/(dashboard)/intake/new/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/intake/[id]/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/new/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`
- Modify: `apps/web/src/lib/case-tabs.ts`
- Test: `apps/web/src/lib/case-tabs.test.ts`

**Interfaces:**
- Produces Cargo API types/client methods, conditional creation fields, and a `cargo-claim` Case tab.

- [ ] Extend the tab test first and verify RED.
- [ ] Add typed API methods and reusable fact/checklist components.
- [ ] Wire Intake type selection, direct Case enablement, and the Case tab.
- [ ] Run web tests/typecheck and browser-check both entry paths at 320/768/1440px.
- [ ] Commit UI changes.

### Task 5: Source-backed Cargo suggestions

**Files:**
- Modify: `apps/api/src/intelligence/document-intelligence.service.ts`
- Modify: `apps/api/src/intelligence/field-suggestions.spec.ts`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/documents/SuggestedFieldsPanel.tsx`
- Modify: `apps/web/src/components/cargo/CargoClaimPanel.tsx`

**Interfaces:**
- Extends `FieldSuggestion.field` with Cargo facts; panel previews source filename/excerpt and applies only on explicit click.

- [ ] Add failing extraction/sanitization tests for Cargo fields and source excerpts.
- [ ] Run focused tests and verify RED.
- [ ] Extend extraction allowlist/prompt/type guards and Cargo apply UI.
- [ ] Run focused tests, complete API/web typechecks, full relevant suites, and browser regression.
- [ ] Commit final verified changes and review the diff.
