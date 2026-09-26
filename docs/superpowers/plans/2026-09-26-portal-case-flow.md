# Portal → Case Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A request a client submits through the portal becomes a PRE_LITIGATION case the client can see, and firm owners are told about it on LINE. The case eye toggle actually publishes a document to the client. Files the client uploads land as case documents, with prefilled details and a date suggestion for the lawyer to confirm.

**Architecture:** Each change extends the module that already owns it. `client-portal` handles submit and upload. `cases` provides case creation internals. `documents` owns publications and the new buffer-based create path. `intelligence` provides the `DocumentDateSuggestion` rows. `notifications` provides `notifyFirmOwners`/`notifyAssigned`. One migration.

**Spec:** `docs/superpowers/specs/2026-09-26-portal-case-flow-design.md`

## Global Constraints
- AI never runs automatically. Prefill uses only data the client typed in.
- Portal endpoints use the existing portal guard and `@CurrentPortalUser()`. The contact must have `ContactCaseAccess` for the case, or the request is refused. Scope everything by the portal user's `firmId` and `clientId`.
- LINE and other notifications run after the transaction commits, inside try/catch, and never throw into the request.
- There is one migration, `20260926300000_portal_case_flow`, generated with `prisma migrate diff` between the old and new schema files. Keep the schema.prisma diff to the new lines only. Never run migrate dev, deploy or reset against the shared DB.
- Tests: `cd apps/api && npx jest --config jest.config.js <path>`. Typecheck api, web and mobile with `npx tsc --noEmit`.
- Never use git stash. Never commit `apps/web/tsconfig.tsbuildinfo`. Stage files by explicit path. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Schema

**Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260926300000_portal_case_flow/migration.sql`

**Produces:**
- `PortalIntakeSubmission.caseId String? @unique`, with relation `case Case? @relation(fields: [caseId], references: [id], onDelete: SetNull)`, plus the back-relation on Case.
- `Document.uploadedById` becomes optional (`String?`, `uploadedBy User?`).
- `Document.uploadedByContactId String?`, with relation `uploadedByContact ClientContact? @relation(fields: [uploadedByContactId], references: [id], onDelete: SetNull)`, plus the back-relation on ClientContact.

Steps:
- [ ] Before editing, grep every reader of `document.uploadedBy` / `uploadedById` in apps/api/src and apps/web/src. Fix any code that would break now the field is nullable, for example `uploadedBy.firstName` becomes `uploadedBy?.firstName ?? contact name`. Web types get `uploadedBy?: … | null` and `uploadedByContact?: { name } | null`.
- [ ] Run `prisma format` and `validate`, generate the migration with `migrate diff`, then `prisma generate`. Run api `tsc`, then the documents, client-portal and intake specs.
- [ ] Commit `feat(db): portal submissions link to cases; documents can come from a client contact`.

### Task 2: Portal submit creates the case and notifies owners

**Files:**
- `apps/api/src/client-portal/client-portal-intake.service.ts` (submit, ~L32-74) and its spec
- `apps/api/src/cases/cases.service.ts`: expose an internal `createForPortal(tx, { firmId, clientId, title, description, leadLawyerId }): Promise<Case>` that reuses the numbering and defaults of `create` (~L271). Refactor the shared part into one private function rather than duplicating it.
- `apps/api/src/documents/documents.service.ts`: add `createFromClientBuffer(tx, { caseId, contactId, filename, buffer, mimeType, category?, description? })`. Mirror the existing `createFromBuffer`: document → storage key → put → version → case feed, but set `uploadedByContactId` and leave `uploadedById` null.
- `apps/api/src/intake/intake.service.ts`: `listPortalSubmissions` adds `caseId: null`.
- Module DI: import CasesModule, DocumentsModule and NotificationsModule into ClientPortalModule. Use `forwardRef` if needed, and keep `app.module.spec.ts` green.

**Behaviour:**
- Inside one `$transaction`:
  1. Create the submission (existing code).
  2. Resolve `leadLawyerId` as the firm's first OWNER member, ordered by `createdAt`.
  3. Call `createForPortal`.
  4. Update the submission with `caseId`.
  5. Upsert `ContactCaseAccess` for the contact (check the model's required fields).
  6. For each uploaded file, call `createFromClientBuffer` instead of, or in addition to, `PortalIntakeAttachment`. Keep writing `PortalIntakeAttachment` if the existing portal request view reads it; otherwise document why it was dropped.
  7. If the DTO has `keyDate`, create a PENDING `DocumentDateSuggestion` on the case. Inspect the model's required fields; if it needs a documentId or ruleId, attach it to the first adopted document, or skip the date suggestion when there is no document and record that as a ruling in the report.
  8. Log a case feed entry: `ลูกความส่งคำขอผ่านพอร์ทัล`.
- After the transaction, call `notifyFirmOwners({ firmId, actorUserId: '', summaryText: \`คำขอใหม่จากลูกความ ${clientName}: ${title}\`, entityPath: \`/cases/${caseId}\` })` inside try/catch.
- The response includes `caseId` and the case ref.
- DTO adds optional `keyDate` (`@IsDateString`) and `keyDateLabel` (`@MaxLength(100)`).

- [ ] TDD specs:
  - submit creates a case with PRE_LITIGATION stage, the owner as lead, the submission linked, and access granted
  - files become case documents with `uploadedByContactId`
  - `notifyFirmOwners` is called once, after the transaction
  - a notifier throw doesn't fail the submit
  - `keyDate` creates a PENDING suggestion
  - with no OWNER in the firm, the call throws BadRequest `'สำนักงานยังไม่มีเจ้าของบัญชี'`
- [ ] Implement, run the client-portal, intake, cases, documents and app.module specs plus tsc, then commit `feat(portal): client requests open a pre-litigation case and alert owners`.

### Task 3: Client upload endpoint, prefill, and the eye toggle publishes

**Files:**
- `apps/api/src/client-portal/client-portal.controller.ts` (or a new `client-portal-documents.controller.ts`), with its service and spec
- `apps/api/src/documents/documents.service.ts` (~L527 visibility) and `document-publication.service.ts`, with their specs
- `apps/api/src/client-portal/client-portal.service.ts` `getCase`: add `clientUploads` (documents on the case where `uploadedByContactId` is set and `clientId` matches) next to the published documents.

**Behaviour:**
- `POST client-portal/cases/:caseId/documents`:
  - Accepts multipart with `file`, plus optional `docType` (`@IsIn` a client-allowed subset of DocumentCategory; pick sensible values from the enum and list them in the report), `note` (`@MaxLength(500)`), `keyDate` (`@IsDateString`) and `keyDateLabel` (`@MaxLength(100)`).
  - Checks `ContactCaseAccess`, then calls `createFromClientBuffer`.
  - Creates a PENDING date suggestion when `keyDate` is set, with label `keyDateLabel ?? 'วันที่จากลูกความ'`.
  - Notifies the lead lawyer and the owners via `notifyAssigned` with `ลูกความอัปโหลดเอกสาร ${filename} ในคดี ${ref}` and link `/cases/${id}?tab=documents`.
  - Reuses the file size and mime limits of the existing portal intake upload.
- Eye toggle `PATCH cases/:caseId/documents/:documentId/visibility`:
  - `{visible:true}` → `DocumentPublicationService.publish(user, caseId, documentId, { latest version, no recipient restriction })`. Honour the same role rule as the publish endpoint (ADMIN/OWNER); if the toggle route allowed other roles, enforce the publish rule in the service and add a spec.
  - `{visible:false}` → close the open publication (reuse unpublish).
  - `visibleToClient` is kept in sync.

- [ ] TDD specs:
  - a contact without case access gets 403/404
  - an upload creates a document with the contact set and category/description taken from the fields
  - `keyDate` creates a suggestion
  - the lead lawyer is notified
  - toggle on publishes, toggle off unpublishes
  - toggle by a non-publisher is refused
  - `getCase` returns `clientUploads`
- [ ] Implement, run the specs plus tsc, then commit `feat(portal): clients upload case documents with prefilled details; eye toggle publishes`.

### Task 4: Web (portal + staff)

**Files:**
- Portal:
  - `apps/web/src/app/(client-portal)/portal/intake/new/page.tsx`: optional key date plus label fields. After submit, show "ส่งคำขอแล้ว — เปิดเป็นคดี <ref>" with a link to `/portal/cases/<caseId>`.
  - `portal/intake/[id]/page.tsx`: link to the case when `caseId` is set.
  - `portal/cases/[id]` page (find the path): an upload form with file, doc type select (Thai labels), note, key date and date label. Add a "เอกสารที่คุณส่ง" list (clientUploads) next to the published documents.
- Staff:
  - `components/cases/CaseDocumentsPanel.tsx`: `จากลูกความ` badge when `uploadedByContact` is set. The uploader name falls back to the contact name. The eye toggle tooltip becomes `แสดงให้ลูกความเห็น (เผยแพร่)`.
  - `DateSuggestionsPanel` already lists PENDING suggestions. Confirm client-sourced ones render; add a `จากลูกความ` tag if the suggestion's source can be told apart.
- `apps/web/src/lib/api.ts`: add the types plus `uploadPortalCaseDocument`, and extend the submit types.

- [ ] Implement, run `cd apps/web && npx tsc --noEmit`, then commit `feat(web): portal requests show their case; clients upload case documents; staff see client uploads`.
