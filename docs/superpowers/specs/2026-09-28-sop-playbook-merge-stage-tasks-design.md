# รวมเมนู SOP + Playbook และเสนองานตามขั้นคดีทุกช่องทาง

วันที่: 2026-09-28 · สถานะ: รอรีวิว

## ปัญหา

1. ระบบมี "SOP ที่รันได้" อยู่แล้วในชื่อ **Playbook** (ขั้นตอนผูก stage, วันครบกำหนดนับวันทำการ,
   มอบงานตามตำแหน่ง) แต่เมนูแยกเป็น "SOP" (เอกสารให้คนอ่าน) กับ "Playbook" — ผู้ใช้ต้องรู้ว่าสองอย่างต่างกัน
2. งานแนะนำตามขั้นคดีเกิดเฉพาะตอนกดเปลี่ยนขั้นใน dropdown หน้าคดีบนเว็บ
   (`handleStageChange` ใน `cases/[id]/page.tsx`) ขั้นที่เปลี่ยนทางอื่นไม่มีงานแนะนำ:
   - สร้างคดีใหม่ / แปลงเรื่องรับเข้าเป็นคดี → เริ่มที่ `PRE_LITIGATION`
   - ปิดคดี → `CLOSING` (`cases.service.ts` close flow)
   - ช่องทางในอนาคต (มือถือ, LINE, API)

## เป้าหมาย / ไม่ใช่เป้าหมาย

- ✅ ผู้ใช้เห็นเมนูเดียวชื่อ "SOP" — SOP ที่มีขั้นตอนอัตโนมัติขึ้นป้าย ⚡
- ✅ ขั้นคดีเปลี่ยนจากทางไหนก็ได้ งานแนะนำของขั้นนั้นไม่ตกหล่น
- ✅ ยังต้องให้คนกดยืนยันก่อนสร้างงาน (แก้ผู้รับผิดชอบ/วันได้เหมือนเดิม)
- ❌ ไม่รวมตาราง `Sop` กับ `PlaybookRelease` (ทาง 2 ที่ตัดทิ้ง — เสี่ยงกับ versioning และ Cargo template)
- ❌ ไม่ให้ playbook สร้าง deadline/นัดศาล (แยกเป็นงานถัดไป)
- ❌ ไม่ทำแถบงานแนะนำบนมือถือรอบนี้ (มือถือไม่มีการเปลี่ยนขั้น)

## ส่วน A — เสนองานตามขั้นทุกช่องทาง

แนวคิด: เลิกผูกการเสนองานกับ "เหตุการณ์เปลี่ยนขั้นบนเว็บ" เปลี่ยนเป็น "สถานะ" ที่หน้าคดีเช็กเองทุกครั้งที่เปิด

### Schema

```prisma
model Case {
  /// ขั้นล่าสุดที่ผู้ใช้จัดการงานแนะนำจาก playbook แล้ว (สร้างหรือข้าม)
  /// ≠ stage ปัจจุบัน → หน้าคดีเสนองานของขั้นนั้น
  stageTasksHandledFor CaseStage?
}
```

Migration: เพิ่มคอลัมน์ nullable แล้ว **backfill `stageTasksHandledFor = stage` ให้คดีเดิมทุกคดี**
เพื่อไม่ให้คดีเก่าทั้งหมดเด้งแถบงานแนะนำพร้อมกันหลัง deploy. คดีที่สร้างหลังจากนี้เริ่มเป็น `null`
→ เห็นงานแนะนำของขั้นแรก

Rollback: drop column — ไม่มีข้อมูลอื่นพึ่งพา

### API (`practice-setup`)

| เปลี่ยน | รายละเอียด |
|---|---|
| `createStageTasks` | หลังสร้างงาน ตั้ง `stageTasksHandledFor = stage` |
| ใหม่ `POST /practice-setup/cases/:caseId/stage-tasks/dismiss` `{ stage }` | ตั้ง `stageTasksHandledFor = stage` + log case feed "ข้ามงานแนะนำขั้น X" · ใช้ `CaseAccessGuard` เหมือน route ข้างเคียง |
| `proposeStageTasks` | ตัดขั้นตอนที่คดีมีงาน label `stage:<STAGE>` ชื่อเดียวกันอยู่แล้วออก — กันงานซ้ำเมื่อคดีย้อนกลับมาขั้นเดิม |
| case detail response | มี `stageTasksHandledFor` (มาจาก Prisma model อยู่แล้ว — ตรวจว่า include/select ไม่ตัดทิ้ง) |

ไม่ validate ว่า `stage` ที่ส่งมาตรงกับ `case.stage` (flow dropdown เรียกก่อน/หลังย้ายขั้นได้ทั้งคู่):
ค่านี้เป็นแค่ตัวซ่อนแถบ ตั้งผิดขั้นก็แค่แถบขึ้นอีกครั้ง. `stage` ต้องเป็นค่าใน enum `CaseStage` (DTO validate)

### เว็บ — หน้าคดี

- โหลดคดีแล้ว ถ้า `case.stage !== case.stageTasksHandledFor` → เรียก `getStageTaskProposals(case.stage)`
  ถ้ามีรายการ → แสดงแถบ **"ขั้น <ชื่อขั้น> มีงานแนะนำ N งาน · [ดูและสร้าง]"** ใต้ header คดี
- กดแล้วเปิด `StageTasksDialog` ตัวเดิม:
  - `onConfirm` → `createStageTasks` (ตั้ง handled ฝั่ง server) → reload
  - `onSkip` → `dismiss` → ซ่อนแถบ
- flow เปลี่ยนขั้นผ่าน dropdown เดิมคงไว้ แต่ "ย้ายขั้นอย่างเดียว" (`handleStageOnly`) ต้องเรียก `dismiss` ด้วย
  ไม่งั้นแถบจะเด้งตามมาหลังเพิ่งกดข้าม
- โหลดงานแนะนำล้มเหลว → ไม่แสดงแถบ (log error) ไม่บล็อกหน้าคดี

## ส่วน B — รวมเมนู SOP + Playbook (รวมที่หน้าจอ ไม่รวมข้อมูล)

- **Sidebar**: ลบรายการ `/playbooks` เหลือ `/sops` (label "SOP")
- **หน้า `/sops`**: โหลด SOP เอกสาร + playbook (release ล่าสุดของแต่ละชื่อ) แสดงเป็นรายการเดียว
  - playbook แสดงป้าย ⚡ "อัตโนมัติ" + ประเภทคดีที่ผูก + จำนวนขั้นตอน; กดแล้วไป `/playbooks?id=<releaseId>`
  - ตัวกรอง: ทั้งหมด / อัตโนมัติ; ช่องค้นหาเดิมกรองทั้งสองชนิดด้วยชื่อ (ฝั่ง client สำหรับ playbook)
  - ปุ่มสร้าง: "SOP เอกสาร" (ทุกคน เหมือนเดิม) · "SOP อัตโนมัติ" (เฉพาะ OWNER — `publish` เป็น owner-only) → `/playbooks?new=1`
- **หน้า `/playbooks`** คงเป็นตัวแก้ไข: หัวเรื่องเปลี่ยนเป็น "SOP อัตโนมัติ", มีลิงก์ "← SOP",
  รองรับ `?id=` (เปิด `startDraft` ของ release นั้น) และ `?new=1` (`resetForm`)
- ลิงก์เดิมที่ชี้ `/playbooks` (settings, getting-started, intake, onboarding tour) ใช้ต่อได้ ไม่ต้องแก้
- i18n: เพิ่ม label ใหม่ใน `lib/i18n/dashboard.ts` ทั้ง th/en

## การทดสอบ

- API spec (`practice-setup.service.spec.ts`):
  - `createStageTasks` ตั้ง `stageTasksHandledFor`
  - `dismissStageTasks` ตั้งค่า + ปฏิเสธคดีที่ผู้ใช้เข้าไม่ถึง
  - `proposeStageTasks` ไม่เสนอขั้นตอนที่มีงาน `stage:X` ชื่อซ้ำอยู่แล้ว
- Migration: ตรวจว่า backfill ตั้งค่าให้คดีเดิมครบ
- Browser (worktree preview): ปิดคดีที่มี playbook ขั้น `CLOSING` → เปิดหน้าคดีเห็นแถบ → ข้าม → แถบหาย reload แล้วไม่กลับมา;
  หน้า `/sops` เห็นรายการรวม + ป้าย ⚡ และกดไปแก้ไขได้

## ข้อจำกัดที่รู้แล้ว

- เก็บแค่ "ขั้นล่าสุดที่จัดการ" — คดีย้อน A→B→A จะเสนอขั้น A อีกครั้ง แต่ตัวกรองชื่อซ้ำกันงานซ้ำไว้แล้ว
- แถบงานแนะนำมีเฉพาะเว็บ — เพิ่มบนมือถือเมื่อมือถือเปลี่ยนขั้นได้
