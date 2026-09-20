# Samnuan — Case Management & Client Intake Audit

วันที่ 2026-09-19 (ตรวจซ้ำหลัง merge `origin/main` = 61b995b) · เทียบกับ `SAMNUAN-CASE-MANAGEMENT-INTAKE-AUDIT.md` v1.0
ฐานที่ตรวจ: `apps/api/prisma/schema.prisma`, `apps/api/src/**`, `apps/web/src/app/**` (branch `claude/samnuan-intake-audit-51fe74`)

## สรุป

| | Score | Level |
|---|---|---|
| Case Management | **69 / 100** | Usable Case Management (ใกล้ Strong) |
| Client Intake | **44 / 100** | Basic Intake |

ตรงกับ PART E ของ checklist กลับด้าน: **Case Management นำหน้า Intake** ซึ่งเป็นลำดับที่ถูกสำหรับ Samnuan
Gap ที่ใหญ่สุดคือ **Conflict Check = 0** และ Case ไม่มี **Stage** แยกจาก Status

---

# PART A — CASE MANAGEMENT · 69/100

| หมวด | Score | หลักฐาน / ที่ขาด |
|---|---|---|
| A1 Case Master | 9/12 | มี ownRef/folderId/customerRef, title, caseType+subType, courtName+courtLevel, black/red case number, client, leadLawyer, assignments, openedAt/closedAt, customFields, claimedAmount, limitationDeadline. **ขาด: stage แยกจาก status** (`CaseStatus` ปนกันอยู่: OPEN/DRAFTING/COURT_DATE/IN_PROGRESS/PENDING/CLOSED), ไม่มี priority, ไม่มี tags, ไม่มี ARCHIVED |
| A2 Parties | 5/8 | `CaseParticipant`: name, role (9 ค่า), side (OURS/OPPONENT/NEUTRAL), personType, idNumber, address, phone, email, opposingLawyer/Insurer, notes. **ขาด: 1 คน 1 role เท่านั้น, participant ไม่ผูกกับ Contact กลาง → ตอบ "นาย ก. อยู่คดีไหนบ้าง" ไม่ได้, ไม่มี duplicate detection, ไม่มี relationship ระหว่าง party** |
| A3 Documents | 8/12 | upload/download, `DocumentVersion` + `DocumentVersionStatus` (DRAFT→WAITING_REVIEW→RETURNED→APPROVED→SUPERSEDED), `ReviewRound`/`ReviewDecision`, `DocumentPublication`, `visibleToClient`, page-level `DocumentChunk` + `KnowledgeCitation`. **ขาด: folder/category, tags, document type, document date, link doc→task, link doc→event, permission ต่อไฟล์** |
| A4 Tasks | 8/10 | case-scoped, assignee, createdBy, status (มี PENDING_REVIEW/NEEDS_REVISION), priority, labels, dueDate, subtasks, comments, attachments, `TaskAssignmentLog`, `TaskOnHold`, playbook สร้าง task ชุดได้. **ขาด: startDate/completedAt, link task→document/event** |
| A5 Deadlines / Events | 9/10 | `CalendarEvent` (type COURT_DATE/CLIENT_MEETING/DEADLINE/OTHER, assignee, reminderMinutes, `ReminderLog`), `DeadlineRule` + `PublicHoliday` + dayBasis, `DocumentDateSuggestion` (มี source + verify/reject), `CourtDay`, agenda upcoming/overdue, ปฏิทินระดับคดี. **ขาด: history เมื่อ deadline ถูกเลื่อน** |
| A6 Notes / Communication | 5/8 | `CaseActivity` type NOTE, `CaseMessage` (คุยกับลูกความผ่าน portal + แนบไฟล์), `EmailThread`/`EmailMessage`/`EmailAttachment` + `MailboxConnection`. **ขาด: communication log รวมศูนย์ที่มี type/people involved/visibility (Internal / Client-visible / Private), ไม่มี log บทสนทนา LINE ต่อคดี (LINE ใช้แจ้งเตือนขาออกเท่านั้น)** |
| A7 Activity History | 5/8 | `CaseActivity` (who/what/when) + `AuditLog` ระดับสำนักงาน. **แต่ CaseActivity เป็น timeline ที่คนกรอก/ระบบยิงบางจุด (ปิดคดี, มอบหมาย) ไม่ใช่ feed อัตโนมัติครบทุก event** — status/stage change, doc upload, deadline change ไม่ได้ลงทุกเส้น |
| A8 Search / Filter | 3.5/5 | ค้น title, ownRef, customerRef, clientName, folderId, courtName, black/red number, client.name; filter status, caseTypeId, userId. **ขาด: ค้นจาก party, tags, ช่วงวันที่, saved filter** |
| A9 Relationships | 1.5/4 | intake↔case (1:1), `relatedCaseId` ฝั่ง intake. **ขาด: related case ↔ case, parent/child matter** |
| A10 Close / Archive | 3/5 | `close()` บังคับ closingSummary, เขียน activity, `reopen()`, หน้า closing-report, `ClosingEmailDraft`, มี `CaseOutcome`. **ขาด: เช็ก task/deadline/เอกสารค้างก่อนปิด, ไม่ได้บันทึก outcome ตอนปิด, ไม่มี archive แยกจาก closed** |
| A11 Permission | 4.5/6 | `CaseAccessService` แยกตาม FirmRole (OWNER เห็นทั้งสำนักงาน / SENIOR_LAWYER เห็นของ LAWYER ใต้สังกัด / คนอื่นเห็นเฉพาะที่ staffed), filter แยกสำหรับ task และข้อมูลการเงิน, ลบคดีได้แค่ OWNER, `ContactCaseAccess` ให้สิทธิ์ลูกความต่อคดี. **ขาด: restricted case flag, permission ต่อเอกสาร/ดาวน์โหลด, UI จัดการสิทธิ์รายคดี** |
| A12 Case Intelligence | 8/8 | `CaseKnowledge` + `KnowledgeCitation` (อ้างหน้า), RAG hybrid search ผ่าน `DocumentChunk` (pgvector) + `AiRun`, OCR สำหรับ PDF สแกน, `IntakePrecedentAnalysis` ตามมาที่คดี, date suggestion verify/reject, evidence view, timeline ของ event ที่ flag ช่องว่าง >30 วัน, AI usage dashboard. **iApp link จาก selected facts ครบแล้ว**: `LegalQuery` + `POST /cases/:id/legal/ask` (ตรวจ tenancy ของ citation, `CaseAccessGuard`, หัก AI credit) — แต่ commit 9bab34f ถอดหน้าจอส่วนนี้ออกจาก AI panel ไปแล้ว ของอยู่ครบแต่ผู้ใช้ยังกดไม่ได้ |

## P0 Gaps (Case Management)
1. **Stage แยกจาก Status** — checklist บอกชัดว่าต้องแยก; ตอนนี้ `CaseStatus` ปนกัน ทำให้ตอบไม่ได้ว่าคดีอยู่ขั้นตอนใดของกระบวนการ (ก่อนฟ้อง/สืบพยาน/บังคับคดี)
2. **Activity feed อัตโนมัติ** — ต้อง log ทุก state change เอง ไม่ใช่รอคนกรอก
3. **Document category / type** — ตอนนี้ไม่มีเลย ค้นเอกสารในคดีใหญ่จะพัง

---

# PART B — CLIENT INTAKE · 44/100

| หมวด | Score | หลักฐาน / ที่ขาด |
|---|---|---|
| B1 Lead Capture | 7/10 | `Intake` มี referralChannel (WALK_IN/PHONE/EMAIL/LINE/REFERRAL/PORTAL/OTHER), referralType, referralName, receivedBy + receivedDate, contactName, assignedUserIds; รับเข้าได้ 3 ทาง: manual, portal (`PortalIntakeSubmission`), email (`email-intake`). **ขาด: เบอร์/อีเมลบน lead โดยตรง (ต้องมี Client ก่อน), lead owner แยกจากผู้รับเรื่อง, duplicate detection** |
| B2 Pipeline | 5/12 | `IntakeStatus` 6 ค่า (RECEIVED/ASSESSING/CONSULTED/ACCEPTED/REJECTED/CONVERTED) + `preLitigationStatus`; filter by status + search + pagination. **ขาด: custom stages, stage history, next action, aging / เวลาค้างในแต่ละขั้น** — เปิด dashboard แล้วยังไม่รู้ว่าใครค้างตรงไหนกี่วัน |
| B3 Qualification | 6.5/10 | matterType, incidentDate, opposingParty, estimatedDamage, insurerName/policy/claim, description, caseStrength, assessor + assessedAt + assessmentNotes, `IntakeFieldProposal` (AI เสนอค่า ให้ทนายยืนยัน — และแก้ฟิลด์แล้ว reset confirmation). **ขาด: คำถามกำหนดเองต่อ matter type, required/conditional questions** |
| B4 **Conflict Check** | **0/12** | ไม่มีเลย — ไม่มี model, service, endpoint หรือหน้าจอ ("conflict" ในโค้ดทั้งหมดคือ `ConflictException` กับการชนกันของตารางศาล) |
| B5 Intake Form | 4/10 | ฟอร์ม portal (`/portal/intake/new`) → `PortalIntakeSubmission` + attachments + referenceNumber, แปลงเป็น intake ได้, mobile friendly. **ขาด: customizable, ต่างกันตาม matter type, public link (ต้อง login portal ก่อน), required/conditional config, form status** |
| B6 Document Collection | 2/6 | `IntakeAttachment`, `PortalRequestMessage` ขอเอกสารเพิ่มได้. **ขาด: checklist เอกสารที่ต้องใช้ + status Requested/Received/Missing/N-A** |
| B7 Consultation | 3/8 | สถานะ CONSULTED, decision CONSULTATION_ONLY, requestedResponseDate. **ขาด: นัดปรึกษาเป็น event จริง (ทนาย/วันเวลา/reminder), consultation note แยก, outcome, no-show** |
| B8 Follow-up | 2.5/8 | requestedResponseDate, deadlineDate, daily digest. **ขาด: next follow-up date + owner, follow-up history, สถานะ NO_RESPONSE, automation ("ไม่ตอบ 2 วัน → เตือน")** |
| B9 Engagement / Retainer | 4/8 | `PortalIntakeSubmission` มี scopeText, proposedDate/agreedDate, commitmentVersion + acceptedCommitmentVersion + agreementAcceptedAt (= ตกลงขอบเขตงานแบบมีเวอร์ชัน), `Invoice` ผูก intake ได้. **ขาด: engagement letter เป็นเอกสารที่มี status Draft/Sent/Viewed/Signed/Declined/Expired, eSign** |
| B10 Accept / Decline | 3/4 | `IntakeDecision` 7 ค่า + decisionNotes + decidedAt + clientDecision, status ACCEPTED/REJECTED. **ขาด: LOST / NO_RESPONSE / DUPLICATE / CONFLICT / REFERRED_OUT เป็นผลลัพธ์ที่วิเคราะห์ได้** |
| B11 Convert to Client / Case | 5.5/6 | แข็งที่สุดของฝั่ง intake: `convertToCase()` ยิง ownRef ใหม่, ย้าย client + customers (สัดส่วน), ไฟล์, precedent analyses, referralSource, assignedUserIds → CaseAssignment, limitationDeadline → CalendarEvent, เปิด InsuranceClaim ให้ถ้ามี insurer, เก็บ `intakeId` ไว้บนคดี (ประวัติ intake ไม่หาย), **idempotent** (กดซ้ำไม่เปิดคดีซ้ำ), แนบเข้าคดีเดิมได้ผ่าน `relatedCaseId`. **ขาด: apply matter playbook อัตโนมัติตอน convert (playbook ต้อง apply แยก)** |
| B12 Intake Reporting | 1.5/6 | `reports.getSummary()` ระดับสำนักงาน. **ขาด: funnel ต่อ stage, conversion rate, response time, time-to-consultation, lost reasons, no-response count** |

## P0 Gaps (Intake)
1. **Conflict Check** — 12 คะแนนที่หายไปทั้งก้อน และเป็นข้อที่ checklist บอกว่าขาดแล้ว "ยังไม่ครบสำหรับ workflow สำนักงานกฎหมาย"
2. **Pipeline aging + next action** — มี stage แต่ไม่รู้ว่าค้างนานแค่ไหนและใครต้องทำอะไรต่อ
3. **Follow-up / no-response** — lead ที่เงียบหายได้จริงในระบบปัจจุบัน

---

# TOP 15 GAP CHECK

## Case Management
- [~] Case มี Stage ไม่ใช่แค่ Status — **ไม่ผ่าน** (ปนกันใน CaseStatus)
- [x] Case มีหลาย Party + Role
- [x] Task อยู่ภายใต้ Case
- [x] Deadline แยกจาก Task (CalendarEvent + DeadlineRule)
- [ ] Document มี category — **ไม่มี**
- [~] มี Activity History — มี แต่ไม่ครบอัตโนมัติ
- [x] มี Notes / Communication
- [x] มี Permission
- [~] Close Case มี workflow — มี summary + reopen แต่ไม่เช็กงานค้าง
- [~] Search จาก client / case no. ได้ — ได้; **จาก party ไม่ได้**

## Intake
- [x] Lead มี Pipeline (แต่ fixed stages)
- [ ] มี Conflict Check ก่อนรับ — **ไม่มี**
- [~] มี Consultation — มีแค่สถานะ ไม่มีการนัด
- [x] มี Accept / Decline reason
- [x] Convert Intake → Case โดยไม่กรอกข้อมูลซ้ำ — **ทำได้ดี**

---

# ลำดับที่แนะนำ

ตาม PART F + Recommended Interpretation: Case Management อยู่ 69 (ต่ำกว่า 75 แต่สูงกว่า 60) → **ปิด P0 ของ Case ก่อน แล้วค่อยเติม Intake ก้อนใหญ่**

1. `Case.stage` แยกจาก status + stage history (เปิดทาง Operations/workflow ทั้งหมด)
2. Conflict Check (ค้น Client / ClientContact / CaseParticipant / Intake ทั้งสำนักงาน + เก็บผลเป็น record)
3. Document category/type + ค้นเอกสาร
4. Activity feed อัตโนมัติจาก state change
5. Intake pipeline aging + follow-up owner/date + สถานะ NO_RESPONSE
6. Party กลาง (participant → contact) เพื่อตอบ "คนนี้อยู่คดีไหนบ้าง" และเป็นวัตถุดิบของ conflict check

ข้อ 6 กับข้อ 2 เป็นงานเดียวกันในทางปฏิบัติ — contact กลางคือสิ่งที่ทำให้ conflict check ทำงานได้จริง

---

# บันทึกการตรวจซ้ำ (merge origin/main)

6 commit ใหม่ (#37–#39) ลงที่ A12 Case Intelligence ทั้งหมด: hybrid search, OCR สำหรับ PDF สแกน, combined AI tab, evidence view, case timeline, AI usage dashboard, และ iApp flow (`LegalQuery`, `apps/api/src/legal/`) ซึ่งปิดช่องสุดท้ายของ A12 → **7 → 8/8, รวม 68 → 69**

ไม่มี commit ใดแตะ conflict check, case stage, document category, activity feed หรือ intake pipeline — **P0 gaps ทั้ง 5 ข้อยังอยู่ครบ** และช่องว่าง Case (69) vs Intake (44) ถ่างขึ้นอีก


---

# ผลหลังปิด P0 gaps (2026-09-19, รอบที่สอง)

| | ก่อน | หลัง | Level |
|---|---|---|---|
| Case Management | 69 | **79 / 100** | Strong Legal Case Management |
| Client Intake | 44 | **68 / 100** | Usable Legal Intake |

## สิ่งที่เปลี่ยน

| หมวด | คะแนน | สิ่งที่เพิ่ม |
|---|---|---|
| A1 Case Master | 9 → 11 | `CaseStage` 9 ขั้น (รับเรื่อง…ปิดคดี) แยกจาก `CaseStatus` + `stageChangedAt` + สถานะ `ARCHIVED` |
| A2 Parties | 5 → 6 | ค้นคดีจากชื่อคู่กรณีได้ (`?party=`, และ search ครอบ participant) → ตอบ "นาย ก. อยู่คดีไหนบ้าง" ได้ผ่าน conflict search |
| A3 Documents | 8 → 10 | `DocumentCategory` 10 หมวด + `documentDate` + `tags` + กรองตามหมวด/tag/ชื่อไฟล์ + นับจำนวนต่อหมวด, เรียงด้วยวันที่บนเอกสาร |
| A7 Activity History | 5 → 7 | `CaseFeedService` ลง feed อัตโนมัติ: เปลี่ยนสถานะ, ย้ายขั้นตอน, เปลี่ยนทนาย/ทีม, อัปโหลดเอกสาร, ปิด/เปิด/เก็บเข้าคลัง |
| A8 Search | 3.5 → 4.5 | กรองตามขั้นตอน + ค้นจาก party |
| A10 Close / Archive | 3 → 5 | เช็กงาน/วันนัด/เอกสารค้างก่อนปิด (ข้ามได้แต่ต้องกดรับทราบ + บันทึกลง feed), บันทึก outcome ตอนปิด, archive แยกจาก closed |
| B1 Lead Capture | 7 → 7.5 | `followUpOwnerId` แยกจากผู้รับเรื่อง |
| B2 Pipeline | 5 → 10 | `IntakeStage` 10 ขั้น + `stageChangedAt` + aging (`ageDays`/`daysInStage`/`followUpOverdueDays`) + กรองตามขั้น/ค้างกี่วัน/ต้องติดตาม |
| **B4 Conflict Check** | **0 → 10** | ค้นทั่วสำนักงาน (Client, ClientContact, CaseParticipant, Case.clientName, Intake ทุกฟิลด์ชื่อ) → `ConflictCheck` เก็บคำค้น + snapshot ผล + คำตัดสินของทนาย + ผู้ตรวจ; **กั้นการเปิดคดีถ้าผลล่าสุดไม่ใช่ CLEAR** (ข้ามได้ด้วยเหตุผลที่ถูกบันทึกลง feed ของคดี) |
| B6 Document Collection | 2 → 6 | `IntakeDocumentRequest` checklist (REQUESTED/RECEIVED/MISSING/NOT_APPLICABLE + required) + ปุ่มเติมเอกสารที่ขอบ่อย + **กั้นการออกหนังสือถ้าเอกสารที่จำเป็นยังไม่ครบ** |
| B8 Follow-up | 2.5 → 6.5 | `IntakeFollowUp` ประวัติการติดตาม + นัดครั้งถัดไป + ผู้ถือเรื่อง + สถานะ `NO_RESPONSE` |
| B10 Accept / Decline | 3 → 3.5 | `NO_RESPONSE` เป็นผลลัพธ์ที่วิเคราะห์ได้ |

## หลักที่ยึดไว้

ทั้งสามด่านที่เพิ่ม (เอกสารไม่ครบก่อนออกหนังสือ, ยังไม่ตรวจ conflict ก่อนเปิดคดี,
ของค้างก่อนปิดคดี) **ข้ามได้ทั้งหมด** แต่ต้องตั้งใจข้ามและมีร่องรอย — ตรงตาม
checklist ที่ว่า "ระบบไม่ควรตัดสินใจรับ/ไม่รับคดีแทนทนาย" สิ่งที่ห้ามคือข้ามแบบไม่มีใครรู้

## ยังเหลือ (P1)

```text
Custom stages ต่อสำนักงาน (ตอนนี้เป็น enum ตายตัว)
Contact กลาง (participant ยังเป็น string ไม่ผูก contact → conflict check ยังค้นด้วย contains)
Notes/Communication รวมศูนย์ + visibility (Internal / Client-visible / Private)
Consultation เป็น event จริง (นัด/ทนาย/reminder/no-show)
Intake funnel report (conversion rate, response time, lost reasons)
Engagement letter + eSign
Related case ↔ case, parent/child matter
Automation ของ follow-up (ตอนนี้ต้องมีคนนัด)
```
