# Lawyer workflow gaps (2026-11-28)

Source: the firm's "การทำงานทนาย" and "ข้อมูลการจัดทำข้อมูลคดี" docs. Mockup + contract: `docs/design/2026-11-27-lawyer-workflow/`.

## What changed
- **Plaintiff follow-ups** (`CourtFollowUp`): filing creates "call court: accepted?" (+7) and "summons served?" (+14); service closes SERVICE and creates "answer filed?" (+30, +60 abroad). Each keeps one DEADLINE calendar event; "ask again in N days" moves it.
- **Defendant answer deadline** (`Case.answerDueAt`, `AnswerExtension`): service sets the legal date; extensions with court order (pending/granted/denied); effective = latest grant, file-by = effective − 1 day; one managed event.
- `ServiceMethod.POSTED_ABROAD` (60 days). Intake `NOT_WORTH_FILING` + clientDecision PENDING/FILE/DROP (`effectiveIntakeDecision`).
- Witness rules: prep −30 and witness statement −7 before WITNESS_HEARING.
- Migration deactivates the 3 global COMPLAINT_SERVED rules (answer-due ×2, default check) — replaced by the follow-ups / managed deadline.
- Insurance claim: assuredName, policyType, claimAmount, claimCurrency; `CaseInsurancePanel` now rendered in the case info grid (it was dead code).
- Expense categories: ค่านำหมาย, ค่าพยาน, ค่าใช้จ่ายในการดำเนินคดี.

## Verified
API jest (sharded): all pass except 3 suites that fail identically on HEAD (app.module fee-packages ordering, cargo-creation, team-digest). Web tsc clean, 316 tests. Browser click-through on local: filing → follow-ups → call result → overseas service → answer follow-up; defendant service → extension granted → event moved; insurance claim save; expense categories.

## Known gaps
- Reminder sync runs after commit (same as limitation reminder); a crash there leaves no event until the next edit.
- Changing a case's party role later does not remove the other side's workflow rows/events.
- Intake decide modal not click-tested in the browser (demo intake locked before decision); covered by unit + DOM tests.
