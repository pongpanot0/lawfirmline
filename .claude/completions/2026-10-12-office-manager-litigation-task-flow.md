# 2026-10-12 — Office manager role, litigation correctness, task flow & notifications

Branch `claude/casefox-clio-features-35183a`. One PR, one prod deploy.
Research and specs come from the Casefox / Clio walkthrough: `docs/research/2026-10-11-*`, `docs/superpowers/specs/2026-10-11-*`, plans in `docs/superpowers/plans/2026-10-11-*`.

## What shipped
**Plan A — `OFFICE_MANAGER` firm role.** Capability map in `packages/shared/src/firm-capabilities.ts` (`hasFirmCapability`, `@RequireCapability` + `FirmRoleGuard`).
- The office manager sees every case and document, runs operations, issues invoices and records payments, approves leave, and invites people up to SENIOR_LAWYER.
- The office manager cannot approve expense claims, change billing or plan, delete cases, or change member roles.

**Plan B — litigation (Part L).**
- Deadline engine:
  - Thai civil-procedure defaults (ม.173/177/79/197-198/88/229/247/237/274).
  - Months are counted per ป.พ.พ. ม.193/3 and ม.193/5.
  - Deadlines fall due at 16:30 Bangkok time. Dates that land on a non-business day roll back or forward.
  - 2570 fixed-date holidays; firm overrides by trigger + label. The FILED rule applies to the trial level only.
- `CaseProceeding` per court level. Case.* mirrors the current level. Changing the level and the case numbers in one save returns 400.
- Stage order, close and reopen.
- Limitation reminder: 90/30/7/1 days before, sent to the current lead.
- `CaseParticipant` is the single source of parties. The case-client row is protected.
- Conflict gate: 409 `CONFLICT_FOUND`, override reason ≥ 10 characters, raw and normalised Thai search.
- Web create-case and overview forms, mobile parties screen, court fee (ตาราง 1 ท้าย ป.วิ.พ.) and simple-interest calculator.

**Plan C — task flow (Part T).**
- Review handoff keeps the worker as assignee (PENDING_REVIEW + submittedAt).
- One reviewer rule everywhere: API `assertReviewer` = shared `canActOnReview` / `isEligibleReviewer`. The reviewer is the named reviewer, else the case lead. The owner backstop applies only when no reviewer is named. Never the assignee, never an office manager.
- Note of at least 5 characters; check-and-set transitions; "รอฉันตรวจ" queues.
- Notifications for reassign, hold, blocker and @mention (mentions only reach people who can open the task).
- LINE approve / return buttons with a 1:1 note flow.
- Document-review notices plus an 08:30 due-tomorrow reminder.
- SOP apply covers the current and next stage, with due dates and party side.
- Closing email really sends and records sentAt/sentTo.
- Web and mobile UI for all of the above.

## Migrations (prod applies on boot, in name order)
`20261011120000_office_manager_role` · `130000_litigation_schema` · `130100_deadline_defaults_holidays_2570` · `130200_limitation_reminders` · `130300_case_proceedings_backfill` · `130400_parties_single_source` · `140000_litigation_final_fixes` · `150000_task_flow_schema` · `150100_review_assignee_backfill` · `150200_default_playbook_step_tags`.

## Deploy notes
- **Rollback past Plan A:** first run `UPDATE "FirmMember" SET role='ASSISTANT' WHERE role='OFFICE_MANAGER';`. Older code cannot read that enum value.
- **2570 holidays:** the lunar holidays must be entered at /admin/holidays once announced. Until then the engine flags the year as incomplete.
- **`PLATFORM_ADMIN_EMAILS`** must be set for editing the global deadline rules.
- **Before tagging prod, count these legacy rows:**
  - PENDING_REVIEW rows with no HANDED_OFF log
  - rows where the assignee is the reviewer (or the lead when no reviewer is set)
  - rows with `caseId IS NULL AND firmId IS NULL`

  Any of these may need a manual reassign.
- **Pending suggestions from the old JUDGMENT +30d rule** are kept as they are and are not recomputed.
- **Local-only:** the `_prisma_migrations` checksum for `20261011130200_limitation_reminders` is stale on the shared dev DB, because the file was edited after it was applied. Prod is unaffected.

## Verification
- API 186 suites / 1580 tests (after merging main); web 127; tsc for api, web and mobile at 0 errors; mobile static checks pass. All runs were sequential, with jest `--maxWorkers=2`.
- End-to-end against a local API with the seed accounts:
  - Review flow: 11/11 checks (note minimum, worker kept as assignee, reviewer queue, assignee and office manager refused, named reviewer approves, double approve refused).
  - Litigation: 9/9 checks (409 conflict on an existing client's name, short override refused, opponent and limitation date stored, filing gives the ม.173 card due 16:30 on +7 days, black number on the TRIAL proceeding).
- Browser: the create-case form and the case page (proceedings card, calculators) render.

## Open owner decisions / follow-ups
- Should an office manager be allowed as case lead? Today they can be. On such a case with no named reviewer, the review notice goes to the office manager, who cannot act; the owner can approve only from the case board.
- Any case lawyer can send the closing email to clients (pre-existing permission).
- Should `requiresAttachment` also block marking a task DONE when review is off?
- The office manager sees firm-wide expense totals in reports (aggregate only).
- Not conflict-checked: a client changed or a participant added after the case opens. The spec gates opening only.
- Court-fee rates were cross-checked with secondary sources; krisdika.go.th was unreachable on 2026-10-12. Re-verify.
- The GET /cases list still returns `customers[].contact` phone/email and `assignments[].user.email`. Trim these later.
- Smaller items are listed in `.superpowers/sdd/*/progress.md`. That folder is git-ignored scratch, so the PR body repeats the important ones.

## Addendum — mobile litigation parity (same PR)
Spec `docs/superpowers/specs/2026-10-12-mobile-litigation-parity.md` (D1–D10), design `docs/design/2026-10-12-mobile-litigation-parity.md`, plan `docs/superpowers/plans/2026-10-12-mobile-litigation-parity.md` (11 tasks).
- **Mobile:**
  - Court-event recording (case screen and court-day chip).
  - Deadline-suggestion confirm/dismiss card.
  - Limitation line and court numbers per level.
  - Review rounds (open the pinned version, approve, return with a reason).
  - Home "ต้องจัดการก่อน" for every reviewer, with deep links to the right card.
  - Limitation date on create/edit using ThaiDateField.
  - @mentions in task notes.
  - Court-fee and interest calculator.
  - Offline case screen shows cached data.
- **API:**
  - My Day `pendingDeadlineConfirms` (groupBy, exact counts).
  - `GET /document-review/mine` and `GET /cases/:caseId/review-rounds`.
  - Thai date-suggestion errors.
  - `toAppRoute` section hints.
- **Checks:**
  - API: focused suites 9 suites / 89 tests and tsc pass.
  - Mobile: tsc clean; `check-litigation-parity` covers 15 scenarios; 8 of 10 static checks pass. The 2 that need the e2e fixture path were not run.
- **Review:**
  - Tasks 1–5 had independent task reviews and fixes.
  - Tasks 6–11 and the final review were self-reviewed only. Reviewer subagents were blocked by the auto-mode classifier.
  - Not yet run on a device or simulator.
