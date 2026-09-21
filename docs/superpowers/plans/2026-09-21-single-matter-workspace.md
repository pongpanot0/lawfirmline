# Single Matter Workspace (ทำตามแบบ) Implementation Plan

**Spec:** Design canvas https://claude.ai/artifact/DB488CCMJ5PaxHR8GFUy6u (V16) + กติกาในบทสนทนา
**Goal:** จอเดียวตั้งแต่รับเรื่องถึงจบคดี — case เปิดตั้งแต่รับเรื่อง, หน้า case เป็น workspace ตามแบบ, AI กดเองเท่านั้น

## หลักที่ล็อกจากแบบ
- Record เดียว: สร้าง "รับเรื่องใหม่" = เปิด Case ทันที stage `INTAKE_REVIEW` (intake ยังเป็นตัวเก็บข้อมูลรับเรื่อง/โนติส ผูก 1:1 เบื้องหลัง — user ไม่เห็นเป็นสองสิ่ง)
- Stage เส้นเดียว (map ลง CaseStage เดิม ไม่แตะ enum): INTAKE_REVIEW=รับเรื่อง/กลั่นกรอง, FACT_GATHERING=ตรวจเอกสาร/ประชุมสรุป, PRE_LITIGATION=Notice/เจรจา, FILING→ENFORCEMENT ตามเดิม
- เลขคดีดำ/แดง + ศาล ซ่อนจนกว่า stage ≥ FILING
- งาน = flat to-do (ไม่มี stage บนงาน) + ผู้รับผิดชอบ + วันแล้วเสร็จ + แนบไฟล์
- เอกสาร checklist + อัปโหลด (ปุ่ม + drag & drop) + "ขอจากลูกความ"
- Notice card: ประวัติหลายฉบับ + ออกฉบับใหม่ + AI ร่าง (กดเอง)
- นัดหมาย card + เพิ่มนัด (นัดศาลหลัง FILING)
- ทีม / Playbook / ค่าบริการ / Conflict (advisory) / Detail (รวมข้อมูล intake)
- AI: ปุ่มลอย ✦ เดียว → drawer; ทุก action กดเอง; v1 = quick actions ต่อ endpoint เดิม (precedent analysis, draft notice, doc intelligence) — chat อิสระเป็น phase หลัง

## Phases
1. **Backend**: intake `create()` → เปิด case ทันที (stage INTAKE_REVIEW), decide/convert เดิมกลายเป็น no-op ผ่าน idempotency; response มี case id
2. **Web create**: /intake/new submit แล้ว redirect ไป /cases/:id (ฟอร์มเดิมครบตามแบบอยู่แล้ว)
3. **Web case workspace**: summary strip + การ์ดงาน (flat todo) + การ์ดเอกสาร (checklist+upload+dnd) + การ์ด Notice + การ์ดนัดหมาย + ซ่อนช่องศาลก่อน FILING + ทีม/playbook ที่มีอยู่จัดตามแบบ
4. **AI entry**: ปุ่มลอย ✦ + drawer v1 (quick actions → ฟีเจอร์ AI เดิม)
5. Regression + docs

Ceiling ที่จดไว้: intake list ยังเป็นเมนู "รับเรื่อง" เดิม (phase หลังค่อยรวมเป็น view คดีก่อนฟ้อง); AI chat อิสระยังไม่ทำ
