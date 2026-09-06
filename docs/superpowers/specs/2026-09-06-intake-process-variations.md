# Intake Process Variations — Design Spec

2026-09-06 · Real intake doesn't always follow the single path the system assumes today (create → assess → decide → maybe convert to a brand-new case). This spec adds the three variations staff actually see, without changing that pipeline for the common case.

Captured from a `/grill-me` session — see the conversation for the full back-and-forth and rationale behind each rejected alternative.

## Goal

A staff member creating or deciding an intake can express three situations the system cannot represent today:

1. **The client already has a Case with this firm**, and this intake is a new matter/issue for them — it should be able to attach to that existing Case instead of always spawning a new one.
2. **The matter is already underway somewhere else** (filed in court already, or another lawyer/firm has been handling it) before it ever reached this firm — that context should be captured and carried into the Case description if accepted.
3. **The contact was only ever a consultation** — advice given, no intent to take the matter on — and should close out as its own outcome, not be miscategorized as "rejected" (which the client portal shows as "declined") or forced through a full case-strength assessment.

None of this is exposed to the client portal — it is a dashboard-only (staff-facing) capability.

## Non-goals (explicitly out of scope for this iteration)

- No change to `client-portal-intake` (controller, service, or form) — clients cannot select any of this themselves.
- No general document-repository work — that is a separate spec/plan (`2026-09-06-intake-document-repository`), because `IntakeAttachment` (AI-input attachments) is already live on `main` and migrating it is a bigger, riskier change than adding a parallel document store. See that spec for the file-storage work; this plan only needs to add a `CONSULTED` entry to the AI-analysis button's existing status gate (already merged on `main`).
- No new Assessment fields, no changes to `assess()`.
- No changes to Notice issuance (`issueNotice`, `draftNotice`).

## Prerequisite: sync with `main`

This worktree is currently behind `main` by the `intake-precedent-notice-ai` feature (already merged — `IntakeAttachment`, `IntakePrecedentAnalysis`, the AI-analysis button on `intake/[id]`, and its `intakePrecedentAnalysisService` dependency injected into `IntakeService`). **Merge/rebase onto `main` before starting Task 1** — every task below assumes the post-merge shape of `intake.service.ts` (constructor takes `precedentAnalysisService: IntakePrecedentAnalysisService` as its 4th argument) and `intake.controller.ts`.

## Variation 1: Attach to an existing Case (`relatedCaseId`)

- Add `Intake.relatedCaseId` — nullable FK to `Case`, **many-to-one** (many intakes can point at the same case over time). This is deliberately separate from `Case.intakeId` (unique, 1:1 — "the intake that spawned this case"): the two model different relationships and must not be conflated.
- Selected **at intake creation time**, not deferred to decision/convert time — staff usually already know the client has an open case when they take the call.
- Selecting a related case does **not** lock the `clientId` — it prefills from the case's client but stays editable (e.g. a co-plaintiff who is a different `Client` record tied to the same matter).
- The intake still goes through the full Assessment → Decision pipeline unchanged, even though the client is already known — the firm may still decline this particular new matter (conflict of interest, wrong practice area, etc.).
- Only the **convert** step changes: when `decision` results in acceptance (see `decide()` below) and `relatedCaseId` is set, `convertToCase()` attaches to that existing case instead of creating a new one — no new `ownRef`/`folderId`/`Case` row, and the intake's own `IntakePrecedentAnalysis` history is backfilled onto that case's `caseId` (same pattern `main` already uses for the create-new-case path).

## Variation 2: Matter already underway elsewhere (`isOngoingElsewhere`)

- Add three fields to `Intake`, all optional:
  - `isOngoingElsewhere: Boolean` (default `false`)
  - `externalCaseNumber: String?`
  - `currentStageNote: String?` (short free text — e.g. "ฟ้องที่ศาลแพ่ง คดีหมายเลขดำ ..., นัดสืบพยาน 15 ต.ค.")
- These are queryable/filterable fields (not just folded into the long-form `description`) because they affect triage priority — a matter already mid-litigation elsewhere may have a much closer deadline than one that hasn't started.
- On `convertToCase()`, when creating a **new** Case (i.e. `relatedCaseId` was not set) and `isOngoingElsewhere` is true, append a short block to the new `Case.description` summarizing these three fields — matching the existing pattern where assessment notes are already folded into the case description on conversion.
- This is orthogonal to Variation 1 — a matter can be "already underway elsewhere" whether or not it also happens to relate to an existing case in this firm (in practice the two are close to mutually exclusive, but nothing enforces that; both fields simply do what they do independently).

## Variation 3: Consultation-only (`CONSULTATION_ONLY` / `CONSULTED`)

- Add `IntakeDecision.CONSULTATION_ONLY` — a new decision outcome alongside the existing `FILE_SUIT` / `DO_NOT_FILE` / `NEGOTIATE_FIRST` / `SEND_NOTICE` / `COMPLAIN_TO_AUTHORITY` / `PENDING`.
- Add `IntakeStatus.CONSULTED` — deliberately **separate from `REJECTED`**. `REJECTED` means the firm declined to take the matter; `CONSULTED` means advice was given and neither side intended to go further. The client-portal-facing label (`intake-status-mapping.ts`) must reflect this distinction — a client who was just given a quick consult should not see "ไม่รับดำเนินการ" (declined).
- No changes to required fields at intake creation — a consultation-only intake is created and filled out exactly like any other intake (nickname/phone/etc. requirements, if any, are unchanged; the only thing that differs is where it ends up).
- Assessment is **optional** for this path: `decide()` can be called directly from `RECEIVED` (or `ASSESSING`) with `decision: CONSULTATION_ONLY`, without ever calling `assess()` first. (This already works today at the data level — `assessorId`/`assessedAt` are nullable — the only change is that `decide()` must not require `status === 'ASSESSING'` as a precondition, which it doesn't today either; no code change needed here beyond the decision→status mapping below.)
- `decide()` mapping: `CONSULTATION_ONLY` → `status = 'CONSULTED'` (its own branch, not lumped into the existing "else → REJECTED" branch).
- The AI-analysis button on `intake/[id]` (`วิเคราะห์ฎีกา + เตรียมข้อมูล Notice`, merged on `main` in `af74fe4`) is already hidden for `status === 'REJECTED' || status === 'CONVERTED'`. Extend that same condition to also hide for `status === 'CONSULTED'` — a closed-out consultation has no further use for precedent analysis or notice drafting, consistent with why it's already hidden for the other two terminal statuses.

## Data model summary

```
Intake (add)
  relatedCaseId       String?   // FK -> Case, many-to-one, nullable
  isOngoingElsewhere  Boolean   @default(false)
  externalCaseNumber  String?
  currentStageNote    String?

IntakeDecision (add)
  CONSULTATION_ONLY

IntakeStatus (add)
  CONSULTED
```

`Case.intakeId` (unique, 1:1, "founding intake") is untouched. `Intake.relatedCaseId` is the new, separate, many-to-one pointer used only by Variation 1.

## Field/enum names (locked)

`relatedCaseId`, `isOngoingElsewhere`, `externalCaseNumber`, `currentStageNote`, `IntakeDecision.CONSULTATION_ONLY`, `IntakeStatus.CONSULTED`.

## Edge cases / risks

- **`decide()` idempotency on attach-to-existing-case**: `convertToCase()` must still guard against double-conversion the same way it does today (an intake with `status = 'CONVERTED'` should not be convertible again) — this guard doesn't exist explicitly today (the endpoint is trusted to be called once by the UI), so this plan does not add one; out of scope, matches existing risk profile.
- **Related case must belong to the same firm**: when `relatedCaseId` is supplied on create, the service must verify the case's `firmId` matches `user.firmId` before saving, the same way `findOne()` scopes intakes.
- **`CaseAssignment`/`CalendarEvent`/task-creation side effects** in `convertToCase()` (assignee buddies, deadline calendar event, kickoff task) still apply on the attach-to-existing-case path — the intake's assigned users and deadline are still meaningful even when the destination case already exists.
