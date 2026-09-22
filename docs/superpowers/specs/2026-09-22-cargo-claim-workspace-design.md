# Cargo Claim Workspace Design

## Goal

รองรับงาน Cargo Claim ที่เข้าระบบได้ทั้งผ่าน Intake และสร้าง Case โดยตรง โดยใช้ข้อมูลชุดเดียว ไม่บังคับกรอกซ้ำ และคงอำนาจตัดสินใจของทนายเหนือข้อมูลที่ AI อ่านจากเอกสาร

## Entry paths

1. Intake เลือกประเภท `TRANSPORT` → สร้าง Cargo Claim profile → เปิด Case คู่กันตามพฤติกรรมปัจจุบัน → profile เดิมผูกทั้ง Intake และ Case
2. Case สร้างตรงพร้อมเลือก `Cargo Claim` → สร้าง profile และ checklist ที่ Case ทันที โดยไม่ต้องมี Intake

ทั้งสองทางเข้าสู่ Cargo Claim workspace แบบเดียวกันในหน้า Case

## Domain model

`CargoClaim` เป็น record กลางหนึ่งรายการต่อ Intake และ/หรือ Case มีข้อมูล:

- คู่กรณีและฐานะ: assured, shipper, consignee, contracting carrier, actual carrier
- การขนส่ง: ต้นทาง, ปลายทาง, mode, เลขเอกสารขนส่ง, วันถึงปลายทาง
- ความเสียหาย: วันเสียหาย, สินค้า, เงื่อนไขการขนส่ง, ลักษณะความเสียหาย, น้ำหนัก/หน่วย
- จำนวนเงิน: amount claimed และสกุลเงิน
- การวิเคราะห์: applicable law, jurisdiction, liable party, liability limit, exclusion, time-bar period/trigger/deadline/basis, quantum, recommendation, opinion
- review metadata: สถานะ draft/confirmed, ผู้ยืนยัน, วันยืนยัน

`CargoDocumentRequirement` เก็บ checklist ต่อ profile เป็นแถวจริง มี stable code, label, required, status, note และ linked document. รายการเริ่มต้นเป็น snapshot จาก Cargo Claim Playbook รุ่นที่ใช้กับเรื่องนั้น ไม่อ่านสดจากค่ารุ่นล่าสุด จึงไม่ทำให้คดีเก่าเปลี่ยนเมื่อเผยแพร่ Playbook รุ่นใหม่

## Cargo Claim Playbook

เอกสาร Excel ทั้งสามไฟล์มีสองชนิดข้อมูลที่ต้องแยกกัน:

- วิธีพิจารณา claim และรายการเอกสาร 16 รายการ เป็นมาตรฐานการทำงาน จัดเก็บเป็น `Cargo Claim Assessment` Playbook แบบ versioned
- ข้อเท็จจริง ผลวิเคราะห์ อายุความ และความเห็น เป็นข้อมูลเฉพาะเรื่อง จัดเก็บใน Cargo Claim workspace

ระบบสร้าง Cargo Playbook v1 ให้สำนักงานเมื่อเริ่มใช้ครั้งแรก ประกอบด้วยขั้นตอนตั้งแต่ตรวจข้อเท็จจริง/เอกสาร กฎหมายที่ใช้ เขตอำนาจ ผู้รับผิด ข้อจำกัดและข้อยกเว้นความรับผิด อายุความ quantum/subrogation ไปจนถึงการตรวจและยืนยันโดยทนาย เจ้าของสำนักงานสามารถแก้ไขและเผยแพร่เป็นรุ่นถัดไปได้

เมื่อเริ่ม Cargo จาก Intake หรือ Case โดยตรง ระบบจะ:

1. เลือก Cargo Playbook รุ่นล่าสุดของสำนักงาน
2. snapshot checklist จากรุ่นนั้นลง Cargo Claim
3. เมื่อมี Case แล้ว apply ขั้นตอนเป็นงาน โดยเก็บ release id ที่ใช้
4. แสดงชื่อและรุ่นของ Playbook ใน Cargo workspace

Cargo Claim ที่เริ่มจาก Intake จะจำ release เดิมไว้และใช้ release เดิมเมื่อส่งต่อเข้า Case เพื่อให้กระบวนการไม่เปลี่ยนกลางทาง ส่วน Cargo Claim เก่าที่ยังไม่มี release สามารถผูกกับรุ่นล่าสุดผ่านการเปิดใช้งานซ้ำแบบ idempotent

## UI

### Intake

- หน้าใหม่เลือก `ทั่วไป / แพทย์ / ขนส่ง (Cargo Claim)` แทน `GENERAL` ตายตัว
- เมื่อเลือกขนส่ง แสดง Cargo facts แบบ progressive disclosure
- แท็บเอกสารใช้ checklist Cargo 16 รายการและสถานะเดิมของ Intake

### Direct Case

- หน้า Case ใหม่มีตัวเลือก `เปิด Cargo Claim workspace`
- เมื่อเลือก แสดง Cargo facts ที่กรอกเท่าที่รู้ได้
- หลังสร้าง เปิด Cargo tab พร้อม checklist โดยไม่ต้องสร้าง Intake

### Case Workbench

- เพิ่มแท็บ `Cargo Claim`
- Summary แสดง parties, route, goods, claim amount, time bar และ document progress
- Edit sections: Shipment, Parties, Damage/Quantum, Legal analysis, Time Bar, Opinion
- ทุกค่าที่ AI เสนอต้องแสดง filename และ excerpt; การกดยืนยันเป็นการกระทำของทนายเท่านั้น

## Rules

- `incidentDate`, `arrivalDate`, `lossDate` เป็นคนละค่า
- `estimatedDamage` และ `claimAmount` เป็นคนละค่า
- Time-bar deadline ห้ามคำนวณหรือยืนยันอัตโนมัติโดยไม่มี basis และ trigger date
- AI ห้ามเขียนทับค่าที่ทนายยืนยันแล้ว
- Intake-to-Case ต้องเชื่อม profile เดิม ไม่ copy เป็น record ใหม่
- Direct Case ต้องทำงานครบโดยไม่มี Intake
- Existing cases ที่ไม่ใช่ Cargo Claim ต้องไม่เห็น Cargo tab
- Playbook รุ่นใหม่มีผลกับเรื่องใหม่เท่านั้น ไม่แก้ checklist หรืองานของเรื่องเดิมย้อนหลัง
- เคสหนึ่งอาจใช้ Playbook มากกว่าหนึ่งชุดได้ แต่ release เดิมต้อง apply ซ้ำแล้วไม่สร้างงานซ้ำ

## Acceptance criteria

- สร้าง Cargo Claim จาก Intake และจาก Case โดยตรงได้
- ทั้งสองทางได้ checklist 16 รายการ
- ทั้งสองทางผูก Cargo Claim Playbook release และแสดงชื่อ/รุ่นที่ใช้อยู่
- Intake จำ release เดิมไว้และ apply release เดิมเมื่อส่งต่อเข้า Case
- เจ้าของสำนักงานแก้ checklist Cargo แล้ว publish เป็นรุ่นถัดไปได้ โดยเรื่องเดิมไม่เปลี่ยน
- Intake ที่มี paired Case ใช้ Cargo profile id เดียวกัน
- หน้า Case อ่านและแก้ Cargo facts/analysis ได้
- checklist อัปเดต status, note และ document link ได้
- batch document analysis คืน cargo field suggestions พร้อม source excerpt และไม่ apply เอง
- API จำกัดข้อมูลตาม firm/case access เดิม

## Non-goals

- ตัดสินความรับผิดหรือความคุ้มค่าคดีอัตโนมัติ
- ยืนยันอายุความอัตโนมัติ
- ส่งความเห็นหรือเอกสารให้ลูกค้าอัตโนมัติ
- import Excel ในระยะแรก
