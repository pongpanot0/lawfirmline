# Samnuan Case Intelligence — RAG Q&A (P0 slice)

**Merged**: PR #36 → main (2026-09-19), branch `claude/samnuan-ai-flow-nano-luna-557752`

## Shipped
- `DocumentChunk` (pgvector 1536, page-anchored, case-scoped) + `AiRun` (AI cost log) — migration `20260921000000_rag_chunks_ai_runs` creates `vector` extension
- `apps/api/src/rag/`: page-aware chunking, OpenAI embeddings, lazy per-case indexing (first ask indexes un-indexed PDFs/TXT — no queue)
- `POST /cases/:caseId/ai/ask` (1 credit, Thai answer + document/page sources), `POST /cases/:caseId/rag/reindex`
- Chunks stored redacted (`redactForAi` before chunking)
- Web: "ถาม AI" case tab (`CaseAskAiPanel`)
- Env: `OPENAI_MODEL_MAIN` (default gpt-4o), `OPENAI_EMBED_MODEL` (default text-embedding-3-small)

## Deferred (spec P1/P2)
Evidence UI, hybrid keyword search, reranker, contradiction detection, smart task creation, OCR for scanned PDFs, nano-tier extraction routing.

Plan: `docs/superpowers/plans/2026-09-19-samnuan-case-intelligence-rag.md`
Spec source: `~/Downloads/SAMNUAN-AI-FLOW-NANO-LUNA-V2.md`

## Follow-up PRs (same day)
- PR #37: hybrid search (pg_trgm), combined AI tab (ask/facts review/Thai law), LegalQuery + iApp deka flow, case timeline with gap warnings, evidence section
- PR #38: OCR for scanned PDFs (vision model via pdf-parse getScreenshot, OCR_MAX_PAGES=30, images sent unredacted — text redaction still applies downstream), /ai-usage dashboard (AiRun aggregation, owner-only), Ask panel shows source document chips

Remaining (deliberate): nano-tier routing — add when a high-volume extraction path exists.
