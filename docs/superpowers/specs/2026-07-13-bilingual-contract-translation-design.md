# Bilingual Contract Translation — Design Spec

**Date:** 2026-07-13
**Status:** Approved, pending implementation plan
**Feature #1 of 3** (translation → AI drafting → client portal). Each feature is an independent subsystem with its own spec → plan → build cycle.

## Goal

Let lawyers produce a **side-by-side bilingual contract** (Thai ↔ English), aligned clause-by-clause, viewable and editable on the web, and downloadable as a DOCX file. Reuses the existing OpenAI integration and AI-credit pattern already used by `document-intelligence`.

## Scope (MVP)

**In scope:**
- Primary output: two-column clause-aligned Thai/English contract.
- Two input sources: (a) pick an existing document in a case, (b) paste text.
- Source file types: PDF (text-layer), DOCX, and pasted plain text.
- Direction: TH↔EN (both directions).
- On-screen side-by-side view with **editable target column** (save edits back).
- Export to **DOCX** (two-column table).
- Charge AI credits, following the existing `document-intelligence` pattern.

**Out of scope (later / separate features):**
- OCR for scanned/image PDFs (belongs to the separate OCR feature).
- PDF export (DOCX first; PDF is a stretch because Thai font embedding is fiddly).
- Saving the exported file back as a new `Document`/`DocumentVersion` (optional future add-on).
- Languages other than TH/EN.

## Architecture

New NestJS module `translation` (kept separate from `intelligence` so the existing service does not grow). Pipeline:

```
Input (pick case document | paste text)
  → extract text (PDF text / DOCX / plain)
  → clause segmentation
  → translate clause-by-clause via GPT-4o → JSON pairs [{ heading, source, target }]
  → persist as TranslationJob (scoped to Firm, optionally to Case)
  → web renders 2 columns, target editable → save
  → export DOCX (2-column table)
```

Follows existing conventions: firm-scoped multi-tenancy, AI-credit charge, and a demo fallback when `OPENAI_API_KEY` is absent.

## Data Model (Prisma)

Add one model + one enum.

```prisma
model TranslationJob {
  id          String   @id @default(cuid())
  firmId      String
  caseId      String?          // null when translating pasted free text
  createdById String
  sourceLang  Lang             // TH | EN
  targetLang  Lang
  sourceType  String           // 'document' | 'text'
  documentId  String?          // set when pulled from a case document
  title       String
  segments    Json             // [{ heading, source, target }] — editable
  status      String           // PENDING | DONE | FAILED
  creditsUsed Int              @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  firm      Firm      @relation(fields: [firmId], references: [id])
  case      Case?     @relation(fields: [caseId], references: [id])
  document  Document? @relation(fields: [documentId], references: [id])
  createdBy User      @relation(fields: [createdById], references: [id])

  @@index([firmId])
  @@index([caseId])
}

enum Lang { TH EN }
```

`segments` is JSON so a lawyer can edit any single clause on the web and save it back without a normalized child table.

## API (`translation.controller`)

All endpoints firm-scoped and subject to the existing subscription guard.

- `POST /translation` — create a job. Body: `{ caseId?, documentId? | text, sourceLang, targetLang, title? }`. Extracts → segments → translates → persists → returns the job.
- `GET /translation?caseId=` — list jobs for a case.
- `GET /translation/:id` — fetch a job with segments.
- `PATCH /translation/:id` — save lawyer-edited `segments`.
- `GET /translation/:id/export.docx` — download the two-column DOCX.

## Service Layer

- **`extractor` (shared util)** — extracts plain text from a source:
  - PDF: `pdf-parse` (text-layer only).
  - DOCX: **`mammoth`** — replaces the current buggy `fileBuffer.toString('utf-8')` in `document-intelligence.service.ts`; the fix is shared so document-intelligence benefits too.
  - plain text: passthrough.
- **`translation.service`** — clause segmentation, chunked GPT-4o calls for long contracts, reassembly into `[{ heading, source, target }]`, credit accounting, and a demo fallback when no API key.
- **`docx-export.service`** — builds a two-column table with the `docx` library (Word renders Thai fonts natively).

## Frontend

- A **"แปลเอกสาร" (Translate)** tab inside `cases/[id]`, plus a top-level menu entry for standalone/pasted translations.
- Flow: choose language direction → choose a case document or paste text → **Translate** → two-column table (`source | target`) with an editable target column → **Save** and **Download DOCX** buttons.

## AI Credits

- Charge credits per the existing pattern, scaled by length (e.g. ~1 credit per ~1,000 characters). Show the estimated cost before the user confirms the translation.

## Error Handling

- No API key → demo fallback translation (mirrors `document-intelligence`).
- Extraction failure (e.g. scanned PDF with no text layer) → clear error telling the user OCR is not yet supported / to paste text.
- Long contracts → chunk by clause to stay within token limits; a failed chunk marks the job `FAILED` with a reason.

## Testing

- Unit: `extractor` (PDF / DOCX / plain), clause segmentation, credit calculation, with a mocked GPT-4o response.
- E2E: create job → edit a segment → save → export DOCX.
