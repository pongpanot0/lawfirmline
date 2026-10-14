export interface EmailTemplateView {
  id: string;
  name: string;
  subject: string;
  body: string;
  builtIn: boolean;
}

/** Variables an email template may use. `example` feeds the editor's live preview. */
export const EMAIL_TEMPLATE_VARIABLES = [
  { key: 'ownRef', label: 'เลขที่คดี (ภายใน)', example: 'TSB-2569-001' },
  { key: 'title', label: 'ชื่อคดี', example: 'คดีผิดสัญญากู้ยืมเงิน' },
  { key: 'clientName', label: 'ชื่อลูกความ', example: 'สมหญิง รักดี' },
  { key: 'customerRef', label: 'เลขอ้างอิงลูกความ', example: 'CUS-0123' },
  { key: 'caseType', label: 'ประเภทคดี', example: 'คดีแพ่ง' },
  { key: 'courtName', label: 'ศาล', example: 'ศาลแพ่ง' },
  { key: 'blackCaseNumber', label: 'เลขคดีดำ', example: 'ผบ.123/2569' },
  { key: 'redCaseNumber', label: 'เลขคดีแดง', example: 'ผบ.456/2569' },
  { key: 'plaintiffNames', label: 'ชื่อโจทก์', example: 'บริษัท เอ จำกัด' },
  { key: 'defendantNames', label: 'ชื่อจำเลย', example: 'นายบี ตัวอย่าง' },
  { key: 'lawyerName', label: 'ทนายความผู้รับผิดชอบ', example: 'สมชาย ใจดี' },
  { key: 'nextHearingDate', label: 'วันนัดถัดไป', example: '1 ธันวาคม 2569' },
  { key: 'nextHearingTime', label: 'เวลานัดถัดไป', example: '09:30' },
  { key: 'nextHearingCourt', label: 'ศาลที่นัด', example: 'ศาลแพ่ง' },
  { key: 'senderName', label: 'ชื่อผู้ส่ง', example: 'สมชาย ใจดี' },
  { key: 'date', label: 'วันที่ปัจจุบัน', example: '14/10/2569' },
] as const;

const BUILT_INS: Omit<EmailTemplateView, 'builtIn'>[] = [
  {
    id: 'builtin:court-hearing',
    name: 'แจ้งนัดศาล',
    subject: '[{{ownRef}}] แจ้งนัดพิจารณาคดี วันที่ {{nextHearingDate}}',
    body: `เรียน {{clientName}}

สำนักงานขอแจ้งกำหนดนัดพิจารณาคดี {{title}} ดังนี้

วันที่นัด: {{nextHearingDate}}
เวลา: {{nextHearingTime}} น.
ศาล: {{nextHearingCourt}}
เลขคดีดำ: {{blackCaseNumber}}

กรุณาเตรียมตัวและแจ้งให้สำนักงานทราบหากไม่สะดวกในวันดังกล่าว หากมีข้อสงสัยสามารถติดต่อสอบถามได้ตลอดเวลา

ขอแสดงความนับถือ
{{senderName}}`,
  },
  {
    id: 'builtin:send-documents',
    name: 'ส่งเอกสาร',
    subject: '[{{ownRef}}] ส่งเอกสารคดี {{title}}',
    body: `เรียน {{clientName}}

สำนักงานขอส่งเอกสารที่เกี่ยวข้องกับคดี {{title}} (เลขที่คดี {{ownRef}}) มาพร้อมอีเมลฉบับนี้ กรุณาตรวจสอบความถูกต้อง และแจ้งกลับหากมีข้อสงสัยหรือต้องการแก้ไข

ขอแสดงความนับถือ
{{senderName}}`,
  },
  {
    id: 'builtin:request-documents',
    name: 'ขอเอกสารเพิ่มเติม',
    subject: '[{{ownRef}}] ขอเอกสารเพิ่มเติม',
    body: `เรียน {{clientName}}

เพื่อให้การดำเนินคดี {{title}} (เลขที่คดี {{ownRef}}) เป็นไปอย่างราบรื่น สำนักงานขอความอนุเคราะห์ท่านจัดส่งเอกสารเพิ่มเติมดังต่อไปนี้

1. 
2. 

สามารถตอบกลับอีเมลฉบับนี้พร้อมแนบไฟล์ได้เลย หากมีข้อสงสัยกรุณาติดต่อสำนักงาน

ขอแสดงความนับถือ
{{senderName}}`,
  },
];

export const BUILT_IN_EMAIL_TEMPLATES: EmailTemplateView[] = BUILT_INS.map((t) => ({ ...t, builtIn: true }));
