# Spec: Litigation correctness + task/handoff flow fixes (2026-10-11)

Source findings:
- [docs/research/2026-10-11-litigation-walkthrough.md](../../research/2026-10-11-litigation-walkthrough.md)
- [docs/research/2026-10-11-case-parties-lifecycle-tasks.md](../../research/2026-10-11-case-parties-lifecycle-tasks.md)

Owner instruction: "fix every item, make it the best possible".

The decisions below are final. Implementers must not re-open them.

---

## Part L — Litigation correctness (plan B)

### L1. Deadline engine
- **Day basis.** Add `MONTHS` to the deadline rule day basis, next to the existing `CALENDAR` and `BUSINESS`.
  - Counting follows ป.พ.พ. ม.193/3 and ม.193/5.
  - **Forward rules:** the due date is the same day-of-month N months after the trigger. If that month has no such day, use the last day of that month.
  - Examples:
    - 11 Oct → 11 Nov
    - 31 Jan + 1 month → 28 Feb (29 Feb in a leap year)
    - 15 Feb → 15 Mar
- **Negative offsets.** Offsets may be negative ("N days before the trigger").
  - Before: if the due date lands on a weekend or holiday, roll **back** to the previous business day.
  - After: roll **forward** to the next business day (unchanged behaviour).
  - Remove `@Min(0)` and the `>=0` clamp.
- **Due time.** Rule due dates are created at **16:30 Asia/Bangkok**, when the court closes. Today's 07:00 is wrong.
- **Court event kind.** Add enum `CourtEventKind` and the field `CalendarEvent.courtEventKind`, used only when `type = COURT_DATE`.
  - Values: `PRELIMINARY` (นัดพร้อม/ชี้สองสถาน), `MEDIATION`, `WITNESS_HEARING` (สืบพยาน), `JUDGMENT_READING`, `OTHER`.
  - Web and mobile event forms show this picker when type is court date.
- **Rule filter.** Add `DeadlineRule.courtEventKind?`. A COURT_DATE rule with a kind fires only for events of that kind.
- **Trigger enum.** Add `FILED` (ยื่นฟ้อง) and `COURT_LEVEL_JUDGMENT` handling (see L3).
- **Default rules.** Seed all of these for new firms, and add them to existing firms in a migration:

  | Trigger | Offset | Title | Law |
  |---|---|---|---|
  | FILED | +7 CALENDAR days | ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง | ม.173 |
  | COMPLAINT_SERVED | +15 CALENDAR days | ครบกำหนดยื่นคำให้การ | ม.177 |
  | COMPLAINT_SERVED + substituted service | +30 CALENDAR days | ครบกำหนดยื่นคำให้การ (ปิดหมาย) | ม.79 + ม.177 |
  | COMPLAINT_SERVED | +30 CALENDAR days, plaintiff side only | ตรวจขาดนัดยื่นคำให้การ / ขอให้พิพากษาโดยขาดนัด | ม.197–198 |
  | COURT_DATE kind=WITNESS_HEARING | −7 CALENDAR days | ยื่นบัญชีระบุพยาน | ม.88 |
  | COURT_DATE (any kind) | +3 BUSINESS days | สรุปผลนัดและรายงานลูกความ | existing rule |
  | JUDGMENT at TRIAL level | +1 MONTHS | ครบกำหนดยื่นอุทธรณ์ | ม.229 |
  | JUDGMENT at APPEAL level | +1 MONTHS | ครบกำหนดยื่นคำร้องขออนุญาตฎีกาและฎีกา | ม.247 |
  | APPEAL_SERVED (new trigger: received copy of appeal) | +15 CALENDAR days | ครบกำหนดยื่นคำแก้อุทธรณ์ | ม.237 |
  | ORDER_RECEIVED | +15 CALENDAR days | existing rule, keep | |
  | JUDGMENT (final) | +10 years − 90 days | ใกล้ครบระยะบังคับคดี 10 ปี | ม.274 |

  - Substituted service: the summons trigger form gets a "วิธีส่งหมาย: รับเอง / ปิดหมาย" select. ปิดหมาย uses the +30 rule; รับเอง uses the +15 rule.
  - Plaintiff-only: rules carry an optional `partySide` filter (PLAINTIFF/DEFENDANT). It is compared with `Case.partyRole`.
  - JUDGMENT rules carry an optional `courtLevel` filter.
- **Who gets notified.** Every rule suggestion created notifies the case lead lawyer (inbox + push + LINE). It is still PENDING until confirmed. The action centre already lists pending suggestions.
- **Per firm editing.** Rules stay global defaults, plus per-firm editable copies.
  - OWNER, or anyone with `manageFirmContent` once Plan A lands, can edit their firm's rules in `/admin/deadline-rules`.
  - Today that page is platform-admin only. Platform admin keeps editing the global defaults.
  - Implementation: `DeadlineRule.firmId?`. A firm's own rule overrides a global rule with the same trigger + title.
- **Holidays.**
  - Seed **2570 (2027)** fixed-date Thai public holidays plus substitution days announced so far.
  - Lunar holidays (มาฆบูชา, วิสาขบูชา, อาสาฬหบูชา, เข้าพรรษา) are seeded **only if** an official source is cited in the migration comment. Otherwise they are left for admin entry.
  - **Warning.** If a computed due date's year has fewer than 10 holidays configured, return `holidayDataIncomplete: true` and show the warning "ยังไม่มีข้อมูลวันหยุดครบสำหรับปี X — ตรวจวันครบกำหนดด้วยตนเอง".

### L2. Case stages
- **Order.** `CASE_STAGE_ORDER` becomes FACT_GATHERING → PRE_LITIGATION → FILING → ANSWER → MEDIATION → HEARING → AWAITING_JUDGMENT → APPEAL → SUPREME → ENFORCEMENT → CLOSING.
  - Update the test that locked the old order.
  - INTAKE_REVIEW stays a hidden alias.
  - Label INTAKE_REVIEW "รับเรื่อง/ตรวจรับงาน" in TH and "Intake review" in EN, so it no longer duplicates "ก่อนฟ้อง".
- **Stage log.** Every stage change writes `CaseStatusLog` (from/to stage, user, optional note) in addition to the CaseActivity. Moving backwards requires a note (`400` without it).
- **Court level sync.** Entering APPEAL or SUPREME sets `courtLevel` to APPEAL or SUPREME and opens a new proceeding (L3) if none exists for that level.
- **Closing.** `PATCH /cases/:id` may no longer set `status` to CLOSED or ARCHIVED (`400`, "ใช้ปุ่มปิดคดี"). Mobile edit removes those options.
  - `POST close` requires `outcome`.
  - Reopen restores the stage that was current before closing (read from CaseStatusLog), or PRE_LITIGATION if unknown.

### L3. Court proceedings and judgment
- **New model `CaseProceeding`:**

  | Field | Type |
  |---|---|
  | id | |
  | caseId | |
  | courtLevel | TRIAL / APPEAL / SUPREME |
  | courtName? | |
  | blackCaseNumber? | |
  | redCaseNumber? | |
  | filedAt? | |
  | judgmentAt? | |
  | judgmentOutcome? | WON / LOST / PARTIAL / DISMISSED / SETTLED |
  | judgmentAmount? (Decimal) | |
  | judgmentNote? | |
  | createdAt, updatedAt | |

  - Unique on (caseId, courtLevel).
- **Backfill.** For every case with any black/red number, create a TRIAL proceeding (or the case's current courtLevel) from `Case.blackCaseNumber`, `redCaseNumber` and `courtName`.
- **Compatibility.** `Case.blackCaseNumber`, `redCaseNumber`, `courtName` and `courtLevel` remain as a mirror of the **current** proceeding, written by the service. Templates and print forms keep working; they also get `{{trialBlackCaseNumber}}` etc.
- **UI.** The case overview shows a "ศาล / เลขคดี" card listing proceedings per level. Actions:
  - "บันทึกการยื่นฟ้อง": filedAt + black number. Fires FILED and sets stage FILING if earlier.
  - "บันทึกการส่งหมาย": served date + method. Fires COMPLAINT_SERVED.
  - "บันทึกคำพิพากษา": judgmentAt, outcome, amount, red number, note. Fires JUDGMENT with the proceeding's courtLevel and sets stage AWAITING_JUDGMENT → keeps it.
  - "บันทึกการได้รับสำเนาอุทธรณ์". Fires APPEAL_SERVED.
  - These replace the manual "บันทึกเหตุตั้งต้น" box. That box stays only for ORDER_RECEIVED.
- **Judgment recording behaviour.**
  - If the case has a `limitationDeadline`, clear the limitation reminder.
  - Notify the lead lawyer: "บันทึกคำพิพากษาแล้ว — ครบกำหนดอุทธรณ์ X".

### L4. Limitation (อายุความ)
- Generalise `insurance-claims/limitation-deadline.service.ts`: any case whose `limitationDeadline` is set or changed gets a DEADLINE calendar event "ครบอายุความ".
- The event has reminders 90, 30, 7 and 1 days before. It is upserted, and removed when cleared or when a FILED proceeding exists.
- The create-case form gets a `limitationDeadline` date field.

### L5. Parties (single source of truth)
- **`CaseParticipant` is the only place for parties.**
  - Data migration: every non-empty `Case.customFields.opposingParty` becomes a participant (role DEFENDANT if partyRole=PLAINTIFF, PLAINTIFF if partyRole=DEFENDANT, else OTHER; side OPPONENT). Then remove the key.
  - Intake conversion converts `Intake.opposingParty` the same way, and also copies `incidentDate` and `estimatedDamage` into customFields.
- **`PartyRole` enum.** Add PETITIONER and RESPONDENT (ผู้ร้อง / ผู้คัดค้าน).
- **Links.** `CaseParticipant` gets `clientId?` and `representedByParticipantId?` (opposing counsel → party).
- **Our side.** When `partyRole` is set and the client exists, the case's client is auto-added as a participant on side OURS with the matching role (idempotent).
- **Create form (web)** gets:
  - "เราเป็น" (partyRole) select
  - a repeatable "คู่ความฝ่ายตรงข้าม" rows editor (name, role, person type)
  - court as the same court catalog select as the edit form (with a free-text fallback "ศาลอื่น")
  - courtLevel select
  - black case number
  - limitationDeadline
  - all case-type custom fields (not only required ones)
- **Create form (mobile)** gets the same, minimal: partyRole, opponent rows, client picker from real Clients (search + create) replacing free text.
- **Mobile case detail** shows parties grouped by side, with add/edit.
- **Participant changes** write CaseActivity and AuditLog.
- **Display bugs to fix:**
  - The participants list disappears after saving the overview form.
  - The timeline is not refreshed after confirming a rule suggestion.
- **Additional clients (CaseClient)** become editable after create (`UpdateCaseDto.clients`).

### L6. Conflict check enforced
- **When it runs.** Server-side, at `POST /cases`, intake convert/decide-open, and portal-submission convert.
- **What it searches.** Run `ConflictCheckService.search` for the client name and every participant name supplied. Extend search to cover `CaseParticipant` and the new linked clients (remove `customFields.opposingParty`, now migrated).
- **Opponent match.** A match is any hit where the searched name is one of our opponents and the hit is our client or OURS-side participant, or the reverse.
- **No match.** Create a `ConflictCheck` record with result CLEAR linked to the case.
- **Match, no override.** Respond `409 { code: 'CONFLICT_FOUND', matches }`. The UI shows the matches and asks for `conflictOverrideReason` (min 10 chars).
- **Match, with override.** Resubmitting with the reason creates the case, records the ConflictCheck as POTENTIAL_CONFLICT with the reason, and writes an AuditLog entry.
- **Recording on an intake** also moves the intake stage to CONFLICT_CHECK if it is earlier.

### L7. Calculators
- **Court fee (ตาราง 1 ท้าย ป.วิ.พ.).** Pure function in `packages/shared`, shown on the case overview next to ทุนทรัพย์ and in the complaint print form.
  - Money claims: 2% of the amount up to 50,000,000 baht, capped at 200,000 baht, plus 0.1% of the part above 50,000,000.
  - Non-money claims: 200 baht.
  - Appeal and ฎีกา use the same table on the amount in dispute.
  - The function is unit-tested at 0; 1; 49,999,999; 50,000,000; 50,000,001; 100,000,000; and 200,000,000.
  - **The implementer must verify these rates against the current official table and cite it in a code comment.** If the official table differs, the official table wins and the test values change accordingly.
- **Interest.** Simple interest = principal × rate × days/365, with a default rate of 5% p.a. (ป.พ.พ. ม.224 as amended 2564: 3% under ม.7 + 2%), and the rate editable. Shown in the same card.

---

## Part T — Tasks, playbooks, handoff, notifications (plan C)

### T1. Applying an SOP to a case
- **"Apply whole SOP"** (`practice-setup/cases/:id/apply`) creates tasks only for the **current stage and the next stage** in `CASE_STAGE_ORDER`. Later stages arrive through the existing stage-change proposal.
- **Due dates.** Every created task gets a due date computed from the step's offset relative to the apply day, using the same calendar/business-day helper as deadlines.
- **Party side.** Playbook steps get an optional `side: 'PLAINTIFF' | 'DEFENDANT'`. Tag the civil playbook's "ยื่นคำให้การ" as DEFENDANT and "ขอให้พิพากษาโดยขาดนัด" as PLAINTIFF; also tag the criminal ones where obvious. Steps whose side doesn't match `Case.partyRole` are skipped. If partyRole is unknown, include both and mark the title "(ถ้าเป็นฝ่าย…)" as today.
- **Notifications.** Each assignee gets **one** batched notification per apply: "ได้รับ N งานใหม่จาก SOP คดี {ownRef}".
- **Labels.** Internal labels `stage:*` and `playbook:*` stay in data but are hidden in every UI. Show a readable chip "ขั้น: {stage label}" instead.

### T2. Review flow (ส่งงานให้ตรวจ)
- **Ownership stays with the worker.**
  - On handoff the task keeps `assigneeId` (the worker) and sets `status = PENDING_REVIEW`. The reviewer is `reviewerId`, or the case lead if null.
  - Add `submittedAt`.
  - All "my tasks" lists show the worker's PENDING_REVIEW tasks under a "รอตรวจ" group.
  - All reviewer lists (dashboard, my-day, mobile tasks tab, operations) gain a "รอฉันตรวจ" section: `status = PENDING_REVIEW AND (reviewerId = me OR (reviewerId IS NULL AND case.leadLawyerId = me))`.
  - Accept and reject authorisation uses the reviewer rule, not the assignee.
  - Reject returns the task to NEEDS_REVISION with the same assignee.
  - **Backfill:** existing PENDING_REVIEW tasks whose assignee was swapped get restored to the last HANDED_OFF sender (from TaskAssignmentLog).
- **Handoff note required.** At least 5 chars, enforced on web, mobile and the LINE quick action. LINE asks for the note as a follow-up message. The note is shown to the reviewer.
- **Attachment required** when the task has `requiresAttachment` (new boolean, default false, settable in the task form and in playbook steps). Mark the civil playbook drafting steps (ร่างคำฟ้อง, ร่างอุทธรณ์, ร่างคำให้การ, บัญชีพยาน) `requiresAttachment: true`.
- **Reviewer eligibility.** OWNER, SENIOR_LAWYER, **the case lead lawyer**, and (after Plan A) OFFICE_MANAGER is **not** eligible. The reviewer can never be the assignee. The task form's reviewer picker lists exactly these people.
- **Card label.** The task-card button shows the real reviewer's name ("ส่งให้ {reviewer} ตรวจ").
- **Status order.** Handoff from TODO auto-records IN_PROGRESS first, so the history is honest.

### T3. Notifications everywhere
Use `AssignmentNotifierService` (inbox + push + LINE, respecting category preferences):

| Event | Recipient |
|---|---|
| handoff | reviewer, with note and LINE quick actions "อนุมัติ / ส่งกลับ" |
| accept | worker |
| reject | worker (exists) |
| reassign | new assignee and previous assignee |
| hold start / resume | lead lawyer and observers |
| daily update with blocker | lead lawyer |
| comment `@mention` | mentioned user (add @mention parsing to task comments, same syntax as case comments) |
| deadline suggestion created | lead lawyer |
| document review round created | each reviewer |
| review round decided (approved/returned) | creator |
| review round due tomorrow | reviewers who haven't decided (daily 08:30 scheduler) |
| SOP apply | batched per assignee (T1) |

### T4. Task forms
- **Web case-task form** adds:
  - description
  - workload hint in the assignee picker (same labels as the case create form)
  - requiresAttachment
  - the "บันทึกแล้วสร้างต่อ" button
- **Mobile** adds priority and observers.
- **Delegation.** LAWYER may assign tasks to ASSISTANT (and to OFFICE_MANAGER after Plan A). Rank rule becomes `>=` for LAWYER→ASSISTANT only; everything else is unchanged.
- **On-hold.** Expose "พักงาน" in the web TaskDetailDrawer and the mobile task view (reason, category, next follow-up). Held tasks show an "พักอยู่" badge on boards.

### T5. Closing email
"อนุมัติ" on a closing-email draft actually sends it.
- Send via the existing email service to the selected client contacts.
- Store `sentAt` and the recipients.
- Show the status "ส่งแล้ว".

---

## Non-goals
- e-Filing/CIOS integration
- an enforcement asset module beyond the 10-year reminder
- custom report builder
- SMS

## Global constraints
- Prisma migrations:
  - Generate with `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script` or `--create-only`.
  - Apply locally with psql + `migrate resolve`.
  - Never run `migrate dev` or `migrate deploy` against the shared local DB.
- After editing `packages/shared`, run `pnpm --filter @lawfirm/shared build`.
- All new UI text in Thai, with English in the i18n files where the page already has an EN dictionary.
- In this worktree, call git as `/usr/bin/git`.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
