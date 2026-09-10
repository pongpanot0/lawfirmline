# Completion: Intake/Case AI document event summary

**Date:** 2026-09-10  
**Request:** When analyzing for ฎีกา (intake + case), also show an AI plain-language summary of what happened in the documents (e.g. medical follow-up narrative), not only precedent bullets.

## Changes

- Added nullable `documentSummary` on `IntakePrecedentAnalysis` (+ migration).
- Extended the precedent-analysis LLM JSON to return `documentSummary` alongside `summaryBullets` and `noticeFacts`.
- Intake detail and case detail UIs show **สรุปเหตุการณ์จากเอกสาร** above the ฎีกา section when present.
- Tuned `summarizeWithAI` prompt for chronological event narratives (used by case batch analysis).
- Tests updated; local migration applied.

## Verify

1. Open an intake with attachments → run analysis → confirm event summary appears before ฎีกา.
2. Convert to case (or open existing case with analysis) → same summary section visible.
3. Older analyses without `documentSummary` still render ฎีกา/notice sections only.
