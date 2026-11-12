# Notice issue now produces a .docx file

**Bug:** "ออกหนังสือทวงถาม / ออก Notice" (case page `CaseNoticeDialog`, intake page notice modal) only saved
notice fields on the intake — no file was ever generated.

**Fix:** `IntakeService.issueNotice` → `saveNoticeFile` builds a Word file with `buildDocx` (templates/docx-builder):
- body = `noticeContent` (AI draft / typed) or a fill-in skeleton (date, เรื่อง ทวงถาม, เรียน <ผู้รับ>, deadline, sign-off)
- intake has a case → `DocumentsService.createFromBuffer` (category CORRESPONDENCE, shows in case documents + feed)
- no case yet → stored as an `IntakeAttachment` (adopted into case documents on case open)
- response gains `noticeDocumentId`

**Tests:** `apps/api/src/intake/intake-gates.spec.ts` (+2 cases). Not E2E-verified in the browser.
