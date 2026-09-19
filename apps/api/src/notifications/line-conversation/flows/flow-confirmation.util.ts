import { QuickReplyItem } from '../../line-messaging.service';
import { SearchResultItem } from '../line-conversation.types';
import { CANCEL_COMMAND, MENU_COMMAND } from '../line-menu';

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

export const SKIP_QUICK_REPLY: QuickReplyItem[] = [{ label: 'ข้าม', text: 'ข้าม' }];

/** Postback payload prefix for "the user picked list item <id>". */
export const PICK_PREFIX = 'pick:';

const LINE_QUICK_REPLY_LIMIT = 13;

/**
 * Every prompt keeps an escape hatch, so a rich-menu tap is never the only way
 * out of a flow (and a tap that lands mid-flow is handled by the router).
 */
export function withEscape(quickReply?: QuickReplyItem[]): QuickReplyItem[] {
  const items = [...(quickReply ?? [])];
  const has = (text: string) => items.some((i) => i.text === text);
  const escapes = [
    { label: '🏠 เมนู', text: MENU_COMMAND },
    { label: '❌ ยกเลิก', text: CANCEL_COMMAND },
  ].filter((e) => !has(e.text));
  return [...items, ...escapes].slice(0, LINE_QUICK_REPLY_LIMIT);
}

/** Buttons for a list of choices — each carries its id, not its label. */
export function pickQuickReply(
  results: SearchResultItem[],
  extra: QuickReplyItem[] = [],
): QuickReplyItem[] {
  const room = LINE_QUICK_REPLY_LIMIT - 2 - extra.length; // 2 reserved for the escapes
  return [
    ...results.slice(0, Math.max(room, 0)).map((r) => ({
      label: r.label.slice(0, 20),
      text: r.label,
      data: `${PICK_PREFIX}${r.id}`,
    })),
    ...extra,
  ];
}

/** Resolve a reply to a pick: by postback id first, by exact label as fallback. */
export function resolvePick(
  results: SearchResultItem[] | undefined,
  text: string,
): SearchResultItem | undefined {
  if (!results?.length) return undefined;
  if (text.startsWith(PICK_PREFIX)) {
    const id = text.slice(PICK_PREFIX.length);
    return results.find((r) => r.id === id);
  }
  return results.find((r) => r.label === text);
}

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
