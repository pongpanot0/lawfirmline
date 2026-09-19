import { QuickReplyItem } from '../line-messaging.service';
import { FlowType } from './line-conversation.types';

export const MYDAY_COMMAND = 'งานของฉันวันนี้';
export const MENU_COMMAND = 'เมนู';
export const CANCEL_COMMAND = 'ยกเลิก';

/** Every wording that starts a flow — imagemap taps, rich-menu taps, typing. */
export const MENU_SELECTION_MAP: Record<string, FlowType> = {
  'สร้าง Case': FlowType.CASE,
  'เพิ่ม Task': FlowType.TASK,
  'สร้าง Todo': FlowType.TODO,
  'บันทึกค่าใช้จ่าย': FlowType.EXPENSE,
  'เบิกล่วงหน้า': FlowType.ADVANCE,
};

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
  { label: '📊 งานวันนี้', text: MYDAY_COMMAND },
];

/** Shown alongside every in-flow prompt so there is always a way out. */
export const ESCAPE_QUICK_REPLY: QuickReplyItem[] = [
  { label: '🏠 เมนู', text: MENU_COMMAND },
  { label: '❌ ยกเลิก', text: CANCEL_COMMAND },
];

export const MENU_HINT =
  'เลือกเมนูด้านล่างได้เลยครับ 👇\n(ระหว่างทำรายการ พิมพ์ "เมนู" เพื่อกลับหน้านี้ หรือ "ยกเลิก" เพื่อเลิกทำครับ)';
