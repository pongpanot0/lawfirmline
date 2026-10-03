// Run with: node scripts/check-court-workflow.cjs
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
  mod.require = (id) => Object.hasOwn(mocks, id) ? mocks[id] : original(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}

async function main() {
  const { expenseError, claimActions, agendaCompanionNames, agendaIncludesPerson, canReviewTask, canToggleTask, actionAppRoute } = load('workflow.ts');
  const taskId = '11111111-1111-4111-8111-111111111111';
  for (const kind of ['WAITING', 'UNASSIGNED', 'TASK_REVIEW']) {
    assert.equal(actionAppRoute({ id: `task:${taskId}`, kind, url: '/todos' }), `/task/new?id=${taskId}`);
  }
  assert.equal(actionAppRoute({ id: 'task:invalid', kind: 'WAITING', url: '/todos' }), null);
  assert.equal(actionAppRoute({ id: 'x', kind: 'UNKNOWN', url: 'https://external.example/cases/' + taskId }), null);
  const review = { status: 'PENDING_REVIEW', assigneeId: 'reviewer', reviewerId: 'reviewer', caseId: 'case' };
  assert.equal(canReviewTask(review, { id: 'reviewer', firmRole: 'LAWYER' }), true);
  assert.equal(canReviewTask(review, { id: 'owner', firmRole: 'OWNER' }), false);
  assert.equal(canReviewTask({ ...review, reviewerId: null }, { id: 'owner', firmRole: 'OWNER' }), true);
  assert.equal(canReviewTask({ ...review, caseId: null }, { id: 'reviewer' }), true);
  assert.equal(canReviewTask({ ...review, caseId: null }, { id: 'creator' }), false);
  assert.equal(canToggleTask(review, { id: 'reviewer' }), false);
  assert.equal(canToggleTask({ ...review, status: 'TODO', requiresReview: true }, { id: 'reviewer' }), false);
  assert.equal(canToggleTask({ ...review, status: 'TODO' }, { id: 'reviewer' }), true);
  assert.equal(canToggleTask({ ...review, status: 'TODO' }, { id: 'creator' }), false);
  const { formatMoney, formatMoneyInput } = load('format.ts');
  assert.equal(formatMoney(50000), '50,000');
  assert.equal(formatMoney('50000.50'), '50,000.50');
  assert.equal(formatMoney(0.1 + 0.2), '0.30');
  assert.equal(formatMoneyInput('50000'), '50,000');
  assert.equal(formatMoneyInput('50,000.50'), '50,000.50');
  assert.equal(formatMoneyInput('.5'), '0.5');
  assert.equal(formatMoneyInput(''), '');
  assert.equal(formatMoneyInput('1.234'), null);
  assert.equal(formatMoneyInput('1e3'), null);
  assert.equal(expenseError('ค่าเดินทาง', '', formatMoneyInput('50000'), true), null);
  // Older API responses and persisted agenda rows may omit assignees.
  for (const assignees of [undefined, null, {}, 'invalid', []]) {
    assert.equal(agendaCompanionNames({ assigneeId: 'primary', assignees }), '');
  }
  assert.equal(agendaCompanionNames({ assigneeId: 'primary' }), '');
  assert.equal(agendaCompanionNames({ assigneeId: 'primary', assignees: [
    { id: 'primary', name: 'ทนายหลัก' },
    { id: 'assistant', name: 'ผู้ช่วย' },
    { id: 'lawyer', name: 'ทนายร่วม' },
  ] }), 'ผู้ช่วย, ทนายร่วม');
  assert.equal(agendaCompanionNames({ assigneeId: null, assignees: [
    { id: 'lawyer', name: 'ทนายร่วม' },
  ] }), 'ทนายร่วม');
  for (const assignees of [undefined, null, {}, 'invalid', []]) {
    assert.equal(agendaIncludesPerson({ assigneeId: 'primary', assignees }, 'primary'), true);
    assert.equal(agendaIncludesPerson({ assigneeId: 'primary', assignees }, 'other'), false);
  }
  assert.equal(agendaIncludesPerson({ assigneeId: 'primary', assignees: [
    { id: 'primary', name: 'หลัก' }, { id: 'companion', name: 'ร่วม' },
  ] }, 'companion'), true);
  assert.equal(expenseError('ค่าเดินทาง', '', '', false), null);
  for (const amount of ['', '0', '-1', 'NaN', 'Infinity', '1.001', '1,2', '1e2']) {
    assert.ok(expenseError('ค่าเดินทาง', '', amount, true), amount);
  }
  assert.equal(expenseError('ค่าเดินทาง', '', '1,250.50', true), null);
  assert.ok(expenseError('อื่นๆ', '  ', '100', false));
  assert.ok(expenseError('หมวดที่พิมพ์เอง', '', '100', true));
  assert.equal(expenseError('อื่นๆ', 'ค่าส่งเอกสาร', '100', true), null);
  assert.deepEqual(claimActions('PENDING', true), ['APPROVED', 'REJECTED']);
  assert.deepEqual(claimActions('APPROVED', true), ['PAID']);
  for (const status of ['PENDING', 'APPROVED', 'PAID', 'REJECTED', 'DRAFT']) {
    assert.deepEqual(claimActions(status, false), []);
  }
  for (const status of ['PAID', 'REJECTED', 'DRAFT']) assert.deepEqual(claimActions(status, true), []);

  process.env.TZ = 'America/Los_Angeles';
  const { bangkokDay, thDate, thTime, calendarRangeQuery } = load('format.ts');
  const bounds = new URLSearchParams(calendarRangeQuery('2026-09-27', '2026-09-27'));
  assert.equal(new Date(bounds.get('from')).toISOString(), '2026-09-26T17:00:00.000Z');
  assert.equal(new Date(bounds.get('to')).toISOString(), '2026-09-27T16:59:59.999Z');
  const instant = '2026-09-27T09:00:00+07:00';
  assert.equal(new URLSearchParams(calendarRangeQuery(instant, instant)).get('to'), instant);
  assert.equal(bangkokDay('2026-09-26T18:00:00Z'), '2026-09-27');
  assert.equal(thDate('2026-09-26T18:00:00Z'), '27 ก.ย. 2569');
  assert.equal(thTime('2026-09-26T18:00:00Z'), '01:00');

  const rows = new Map();
  const starts = [];
  let finish;
  const blocked = new Promise((resolve) => { finish = resolve; });
  const storage = { setItem: async (key, value) => {
    starts.push(value);
    if (value === '"first"') await blocked;
    rows.set(key, value);
  } };
  const drafts = load('api/drafts.ts', {
    '@react-native-async-storage/async-storage': storage,
    'expo-file-system/legacy': {},
  });
  const owner = { firmId: 'firm-a', id: 'owner' };
  assert.notEqual(drafts.draftScope(owner), drafts.draftScope({ ...owner, id: 'lawyer' }));
  assert.notEqual(drafts.draftScope(owner), drafts.draftScope({ ...owner, firmId: 'firm-b' }));
  const first = drafts.saveDraft('note', 'first');
  const last = drafts.saveDraft('note', 'last');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(starts, ['"first"']);
  finish(); await Promise.all([first, last]);
  assert.equal(rows.get('note'), '"last"');

  const copied = [];
  const receipts = load('api/drafts.ts', {
    '@react-native-async-storage/async-storage': storage,
    'expo-file-system/legacy': { documentDirectory: 'file:///documents/', makeDirectoryAsync: async () => {}, copyAsync: async (value) => copied.push(value) },
  });
  const retained = await receipts.retainReceipt('firm:user:', 'draft-1', 'file:///temporary/receipt.png');
  assert.ok(retained.startsWith('file:///documents/firm%3Auser%3A/draft-1-'));
  assert.equal(copied[0].to, retained);
  assert.equal(copied[0].from, 'file:///temporary/receipt.png');

  let sent;
  global.fetch = async (_url, options) => { sent = options.body; return { ok: true, json: async () => ({ id: 'saved' }) }; };
  const files = load('api/files.ts', {
    'expo-file-system/legacy': {}, 'expo-sharing': {},
    'expo-file-system': { File: class { constructor(uri) { this.uri = uri; } async bytes() { return new TextEncoder().encode(this.uri); } } },
    './client': { API_URL: 'https://example.invalid', getTokens: async () => ({ accessToken: 'test' }) },
  });
  await files.createExpense({ category: 'ค่าเดินทาง', amount: 100, description: 'ค่าเดินทาง', date: '2026-09-26' });
  assert.equal(sent.get('status'), 'DRAFT');
  assert.equal(sent.get('category'), 'ค่าเดินทาง');
  assert.equal(sent.has('billable'), false);
  const NativeFormData = global.FormData;
  global.FormData = class extends Map { append(key, value, name) { if (name) value.name = name; this.set(key, value); } };
  await files.createExpense({ category: 'ค่าเดินทาง', amount: 100, description: 'ค่าเดินทาง', date: '2026-09-26', receiptUri: 'file:///receipt.png', receiptMimeType: 'image/png' });
  assert.equal(sent.get('receipt').name, 'receipt.png');
  assert.equal(sent.get('receipt').type, 'image/png');
  assert.equal(new TextDecoder().decode(await sent.get('receipt').bytes()), 'file:///receipt.png');
  await files.uploadCaseDocument('case-id', 'file:///document.pdf', 'document.pdf', 'application/pdf');
  assert.equal(sent.get('file').name, 'document.pdf');
  assert.equal(sent.get('file').type, 'application/pdf');
  assert.equal(new TextDecoder().decode(await sent.get('file').bytes()), 'file:///document.pdf');
  await files.uploadTaskAttachment('task-id', { uri: 'file:///task.png', name: 'task.png', mimeType: 'image/png' });
  assert.equal(sent.get('file').name, 'task.png');
  assert.equal(sent.get('file').type, 'image/png');
  assert.equal(new TextDecoder().decode(await sent.get('file').bytes()), 'file:///task.png');
  global.FormData = NativeFormData;
  let attempts = 0;
  global.__DEV__ = false;
  global.fetch = async () => { attempts += 1; throw new TypeError('Network request failed'); };
  await assert.rejects(files.createExpense({ category: 'ค่าเดินทาง', amount: 100, description: 'ค่าเดินทาง', date: '2026-09-26' }), /เชื่อมต่อไม่ได้/);
  assert.equal(attempts, 1);
  console.log('PASS: direct task routes, named reviewer permissions and protected review completion; agenda companions, expense validation, batch actions, Bangkok dates, draft isolation/write order, receipt paths/MIME, upload contract and network failure without retry');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
