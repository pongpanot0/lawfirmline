# Intake Precedent Analysis + Notice-Data AI — Design Spec

2026-09-06 · One-click AI action on the intake detail page: read a client intake (form text + optional PDF attachment), find likely-relevant ฎีกา (Supreme Court precedents) from a real database, summarize them for the lawyer, and separately prepare structured facts ready to feed the existing `draftNotice()` flow.

Related research: [docs/research/2026-09-06-supreme-court-caselaw-ai-integration.md](../../research/2026-09-06-supreme-court-caselaw-ai-integration.md)

## Goal

When a lawyer opens an intake (`intake/[id]`), they can click one button to get:
1. A short bullet-point summary of relevant ฎีกา precedents (grounded in a real case-law database, not LLM guesswork), each with a link back to the source so the lawyer can verify before relying on it.
2. Structured facts, extracted in the same pass, ready to hand to the existing notice-drafting action — so the lawyer doesn't have to re-enter the same information twice.

The lawyer is never forced to use the result — it's advisory. If the intake is later accepted as a case, the analysis persists and carries over to the case view.

## Non-goals (explicitly out of scope for this iteration)

- No standalone precedent search UI (search-by-keyword across all cases) — this is deferred; see the research doc's "trend analysis" and "search" ideas for later.
- No trend-analysis dashboard ("how have courts ruled on X over 5 years").
- No bulk/background scraping of the full Supreme Court database — precedent data is fetched on-demand per intake only, via a paid third-party API (see below), never scraped directly from deka.supremecourt.or.th.
- No vector database / self-hosted embeddings — retrieval is delegated to the third-party API's own search.

## Data source decision

**iApp Thai Legal Data API** (`https://iapp.co.th/docs/data/legal/thai-legal`) is used instead of scraping deka.supremecourt.or.th directly or relying on GPT-4o's own (unverified, possibly hallucinated) knowledge of case law.

Rationale: GPT-4o alone can fabricate ฎีกา citation numbers that don't exist — unacceptable for a legal citation a lawyer might rely on. iApp's `deka/search` / `deka/{case_id}` / `ask` endpoints query a real database of 133k+ Supreme Court documents, each traceable back to a source. The LLM's role is narrowed to (a) turning intake facts into a search query, and (b) summarizing the *real* retrieved documents — not inventing citations from memory.

**Pricing** (as of 2026-09-06, see research doc sources): IC (iApp Credit) packages start at 1.25 THB/IC (no expiry), scaling down to 0.89 THB/IC at ≥500,000 IC. Relevant endpoints: `deka/search` = 0.1 IC, `ask` = 0.1 IC, `deka/{case_id}` = 0.1 IC, `meta`/`laws` = free. Estimated cost per analysis run: 0.2–0.5 IC (~0.25–0.65 THB). At the firm's estimated volume (30–100 intakes/month, ~1.2 runs/intake average), total iApp cost is **~9–75 THB/month**; combined with existing OpenAI GPT-4o usage (~1–3 THB/run for the two LLM calls), total estimated cost is **~150–375 THB/month at 100 intakes/month**. The firm's existing 100 free IC covers roughly 1–4 months at this volume before a paid package is needed.

## Architecture / data flow

```
Lawyer clicks "วิเคราะห์ฎีกา + เตรียมข้อมูล Notice" on intake/[id]
        │
        ▼
1. Gather facts from intake: structured fields (description, matterType,
   opposingParty, estimatedDamage, incidentDate, etc.) + extracted text from
   any attached PDF(s) (reusing existing PDF-extraction logic from
   document-intelligence.service.ts — do not duplicate).
        │
        ▼
2. LLM call #1 (existing GPT-4o integration): turn gathered facts into a
   Thai-language search query + a rough guess at relevant statute
   section(s), suitable for iApp's search params.
        │
        ▼
3. Call iApp: `deka/search` (semantic search over headnotes) using the
   query from step 2; optionally `ask` for a synthesized answer; fetch
   full detail for the top ~3 results via `deka/{case_id}`.
        │
        ▼
4. LLM call #2: given the *real* retrieved precedents, produce (a) a
   bullet-point summary per precedent for the lawyer, and (b) a
   notice-ready facts string in the same shape `draftNotice()` already
   expects (do not touch draftNotice()'s prompt/logic — just supply it
   pre-built facts).
        │
        ▼
5. Persist everything as a new IntakePrecedentAnalysis record, linked to
   the intake (and later backfilled to the case if the intake converts).
        │
        ▼
6. UI shows two sections from the same result: "ฎีกาที่เกี่ยวข้อง" (bulleted,
   each with a source link) and "ข้อมูลพร้อมร่าง Notice" (a button that
   calls the existing draft-notice endpoint, passing this analysis's id).
```

The whole pipeline runs synchronously within a single HTTP request (~5–15s), matching the existing pattern for `summarize`/`draft` actions in `AIAssistantPanel.tsx`. If this proves too slow in practice, revisit as an async job with polling — not needed for MVP.

## Data model changes

### New: `IntakeAttachment`

The system currently has **no way to attach a file to an intake** — `Document` requires a non-null `caseId`, and intakes don't have a case yet. This is a genuine gap that must be filled to support the "intake can arrive as PDF" requirement.

```prisma
model IntakeAttachment {
  id            String   @id @default(uuid())
  intakeId      String
  filename      String
  storagePath   String
  mimeType      String
  uploadedById  String
  createdAt     DateTime @default(now())

  intake       Intake @relation(fields: [intakeId], references: [id], onDelete: Cascade)
  uploadedBy   User   @relation(fields: [uploadedById], references: [id])

  @@index([intakeId])
}
```

No versioning (unlike `Document`) — an intake attachment is a one-time input, not a working document.

### New: `IntakePrecedentAnalysis`

```prisma
enum AnalysisStatus {
  PENDING
  COMPLETE
  FAILED
}

model IntakePrecedentAnalysis {
  id               String         @id @default(uuid())
  intakeId         String
  caseId           String?        // backfilled if the intake becomes a case
  status           AnalysisStatus @default(PENDING)
  extractedFacts   Json           // facts pulled from intake fields + PDF text
  searchQueries    Json           // query/queries sent to iApp
  precedents       Json           // [{ dekaId, headnote, citedStatutes[], courtLevel, judgmentDate, sourceUrl }]
  summaryBullets   String         @db.Text // bullet summary for the lawyer
  noticeFacts      String         @db.Text // facts string, same shape draftNotice() expects
  creditsCost      Float          // IC spent on this run (for cost tracking)
  createdById      String
  createdAt        DateTime       @default(now())
  errorMessage     String?        @db.Text // set when status = FAILED

  intake      Intake @relation(fields: [intakeId], references: [id], onDelete: Cascade)
  case        Case?  @relation(fields: [caseId], references: [id], onDelete: SetNull)
  createdBy   User   @relation(fields: [createdById], references: [id])

  @@index([intakeId, createdAt])
  @@index([caseId])
}
```

**Design decisions:**
- **History, not overwrite**: each click is a new row. Each run spends real money (IC + OpenAI tokens), so the firm needs an audit trail of how many times it was run and what each run produced. The UI shows the latest by default with a way to browse history.
- **`caseId` nullable, backfilled**: when an intake is accepted and converted to a case, this record's `caseId` is set (not copied into a new row) so the same analysis carries forward.
- **`noticeFacts` kept separate from `summaryBullets`**: they're different outputs for different purposes; `noticeFacts` slots directly into the existing `draftNotice()` facts format without needing to change that function's prompt logic at all.
- Uses the existing `AiCreditsInterceptor` / `@RequireCredits(N)` pattern already used for other AI actions — this is separate from the iApp IC cost (a firm-side quota to prevent overuse, not the actual third-party billing currency).

## API design

### New: intake attachments

```
POST   /intake/:id/attachments        multipart/form-data { file: pdf }
       → { id, filename, mimeType, createdAt }
       Validates mimeType is PDF only; enforces a max file size (TBD at
       implementation time — match whatever limit Document uploads use
       elsewhere in the codebase for consistency).

DELETE /intake/:id/attachments/:attachmentId
       → 204
```

### New: precedent analysis

```
POST /intake/:id/precedent-analysis      [@RequireCredits(10)]
     body: {}  (reads intake + attachments server-side; no client input needed)
     → {
         id, status: "COMPLETE" | "FAILED",
         summaryBullets: string,
         precedents: [{ dekaId, headnote, citedStatutes: string[], courtLevel, judgmentDate, sourceUrl }],
         noticeFacts: string,
         creditsCost: number,
         createdAt,
         errorMessage?: string
       }

GET  /intake/:id/precedent-analysis      → { items: IntakePrecedentAnalysis[] }  // newest first
GET  /intake/:id/precedent-analysis/:analysisId → single record
```

### Modified (backward-compatible): notice drafting

```
POST /intake/:id/draft-notice
     body: { analysisId?: string }   // NEW optional field
     → if analysisId provided: use that analysis's `noticeFacts` instead of
       recomputing facts from raw intake fields inline
     → if omitted: behaves exactly as today (unchanged)
     → { content }  (response shape unchanged)
```

### New services

- `apps/api/src/intake/intake-precedent-analysis.service.ts` — orchestrates the 4-step pipeline described above; reads/writes `IntakePrecedentAnalysis`.
- `apps/api/src/intelligence/iapp-legal.client.ts` — thin wrapper around iApp's `deka/search`, `ask`, `deka/{case_id}` endpoints (raw `fetch`, matching the existing pattern used for OpenAI calls in `document-intelligence.service.ts` — this codebase has no central LLM/HTTP SDK abstraction, so stay consistent with that rather than introducing one).
- PDF text extraction is **reused** from `document-intelligence.service.ts`, not reimplemented.

### Error handling

- iApp failure (rate limit, timeout, non-2xx): record `status = FAILED` with `errorMessage`; **the user's AI credit must not be charged** for a failed run — verify whether `AiCreditsInterceptor` deducts before or after the handler executes, and if it deducts unconditionally, add a refund path for failures.
- PDF extraction failure (corrupt file, non-PDF content despite extension): do not hard-fail the whole analysis — proceed using whatever structured intake fields are available, and note the extraction failure inside `extractedFacts` so the summary/UI can surface it.
- Empty input guard: if an intake has no `description` and no attachments (nothing to analyze), reject before calling the LLM or iApp at all, to avoid spending credits on empty input.

## UI/UX (`intake/[id]`)

- New button alongside the existing `summarize`/`draft` actions in `AIAssistantPanel.tsx`: **"วิเคราะห์ฎีกา + เตรียมข้อมูล Notice"**.
- Because the pipeline is synchronous and takes 5–15s, the button shows a loading state ("กำลังค้นฎีกาที่เกี่ยวข้อง...") and is disabled while running to prevent duplicate clicks.
- Result card, shown after completion, with two sections:
  - **ฎีกาที่เกี่ยวข้อง**: bulleted list, each item with a short summary and a link to the source (`sourceUrl`) so the lawyer can verify before relying on it.
  - **ข้อมูลพร้อมร่าง Notice**: a human-readable rendering of the extracted facts, plus a button "ร่างหนังสือแจ้งเลย" that calls the existing draft-notice action with this analysis's `id`.
  - A visible disclaimer: this is AI-assisted preliminary research, not a complete legal opinion — verify against the full judgment before relying on it (consistent with the Lawyers Council's AI guidance surfaced during research).
- A "history" affordance (e.g. a small dropdown/expander) lets the lawyer see past runs for this intake, newest first.
- Re-running is an explicit, separate action from viewing history — a fresh click spends a new credit and creates a new record; it never overwrites a previous one.
- If the intake is later converted to a case, the same analysis card appears on the case view too (via the backfilled `caseId`) — still optional to use, never forced into the case workflow.
- New minimal file-attach UI on the intake page (does not exist today): a small dropzone/button to attach a PDF, a list of attached files, and a delete action per file.

## Testing plan

**Backend:**
- `intake-precedent-analysis.service.spec.ts`:
  - Happy path with mocked iApp client + mocked OpenAI → `COMPLETE` record with expected shape.
  - iApp error/timeout/429 → `FAILED` status, `errorMessage` set, and **no credit charged** (this is the most important test — confirm the no-charge-on-failure behavior explicitly).
  - Corrupt/unparseable PDF attachment → still `COMPLETE` using remaining fields, with the extraction failure flagged inside `extractedFacts`.
  - Intake with no description and no attachments → rejected before any LLM/iApp call (guards against wasting credit on empty input).
- `iapp-legal.client.ts` unit tests: mock `fetch`, assert query params sent match the documented endpoint shapes for `deka/search` and `ask`.
- `draft-notice` regression test: calling without `analysisId` must produce byte-identical behavior to today (no regression on the existing, shipped feature).
- Controller-level: `@RequireCredits(10)` enforcement; attachment upload validates PDF mime type and a max file size.

**Frontend:**
- Button click → loading state → both result sections render correctly.
- Error state (iApp failure) shows a friendly message, not a raw error/stack trace.
- "ร่างหนังสือแจ้งเลย" button passes `analysisId` correctly; the existing `draft` button (no `analysisId`) still works unchanged.
- History view sorts newest-first and can display an older run.

**Manual QA scenarios:**
- Intake with text only (no PDF).
- Intake with a scanned/low-quality PDF (text extraction may partially fail) — confirm graceful fallback.
- Intake for a case type where iApp likely has sparse data (e.g. IP, Family) — confirm the system doesn't force irrelevant precedents into the summary when nothing relevant is found.
- Clicking "วิเคราะห์ใหม่" twice on the same intake → two distinct history entries, neither overwritten.

## Open items for implementation time

- Confirm whether `AiCreditsInterceptor` deducts before or after the handler runs, to correctly implement the no-charge-on-failure requirement.
- Decide the max PDF file size / attachment count limit for `IntakeAttachment` (match existing `Document` upload conventions in the codebase).
- Decide the exact `@RequireCredits(N)` value for this action (10 used above as a placeholder reflecting the heavier, multi-call pipeline vs. the existing `CREDIT_COST = 5` single-call actions) — confirm with the firm's AI-credit pricing model.
