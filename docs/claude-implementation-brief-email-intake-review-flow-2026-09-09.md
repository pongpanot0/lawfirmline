# Claude Implementation Brief — Email Intake, Word Review, and Pre-Litigation Workspace

วันที่: 9 กันยายน 2026

เอกสารนี้เป็น brief สำหรับให้ Claude หรือ agent อื่นนำไป implement ต่อในโปรเจกต์ LexFlow/Lawfirm โดยอิงจาก mockup และ UX discussion ล่าสุด จุดประสงค์ไม่ใช่ทำ feature สวย ๆ เพิ่ม แต่ต้องทำให้สำนักงานกฎหมายรู้สึกว่า "ซื้อแล้วงานลดจริง" โดยเฉพาะงานซ้ำจากอีเมล Word OneDrive การตรวจเอกสาร และการตามรุ่นเอกสาร

## เป้าหมายธุรกิจ

ผู้ใช้หลักคือสำนักงานกฎหมายที่ปัจจุบันทำงานประมาณนี้:

1. ลูกค้าส่งอีเมลพร้อมเอกสารก่อนฟ้อง
2. ทนายเปิดอ่านเมลและเอกสาร เพื่อประเมินว่าควรฟ้องหรือไม่
3. บางกรณีต้องส่ง notice ก่อน
4. ถ้าควรฟ้อง ต้องตอบลูกค้าว่าทำไมควรฟ้อง ถ้าไม่ควรฟ้อง ต้องตอบเหตุผลและทางเลือก
5. ทนายมักเอาไฟล์คดีเก่ามาแก้ชื่อ/เนื้อหา ใช้แบบฟอร์มกลางของสำนักงาน หรือใช้แบบฟอร์มศาล
6. เขียน/แก้ Word แล้ว save ใน OneDrive
7. ส่งให้หัวหน้า หรือผู้ตรวจคนใดก็ได้ตรวจ
8. ผู้ตรวจอาจพิมพ์เอกสารออกมา ขีดเส้น เขียน comment ด้วยมือ แล้วคืนกระดาษให้ผู้แก้
9. ลูกค้ามัก reply ในอีเมล thread เดิมเมื่อถามเพิ่มหรือส่งเอกสารเพิ่ม

Product promise ที่ควรยึด:

> ใช้แบบที่สำนักงานตรวจแล้ว เติมข้อมูลซ้ำให้น้อยลง ตามรุ่นเอกสารได้ และให้ทนายเป็นคนตัดสินใจ/ตรวจทุกจุดสำคัญ

ระบบไม่ควรพยายามเป็น AI lawyer ที่ตัดสินคดีเอง แต่ควรเป็น operations layer ที่เก่งมากในการเตรียมข้อมูล จับคู่ thread ดึงข้อมูลซ้ำ จัดไฟล์ ตามรุ่น และทำให้ review cycle ชัดเจน

## Prototype ที่มีอยู่

มี prototype แยกจาก production อยู่ที่:

- `docs/prototypes/prelitigation-workspace/intake.html`
- `docs/prototypes/prelitigation-workspace/intake.css`
- `docs/prototypes/prelitigation-workspace/intake.js`
- `docs/prototypes/prelitigation-workspace/index.html`
- `docs/prototypes/prelitigation-workspace/app.js`
- `docs/prototypes/prelitigation-workspace/FLOW.md`
- `docs/prototypes/prelitigation-workspace/EMAIL-INTAKE.md`

รัน prototype:

```sh
python3 -m http.server 3012 --bind 127.0.0.1 --directory docs/prototypes/prelitigation-workspace
```

เปิด:

- `http://127.0.0.1:3012/intake.html` สำหรับ email intake และ reply thread
- `http://127.0.0.1:3012/index.html?variant=1` สำหรับ matter workspace
- `http://127.0.0.1:3012/index.html?variant=2` สำหรับ review queue
- `http://127.0.0.1:3012/index.html?variant=3` สำหรับ flow map

Prototype เป็น source of truth ด้าน UX intent เท่านั้น ยังไม่เชื่อม Outlook, OneDrive, Word, database, upload, OCR, AI extraction หรือ real email sending

## Scope ที่ควรทำเป็น implementation แรก

ทำ vertical slice ที่ใช้ได้จริงพอพิสูจน์ว่า workflow ลดงาน:

1. Intake จาก email/thread mock หรือ connector layer ที่ยัง stub ได้
2. แสดง source email และ attachments ข้าง ๆ form
3. Pre-fill ข้อมูลสำคัญจาก email/attachment suggestion
4. ให้ lawyer ยืนยัน/แก้ข้อมูลก่อนกดรับงาน
5. สร้างหรือจับคู่ matter/pre-litigation intake record
6. เมื่อมี reply thread ใหม่ ให้เสนอ update เฉพาะ field ที่เปลี่ยนหรือไฟล์ใหม่
7. เปิด workspace สำหรับประเมินแนวทาง: ขอข้อมูลเพิ่ม, ส่ง notice, ควรฟ้อง, ไม่ควรฟ้อง
8. เตรียม document draft จาก template ที่สำนักงานตรวจแล้ว
9. เลือกผู้ตรวจและผู้แก้ได้หลายคน โดยไม่ hardcode ตาม role
10. เปิดหน้า document review ที่มีปุ่มผ่าน/ส่งกลับแก้ในหน้าเอกสารเอง
11. ผูก approval กับ document version/revision
12. เมื่อแก้เนื้อหาหลังผ่านแล้ว ต้อง invalidate approval ของ version เดิมและสร้าง review round ใหม่
13. เตรียม email draft หลังเอกสารหรือเหตุผลผ่าน review แล้ว แต่ไม่ส่งจริงอัตโนมัติ

ยังไม่ต้องทำระบบรวบรวมแบบฟอร์มศาลทั้งหมดจากทุกศาลในรอบแรก ให้เริ่มจาก firm-verified templates และ court forms ที่สำนักงานใช้จริงก่อน

## Non-goals รอบแรก

ห้ามทำให้ scope บานใน implementation แรก:

- ไม่ต้องสร้าง AI ที่ตัดสินว่าควรฟ้องแทนทนาย
- ไม่ต้อง auto-send email
- ไม่ต้อง auto-file court documents
- ไม่ต้องดึงแบบฟอร์มศาลทุกแบบทุกศาล
- ไม่ต้อง OCR ลายมือจากกระดาษตรวจเป็น core path
- ไม่ต้องสร้าง client portal publication ใน slice นี้
- ไม่ต้องทำ permission expansion ตอนเลือก reviewer/editor; เลือกได้เฉพาะคนที่มีสิทธิ์ใน matter อยู่แล้ว
- ไม่ต้อง claim ว่าเชื่อม Outlook/OneDrive พร้อมใช้งานถ้ายังไม่ได้ตรวจ permission จริง

## Core UX Flow

### 1. Email Intake Queue

หน้ารับงานควรให้ lawyer เห็นสองฝั่ง:

- ฝั่งซ้าย: email ต้นทาง, sender, timestamp, subject, body excerpt, attachments
- ฝั่งขวา: form ที่ระบบเตรียมให้ พร้อม source label และ confidence/needs-confirmation

Fields ขั้นต่ำ:

- Matter title
- Client name
- Contact person
- Requested amount
- Requested response date
- Request summary
- Responsible lawyer/team
- Missing information
- Suggested existing client/matter match

ทุก field ที่ระบบเสนอ ต้อง editable และต้องแสดงแหล่งที่มา เช่น:

- `found in email body`
- `found in attachment`
- `suggested from existing client`
- `requires lawyer confirmation`
- `conflict: email says X, invoice says Y`

สำคัญ: วันที่ที่ลูกค้าขอคำตอบไม่ใช่ legal deadline และไม่ใช่ agreed delivery date ต้องแยก label ชัด

### 2. Confirm Before Accepting Work

ก่อนกดรับงาน ต้องมี confirmation อย่างน้อยสำหรับ field ที่เสี่ยง:

- amount
- requested response date
- client/matter match เมื่อระบบจับคู่จากข้อมูลเดิม

Acceptance button copy ควรสื่อว่าเป็นการรับเข้าระบบเพื่อพิจารณา ไม่ใช่รับฟ้อง:

- ดี: `ยืนยันข้อมูลและรับเข้าพิจารณา`
- ดี: `รับเรื่องเข้าทำงาน`
- เลี่ยง: `รับฟ้อง`
- เลี่ยง: `อนุมัติคดี`

Validation:

- ห้าม accept ถ้า required field ว่าง
- ห้าม accept ถ้า field ที่ระบบ mark ว่า require confirmation ยังไม่ถูกยืนยัน
- ถ้า amount/date ถูกแก้ ต้อง reset confirmation ของ field นั้น
- ถ้าจับคู่ matter กำกวม ต้องให้คนเลือกก่อน

### 3. Reply Thread Updates

ลูกค้าจะส่งข้อมูลเพิ่มด้วยการ reply ใน email thread เดิม ระบบควรมีหน้าจอ "เมลตอบกลับ" ที่ไม่เขียนทับข้อมูลเดิมทันที

แสดง:

- ข้อความล่าสุดใน thread
- attachments ใหม่
- detected changes
- previous value
- proposed new value
- source ของ proposed value
- effect ต่อ draft/review เดิม

ตัวอย่าง:

- amount เดิม 450,000 บาท
- reply ใหม่บอกชำระแล้ว 50,000 บาท
- proposed remaining amount 400,000 บาท
- lawyer ต้องเลือกว่าจะ apply หรือไม่

กติกาสำคัญ:

- ไม่เขียนทับ field ที่ lawyer ยืนยันแล้วแบบเงียบ ๆ
- ถ้า apply ข้อมูลใหม่แล้วกระทบร่างเอกสาร ต้อง mark ว่า draft ต้องทบทวน
- ถ้าเอกสาร version ผ่าน review ไปแล้ว แล้วข้อมูลใหม่เปลี่ยนสาระ ต้องสร้าง version/review ใหม่
- ไฟล์ซ้ำต้อง detect และเสนอ skip/replace/link เป็น existing evidence

### 4. Matter Workspace

หลังรับเรื่องแล้ว ควรเข้า workspace ที่ตอบคำถามเดียว: "ตอนนี้ต้องทำอะไรต่อเพื่อให้เรื่องเดิน"

แนะนำ layout:

- Header: matter title, client, current stage, owner, next action
- Left rail หรือ side context: email thread, documents, missing info, activity
- Main pane: current task เช่น assessment/document/review/reply
- Right pane หรือ bottom panel: sources, version, review status

Assessment choices:

- ขอข้อมูลเพิ่ม
- ส่ง notice
- ควรฟ้อง
- ไม่ควรฟ้อง

แต่ละ choice ต้องมี reason ที่ lawyer แก้เองได้ ระบบเสนอร่างได้แต่ต้องอิง source และแสดง missing facts

### 5. Document Preparation

เอกสารควรเริ่มจากหนึ่งในสามแหล่ง:

- firm-approved template
- old case document ที่สำนักงานอนุญาตให้ใช้เป็นต้นแบบ
- court form ที่สำนักงานเก็บต้นฉบับพร้อม source และวันที่ตรวจสอบ

สำหรับ court form:

- เก็บ source URL/file
- เก็บวันที่ตรวจสอบ
- เก็บ version/form year ถ้ามี
- เติมเฉพาะช่องที่รองรับ
- รักษารูปแบบเพื่อพิมพ์
- ถ้า form ยังไม่ verified ห้ามเปิด auto-fill เป็น primary action

Document status ต้องผูกกับ version/revision ไม่ใช่ชื่อไฟล์ลอย ๆ:

- draft
- waiting_review
- returned_for_changes
- approved
- superseded

เมื่อมีการแก้เนื้อหาสาระ ต้องสร้าง version ใหม่ และ approval ของ version เดิมไม่ควรถูกใช้ต่อ

### 6. Review Assignment

ผู้ตรวจและผู้แก้เลือกได้ตามงาน ไม่ผูกกับ role ตายตัว:

- Owner เป็น reviewer ได้
- Senior lawyer เป็น reviewer ได้
- Lawyer เป็น reviewer ได้
- คนที่เป็น editor ในเอกสารหนึ่ง อาจเป็น reviewer ในเอกสารอื่นได้
- reviewer/editor list ต้องมาจากสมาชิกที่มี access ใน matter

Review round ต้องเก็บ:

- document id
- version/revision id
- reviewers
- editors
- due date
- review scope
- required approval rule
- per-reviewer decision
- return reason
- timestamps

รอบแรกใช้กติกา default ได้ว่า "ผู้ตรวจทุกคนที่เลือกต้องผ่าน" แต่ควรออกแบบให้เปลี่ยนได้ภายหลัง เช่น approve any one, sequential approve, all approve

### 7. Reviewer Document Page

จาก feedback ล่าสุด: เมื่อ reviewer กด "เปิดตรวจ" จากคิว ไม่ควรให้กลับไปกดผ่านในตารางอย่างเดียว ต้องเปิดหน้าเอกสาร แล้วมี action ของคนตรวจบนหน้านั้น

พฤติกรรมที่ต้องมี:

- เปิด document review page ในบริบทของ reviewer ที่เลือก
- แสดง document preview/content และ metadata
- แสดง version ที่กำลังตรวจ
- แสดงว่า reviewer คนนี้กำลังตรวจในนามใคร
- มี primary actions ติดอยู่ในหน้า: `ผ่านการตรวจ` และ `ส่งกลับแก้ไข`
- เมื่อกดผ่าน ต้องยืนยันกับ version ปัจจุบัน
- ถ้า version เปลี่ยนระหว่างเปิดหน้า ต้องเตือนและห้าม approve version เก่า
- ถ้า reviewer คนนี้ approve แล้ว ให้แสดง `คุณตรวจผ่านแล้ว`
- ถ้ายังรอ reviewer คนอื่น ให้แสดงว่าเหลือใคร
- ถ้าผ่านครบ ให้ status เอกสารเป็น approved
- ถ้าส่งกลับแก้ไข ต้องบังคับกรอก reason
- หลังส่งกลับ status เป็น returned_for_changes และ editor ต้องแก้เป็น version ใหม่ก่อนส่งตรวจอีกครั้ง

UX copy ที่แนะนำ:

- `ผ่านการตรวจฉบับนี้`
- `ส่งกลับแก้ไข`
- `คุณตรวจผ่านแล้ว · ยังรอผู้ตรวจอื่น`
- `ผ่านการตรวจครบแล้ว`
- `เอกสารถูกแก้หลังจากเปิดหน้านี้ กรุณาเปิดฉบับล่าสุดก่อนตรวจ`

### 8. Paper Review Support

เพราะผู้ตรวจบางคนยัง print แล้วขีดเส้นบนกระดาษ ระบบควร support โดยไม่บังคับ OCR ตั้งแต่แรก:

- document print packet ควรมี version code หรือ review round code
- เมื่อได้รับกระดาษคืน editor สามารถ mark ว่า received paper comments
- แนบ scan/photo ได้ในอนาคต แต่ไม่ใช่ core path รอบแรก
- return reason ในระบบควรสรุปสิ่งที่ต้องแก้ เพื่อให้ audit trail ตามได้

### 9. Draft Client Reply

หลัง assessment/document review ผ่านแล้ว ระบบช่วยเตรียมร่างตอบลูกค้าได้

แยกสถานะ:

- internal reasoning draft
- reviewed response content
- Outlook draft created
- sent confirmation

ห้ามถือว่า `created Outlook draft` คือ `sent`

ก่อนสร้าง draft ต้องให้ lawyer ตรวจ:

- recipients
- subject/thread
- body
- attachments
- whether this is in same reply thread

ถ้าเชื่อม Outlook จริง ให้เริ่มจาก create draft message ก่อน ไม่ auto-send

## Data Model Suggestion

ชื่อตาราง/โมเดลให้ปรับตาม codebase จริง แต่อย่างน้อยควรมี concept เหล่านี้:

```ts
type IntakeSource = {
  id: string;
  provider: 'mock' | 'outlook' | 'gmail' | 'manual';
  threadId?: string;
  messageId?: string;
  subject: string;
  from: string;
  receivedAt: string;
  bodyText?: string;
  attachments: SourceAttachment[];
};

type ProposedField = {
  field: string;
  proposedValue: string | number | null;
  previousValue?: string | number | null;
  sourceRefs: SourceRef[];
  status: 'suggested' | 'requires_confirmation' | 'confirmed' | 'rejected' | 'conflict';
  confirmedBy?: string;
  confirmedAt?: string;
};

type MatterIntake = {
  id: string;
  title: string;
  clientName: string;
  contactName?: string;
  requestedAmount?: number;
  requestedResponseDate?: string;
  requestSummary?: string;
  status: 'received' | 'needs_confirmation' | 'accepted_for_assessment' | 'waiting_for_client' | 'converted_to_matter' | 'closed';
  ownerId?: string;
  sourceThreadId?: string;
  fieldProposals: ProposedField[];
};

type DocumentVersion = {
  id: string;
  documentId: string;
  versionNumber: number;
  storageProvider: 'mock' | 'onedrive' | 'sharepoint' | 'local';
  fileRef: string;
  sourceTemplateId?: string;
  status: 'draft' | 'waiting_review' | 'returned_for_changes' | 'approved' | 'superseded';
  contentHash?: string;
  createdBy: string;
  createdAt: string;
};

type ReviewRound = {
  id: string;
  documentVersionId: string;
  reviewers: string[];
  editors: string[];
  approvalRule: 'all' | 'any_one' | 'sequential';
  scope?: string;
  dueAt?: string;
  status: 'waiting_review' | 'returned' | 'approved' | 'cancelled';
  decisions: ReviewDecision[];
};

type ReviewDecision = {
  reviewerId: string;
  decision: 'approved' | 'returned';
  reason?: string;
  decidedAt: string;
  documentVersionId: string;
};
```

## Permissions

อย่าผูก business permission กับ display role แบบแข็ง:

- role owner/senior lawyer/lawyer ใช้ช่วยจัด navigation และ default access ได้
- reviewer/editor ต้องเลือกจาก matter members ที่มีสิทธิ์อยู่แล้ว
- ถ้าจะเพิ่มคนนอก matter ต้องเป็น permission flow แยก มี confirmation และ audit trail
- reviewer เห็นเฉพาะเรื่อง/เอกสารที่ถูก assign หรือที่ตนมีสิทธิ์
- client portal หรือ publication เป็นคนละ permission domain กับ internal work documents

## Suggested UI Routes

ปรับตาม framework จริง แต่ควรมี route-level surfaces ประมาณนี้:

- `/intake` หรือ `/dashboard/intake`: queue ของ email/thread ที่รอรับงาน
- `/intake/:id`: intake detail พร้อม source email และ confirm fields
- `/matters/:id/workspace`: matter workspace หลังรับเรื่อง
- `/matters/:id/documents/:documentId`: document detail
- `/matters/:id/documents/:documentId/review/:roundId`: reviewer document page
- `/reviews`: คิวเอกสารรอตรวจของ user ปัจจุบัน
- `/matters/:id/reply-drafts`: draft reply และสถานะการส่ง

ถ้า production app มี route เดิมใกล้เคียง ให้ใช้ route เดิมก่อน อย่าสร้าง top-level ใหม่โดยไม่จำเป็น

## UI Requirements

หน้า intake:

- ใช้ split view บน desktop: source email ซ้าย, confirmation form ขวา
- บน mobile stack email ก่อน แล้ว form
- แสดง source highlight สำหรับข้อมูลที่ถูกดึงมาเติม
- แสดง badge ว่า field ไหน found/suggested/requires confirmation/conflict
- primary action อยู่ชัดเจน แต่ disabled พร้อม error เมื่อยังไม่ยืนยันครบ
- ใช้ wording ว่า "รับเข้าพิจารณา" ไม่ใช่ "รับฟ้อง"

หน้า reply update:

- แสดง old value vs new value เป็น comparison
- มี checkbox หรือ toggle ต่อรายการว่าจะ apply อะไร
- มี note ว่าการ apply อาจทำให้ draft/review เดิมต้องทบทวน
- แยก apply amount กับ add file ออกจากกัน
- หลัง apply ต้องเก็บ audit ว่าใครรับข้อมูลจาก reply ไหน

หน้า review:

- reviewer ต้อง approve/return ในหน้าเอกสารได้
- action bar ควร sticky หรืออยู่ในตำแหน่งที่เห็นตลอดตอนอ่าน
- return ต้องมี modal/textarea บังคับ reason
- approve ต้องผูกกับ version ที่เห็นอยู่
- หลัง approve แล้วปุ่มต้องเปลี่ยน state ห้าม approve ซ้ำ

## Backend Rules

1. Never overwrite lawyer-confirmed fields silently
2. Every proposed update from email reply must carry source refs
3. Approval always belongs to a specific document version
4. Editing a document after approval creates or requires a new version
5. Returned review must have reason
6. Sending/creating email draft must be separate from internal approval
7. Accepting intake is not accepting litigation
8. Requested response date is not legal deadline
9. Court form templates must have source and verified date before auto-fill
10. File duplicate detection should avoid creating confusing repeated attachments

## Integration Notes

Outlook/Microsoft 365:

- Start with draft creation, not sending
- Confirm mailbox type: personal mailbox vs shared mailbox
- Confirm Microsoft Graph permissions before promising product capability
- Keep provider message id/thread id for reply matching
- Handle expired connection and permission revocation

OneDrive/SharePoint:

- Prefer one canonical file reference per working document
- Track revision/content hash where possible
- Detect if file changed after reviewer opened it
- Handle moved/deleted files and permission loss

AI extraction:

- AI suggestions must show source and uncertainty
- AI must not invent facts, dates, legal deadlines, court outcomes, or final advice
- Missing data is a valid result
- Conflict between sources must be shown as conflict, not resolved silently

## Acceptance Criteria

Implementation is acceptable when these user journeys work end to end using seed/mock data or real connector stubs:

1. Lawyer opens an email intake, sees source email and proposed fields
2. Lawyer cannot accept until required confirmations are checked
3. Editing amount/date resets confirmation for that field
4. Lawyer accepts intake as pre-litigation assessment, not as filing/litigation acceptance
5. A reply in the same thread proposes changes without overwriting confirmed data
6. Lawyer selectively applies amount update while skipping duplicate/irrelevant file
7. Matter workspace shows assessment choices and stores lawyer reason
8. Lawyer prepares a document from verified firm template or mock template
9. Lawyer assigns reviewer/editor from matter members
10. Reviewer opens document review page and can approve in that page
11. Reviewer can return with required reason
12. After return, editor creates a new version before resubmitting
13. Approval is tied to exact version; stale version cannot be approved
14. When all required reviewers approve, document version becomes approved
15. Email draft step remains draft-only and requires recipient/content confirmation

## QA Scenarios

Test these before calling the work done:

- intake with complete email
- intake with missing amount
- intake with conflicting amount between email and invoice
- edit amount then try accept without re-confirming
- reply thread reduces amount after partial payment
- reply thread includes duplicate attachment
- reply thread includes new signed delivery evidence
- reviewer approves once, then tries again
- reviewer opens version 1, editor creates version 2, reviewer tries to approve stale page
- reviewer returns without reason
- editor edits after approval and approval is invalidated for new version
- role lawyer acts as reviewer
- role senior lawyer acts as editor
- owner is not required for every review
- Outlook draft created but not sent

## Implementation Approach

Recommended order:

1. Read current app routes and models for dashboard, matters/cases, documents, tasks, roles, users, and approvals
2. Reuse existing layout/navigation/components where possible
3. Add mock-backed vertical slice before real connector
4. Implement intake record and proposed fields with source refs
5. Implement reply update comparison and selective apply
6. Implement document version and review round behavior
7. Implement reviewer document page action bar
8. Add focused tests for state transitions and stale version protection
9. Only then wire Outlook/OneDrive behind provider interfaces

Do not start by building every Microsoft integration. The value can be proven first with realistic mocks and seed data if the state model is correct.

## Product Bar

The final UX should feel like:

- Lawyer opens email, most fields are already ready
- Lawyer edits two or three important things instead of copying everything
- Files are already grouped under the matter
- Reply thread updates are proposed, not lost in email
- Reviewer opens one page, checks document, clicks pass or return
- Everyone can see which version passed and which version was sent back
- Email response is prepared as a draft after review, still controlled by lawyer

If the implementation adds more manual admin work than the old Word/OneDrive/email process, it misses the product point.
