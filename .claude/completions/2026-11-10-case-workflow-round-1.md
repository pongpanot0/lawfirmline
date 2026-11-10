# Case workflow — round 1 (2026-11-10)

Workflow changes agreed in the grilling session. Round 2 will redesign the visuals of the 7 case pages.

## What changed
- **Open a case at its current stage.** New-case form field "ขั้นปัจจุบันของคดี", stored as `Case.openedAtStage` (migration `20261111090000_case_opened_at_stage`).
  - From ยื่นฟ้อง onward, a court and a black case number are required. Ticking "ยังไม่ทราบเลขคดี" creates the task "ใส่หมายเลขคดีดำ" instead.
  - Earlier stages show "ข้ามตอนเปิดคดี"; no tasks are back-filled.
- **One pre-litigation checklist for every case** (`preLitChecklist`): ข้อมูลครบ, ผลประโยชน์ขัดกัน, เอกสารจากลูกความ. Cases created from the form pass the first two automatically.
- **Assessment is an ordinary task.** "ประเมินและตัดสินใจแนวทาง (ฟ้อง / เจรจา / ส่งโนติส)" is created when a case opens at ก่อนฟ้อง; it is no longer a gate. The old "เริ่มดำเนินการคดี" task is gone.
- **Team.**
  - The lawyer who received the matter stays on the team as BUDDY when someone else leads, at case open and on handover.
  - New `DELETE /cases/:id/assignments/me` lets a member leave the team.
- **OwnerPicker.** New `GET /operations/assignees`, visible to every member: open cases, overdue tasks and leave, lightest workload first.
- **Linking emails from a case.**
  - New `GET /cases/:caseId/email/link-candidates` and `GET /email/link-candidates?clientId=`.
  - Dialog "ผูกอีเมลเข้าคดี", plus an optional section on the new-case form.
  - The thread list shows "ผูกโดย".
- **Conflict check on a case without an intake** (`caseId` on record/list).
- **Case page.** One "สิ่งที่ต้องทำ" card per stage replaces the old stack (8-step banner, nested 4-step checklist, locked cards, sticky bar). The right rail has the team and the matter's source.
- **Sidebar** collapse is remembered (localStorage).

## Verification
- API: tsc clean; 865 tests / 69 suites pass in cases, intake, email-intake, operations, conflict-check and tasks.
- Web: tsc clean; 208 node tests pass.
- Click-through on localhost (built-in browser):
  - Created cases at ก่อนฟ้อง and at สืบพยาน, ran the checklist, skipped a task and advanced a stage.
  - Changed the owner, linked an email, checked that the sidebar collapse persists.
  - At 375px there is no horizontal scroll.
- Cursor review: findings #3 and #4 fixed. #1 and #2 are pre-existing behaviour, not changed in this round.

## Left for later
- Round 2 visuals. The old stage selector "ขั้นตอนคดี", the SOP banner and the stat tiles still sit under the new card.
- Pre-existing behaviour, not changed in this round:
  - Any team member can advance a stage.
  - A BUDDY sees the done/skip buttons, but the API only lets the lead or the owner change them.
