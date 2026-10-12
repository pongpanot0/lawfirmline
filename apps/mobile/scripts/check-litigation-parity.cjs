// Run with: node apps/mobile/scripts/check-litigation-parity.cjs   (needs `pnpm --filter @lawfirm/shared build`)
// Pure logic and hook wiring for the mobile litigation work. Dates run under a non-Bangkok TZ on purpose.
process.env.TZ = 'America/Los_Angeles';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', file);
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = (id) => (Object.hasOwn(mocks, id) ? mocks[id] : original(id));
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}

const format = load('format.ts');
const thaiDate = load('thai-date.ts');
const deadline = load('deadline.ts');
const lit = load('litigation.ts', { './format': format, './thai-date': thaiDate });
const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('thai date parts: all three or none, no impossible day, Buddhist year only', () => {
  const { checkThaiDate, dayToParts, bangkokDayToIso, limitationPatch, THAI_MONTH_OPTIONS, THAI_DATE_PARTIAL, THAI_DATE_IMPOSSIBLE, THAI_DATE_YEAR } = thaiDate;
  assert.equal(THAI_DATE_PARTIAL, 'กรอกให้ครบทั้งวัน เดือน ปี หรือเว้นว่างทั้งหมด');
  assert.equal(THAI_DATE_IMPOSSIBLE, 'วันที่นี้ไม่มีในปฏิทิน');
  assert.equal(THAI_DATE_YEAR, 'ใส่ปี พ.ศ. (เช่น 2569)');
  assert.deepEqual(checkThaiDate({ d: '', m: '', y: '' }), { kind: 'empty' });
  for (const parts of [{ d: '13', m: '', y: '' }, { d: '13', m: '11', y: '256' }, { d: '', m: '11', y: '2569' }]) {
    assert.deepEqual(checkThaiDate(parts), { kind: 'partial', message: THAI_DATE_PARTIAL });
  }
  assert.deepEqual(checkThaiDate({ d: '31', m: '4', y: '2569' }), { kind: 'invalid', message: THAI_DATE_IMPOSSIBLE });
  assert.deepEqual(checkThaiDate({ d: '29', m: '2', y: '2569' }), { kind: 'invalid', message: THAI_DATE_IMPOSSIBLE });
  assert.deepEqual(checkThaiDate({ d: '0', m: '1', y: '2569' }), { kind: 'invalid', message: THAI_DATE_IMPOSSIBLE });
  assert.deepEqual(checkThaiDate({ d: '29', m: '2', y: '2567' }), { kind: 'ok', day: '2024-02-29' });
  assert.deepEqual(checkThaiDate({ d: '13', m: '11', y: '2026' }), { kind: 'invalid', message: THAI_DATE_YEAR });
  assert.deepEqual(checkThaiDate({ d: '1', m: '1', y: '2701' }), { kind: 'invalid', message: THAI_DATE_YEAR });
  assert.deepEqual(checkThaiDate({ d: '1', m: '1', y: '2700' }), { kind: 'ok', day: '2157-01-01' });
  assert.deepEqual(checkThaiDate({ d: '13', m: '11', y: '2569' }), { kind: 'ok', day: '2026-11-13' });
  assert.deepEqual(dayToParts('2026-11-13'), { d: '13', m: '11', y: '2569' });
  assert.deepEqual(dayToParts(null), { d: '', m: '', y: '' });
  assert.equal(bangkokDayToIso('2026-11-13'), '2026-11-12T17:00:00.000Z');
  assert.equal(THAI_MONTH_OPTIONS.length, 12);
  assert.deepEqual(THAI_MONTH_OPTIONS[10], { value: '11', label: 'พฤศจิกายน' });
  // The limitation key is sent only when it changed, and null only for a real clear.
  assert.deepEqual(limitationPatch('2026-11-13', '2026-11-13'), {});
  assert.deepEqual(limitationPatch(null, null), {});
  assert.deepEqual(limitationPatch('2026-11-14', '2026-11-13'), { limitationDeadline: '2026-11-13T17:00:00.000Z' });
  assert.deepEqual(limitationPatch(null, '2026-11-13'), { limitationDeadline: null });
});

check('deadline urgency follows the design thresholds on the Bangkok calendar, due 16:30', () => {
  const now = new Date('2026-10-12T03:00:00Z'); // 12 ต.ค. 2569, 10:00 Bangkok
  const at = (iso, when = now) => deadline.deadlineUrgency(iso, when);
  assert.deepEqual(at('2026-10-12T09:30:00Z'), { tone: 'due', label: 'ครบกำหนดวันนี้ 16:30 น.', daysLeft: 0 });
  assert.deepEqual(at('2026-10-12T09:30:00Z', new Date('2026-10-12T09:31:00Z')), { tone: 'due', label: 'เลยกำหนดวันนี้ 16:30 น.', daysLeft: 0 });
  assert.deepEqual(at('2026-10-09T09:30:00Z'), { tone: 'due', label: 'เลยกำหนด 3 วัน', daysLeft: -3 });
  assert.deepEqual(at('2026-10-13T09:30:00Z'), { tone: 'due', label: 'เหลือ 1 วัน', daysLeft: 1 });
  assert.deepEqual(at('2026-10-19T09:30:00Z'), { tone: 'due', label: 'เหลือ 7 วัน', daysLeft: 7 });
  assert.deepEqual(at('2026-10-20T09:30:00Z'), { tone: 'court', label: 'เหลือ 8 วัน', daysLeft: 8 });
  assert.deepEqual(at('2026-11-11T09:30:00Z'), { tone: 'court', label: 'เหลือ 30 วัน', daysLeft: 30 });
  assert.deepEqual(at('2026-11-12T09:30:00Z'), { tone: 'info', label: 'เหลือ 31 วัน', daysLeft: 31 });
  // A limitation date is stored as Bangkok midnight: 13 พ.ย. 2569 is 32 days away (design example).
  assert.deepEqual(at('2026-11-12T17:00:00.000Z'), { tone: 'info', label: 'เหลือ 32 วัน', daysLeft: 32 });
  // 00:30 Bangkok on 13 ต.ค. is still 12 Oct in UTC: the Bangkok day decides.
  assert.equal(at('2026-10-13T09:30:00Z', new Date('2026-10-12T17:30:00Z')).label, 'ครบกำหนดวันนี้ 16:30 น.');
});

check('legal basis comes from the default rule label; a firm-renamed rule shows none', () => {
  assert.equal(deadline.legalBasis('ครบกำหนดยื่นอุทธรณ์'), 'ป.วิ.พ. ม.229');
  assert.equal(deadline.legalBasis('ครบกำหนดยื่นคำแก้อุทธรณ์'), 'ป.วิ.พ. ม.237');
  assert.equal(deadline.legalBasis('ชื่อที่สำนักงานตั้งเอง'), null);
  assert.equal(deadline.legalBasis(null), null);
});

check('actions are hidden where the API refuses; failures read in Thai', () => {
  const { canRecordProceedings, isNetworkError, actionErrorText, OFFLINE_SAVE, canDecideRound } = lit;
  for (const status of ['OPEN', 'DRAFTING', 'COURT_DATE', 'IN_PROGRESS', 'PENDING']) assert.equal(canRecordProceedings(status), true, status);
  for (const status of ['CLOSED', 'ARCHIVED', '', null, undefined]) assert.equal(canRecordProceedings(status), false, String(status));
  const offline = new TypeError('Network request failed');
  const apiError = (status, message) => Object.assign(new Error(message), { status });
  assert.equal(isNetworkError(offline), true);
  assert.equal(isNetworkError(apiError(409, 'x')), false);
  assert.equal(OFFLINE_SAVE, 'ต้องต่อเน็ตเพื่อบันทึก');
  assert.equal(actionErrorText(offline), OFFLINE_SAVE);
  assert.equal(actionErrorText(apiError(400, 'คดีปิดแล้ว')), 'คดีปิดแล้ว');
  assert.equal(actionErrorText(apiError(409, 'วันที่นี้ถูกยืนยันหรือไม่ใช้ไปแล้ว')), 'วันที่นี้ถูกยืนยันหรือไม่ใช้ไปแล้ว');
  assert.equal(actionErrorText(apiError(403, 'You do not have access to this case')), 'ไม่มีสิทธิ์ทำรายการนี้ในคดีนี้');
  assert.equal(actionErrorText(apiError(404, 'Case not found')), 'ไม่พบรายการนี้แล้ว');
  assert.equal(actionErrorText(apiError(500, 'HTTP 500')), 'ลองใหม่อีกครั้ง');
  const round = { status: 'WAITING_REVIEW', reviewers: [{ id: 'me', decision: null }, { id: 'other', decision: 'APPROVED' }] };
  assert.equal(canDecideRound(round, 'me'), true);
  assert.equal(canDecideRound(round, 'other'), false, 'already decided');
  assert.equal(canDecideRound(round, 'stranger'), false, 'not on the round');
  assert.equal(canDecideRound({ ...round, status: 'RETURNED' }, 'me'), false, 'closed round');
  assert.equal(canDecideRound(round, undefined), false);
});

check("requests target the row's own case and send what the API checks", () => {
  const { suggestionRequest, reviewDecisionRequest } = lit;
  const row = { id: 's1', caseId: 'case-B', updatedAt: '2026-10-12T01:00:00.000Z', source: 'RULE' };
  assert.deepEqual(suggestionRequest(row, 'confirm', 'lead-1'),
    { path: '/cases/case-B/date-suggestions/s1/confirm', body: { expectedUpdatedAt: '2026-10-12T01:00:00.000Z' } });
  assert.deepEqual(suggestionRequest({ ...row, source: 'DOCUMENT' }, 'confirm', 'lead-1').body,
    { expectedUpdatedAt: '2026-10-12T01:00:00.000Z', assigneeId: 'lead-1' });
  assert.deepEqual(suggestionRequest(row, 'dismiss'), { path: '/cases/case-B/date-suggestions/s1/dismiss' });
  const round = { id: 'r1', caseId: 'case-C', documentId: 'd1', documentVersionId: 'v3' };
  assert.deepEqual(reviewDecisionRequest(round, 'return', '  แก้ข้อ 2  '), {
    path: '/cases/case-C/documents/d1/review-rounds/r1/decision',
    body: { action: 'return', reviewedDocumentVersionId: 'v3', reason: 'แก้ข้อ 2' },
  });
  assert.deepEqual(reviewDecisionRequest(round, 'approve', 'ignored').body, { action: 'approve', reviewedDocumentVersionId: 'v3' });
});

check("deadline hooks refetch on every mount, act on the row's case, and refresh after any outcome", async () => {
  const calls = [];
  const invalidated = [];
  const client = { invalidateQueries: ({ queryKey }) => { invalidated.push(JSON.stringify(queryKey)); } };
  const hooks = load('api/hooks.ts', {
    '@tanstack/react-query': { useQuery: (o) => o, useMutation: (o) => o, useInfiniteQuery: (o) => o, useQueryClient: () => client },
    './client': { api: async (requestPath, init) => { calls.push([requestPath, init]); return { status: 'WAITING_REVIEW' }; } },
    '../format': format,
    '../litigation': lit,
  });
  const list = hooks.useDateSuggestions('case-A');
  assert.deepEqual(list.queryKey, ['date-suggestions', 'case-A']);
  assert.equal(list.staleTime, 0, 'a suggestion confirmed elsewhere must not show from the 7-day cache');
  await list.queryFn();
  assert.equal(calls.at(-1)[0], '/cases/case-A/date-suggestions');
  const decide = hooks.useDecideSuggestion('case-A');
  assert.equal(decide.retry, false);
  assert.equal(decide.onMutate, undefined, 'never optimistic on a legal deadline');
  await decide.mutationFn({ suggestion: { id: 's1', caseId: 'case-A', updatedAt: '2026-10-12T01:00:00.000Z', source: 'RULE' }, action: 'confirm' });
  assert.deepEqual(calls.at(-1), ['/cases/case-A/date-suggestions/s1/confirm', { method: 'POST', body: { expectedUpdatedAt: '2026-10-12T01:00:00.000Z' } }]);
  // onSettled runs after success AND failure, so a 409 "already handled" also refreshes the list.
  decide.onSettled();
  for (const key of [['case', 'case-A'], ['date-suggestions', 'case-A'], ['my-day'], ['todos'], ['notifications'], ['actions']]) {
    assert.ok(invalidated.includes(JSON.stringify(key)), `invalidates ${key.join(':')}`);
  }
  const record = hooks.useRecordProceeding('case-A');
  assert.equal(record.retry, false);
  await record.mutationFn({ kind: 'judgment', body: { courtLevel: 'TRIAL' } });
  assert.deepEqual(calls.at(-1), ['/cases/case-A/proceedings/judgment', { method: 'POST', body: { courtLevel: 'TRIAL' } }]);
  const rounds = hooks.useCaseReviewRounds('case-A');
  assert.deepEqual(rounds.queryKey, ['review-rounds', 'case-A']);
  assert.equal(rounds.staleTime, 0);
  assert.deepEqual(hooks.useMyReviewRounds().queryKey, ['my-review-rounds']);
  const review = hooks.useDecideReviewRound('case-A');
  assert.equal(review.retry, false);
  invalidated.length = 0;
  review.onSettled();
  for (const key of [['review-rounds', 'case-A'], ['my-review-rounds'], ['notifications']]) {
    assert.ok(invalidated.includes(JSON.stringify(key)), `invalidates ${key.join(':')}`);
  }
});

check('the date field holds a half-typed entry back and asks before clearing a saved date', () => {
  const { thaiDateAction } = thaiDate;
  assert.deepEqual(thaiDateAction({ d: '13', m: '', y: '25' }, '2026-11-13', true),
    { emit: 'none', invalid: true, message: 'กรอกให้ครบทั้งวัน เดือน ปี หรือเว้นว่างทั้งหมด' });
  assert.deepEqual(thaiDateAction({ d: '31', m: '4', y: '2569' }, '2026-11-13', true),
    { emit: 'none', invalid: true, message: 'วันที่นี้ไม่มีในปฏิทิน' });
  assert.deepEqual(thaiDateAction({ d: '', m: '', y: '' }, '2026-11-13', true), { emit: 'confirm-clear', invalid: false });
  assert.deepEqual(thaiDateAction({ d: '', m: '', y: '' }, null, true), { emit: 'clear', invalid: false });
  assert.deepEqual(thaiDateAction({ d: '', m: '', y: '' }, '2026-11-13', false), { emit: 'clear', invalid: false });
  assert.deepEqual(thaiDateAction({ d: '14', m: '11', y: '2569' }, '2026-11-13', true), { emit: 'day', day: '2026-11-14', invalid: false });
});

check('a failed refetch keeps the cached case and says why in Thai (D7)', () => {
  const now = new Date('2026-10-12T03:00:00Z');
  assert.equal(lit.cachedDataNote(new TypeError('Network request failed'), now.getTime() - 5 * 60_000, now),
    'ออฟไลน์ · ข้อมูลล่าสุด 5 นาทีที่แล้ว');
  assert.equal(lit.cachedDataNote(Object.assign(new Error('HTTP 500'), { status: 500 }), now.getTime(), now),
    'โหลดข้อมูลล่าสุดไม่ได้ แสดงข้อมูลที่เก็บไว้');
});

// ── add new check(...) blocks above this line ──
(async () => {
  for (const [name, fn] of checks) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`PASS: ${checks.length} mobile litigation parity checks`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
