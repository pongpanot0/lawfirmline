# 2026-10-31 — AI secretary (เลขาทนาย AI) + gpt-4o-mini

Spec: `docs/superpowers/specs/2026-10-31-ai-secretary-design.md` · Plan: `docs/superpowers/plans/2026-10-31-ai-secretary.md`

## Shipped
- All OpenAI chat calls → `chatModel()` (`apps/api/src/common/openai-model.ts`), default `gpt-4o-mini`, env `OPENAI_MODEL_MAIN`.
- `apps/api/src/secretary/`: stuck-work core, `GET /cases/:caseId/brief` (no AI), read-only tool layer (find_matters, case_overview, search_documents, read_document, list_events — all access-filtered + redacted), `POST /ai/secretary` (tool-calling, ≤4 rounds), `POST /ai/secretary/transcribe`, daily brief (`DailyBrief` table, cron 07:30 Bangkok, `GET /ai/daily-brief`, `/dates`).
- Web: secretary tab in the AI panel (also on /dashboard), case brief card, `/brief` page + sidebar entry (viewAllCases).
- Mobile (built with Codex): `app/secretary.tsx` with tap-to-record voice, case brief card, `app/brief.tsx`, home entries, DAILY_BRIEF inbox category.

## Deploy checklist
- Migration `20261031110000_daily_brief` (api auto-migrates on boot).
- Env: `AI_DAILY_BRIEF_FIRM_SLUGS=thesiambarristers`; optional `OPENAI_TRANSCRIBE_MODEL` (default gpt-4o-mini-transcribe); remove any `OPENAI_MODEL_MAIN=gpt-4o` override.
- Mobile needs a new EAS native build (expo-audio + mic permission).

## Not verified
- Live run against Postgres (local 5433 was down): migration apply, real chat round-trip, a real brief run.
- Voice on a physical device.
