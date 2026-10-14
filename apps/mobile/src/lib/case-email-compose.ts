// Pure helpers for CaseEmailComposer — no imports, so node --test can run them directly.

export const MAX_EMAIL_RECIPIENTS = 50;

const EMAIL_PATTERN = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]+$/;

export interface ReplySourceMessage {
  id: string;
  fromAddress: string | null;
  toAddresses?: string[];
  ccAddresses?: string[];
}

export function parseAddressList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const address = raw.trim().replace(/^<|>$/g, '');
    const key = address.toLowerCase();
    if (!address || seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

export function appendAddress(text: string, email: string): string {
  if (parseAddressList(text).some((a) => a.toLowerCase() === email.toLowerCase())) return text;
  return [text.trim(), email].filter(Boolean).join(', ');
}

/** First problem as a Thai sentence, or null when the email may be sent. Mirrors the API's SendCaseEmailDto rules. */
export function composeError(input: { to: string[]; cc: string[]; subject: string; body: string }): string | null {
  if (input.to.length === 0) return 'กรุณาใส่ผู้รับอย่างน้อย 1 คน';
  const invalid = [...input.to, ...input.cc].filter((a) => !EMAIL_PATTERN.test(a));
  if (invalid.length) return `อีเมลไม่ถูกต้อง: ${invalid.join(', ')}`;
  if (input.to.length + input.cc.length > MAX_EMAIL_RECIPIENTS) {
    return `ผู้รับรวม (ถึง + สำเนา) ได้ไม่เกิน ${MAX_EMAIL_RECIPIENTS} คน`;
  }
  if (input.subject.includes('{{') || input.body.includes('{{')) return 'ยังมีช่องข้อมูลที่ไม่ได้กรอก {{...}}';
  if (!input.subject.trim()) return 'กรุณาใส่หัวเรื่อง';
  if (!input.body.trim()) return 'กรุณาใส่เนื้อหา';
  return null;
}

export function newSubject(ownRef: string): string {
  return ownRef ? `[${ownRef}] ` : '';
}

export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

export function replyRecipients(
  message: ReplySourceMessage,
  replyAll: boolean,
  ownAddress: string | null,
): { to: string[]; cc: string[] } {
  const own = (ownAddress ?? '').toLowerCase();
  const fromIsOwn = !!message.fromAddress && message.fromAddress.toLowerCase() === own;
  const to = fromIsOwn
    ? (message.toAddresses ?? []).filter((a) => a.toLowerCase() !== own)
    : message.fromAddress
      ? [message.fromAddress]
      : [];
  if (!replyAll) return { to, cc: [] };
  const taken = new Set(to.map((a) => a.toLowerCase()));
  const cc = [...(message.toAddresses ?? []), ...(message.ccAddresses ?? [])].filter((a) => {
    const key = a.toLowerCase();
    if (key === own || taken.has(key)) return false;
    taken.add(key);
    return true;
  });
  return { to, cc };
}

/** "แทนที่" swaps the whole body for the template; "ต่อท้าย" keeps what was typed and adds the template below it. */
export function mergeTemplateBody(existing: string, templateBody: string, how: 'replace' | 'append'): string {
  return how === 'append' && existing.trim() ? `${existing.trimEnd()}\n\n${templateBody}` : templateBody;
}

export function insertAtCursor(text: string, start: number, end: number, insert: string): { text: string; caret: number } {
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length };
}

/** Fill {{key}} with example values for the settings preview; unknown keys stay visible. */
export function previewTemplate(text: string, variables: Array<{ key: string; example: string }>): string {
  const byKey = new Map(variables.map((v) => [v.key, v.example]));
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => byKey.get(key) ?? whole);
}
