/** In-app replacement for window.confirm: same one-line call, but awaited, styled and in Thai. */
export type ConfirmRequest = { message: string; resolve: (ok: boolean) => void; action?: string; cancel?: string; danger?: boolean };

let listener: ((request: ConfirmRequest) => void) | null = null;

/** ConfirmHost registers itself here; returns the unsubscribe. */
export function setConfirmListener(fn: (request: ConfirmRequest) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Resolves true when the person confirms. Falls back to the browser box only if no host is mounted. */
export function confirmDialog(message: string, options?: { action?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  if (!listener) return Promise.resolve(typeof window !== 'undefined' && window.confirm(message));
  const current = listener;
  return new Promise((resolve) => current({ message, resolve, ...options }));
}

const DANGER = /^(ลบ|ยกเลิก|ไม่อนุมัติ|ถอน|ปิดคดี|ทิ้ง|ล้าง|เลิก)/;

/** First line is the question (title); the rest explains the consequence. The button repeats the action. */
export function splitConfirmMessage(message: string): { title: string; body: string; action: string; danger: boolean } {
  const [first, ...rest] = message.trim().split('\n');
  const title = first.trim();
  const body = rest.join('\n').trim();
  const question = title.replace(/[?？]\s*$/, '').replace(/^ต้องการ/, '').trim();
  // A question naming something in quotes → its leading verb ("ลบงาน"); otherwise a short question is the button.
  const lead = question.split(/["“'«]/)[0].trim();
  const action = lead !== question && lead.length >= 2 && lead.length <= 16 ? lead : question.length > 0 && question.length <= 24 ? question : 'ยืนยัน';
  const danger = DANGER.test(question) || /ลบถาวร|ย้อนกลับไม่ได้|กู้คืนไม่ได้/.test(message);
  return { title, body, action, danger };
}
