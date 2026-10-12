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
const lit = load('litigation.ts', { './format': format, './thai-date': thaiDate, './deadline': deadline });
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
  assert.deepEqual(at('2027-10-12T09:30:00Z'), { tone: 'info', label: 'เหลือ 365 วัน', daysLeft: 365 });
  assert.equal(at('2036-07-14T09:30:00Z').label, 'เหลือราว 9 ปี', 'a 10-year enforcement window reads in years');
  // 00:30 Bangkok on 13 ต.ค. is still 12 Oct in UTC: the Bangkok day decides.
  assert.equal(at('2026-10-13T09:30:00Z', new Date('2026-10-12T17:30:00Z')).label, 'ครบกำหนดวันนี้ 16:30 น.');
});

check('legal basis comes from the default rule label; a firm-renamed rule shows none', () => {
  assert.equal(deadline.legalBasis('ครบกำหนดยื่นอุทธรณ์'), 'ป.วิ.พ. ม.229');
  assert.equal(deadline.legalBasis('ครบกำหนดยื่นคำแก้อุทธรณ์'), 'ป.วิ.พ. ม.237');
  assert.equal(deadline.legalBasis('ชื่อที่สำนักงานตั้งเอง'), null);
  assert.equal(deadline.legalBasis(null), null);
  assert.deepEqual(deadline.deadlineUrgency('not a date', new Date()), { tone: 'none', label: '', daysLeft: 0 });
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
    react: { useRef: (value) => ({ current: value }) },
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
  const decide = hooks.useDecideSuggestion();
  assert.equal(decide.retry, false);
  assert.equal(decide.onMutate, undefined, 'never optimistic on a legal deadline');
  await decide.mutationFn({ suggestion: { id: 's1', caseId: 'case-A', updatedAt: '2026-10-12T01:00:00.000Z', source: 'RULE' }, action: 'confirm' });
  assert.deepEqual(calls.at(-1), ['/cases/case-A/date-suggestions/s1/confirm', { method: 'POST', body: { expectedUpdatedAt: '2026-10-12T01:00:00.000Z' } }]);
  // onSettled runs after success AND failure, so a 409 "already handled" also refreshes the list.
  decide.onSettled(null, null, { suggestion: { caseId: 'case-A' } });
  for (const key of [['case', 'case-A'], ['date-suggestions', 'case-A'], ['my-day'], ['todos'], ['notifications'], ['actions']]) {
    assert.ok(invalidated.includes(JSON.stringify(key)), `invalidates ${key.join(':')}`);
  }
  // A list mounted for another case still refreshes the row's own case.
  invalidated.length = 0;
  decide.onSettled(null, null, { suggestion: { caseId: 'case-Z' } });
  assert.ok(invalidated.includes(JSON.stringify(['date-suggestions', 'case-Z'])));
  // Double tap: the second call while one is in flight shares the first request.
  const before = calls.length;
  const vars = { suggestion: { id: 's2', caseId: 'case-A', updatedAt: 'u', source: 'RULE' }, action: 'dismiss' };
  await Promise.all([decide.mutationFn(vars), decide.mutationFn(vars)]);
  assert.equal(calls.length - before, 1, 'one POST for two taps');
  await decide.mutationFn(vars);
  assert.equal(calls.length - before, 2, 'guard clears after settle');
  const record = hooks.useRecordProceeding('case-A');
  assert.equal(record.retry, false);
  await record.mutationFn({ kind: 'judgment', body: { courtLevel: 'TRIAL' } });
  assert.deepEqual(calls.at(-1), ['/cases/case-A/proceedings/judgment', { method: 'POST', body: { courtLevel: 'TRIAL' } }]);
  const rounds = hooks.useCaseReviewRounds('case-A');
  assert.deepEqual(rounds.queryKey, ['review-rounds', 'case-A']);
  assert.equal(rounds.staleTime, 0);
  assert.deepEqual(hooks.useMyReviewRounds().queryKey, ['my-review-rounds']);
  assert.equal(hooks.useMyReviewRounds().staleTime, 0);
  const review = hooks.useDecideReviewRound();
  assert.equal(review.retry, false);
  invalidated.length = 0;
  review.onSettled(null, null, { round: { caseId: 'case-A' } });
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

check('limitation matters until filing; one court row per level, current level falls back to the case', () => {
  const { limitationRelevant, courtLevelRows } = lit;
  const open = { status: 'OPEN', blackCaseNumber: null, proceedings: [] };
  assert.equal(limitationRelevant(open), true);
  assert.equal(limitationRelevant({ status: 'OPEN', blackCaseNumber: null }), true, 'older cache without proceedings');
  assert.equal(limitationRelevant({ ...open, status: 'CLOSED' }), false);
  assert.equal(limitationRelevant({ ...open, blackCaseNumber: 'พ.123/2569' }), false);
  assert.equal(limitationRelevant({ ...open, proceedings: [{ courtLevel: 'TRIAL', filedAt: '2026-10-01T00:00:00Z', blackCaseNumber: null, judgmentAt: null }] }), false);
  const rows = courtLevelRows({
    courtLevel: 'APPEAL', courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'อ.5/2570', redCaseNumber: null,
    proceedings: [{ courtLevel: 'TRIAL', courtName: 'ศาลแพ่งกรุงเทพใต้', blackCaseNumber: 'พ.123/2569', redCaseNumber: 'พ.900/2569', filedAt: null, judgmentAt: null }],
  });
  assert.deepEqual(rows.map((row) => [row.level, row.current, row.reached, row.courtName, row.black, row.red]), [
    ['TRIAL', false, true, 'ศาลแพ่งกรุงเทพใต้', 'พ.123/2569', 'พ.900/2569'],
    ['APPEAL', true, true, 'ศาลอุทธรณ์', 'อ.5/2570', null],
    ['SUPREME', false, false, null, null, null],
  ]);
  const unset = courtLevelRows({ courtLevel: null, courtName: 'ศาลแพ่ง', blackCaseNumber: null, redCaseNumber: null });
  assert.deepEqual(unset.map((row) => [row.level, row.current, row.reached, row.courtName]),
    [['TRIAL', true, true, 'ศาลแพ่ง'], ['APPEAL', false, false, null], ['SUPREME', false, false, null]]);
});


check('court-event body, confirmation and result say exactly what will be and was recorded (D3)', async () => {
  const { proceedingBody, proceedingLevel, proceedingConfirm, proceedingResultText, runProceeding, LEVEL_TABS, PROCEEDING_LABELS } = lit;
  assert.deepEqual(LEVEL_TABS.map((tab) => tab.label), ['ชั้นต้น', 'อุทธรณ์', 'ฎีกา']);
  assert.deepEqual(Object.values(PROCEEDING_LABELS), ['ยื่นฟ้อง', 'ส่งหมาย', 'อ่านคำพิพากษา', 'ได้รับสำเนาอุทธรณ์']);
  const base = { level: 'APPEAL', day: '2026-10-13', method: '', outcome: '' };
  const at = '2026-10-12T17:00:00.000Z';
  assert.deepEqual(proceedingBody({ ...base, kind: 'filing' }), { filedAt: at, courtLevel: 'APPEAL' });
  assert.equal(proceedingBody({ ...base, kind: 'service' }), null, 'service needs a method');
  assert.deepEqual(proceedingBody({ ...base, kind: 'service', method: 'POSTED' }), { servedAt: at, method: 'POSTED' });
  assert.equal(proceedingBody({ ...base, kind: 'judgment' }), null, 'judgment needs an outcome');
  assert.deepEqual(proceedingBody({ ...base, kind: 'judgment', outcome: 'WON' }), { courtLevel: 'APPEAL', judgmentAt: at, outcome: 'WON' });
  assert.deepEqual(proceedingBody({ ...base, kind: 'appeal-served' }), { servedAt: at });
  assert.equal(proceedingBody({ ...base, kind: null }), null);
  assert.equal(proceedingBody({ ...base, kind: 'filing', day: null }), null);
  assert.equal(proceedingLevel('service', 'SUPREME', 'TRIAL'), 'TRIAL', 'service lands on the current level');
  assert.equal(proceedingLevel('judgment', 'APPEAL', 'TRIAL'), 'APPEAL');
  assert.deepEqual(proceedingConfirm('judgment', 'APPEAL', '2026-10-13', 'ชนะคดี'), {
    title: 'ยืนยันบันทึกอ่านคำพิพากษา',
    body: 'ชั้นอุทธรณ์ · วันที่ 13 ต.ค. 2569 · ชนะคดี\nระบบจะปรับขั้นตอนคดีและเสนอวันครบกำหนดให้ยืนยัน\nบันทึกแล้วยกเลิกไม่ได้',
  });
  assert.equal(proceedingConfirm('filing', 'TRIAL', '2026-10-13').body.split('\n')[0], 'ชั้นต้น · วันที่ 13 ต.ค. 2569');
  // Save says what is still missing instead of sitting grey.
  const { proceedingMissing } = lit;
  assert.equal(proceedingMissing({ ...base, kind: null }, false), 'เลือกเหตุการณ์ก่อน');
  assert.equal(proceedingMissing({ ...base, kind: 'service' }, false), 'เลือกวิธีส่งหมายก่อน');
  assert.equal(proceedingMissing({ ...base, kind: 'judgment' }, false), 'เลือกผลคำพิพากษาก่อน');
  assert.equal(proceedingMissing({ ...base, kind: 'filing' }, true), 'ใส่วันที่ให้ครบก่อน');
  assert.equal(proceedingMissing({ ...base, kind: 'service', method: 'POSTED' }, false), null);
  assert.equal(proceedingResultText(0, 'FILING', 'FILING'), 'บันทึกแล้ว · ไม่มีวันครบกำหนดที่ต้องยืนยัน');
  assert.equal(proceedingResultText(2, 'FILING', 'AWAITING_JUDGMENT'),
    'บันทึกแล้ว · ขั้นตอนคดีเป็น "รอคำพิพากษา" · ระบบเสนอวันครบกำหนด 2 รายการ รอยืนยัน');
  // Offline: nothing recorded; the caller keeps the sheet and its input and shows this line.
  assert.deepEqual(await runProceeding(async () => { throw new TypeError('Network request failed'); }, async () => 'FILING', 'FILING'),
    { ok: false, message: 'ต้องต่อเน็ตเพื่อบันทึก' });
  assert.deepEqual(await runProceeding(async () => { throw Object.assign(new Error('คดีปิดแล้ว'), { status: 400 }); }, async () => null, null),
    { ok: false, message: 'คดีปิดแล้ว' });
  // Recorded, but the case refetch failed: no claim about the stage.
  assert.deepEqual(await runProceeding(async () => ({ suggestions: 1 }), async () => { throw new TypeError('x'); }, 'PRE_LITIGATION'),
    { ok: true, text: 'บันทึกแล้ว · ระบบเสนอวันครบกำหนด 1 รายการ รอยืนยัน' });
  assert.deepEqual(await runProceeding(async () => ({ suggestions: 1 }), async () => 'FILING', 'PRE_LITIGATION'),
    { ok: true, text: 'บันทึกแล้ว · ขั้นตอนคดีเป็น "ยื่นฟ้อง" · ระบบเสนอวันครบกำหนด 1 รายการ รอยืนยัน' });
});

check('home queue rows open the one case, or the filtered waiting list for several', () => {
  assert.equal(lit.queueRoute(['c1', 'c1'], 'deadlines'), '/case/c1?section=deadlines');
  assert.equal(lit.queueRoute(['c1', 'c2'], 'deadlines'), '/notifications?filter=deadline');
  assert.equal(lit.queueRoute(['c9'], 'documents'), '/case/c9?section=documents');
  assert.equal(lit.queueRoute(['c1', 'c2'], 'documents'), '/notifications?filter=document');
  // The row says which case and how close, so nobody opens it just to find out.
  const now = new Date('2026-10-12T03:00:00Z');
  assert.equal(lit.deadlineQueueDetail([{ ownRef: 'TSB1', nearestDate: '2026-10-20T09:30:00Z' }], now), 'TSB1 · ใกล้สุด 20 ต.ค. 2569 (เหลือ 8 วัน)');
  assert.equal(lit.deadlineQueueDetail([
    { ownRef: 'TSB1', nearestDate: '2026-11-11T09:30:00Z' }, { ownRef: 'TSB2', nearestDate: '2026-10-20T09:30:00Z' },
  ], now), '2 คดี · ใกล้สุด 20 ต.ค. 2569 (เหลือ 8 วัน)');
  assert.equal(lit.reviewQueueDetail([{ filename: 'คำฟ้อง.pdf', createdByName: 'Nattapong' }]), 'คำฟ้อง.pdf · จาก Nattapong');
  assert.equal(lit.reviewQueueDetail([{ filename: 'a', createdByName: null }, { filename: 'b', createdByName: null }]), '2 ฉบับ');
});

check('a half-typed limitation never reaches the save; only a confirmed clear sends null', () => {
  const { thaiDateAction, limitationBody } = thaiDate;
  assert.deepEqual(limitationBody(false, null, null), {}, 'create without a date sends nothing');
  assert.deepEqual(limitationBody(false, '2026-11-13', null), { limitationDeadline: '2026-11-12T17:00:00.000Z' });
  const stored = '2026-11-13';
  let form = stored;
  const type = (parts) => {
    const action = thaiDateAction(parts, form, true);
    if (action.emit === 'day') form = action.day;
    if (action.emit === 'clear') form = null;
    return action;
  };
  assert.equal(type({ d: '13', m: '', y: '2569' }).invalid, true);
  assert.deepEqual(limitationBody(true, form, stored), {}, 'half-typed: the stored date is untouched');
  assert.equal(type({ d: '31', m: '4', y: '2569' }).invalid, true);
  assert.deepEqual(limitationBody(true, form, stored), {}, 'impossible day: still untouched');
  assert.equal(type({ d: '', m: '', y: '' }).emit, 'confirm-clear', 'emptying a saved date asks first');
  assert.deepEqual(limitationBody(true, form, stored), {}, 'nothing is cleared before the lawyer confirms');
  form = null; // the lawyer tapped "ลบวันที่"
  assert.deepEqual(limitationBody(true, form, stored), { limitationDeadline: null });
  form = stored; // "คืนค่าเดิม"
  assert.deepEqual(limitationBody(true, form, stored), {});
  assert.equal(type({ d: '14', m: '11', y: '2569' }).emit, 'day');
  assert.deepEqual(limitationBody(true, form, stored), { limitationDeadline: '2026-11-13T17:00:00.000Z' });
});

check('a review opens the exact version under review, cached apart from the latest', async () => {
  const downloads = [];
  const files = load('api/files.ts', {
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/',
      makeDirectoryAsync: async () => {},
      downloadAsync: async (url, target) => { downloads.push([url, target]); return { status: 200, uri: target }; },
    },
    'expo-file-system': { File: class {} },
    'expo-sharing': { isAvailableAsync: async () => false },
    './client': {
      API_URL: 'https://api.test', api: async () => ({}), ApiError: class extends Error {},
      authenticatedFetch: async () => ({}), getTokens: async () => ({ accessToken: 't' }),
    },
  });
  await files.openCaseDocument('case-1', 'doc-1', 'สัญญา.pdf', 3);
  await files.openCaseDocument('case-1', 'doc-1', 'สัญญา.pdf');
  assert.deepEqual(downloads, [
    ['https://api.test/cases/case-1/documents/doc-1/download?version=3', 'file:///cache/docs/doc-1/v3/สัญญา.pdf'],
    ['https://api.test/cases/case-1/documents/doc-1/download', 'file:///cache/docs/doc-1/latest/สัญญา.pdf'],
  ]);
});

check('mentions: @query at the end, literal insert, case team only, and who the API dropped', () => {
  const m = load('mentions.ts');
  assert.equal(m.mentionQuery('ขอให้ @สม'), 'สม');
  assert.equal(m.mentionQuery('ขอให้ @'), '');
  assert.equal(m.mentionQuery('ขอให้ @สมชาย '), null, 'a space closes the list');
  assert.equal(m.mentionQuery('ไม่มีการกล่าวถึง'), null);
  assert.equal(m.insertMention('ขอให้ @สม', 'สมชาย'), 'ขอให้ @สมชาย ');
  assert.equal(m.insertMention('@', 'A$&B'), '@A$&B ', 'names are inserted literally');
  const lead = { id: 'lead', firstName: 'สมชาย', lastName: 'ใจดี' };
  const team = { leadLawyer: lead, assignments: [{ user: { id: 'author', firstName: 'สมหญิง', lastName: 'ขยัน' } }, { user: lead }] };
  const people = m.mentionCandidates(team, [{ id: 'outsider', firstName: 'มานะ', lastName: 'อดทน' }], 'author',
    [{ id: 'worker', firstName: 'วิชัย', lastName: 'ทำงาน' }, null]);
  assert.deepEqual(people.map((p) => p.id), ['lead', 'worker'], 'case team + assignee; no author, duplicates or outsiders');
  assert.deepEqual(m.mentionCandidates(null, [{ id: 'a', firstName: 'ก', lastName: 'ข' }, { id: 'me', firstName: 'ค', lastName: 'ง' }], 'me')
    .map((p) => p.id), ['a'], 'a task without a case offers firm members');
  assert.deepEqual(m.matchPeople(people, 'สม').map((p) => p.id), ['lead']);
  assert.equal(m.matchPeople(Array.from({ length: 9 }, (_, i) => ({ id: String(i), firstName: `สม${i}`, lastName: '' })), 'สม').length, 5);
  assert.deepEqual(m.mentionedIdsIn('ฝาก @สมชาย ดู', [lead, { id: 'x', firstName: 'มานะ', lastName: '' }]), ['lead'],
    'a picked name deleted from the text is not notified');
  assert.deepEqual(m.droppedMentions(['lead', 'x'], ['lead']), ['x']);
  assert.deepEqual(m.droppedMentions([], undefined), []);
});

check('court fee and interest estimate come from the shared calculators (item 8)', () => {
  const { litigationEstimate } = lit;
  assert.equal(litigationEstimate({ amount: '', rate: '5', from: null, to: '2026-10-12' }), null, 'กรอกทุนทรัพย์เพื่อคำนวณ');
  assert.equal(litigationEstimate({ amount: 'abc', rate: '5', from: null, to: '2026-10-12' }), null);
  assert.deepEqual(litigationEstimate({ amount: '1,250,000', rate: '5', from: null, to: '2026-10-12' }), { fee: 25000, days: null, interest: null });
  assert.deepEqual(litigationEstimate({ amount: '1,250,000', rate: '5', from: '2025-08-26', to: '2026-10-12' }), { fee: 25000, days: 412, interest: 70547.95 });
  assert.equal(litigationEstimate({ amount: '1,250,000', rate: '', from: '2025-08-26', to: '2026-10-12' }).interest, null);
  // Above 50 million: 200,000 cap on the first band + 0.1% of the rest; an end before the start counts 0 days.
  assert.deepEqual(litigationEstimate({ amount: '60,000,000', rate: '5', from: '2026-10-12', to: '2026-10-01' }), { fee: 210000, days: 0, interest: 0 });
});

// ── add new check(...) blocks above this line ──
(async () => {
  for (const [name, fn] of checks) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`PASS: ${checks.length} mobile litigation parity checks`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
