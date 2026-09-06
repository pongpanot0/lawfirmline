# Intake Document Repository — Design Spec

2026-09-06 · Case already has a full managed document repository (versioning, client-visibility toggle, download). Intake has none — only `IntakeAttachment` (already live on `main`), a narrow, unversioned attachment store built solely to feed the precedent-analysis AI feature. This spec gives Intake the same managed-document capability Case already has, as a genuinely separate, parallel system.

Captured from a `/grill-me` session — see the conversation for the full back-and-forth, including why extending `IntakeAttachment` itself (or migrating it into `Document`) was rejected.

## Goal

A staff member on an intake detail page can upload PDF/Word/etc. files as **official documents** — the same durable, versioned, client-visibility-toggleable kind Case already supports — separate from the lightweight PDF attachments already used to feed the AI precedent-analysis flow.

## Non-goals (explicitly out of scope for this iteration)

- **No migration of `IntakeAttachment`.** It is live on `main`, wired into `intake.controller.ts`, `intake.service.ts` (`uploadAttachment`/`deleteAttachment`), and `intake-precedent-analysis.service.ts` (reads attachment files to build LLM input). Migrating it into the model below would touch all three of those already-shipped, already-tested files for a schema-purity win only — not worth the regression risk. `IntakeAttachment` keeps doing its narrow job (ephemeral input to AI analysis, no versioning, no client visibility) untouched.
- No client-portal exposure. `visibleToClient` is added now (for parity with Case's `Document` model and so it's ready whenever the client portal grows an "intake status" file view), but nothing in this plan wires it into `client-portal-intake` or any `(client-portal)` page.
- No changes to `intake-precedent-notice-ai`'s own flow. The AI-analysis button still only reads from `IntakeAttachment`, unchanged.

## Why reuse `Document` instead of building `IntakeDocument`

`Document` already has every field this needs: `filename`, `storagePath`, `mimeType`, `version` + `DocumentVersion` history, `visibleToClient`. Duplicating that shape into a new `IntakeDocument` model (and a matching `IntakeDocumentVersion`) would mean maintaining two near-identical version-history systems forever. Instead:

- `Document.caseId` becomes **nullable**.
- `Document.intakeId` is added, **nullable**, FK → `Intake`.
- Exactly one of `caseId` / `intakeId` must be set on any row — enforced with a database `CHECK` constraint (Prisma's schema DSL has no native support for this, so the constraint is added via raw SQL in the generated migration — see Task 1).
- When an intake with attached `Document` rows converts to a Case (`IntakeService.convertToCase`), those `Document.intakeId` rows simply get `caseId` set — no file move, no copy, the file on disk never moves. This mirrors the existing pattern (assessment notes text is already folded into `Case.description` on conversion) but for files it's cheaper: literally just re-pointing a foreign key.

## Data model

```
Document (change)
  caseId    String?     // was required, now nullable
  intakeId  String?     // new, nullable, FK -> Intake

  CHECK ((case_id IS NOT NULL) OR (intake_id IS NOT NULL))   -- exactly one owner, enforced at the DB
```

`DocumentVersion` is untouched — it already keys off `documentId`, not `caseId`, so it works unchanged for intake-owned documents.

## API surface

New, parallel to the existing `cases/:caseId/documents` routes:

```
GET    /intake/:intakeId/documents
POST   /intake/:intakeId/documents               (multipart, field name "file")
POST   /intake/:intakeId/documents/:documentId/versions   (multipart, field name "file")
PATCH  /intake/:intakeId/documents/:documentId/visibility
GET    /intake/:intakeId/documents/:documentId/download
```

Same shape and behavior as the Case document routes (`documents.controller.ts`), scoped to `intakeId` instead of `caseId`. Firm-scoping is done the same way `IntakeService` already scopes every other intake sub-resource: verify `intake.firmId === user.firmId` in the service layer (there is no `IntakeAccessGuard` equivalent to `CaseAccessGuard` in this codebase — intake endpoints have never used a request-level access guard, they scope in the service).

## Conversion behavior

On `convertToCase()` (both the "create new case" branch and the "attach to existing case" branch added by the sibling `intake-process-variations` plan, if that plan has landed first — if not, only the "create new case" branch exists yet and this plan's Task 4 only needs to touch that one), re-point every `Document` row with `intakeId = <this intake>` to `caseId = <destination case>` and clear `intakeId` to `null` (a document belongs to exactly one owner — once it's a case document, it stops being an intake document). This is a single `updateMany`, not a loop.

## Field/route names (locked)

`Document.intakeId`, `Document.caseId` (nullable), route prefix `intake/:intakeId/documents`, controller `IntakeDocumentsController`, service methods `findByIntake`, `uploadForIntake`, `uploadNewVersionForIntake`, `updateVisibilityForIntake`, `getFilePathForIntake` on the existing `DocumentsService`.

## Edge cases / risks

- **Existing queries assuming `Document.caseId` is always present**: `documents.service.ts` (`findByCase`, `verifyDocument`, `getFilePath`, `updateVisibility`) and `document-publication.service.ts` already filter by an explicit `caseId` value, so a nullable column doesn't change their behavior — they simply never match intake-owned rows (which have `caseId = null`), which is correct (case routes should never surface intake documents and vice versa).
- **The CHECK constraint must allow the existing 100% case-owned rows to pass silently** — every existing `Document` row already has `caseId` set and `intakeId` will default to `null`, so the constraint `(case_id IS NOT NULL) OR (intake_id IS NOT NULL)` is satisfied by 100% of existing data without a backfill step.
