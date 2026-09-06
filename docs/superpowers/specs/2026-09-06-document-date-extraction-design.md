# Document Date Extraction — Design Spec

**Date:** 2026-09-06
**Status:** Approved, pending implementation plan

Comes out of a broader review of where AI could help across Operations and the Customer Portal earlier this session. That review found `AIAssistantPanel` already lists "ดึงวันสำคัญ" (extract important dates) as a planned action (`id: 'dates'`, `ready: false`), and that Operations' near-deadline tracking (`OperationsService.nearestDeadlineDays`) already reads from any `CalendarEvent.startAt` plus `Task.dueDate` — so feeding extracted dates in as `CalendarEvent` rows gets Operations visibility for free, no changes needed there.

## Goal

When staff have a legal document (court order, summons, notice) for a case, let them click a dedicated "ดึงวันสำคัญ" action on the case's Documents page to have AI find the dates in it (hearing dates, filing deadlines, statutory deadlines), classify each one, and quote the source sentence — then review, edit, and confirm each one individually before it becomes a real calendar entry. Nothing is trusted onto the calendar without a human confirming it first.

## Scope (MVP)

**In scope:**
- A dedicated "ดึงวันสำคัญ (AI)" dropzone on the case Documents page (`cases/[id]/documents`), separate from the existing "วิเคราะห์เอกสาร" (summarize) dropzone.
- AI extracts a list of candidate dates from the document text, each classified into the existing `EventType` (`COURT_DATE` / `DEADLINE` / `CLIENT_MEETING` / `OTHER`), with the source sentence quoted for verification.
- Every extraction is persisted as a `DocumentDateSuggestion` row (`PENDING` status) — this is the audit trail: what AI proposed is recorded even if a human later dismisses it.
- Per-suggestion review UI: edit label/date/type, then **confirm** (creates a real `CalendarEvent` via the existing `CalendarService`) or **dismiss** (no calendar entry created). Pending suggestions persist across page reloads (loaded via a `GET` on page mount), since they're already in the DB.
- Confirming reuses `CalendarService.create()` as-is — no duplicate event-creation logic.
- Extraction costs AI credits via the existing `@RequireCredits` / `AiCreditsInterceptor` pattern (same 5-credit cost as the existing "analyze" action). Confirm/dismiss are free — they don't call AI.

**Out of scope (later / separate features):**
- A cross-case "pending review" queue (like `intake/portal-submissions`) — this session decided in-page review is enough for MVP; a queue can be added later if staff want centralized triage.
- Wiring the `AIAssistantPanel`'s existing `id: 'dates'` action — that panel only renders a single text-block result today and can't show a per-item confirm/dismiss list without its own rework. Left disabled (`ready: false`) for now; a follow-up feature if the global panel is worth extending.
- Numeric AI confidence scores — the quoted source excerpt is what lets a reviewer judge trust, not a score.
- Auto-creating calendar events without review — rejected explicitly: a wrong AI-read legal deadline landing on the calendar unreviewed is worse than not having the feature.
- Changes to `OperationsService` — not needed; it already reads any future `CalendarEvent`.

## Architecture

**A staging table in front of the existing `CalendarEvent`/`CalendarService`, not a parallel calendar system.** `DocumentDateSuggestion` only exists to hold AI output in a reviewable, editable, auditable state before it becomes a real event. Once confirmed, event creation goes through the exact same `CalendarService.create()` path a human would use creating an event by hand — the suggestion table is not a shadow calendar.

```
Staff opens case Documents page
  → drops file onto "ดึงวันสำคัญ (AI)" zone
  → POST /cases/:caseId/documents/extract-dates (multipart, 5 credits)
       DocumentIntelligenceService.extractDates()
         - extractText() [reused from analyze flow]
         - extractDatesWithAI(text) → OpenAI, JSON mode
             → [{ label, date, eventType, sourceExcerpt }, ...]
             → malformed JSON / no API key / no dates found → []
         - creates one DocumentDateSuggestion per item, status PENDING
       returns created suggestions
  → frontend appends them to the pending list (also loaded via GET on mount)

Staff reviews a pending suggestion card:
  → edits label/date/eventType inline, reads sourceExcerpt
  → "ยืนยัน" → POST .../date-suggestions/:id/confirm
       - CalendarService.create({ caseId, title: label, startAt: date, type: eventType })
       - suggestion.status = CONFIRMED, calendarEventId = <new event id>,
         reviewedById = user.id, reviewedAt = now
  → "ปัดทิ้ง" → POST .../date-suggestions/:id/dismiss
       - suggestion.status = DISMISSED, reviewedById = user.id, reviewedAt = now
```

## Data model changes

Additive only, no breaking changes to existing tables:

```prisma
enum DateSuggestionStatus {
  PENDING
  CONFIRMED
  DISMISSED
}

model DocumentDateSuggestion {
  id              String               @id @default(uuid())
  caseId          String
  documentId      String?
  label           String
  suggestedDate   DateTime
  eventType       EventType            @default(DEADLINE)
  sourceExcerpt   String               @db.Text
  status          DateSuggestionStatus @default(PENDING)
  calendarEventId String?              @unique
  createdById     String
  reviewedById    String?
  reviewedAt      DateTime?
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  case          Case           @relation(fields: [caseId], references: [id], onDelete: Cascade)
  document      Document?      @relation(fields: [documentId], references: [id], onDelete: SetNull)
  calendarEvent CalendarEvent? @relation(fields: [calendarEventId], references: [id], onDelete: SetNull)
  createdBy     User           @relation("DateSuggestionCreator", fields: [createdById], references: [id])
  reviewedBy    User?          @relation("DateSuggestionReviewer", fields: [reviewedById], references: [id])

  @@index([caseId, status])
}
```

`Case`, `Document`, `CalendarEvent`, and `User` each gain the corresponding back-relation field; no other schema changes. `CalendarEvent.startAt`/`type` already cover what a confirmed suggestion needs — no new fields on `CalendarEvent`.

## API surface

New endpoints on the existing `IntelligenceController` (extraction — mirrors `analyze`) and a new `DateSuggestionsController` (review actions), both under `JwtAuthGuard` + `CaseAccessGuard` like the rest of `/cases/*`:

- `POST /cases/:caseId/documents/extract-dates` — multipart file upload, `@RequireCredits(5)` + `AiCreditsInterceptor` (same pattern as `analyze`). Runs `DocumentIntelligenceService.extractDates()`, returns the created `DocumentDateSuggestion[]`.
- `GET /cases/:caseId/date-suggestions?status=PENDING` — lists suggestions for the case (defaults to `PENDING`), used to repopulate the review list on page load.
- `POST /cases/:caseId/date-suggestions/:id/confirm` — body `{ label?, date?, eventType?, reminderMinutes? }` (overrides applied on top of the stored suggestion values before creating the event). No AI credit cost.
- `POST /cases/:caseId/date-suggestions/:id/dismiss` — no body. No AI credit cost.

`DocumentIntelligenceService` gains:
- `extractDatesWithAI(text: string): Promise<{ label: string; date: string; eventType: EventType; sourceExcerpt: string }[]>` — calls OpenAI with `response_format: { type: 'json_object' }` and a system prompt asking for `{ "dates": [...] }`. If `OPENAI_API_KEY` is unset, or the response fails to parse, or `dates` isn't an array, returns `[]` (mirrors how `summarizeWithAI` degrades gracefully without a key, but here "no dates found" is a valid, non-error outcome rather than a demo string). Each item is validated: `date` must parse to a valid `Date` (invalid entries dropped, logged), `eventType` must be one of the four enum values (invalid values fall back to `OTHER`).
- `extractDates(fileBuffer, mimeType, caseId, userId, documentId?)` — `extractText()` (reused) → `extractDatesWithAI()` → creates one `DocumentDateSuggestion` per surviving item, returns them.

## Frontend changes

- `apps/web/src/lib/api.ts` gains: `extractDates`, `getDateSuggestions`, `confirmDateSuggestion`, `dismissDateSuggestion`, following the existing per-resource grouping in that file.
- `cases/[id]/documents/page.tsx`:
  - New `DocumentDropZone` labeled "ดึงวันสำคัญ (AI)", parallel to the existing analyze dropzone, calling `handleExtractDates(file)`.
  - On mount, loads `PENDING` suggestions via `getDateSuggestions` alongside the page's existing data loads.
  - Renders a "วันสำคัญที่รอยืนยัน" section listing pending suggestions as cards: editable label (text input), editable date (date input), editable type (select over the 4 `EventType` values with Thai labels), the quoted `sourceExcerpt` (muted, small, expandable if long), and two buttons — "ยืนยัน" (confirm with current edited values) and "ปัดทิ้ง" (dismiss). A confirmed/dismissed card is removed from the pending list.

## Error handling

- `extractDatesWithAI` never throws for "no dates found" or a malformed AI response — it returns `[]`, and the endpoint returns an empty list. Frontend shows "ไม่พบวันที่สำคัญในเอกสารนี้" when the result is empty.
- Unsupported file mime types reuse `extractText()`'s existing behavior (throws, surfaces as an error toast) — consistent with how `analyze` already handles this today; not being extended in this feature.
- `confirm`/`dismiss` on a suggestion not in `PENDING` status → 409 (prevents double-confirming or reviving a dismissed suggestion).
- `confirm`/`dismiss` for a suggestion belonging to a different case than the URL's `:caseId` → 404 (same defense-in-depth pattern as other nested case resources).
- Deleting a `Case`, `Document`, or the confirmed `CalendarEvent` cascades/nulls consistently with the relations above (`Case` cascades, `Document`/`CalendarEvent` set null) — a suggestion's audit record survives even if its source document or resulting event is later deleted.

## Testing

- Unit: `extractDatesWithAI` — valid JSON parses correctly; malformed JSON returns `[]`; missing API key returns `[]`; invalid date strings are dropped; invalid `eventType` values fall back to `OTHER`.
- Unit: confirm/dismiss service logic — status transitions, rejecting a non-`PENDING` suggestion, `CalendarService.create()` called with the right (possibly overridden) fields on confirm.
- Integration: `POST .../extract-dates` end-to-end with a mocked AI response → verify `DocumentDateSuggestion` rows created with `PENDING` status and correct credit deduction (5 credits, matching `analyze`).
- Integration: confirm → verify a `CalendarEvent` is created and appears in `GET /calendar` and in `OperationsService`'s near-deadline calculation (proves the "no changes needed in Operations" assumption holds).
- Manual: run the Documents page in the browser, extract dates from a real sample document, edit one suggestion before confirming, dismiss another, reload the page and confirm the still-pending one survives the reload.
