export function isActionRequest(method?: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes((method ?? 'GET').toUpperCase());
}

export function publishActionFeedback(status: 'success' | 'error', message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('lawfirm:action-result', { detail: { status, message } }));
}

/** +1 when an AI request starts, -1 when it settles; AiWorkingIndicator counts them. */
export function publishAiBusy(delta: 1 | -1) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('lawfirm:ai-busy', { detail: delta }));
}

type Rule = [method: string, path: RegExp, message: string | ((body: Record<string, unknown>) => string | null)];

/** Say what just happened. Most specific first; ids are path segments matched by [^/]+. */
const RULES: Rule[] = [
  ['POST', /^\/cases$/, 'เปิดคดีแล้ว'],
  ['PATCH', /^\/cases\/[^/]+$/, 'บันทึกข้อมูลคดีแล้ว'],
  ['POST', /^\/cases\/[^/]+\/tasks$/, 'เพิ่มงานแล้ว'],
  ['POST', /\/tasks\/[^/]+\/accept$/, 'ตรวจผ่าน ปิดงานแล้ว'],
  ['POST', /\/tasks\/[^/]+\/reject$/, 'ส่งกลับให้แก้ไขแล้ว'],
  ['POST', /\/tasks\/[^/]+\/handoff$/, 'ส่งงานให้ผู้ตรวจแล้ว'],
  ['POST', /\/tasks\/[^/]+\/acknowledge$/, 'รับทราบงานแล้ว'],
  ['POST', /\/tasks\/[^/]+\/confirm-plan$/, 'ยืนยันแผนงานวันนี้แล้ว'],
  ['POST', /\/tasks\/[^/]+\/daily-update$/, 'บันทึกความคืบหน้าแล้ว'],
  ['POST', /\/tasks\/[^/]+\/comments$/, 'บันทึกความคืบหน้าแล้ว'],
  ['POST', /\/tasks\/[^/]+\/attachments$/, 'แนบไฟล์แล้ว'],
  ['POST', /\/tasks\/[^/]+\/subtasks$/, 'เพิ่มงานย่อยแล้ว'],
  ['POST', /\/tasks\/[^/]+\/skip$/, 'ข้ามงานแล้ว'],
  ['PATCH', /\/tasks\/[^/]+$/, (body) => (body.status === 'DONE' ? 'ทำงานเสร็จแล้ว' : 'บันทึกงานแล้ว')],
  ['POST', /^\/clients$/, 'เพิ่มลูกความแล้ว'],
  ['PATCH', /^\/clients\/[^/]+$/, 'บันทึกข้อมูลลูกความแล้ว'],
  ['POST', /\/calendar\/events\/[^/]+\/court-day\/complete$/, 'บันทึกผลนัดแล้ว'],
  ['PATCH', /\/calendar\/events\/[^/]+\/court-day$/, 'บันทึกแฟ้มไปศาลแล้ว'],
  ['POST', /\/calendar\/events$/, 'บันทึกนัดแล้ว'],
  ['PATCH', /\/calendar\/events\/[^/]+$/, 'บันทึกนัดแล้ว'],
  ['POST', /expense-claims$/, 'ส่งเบิกแล้ว'],
  ['POST', /\/expenses\/submit$/, 'ส่งเบิกแล้ว'],
  ['PATCH', /expense-claims\/[^/]+/, (body) => (body.status === 'APPROVED' ? 'อนุมัติใบเบิกแล้ว' : body.status === 'REJECTED' ? 'ไม่อนุมัติใบเบิกแล้ว' : body.status === 'PAID' ? 'บันทึกจ่ายแล้ว' : null)],
  ['POST', /expenses$/, 'บันทึกค่าใช้จ่ายแล้ว'],
  ['POST', /^\/leaves$/, 'ยื่นลาแล้ว'],
  ['PATCH', /^\/leaves\/[^/]+\/decision$/, (body) => (body.decision === 'APPROVED' ? 'อนุมัติการลาแล้ว' : body.decision === 'REJECTED' ? 'ไม่อนุมัติการลาแล้ว' : null)],
  ['POST', /time-entries(\/confirm)?$/, 'บันทึกเวลาแล้ว'],
  ['POST', /invoices$/, 'ออกใบแจ้งหนี้แล้ว'],
  ['PATCH', /invoices\/[^/]+\/send$/, 'ส่งใบแจ้งหนี้แล้ว'],
  ['POST', /invoices\/[^/]+\/remind$/, 'ส่งเตือนชำระแล้ว'],
  ['POST', /\/documents$/, 'อัปโหลดเอกสารแล้ว'],
];

export function actionSuccessMessage(method?: string, path?: string, body?: unknown): string {
  const verb = (method ?? 'GET').toUpperCase();
  const clean = (path ?? '').split('?')[0];
  let parsed: Record<string, unknown> = {};
  if (typeof body === 'string') { try { parsed = JSON.parse(body) ?? {}; } catch { /* not JSON */ } }
  for (const [ruleMethod, pattern, message] of RULES) {
    if (ruleMethod !== verb || !pattern.test(clean)) continue;
    const text = typeof message === 'function' ? message(parsed) : message;
    if (text) return text;
  }
  return verb === 'DELETE' ? 'ลบแล้ว' : 'บันทึกแล้ว';
}
