# ถาดงาน AI (AI action tray)

วันที่: 2026-09-29 · สถานะ: อนุมัติแล้ว (แบบ A — เว็บเรียก endpoint เดิมทีละไฟล์)

## ปัญหา

ระบบมี AI อ่านเอกสาร (สรุป + อ้างอิงหน้า) และจับวันนัด/ครบกำหนดจากเอกสารอยู่แล้ว แต่ผู้ใช้ต้องจำเองว่าเอกสารไหนยังไม่ได้ให้ AI อ่าน
และวันที่ที่ AI เสนอไว้ค้างรอยืนยันอยู่ในแท็บปฏิทินของแต่ละคดี — ไม่มีที่ไหนบอก "มีงาน AI รอคุณอยู่"

## กฎที่ต้องรักษา

- AI ทำงานเมื่อผู้ใช้กดเท่านั้น ห้ามรันอัตโนมัติ (กติกาเจ้าของ 2026-09-21)
- ผลลัพธ์ต้องให้คนยืนยัน: วันที่ที่ AI เสนอยังเป็น `PENDING` จนคนยืนยันใน `DateSuggestionsPanel` เดิม
- แสดงเครดิตที่จะใช้ก่อนกดรัน

## ขอบเขต

- ✅ การ์ด `UNREAD_DOCUMENTS` — "✦ มีเอกสารใหม่ N ฉบับที่ AI ยังไม่อ่าน" → จับวัน + สรุป ทีละไฟล์ (10 เครดิต/ไฟล์)
- ✅ การ์ด `PENDING_DATES` — "มีวันนัด/ครบกำหนด N รายการรอยืนยัน" → ไปแท็บปฏิทินของคดี (ไม่ใช้เครดิต)
- ✅ แสดงทั้งบนหน้าคดี (เฉพาะคดีนั้น) และใน AI Assistant (ทุกคดีที่ผู้ใช้เข้าถึง) — API ตัวเดียว
- ❌ การ์ดอีเมลที่ยังไม่ผูกคดี, การ์ดร่างเอกสารตามขั้น (รอบถัดไป)
- ❌ คิวงานเบื้องหลัง / endpoint AI ใหม่

## ข้อมูล

```prisma
model Document {
  /// ถาดงาน AI: ตั้งเมื่อผู้ใช้ "ข้าม" หรือ AI อ่านครบ (จับวัน + สรุป) — null = ยังรอในถาด
  aiTrayHandledAt DateTime?
}
```

Migration: เพิ่มคอลัมน์ + `UPDATE "Document" SET "aiTrayHandledAt" = NOW()` — เอกสารเดิมทั้งหมดไม่เข้าถาด
นับเฉพาะเอกสารที่อัปโหลดหลัง deploy. Rollback: drop column.

เอกสารอยู่ในถาดเมื่อ **ทุกข้อ**: `caseId` ไม่ว่าง · คดีอยู่ในสิทธิ์ของผู้ใช้ (`getCaseFilterForUser`) ·
`aiTrayHandledAt IS NULL` · `mimeType ∈ DOCUMENT_ANALYSIS_MIME_TYPES` · ไม่มี `CaseKnowledge` ที่ `documentId` = เอกสารนี้
(ถ้าผู้ใช้กดวิเคราะห์เองจากแท็บเอกสาร เอกสารหลุดจากถาดเอง)

## API — โมดูลใหม่ `apps/api/src/ai-tray`

| Route | ทำอะไร |
|---|---|
| `GET /ai-tray?caseId=<uuid>` (caseId ไม่บังคับ) | คืน `AiTrayCard[]` คำนวณสด เรียงคดีที่มีเอกสารใหม่ล่าสุดก่อน |
| `POST /ai-tray/documents/handled` `{ documentIds: uuid[] (1–50) }` | ตั้ง `aiTrayHandledAt = now()` เฉพาะเอกสารที่อยู่ในคดีที่ผู้ใช้เข้าถึงได้; มีฉบับไหนเข้าไม่ถึง → 404 ทั้งคำขอ |

```ts
type AiTrayCard =
  | { type: 'UNREAD_DOCUMENTS'; caseId: string; caseTitle: string; caseRef: string | null;
      documents: { id: string; filename: string; createdAt: string }[]; creditCost: number }
  | { type: 'PENDING_DATES'; caseId: string; caseTitle: string; caseRef: string | null; count: number };
```

`creditCost = documents.length * (AI_CREDIT_COST.DOCUMENT_ANALYSIS * 2)`. จำกัดเอกสารที่ดึงต่อคำขอ 200 ฉบับ และ suggestion 500 รายการ
(ป้องกันคำขอใหญ่เกิน; ถาดแสดงเป็นรายการที่ควรทำ ไม่ใช่รายงานครบถ้วน).

## เว็บ

- `components/ai/AiTrayCards.tsx` — props `{ caseId?: string; compact?: boolean }` โหลด `GET /ai-tray`
  - การ์ดเอกสาร: รายชื่อไฟล์ติ๊กเลือก (ค่าเริ่มต้นติ๊กทั้งหมด) · ปุ่ม **"✦ ให้ AI อ่าน (X เครดิต)"** → `confirm()` แสดงเครดิต →
    รันทีละไฟล์: `extractDatesFromDocument` แล้ว `analyzeExistingDocument` → สำเร็จครบ → `markAiTrayHandled([id])` · สถานะรายไฟล์ ⏳/✓/✕ + ข้อความ error ·
    ปุ่ม **"ข้าม"** → `markAiTrayHandled(ที่เลือก)` · จบรอบแล้วโหลดถาดใหม่
  - การ์ดวันที่: ลิงก์ **"ตรวจวันที่"** → `/cases/<id>?tab=calendar`
  - ไม่มีการ์ด → ไม่ render อะไร (หน้าคดี) / ข้อความ "ไม่มีงานค้าง" (AI Assistant)
- หน้าคดี: `<AiTrayCards caseId={id} />` ใต้แถบงานแนะนำตามขั้น
- `AIAssistantPanel`: ส่วนใหม่บนสุด "งานที่ AI เตรียมไว้" → `<AiTrayCards compact />` (แต่ละการ์ดมีชื่อคดีลิงก์ไปหน้าคดี)
- หลัง AI รันเสร็จบนหน้าคดี → เรียก callback `onChanged` ให้หน้าคดีโหลดเอกสาร/ปฏิทินใหม่

## การทดสอบ

- `ai-tray.service.spec.ts`: เงื่อนไขเข้าถาด (where ที่ส่งให้ Prisma), จัดกลุ่มต่อคดี + creditCost, การ์ดวันที่นับต่อคดี,
  `markHandled` ปฏิเสธเอกสารนอกสิทธิ์ (404) และไม่ update อะไร
- Browser: อัปโหลด PDF ในคดี → การ์ดขึ้นทั้งหน้าคดีและ AI Assistant → ข้าม → หาย; การ์ดวันที่ลิงก์ไปแท็บปฏิทิน;
  กดรันบนเครื่องที่ไม่มี `OPENAI_API_KEY` → ไฟล์ขึ้น ✕ พร้อมข้อความ และยังอยู่ในถาด

## ข้อจำกัดที่รู้แล้ว

- จับวันสำเร็จแต่สรุปพัง แล้วกดรันซ้ำ → วันที่เสนอซ้ำ (ยัง PENDING ปัดทิ้งได้)
- เครดิตถูกตรวจรายคำขอโดย `AiCreditsInterceptor` เดิม — เครดิตหมดกลางทางไฟล์ที่เหลือขึ้น ✕
