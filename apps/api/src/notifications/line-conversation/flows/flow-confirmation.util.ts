import { QuickReplyItem } from '../../line-messaging.service';

export interface FieldSpec {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

export const CONFIRM_QUICK_REPLY: QuickReplyItem[] = [
  { label: '✅ ยืนยัน', text: 'ยืนยัน' },
  { label: '✏️ แก้ไข', text: 'แก้ไข' },
  { label: '❌ ยกเลิก', text: 'ยกเลิก' },
];

export function renderSummary(fields: FieldSpec[], data: Record<string, unknown>): string {
  const lines = fields.map((f) => {
    const raw = data[f.key];
    const value = raw === undefined || raw === null || raw === '' ? '(ไม่ระบุ)' : f.format ? f.format(raw) : String(raw);
    return `${f.label}: ${value}`;
  });
  return `กรุณาตรวจสอบข้อมูล:\n\n${lines.join('\n')}`;
}

export function buildFieldPickerQuickReply(fields: FieldSpec[]): QuickReplyItem[] {
  return fields.map((f) => ({ label: f.label.slice(0, 20), text: `แก้:${f.key}` }));
}
