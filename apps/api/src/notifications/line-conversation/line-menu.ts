import { QuickReplyItem } from '../line-messaging.service';
import { FlowType } from './line-conversation.types';

export const MYDAY_COMMAND = 'งานของฉันวันนี้';
export const MENU_COMMAND = 'เมนู';
export const CANCEL_COMMAND = 'ยกเลิก';
/** The only thing that saves what the AI proposed. */
export const AI_CONFIRM_COMMAND = 'ยืนยันบันทึก';

/** Every wording that starts a flow — imagemap taps, rich-menu taps, typing. */
export const MENU_SELECTION_MAP: Record<string, FlowType> = {
  'สร้าง Case': FlowType.CASE,
  'เพิ่ม Task': FlowType.TASK,
  'สร้าง Todo': FlowType.TODO,
  'บันทึกค่าใช้จ่าย': FlowType.EXPENSE,
  'เบิกล่วงหน้า': FlowType.ADVANCE,
  'ลางาน': FlowType.LEAVE,
  'ลาป่วย': FlowType.LEAVE,
  'ลากิจ': FlowType.LEAVE,
  'พักร้อน': FlowType.LEAVE,
  'การลาของฉัน': FlowType.LEAVE,
};

/** A leave question ("ใครลาบ้าง", "ลาเหลือกี่วัน") is for the AI, not the leave form. */
const LEAVE_QUESTION = /ใคร|กี่|เหลือ|ยังไง|อย่างไร|ทำไม|ระเบียบ|สิทธิ|\?/;
/**
 * "ลา" typed as a request: "ลา", "ขอลาพรุ่งนี้", "จะลาป่วยครับ", "ขอหยุดงาน".
 * What may follow "ลา" is listed, not excluded, so ลาออก / ลาย / ลาบ / ลาเต้ never open the form.
 */
const LEAVE_REQUEST =
  /^(?:(?:ขออนุญาต|ขอ|จะ|อยาก|ต้องการ|ผม|หนู|ดิฉัน|ฉัน|เรา|พี่|น้อง)\s*)*(?:ลา(?=$|\s|ป่วย|กิจ|พัก|งาน|หยุด|วัน|พรุ่ง|พรุ้ง|มะรืน|ครึ่ง|ครับ|คับ|ค่ะ|คะ|นะ|จ้า|ด้วย|\d|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์|สัปดาห์)|หยุดงาน|ขอหยุด)/;

/**
 * The leave command a typed request means — the type picked from the words when it is clear —
 * or null when the text is not a leave request.
 */
export function leaveIntent(text: string): string | null {
  const t = text.trim();
  if (!LEAVE_REQUEST.test(t) || LEAVE_QUESTION.test(t)) return null;
  if (/ป่วย|ไม่สบาย/.test(t)) return 'ลาป่วย';
  if (/กิจ/.test(t)) return 'ลากิจ';
  if (/พักร้อน/.test(t)) return 'พักร้อน';
  return 'ลางาน';
}

/**
 * The menu as buttons. The home imagemap only pictures three actions, so these
 * quick replies ride along with it — they are the only place the expense,
 * advance and my-day commands are discoverable without typing them exactly.
 */
export const MENU_QUICK_REPLY: QuickReplyItem[] = [
  { label: '📋 สร้าง Case', text: 'สร้าง Case' },
  { label: '✅ เพิ่ม Task', text: 'เพิ่ม Task' },
  { label: '📝 สร้าง Todo', text: 'สร้าง Todo' },
  { label: '💸 ค่าใช้จ่าย', text: 'บันทึกค่าใช้จ่าย' },
  { label: '💰 เบิกล่วงหน้า', text: 'เบิกล่วงหน้า' },
  { label: '🏖️ ลางาน', text: 'ลางาน' },
  { label: '📅 การลาของฉัน', text: 'การลาของฉัน' },
  { label: '📊 งานวันนี้', text: MYDAY_COMMAND },
  { label: '📌 งานค้างของฉัน', text: 'งานค้างของฉัน' },
  { label: '🔎 ค้นคดี', text: 'ค้นคดี' },
];

/** Shown alongside every in-flow prompt so there is always a way out. */
export const ESCAPE_QUICK_REPLY: QuickReplyItem[] = [
  { label: '🏠 เมนู', text: MENU_COMMAND },
  { label: '❌ ยกเลิก', text: CANCEL_COMMAND },
];

export const MENU_HINT =
  'เลือกเมนูด้านล่างได้เลยครับ 👇\n(ระหว่างทำรายการ พิมพ์ "เมนู" เพื่อกลับหน้านี้ หรือ "ยกเลิก" เพื่อเลิกทำครับ)';
