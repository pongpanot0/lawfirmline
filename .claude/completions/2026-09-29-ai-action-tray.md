# AI action tray — 2026-09-29

Spec: `docs/superpowers/specs/2026-09-29-ai-action-tray-design.md` · Branch: `claude/ai-action-tray`

- `Document.aiTrayHandledAt` (migration `20260929130000_document_ai_tray_handled`, backfill NOW()), so only uploads after deploy enter the tray.
- `GET /ai-tray?caseId=` returns cards: UNREAD_DOCUMENTS (analyzable, unread, unhandled docs per case plus credit estimate) and PENDING_DATES (DOCUMENT-source PENDING suggestions). `POST /ai-tray/documents/handled` is all-or-nothing within the user's case scope.
- `AiTrayCards` appears on the case page and in the AI Assistant section "งานที่ AI เตรียมไว้". A click → confirm credits → per file: analyze, then extract dates, then mark handled. Skip is available. The date card links to `?tab=documents`.
- Not done: email/unlinked and stage-draft cards; OCR in extractDates; new versions re-entering the tray.
