# Client portal → case flow: design

Date: 2026-09-26. Owner request: "customer สร้างงานผ่าน portal ต้องขึ้นในคดี เป็นงานก่อนฟ้อง แจ้งเตือน owner, customer ต้องเห็นเอกสารที่ทนายกดให้เห็น, ถ้าลูกความอัปเอกสารมา prefill ให้ทนาย".

## A. Portal request becomes a pre-litigation case
- `POST /client-portal/intake` (submit) still creates the `PortalIntakeSubmission`, so the workroom thread keeps working. In the **same transaction** it now also:
  - creates a `Case` for the portal user's `clientId` with:
    - `stage: PRE_LITIGATION`
    - `title`: the submission title
    - `description`: the submission detail
    - `leadLawyerId`: the firm's first OWNER (by membership createdAt; owners can reassign)
    - reference numbering, status and every other default exactly as the staff create path does (reuse `CasesService`'s creation internals; do not duplicate numbering logic)
  - sets the new `PortalIntakeSubmission.caseId` column (nullable FK, SetNull, unique).
  - grants `ContactCaseAccess` to the submitting contact, so the client sees the case right away.
  - adopts every submitted file as a case `Document`. For client uploads, `uploadedById` becomes nullable and the new nullable column `uploadedByContactId` is set. Storage key: `cases/<caseId>/<docId>_v1<ext>`, plus a `DocumentVersion`.
  - logs a case feed activity: `ลูกความส่งคำขอผ่านพอร์ทัล`.
- **After commit**, notify owners with `AssignmentNotifierService.notifyFirmOwners({ firmId, actorUserId: '', summaryText: 'คำขอใหม่จากลูกความ <client>: <title>', entityPath: '/cases/<id>' })`, wrapped in try/catch.
- The staff "convert submission to intake" path stays but is no longer needed for new submissions. `listPortalSubmissions` keeps filtering `intakeId: null`, and now also filters `caseId: null`, so new submissions don't show up twice.
- The portal request detail page shows a link to the case (`caseId`), and the portal case page shows the request.
- Conflict check is **not** run automatically. The case shows up as a normal PRE_LITIGATION case, and staff run the existing conflict check from the case/intake UI. A client portal request always comes from an existing client.

## B. Client sees documents the lawyer shares
- Publications (`DocumentPublication`) stay the single source of truth for what the client sees on a case.
- The case documents eye toggle (`PATCH /cases/:caseId/documents/:documentId/visibility`, today a dead flag) becomes a shortcut:
  - `visible: true` → `DocumentPublicationService.publish` for the latest version (ADMIN-only rule preserved; if non-admins could toggle before, keep their access consistent with publish permissions — check and follow the publish rule).
  - `visible: false` → unpublish the open publication.
  - `visibleToClient` stays in sync for display only.
- Documents the client uploaded are always visible to that client on the portal case page, under "เอกสารที่คุณส่ง".

## C. Client upload → prefilled for the lawyer (no auto AI)
- New `POST /client-portal/cases/:caseId/documents` (portal guard, contact must have case access). It is multipart with one file (the existing upload limits and mime rules) plus optional form fields:
  - `docType`: one of `DocumentCategory` values the client may pick
  - `note`: ≤500 characters
  - `keyDate`: `YYYY-MM-DD`
  - `keyDateLabel`: ≤100 characters, e.g. "วันที่ได้รับหมาย"
- It creates the case `Document` with:
  - `uploadedByContactId`
  - `category = docType ?? OTHER`
  - `description = note`
- **Prefill.** If `keyDate` is set, it creates a PENDING `DocumentDateSuggestion` on the case for that document, labelled `keyDateLabel ?? 'วันที่จากลูกความ'`. It reuses the existing model and confirm/dismiss flow, so the lawyer confirms it into the calendar with one click.
- It notifies the case lead lawyer (and owners) with `notifyAssigned`: `ลูกความอัปโหลดเอกสาร <filename> ในคดี <ref>`, linking to `/cases/<id>?tab=documents`.
- Staff case documents list shows a `จากลูกความ` badge for client uploads. The document's existing user-invoked AI "✦ วิเคราะห์" button remains the way to extract more fields; nothing runs automatically.
- Submit (A) also accepts the same optional `keyDate`/`keyDateLabel` per request, and creates the same PENDING date suggestion on the new case.

## Out of scope
- Auto AI extraction.
- Auto conflict check.
- Dropping the intake-conversion path.
