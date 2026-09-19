# Samnuan Case Intelligence — RAG Q&A (from SAMNUAN-AI-FLOW-NANO-LUNA-V2 spec)

## What already exists (reuse, don't rebuild)
- Page-mapped PDF text extraction: `intelligence/document-intelligence.service.ts` `extractText()` (`[หน้า N]` markers)
- Facts with verified page citations: `CaseKnowledge` + `KnowledgeCitation`
- Date/timeline suggestions: `DocumentDateSuggestion` → `CalendarEvent`
- Thai law: `intelligence/iapp-legal.client.ts`
- PII boundary: `redactForAi()` — mandatory before any outbound AI call
- Credits metering: `@RequireCredits` + `AiCreditsInterceptor`

## New in this branch (P0 slice)
1. **Schema**: `DocumentChunk` (caseId, documentId, chunkIndex, pageStart/End, content, `vector(1536)` embedding) + `AiRun` usage log. Hand-written migration creates `CREATE EXTENSION vector`.
2. **`apps/api/src/rag/` module**
   - `ChunkingService`: page-aware chunking (~4000 chars, 400 overlap) from `[หน้า N]` text
   - `EmbeddingService`: OpenAI `text-embedding-3-small` (env `OPENAI_EMBED_MODEL`)
   - `RagService`: lazy indexing (first `ask` indexes any un-indexed case PDFs/TXT — no queue infra needed), cosine retrieval via `$queryRaw`, answer with sources
   - `POST /cases/:caseId/ai/ask` (credits: `RAG_QA`), `POST /cases/:caseId/rag/reindex`
   - Every model call logged to `AiRun` (model, tokens, latency, status)
3. **Frontend**: "ถาม AI" panel on case detail (question → answer + คลิกดู source document/page)

## Model strategy (spec §12 adapted)
- Chat: env `OPENAI_MODEL_MAIN`, default `gpt-4o` (spec's "GPT-5.6 Luna" — swap via env when available)
- Cheap tier `OPENAI_MODEL_NANO` reserved for future high-volume extraction; not used in this slice (existing extraction paths already work on the main model)
- Chunks are stored redacted (`redactForAi` before chunking), so both storage and outbound calls are safe.

## Deferred (P1/P2 per spec §29)
- Evidence table/UI, hybrid keyword search, reranker, contradiction detection, smart task creation from Q&A, OCR for scanned PDFs, nano→main escalation.
