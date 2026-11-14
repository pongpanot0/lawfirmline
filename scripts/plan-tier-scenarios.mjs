import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const base = 'http://localhost:3021';
const run = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const password = `Tier-${randomUUID()}!`;
const plans = { FREE: 1, TEAM: 3, FIRM: 10, PROFESSIONAL: 20 };
const owned = new Set();
const results = [];
const firms = [];
const authTimes = new Map();
const rerun = 'node scripts/plan-tier-scenarios.mjs > /private/tmp/claude-161482033/-Users-pongpanot-s-Documents-dev-lawfirm--claude-worktrees-test-pricing-tiers-free-76517a/37c91540-0291-40d0-9be6-b4aafe51520d/scratchpad/tier-run.log 2>&1';

function sql(statement) {
  return execFileSync('docker', ['exec', '-i', 'lawfirm-postgres', 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'lawfirm', '-d', 'lawfirm'], {
    input: statement, encoding: 'utf8', timeout: 30_000,
  }).trim();
}

function firmId(firm) {
  assert(owned.has(firm.id), 'SQL may only target a firm registered in this run');
  assert.match(firm.id, /^[a-f0-9-]{36}$/i);
  return `'${firm.id}'`;
}

function redact(value) {
  return JSON.parse(JSON.stringify(value, (key, v) =>
    /password|token|inviteUrl/i.test(key) ? '[redacted]' : v));
}

async function request(method, path, token, body) {
  // Respect the existing per-route auth throttle while accepting all 32 paid seats.
  if (path === '/saas/invitations/accept' || path === '/auth/login') {
    const times = authTimes.get(path) ?? [];
    while (times.length && Date.now() - times[0] >= 61_000) times.shift();
    if (times.length >= 9) {
      const wait = 61_000 - (Date.now() - times[0]);
      console.error(`INFO waiting ${wait}ms for ${path} throttle window`);
      await sleep(wait);
      while (times.length && Date.now() - times[0] >= 61_000) times.shift();
    }
    times.push(Date.now());
    authTimes.set(path, times);
  }
  const multipart = body instanceof FormData;
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetch(`${base}${path}`, {
    method, headers, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = raw; }
  return { method, path, requestBody: multipart ? { file: 'tier.txt', bytes: 4 } : redact(body ?? null), status: response.status, body: data };
}

const ok = (r) => r.status >= 200 && r.status < 300;
const locked = (r, code) => r.status === 403 && r.body?.code === code;

function check(plan, scenario, name, response, passed, expected) {
  const result = { plan, scenario, name, passed: Boolean(passed), expected, ...response };
  results.push(result);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${plan} ${scenario}/${name} — status=${response.status} code=${response.body?.code ?? '-'} expected=${expected}${passed ? '' : ` request=${response.method} ${response.path} ${JSON.stringify(response.requestBody)} response=${JSON.stringify(redact(response.body))}`}`);
  return result.passed;
}

async function call(firm, scenario, name, method, path, body, predicate = ok, expected = '2xx', token = firm.token) {
  const r = await request(method, path, token, body);
  check(firm.plan, scenario, name, r, predicate(r), expected);
  return r;
}

async function section(firm, scenario, action) {
  try { await action(); } catch (error) {
    check(firm.plan, scenario, 'prerequisite-or-runtime', { method: 'SCRIPT/SQL', path: scenario, status: 0, requestBody: null, body: { error: error.message } }, false, 'scenario completes');
  }
}

async function register(plan) {
  const email = `tier-${plan.toLowerCase()}-${run}@example.test`;
  const r = await request('POST', '/auth/register', null, { firmName: `Tier ${plan} ${run}`, firstName: 'Tier', lastName: 'Owner', email, password });
  check(plan, 'registration', 'owner', r, ok(r) && r.body?.accessToken && r.body?.user?.firmId, '2xx + token + firmId');
  if (!ok(r) || !r.body?.user?.firmId) throw new Error(`Cannot register ${plan}`);
  const firm = { plan, email, id: r.body.user.firmId, ownerId: r.body.user.id, token: r.body.accessToken, cases: [] };
  owned.add(firm.id);
  firms.push(firm);
  sql(`UPDATE "Firm" SET "subscriptionPlan"='${plan}', "subscriptionStatus"='ACTIVE', "maxUsers"=${plans[plan]}, "createdAt"='2026-12-01' WHERE id=${firmId(firm)};`);
  await call(firm, 'registration', 'plan-reloaded', 'GET', '/auth/me', undefined,
    (me) => me.status === 200 && me.body.subscriptionPlan === plan && me.body.planGrandfathered === false && me.body.firmId === firm.id,
    `200 ${plan}, grandfathered=false`);
  // Real login, the way a user signs in after registering: wrong password refused, right one works.
  await call(firm, 'login', 'owner-wrong-password', 'POST', '/auth/login', { email, password: `${password}x` },
    (r) => r.status === 401, '401 wrong password', null);
  const login = await call(firm, 'login', 'owner-login', 'POST', '/auth/login', { email, password },
    (r) => ok(r) && r.body.accessToken && r.body.user?.firmId === firm.id, '2xx token for own firm', null);
  if (login.body?.accessToken) firm.token = login.body.accessToken;
  await call(firm, 'login', 'owner-me-after-login', 'GET', '/auth/me', undefined,
    (me) => me.status === 200 && me.body.subscriptionPlan === plan && me.body.email === email, `200 me = ${plan} owner`);
  console.error(`INFO firm ${plan} ${firm.id} ${email}`);
  return firm;
}

async function seats(firm) {
  for (let member = 2; member <= plans[firm.plan] + 1; member++) {
    const extra = member > plans[firm.plan];
    const email = `tier-${firm.plan.toLowerCase()}-${member}-${run}@example.test`;
    const invited = await call(firm, 'seats', `invite-${member}`, 'POST', '/saas/invitations', { email, role: 'LAWYER' },
      (r) => extra ? [400, 403].includes(r.status) && /ที่นั่ง|จำนวนผู้ใช้|seat/i.test(JSON.stringify(r.body)) : ok(r),
      extra ? 'seat-limit refusal (400/403)' : '2xx invitation');
    if (!ok(invited)) {
      if (!extra) throw new Error(`Invitation ${member} failed before capacity`);
      continue;
    }
    // If an over-limit invitation is wrongly admitted, do not accept an extra member.
    if (extra) continue;
    const inviteToken = invited.body.inviteUrl?.split('/').pop() ?? sql(`SELECT token FROM "Invitation" WHERE "firmId"=${firmId(firm)} AND email='${email}';`);
    assert.match(inviteToken, /^[a-f0-9]+$/i);
    await call(firm, 'seats', `view-${member}`, 'GET', `/saas/invitations/${inviteToken}`, undefined,
      (r) => r.status === 200 && r.body.email === email, '200 matching invitation', null);
    const accepted = await call(firm, 'seats', `accept-${member}`, 'POST', '/saas/invitations/accept', { token: inviteToken, firstName: 'Tier', lastName: `Lawyer${member}`, password },
      (r) => ok(r) && r.body.user?.firmId === firm.id && r.body.accessToken, '2xx matching firm + token', null);
    if (!ok(accepted)) throw new Error(`Accept member ${member} failed`);
    if (member === 2) firm.lawyer = { id: accepted.body.user.id, email };
  }
  await call(firm, 'seats', 'member-count', 'GET', '/saas/members', undefined,
    (r) => r.status === 200 && Array.isArray(r.body) && r.body.length === plans[firm.plan], `200 exactly ${plans[firm.plan]} members`);
}

async function newCase(firm, scenario, name) {
  const r = await call(firm, scenario, name, 'POST', '/cases', { title: `Tier ${firm.plan} ${name}`, courtLevel: 'TRIAL', leadLawyerId: firm.ownerId },
    (r) => ok(r) && r.body.id, '2xx + caseId');
  assert(ok(r) && r.body.id, 'Case creation is required');
  firm.cases.push(r.body.id);
  return r.body.id;
}

async function assignment(firm) {
  assert(firm.lawyer, 'A lawyer must have joined');
  const login = await call(firm, 'assignment', 'lawyer-login', 'POST', '/auth/login', { email: firm.lawyer.email, password },
    (r) => ok(r) && r.body.user?.firmId === firm.id && r.body.accessToken, '2xx matching firm + token', null);
  assert(login.body.accessToken, 'Lawyer login required');
  firm.lawyer.token = login.body.accessToken;
  const caseId = await newCase(firm, 'assignment', 'create-case');
  for (const action of ['accept', 'reject']) {
    const created = await call(firm, 'assignment', `create-${action}`, 'POST', `/cases/${caseId}/tasks`, {
      title: `Tier ${action}`, assigneeId: firm.lawyer.id, requiresReview: true, reviewerId: firm.ownerId,
    }, (r) => ok(r) && r.body.assigneeId === firm.lawyer.id && r.body.status === 'TODO', '2xx assigned lawyer, TODO');
    assert(created.body.id, 'Task required');
    const taskId = created.body.id;
    // accept/reject are the reviewer's actions: the assignee may not review their own work.
    await call(firm, 'assignment', `lawyer-cannot-self-${action}`, 'POST', `/cases/${caseId}/tasks/${taskId}/${action}`,
      action === 'reject' ? { reason: 'Cannot accept this assignment' } : {},
      (r) => r.status === 403, '403 assignee cannot review own task', firm.lawyer.token);
    await call(firm, 'assignment', `acknowledge-${action}`, 'POST', `/tasks/${taskId}/acknowledge`, {},
      (r) => ok(r) && Boolean(r.body.acknowledgedAt), '2xx acknowledgedAt set', firm.lawyer.token);
    await call(firm, 'assignment', `start-${action}`, 'PATCH', `/cases/${caseId}/tasks/${taskId}`, { status: 'IN_PROGRESS' },
      (r) => ok(r) && r.body.status === 'IN_PROGRESS', '2xx IN_PROGRESS', firm.lawyer.token);
    await call(firm, 'assignment', `handoff-${action}`, 'PATCH', `/cases/${caseId}/tasks/${taskId}/handoff`, { note: 'Scenario test work completed, ready for owner review.' },
      (r) => ok(r) && r.body.status === 'PENDING_REVIEW', '2xx PENDING_REVIEW', firm.lawyer.token);
    await call(firm, 'assignment', `owner-review-${action}`, 'POST', `/cases/${caseId}/tasks/${taskId}/${action}`,
      action === 'reject' ? { reason: 'Please revise the scenario work' } : {},
      (r) => ok(r) && r.body.status === (action === 'accept' ? 'DONE' : 'NEEDS_REVISION'),
      `2xx ${action === 'accept' ? 'DONE' : 'NEEDS_REVISION'}`);
    await call(firm, 'assignment', `persisted-${action}`, 'GET', `/tasks/${taskId}`, undefined,
      (r) => r.status === 200 && r.body.status === (action === 'accept' ? 'DONE' : 'NEEDS_REVISION'), '200 persisted final status', firm.lawyer.token);
  }
}

async function expenses(firm) {
  const actor = firm.plan === 'FREE' ? { id: firm.ownerId, token: firm.token } : firm.lawyer;
  assert(actor?.token, 'Authenticated expense author required');
  if (firm.plan !== 'FREE') {
    const advance = await call(firm, 'expenses', 'issue-advance', 'POST', '/cash-advances', { userId: actor.id, amount: 100 },
      (r) => ok(r) && r.body.userId === actor.id && r.body.remaining === 100, '2xx lawyer advance 100');
    assert(advance.body.id, 'Advance required');
    await call(firm, 'expenses', 'mine', 'GET', '/cash-advances/mine', undefined,
      (r) => r.status === 200 && r.body.some((a) => a.id === advance.body.id && a.remaining === 100), '200 advance visible to lawyer', actor.token);
    const expense = await call(firm, 'expenses', 'advance-expense', 'POST', '/expenses', { amount: 100, description: 'Tier advance-funded expense', paidFromAdvanceId: advance.body.id },
      (r) => ok(r) && r.body.status === 'PAID' && r.body.paidFromAdvanceId === advance.body.id, '2xx PAID from advance', actor.token);
    assert(expense.body.id, 'Advance expense required');
    // Paid from the advance already: claiming it again would reimburse the same money twice.
    await call(firm, 'expenses', 'advance-expense-not-reclaimable', 'POST', '/expenses/submit', { expenseIds: [expense.body.id] },
      (r) => r.status === 400, '400 advance-paid expense cannot be claimed again', actor.token);
    await call(firm, 'expenses', 'settle', 'POST', `/cash-advances/${advance.body.id}/settle`, { note: 'Fully consumed in scenario' },
      (r) => ok(r) && r.body.remaining === 0 && Boolean(r.body.settledAt), '2xx remaining=0 + settledAt');
    await call(firm, 'expenses', 'settled-persisted', 'GET', '/cash-advances', undefined,
      (r) => r.status === 200 && r.body.some((a) => a.id === advance.body.id && a.remaining === 0 && a.settledAt), '200 settled advance persisted');
  }
  // A separate personal cost exercises submit/approve without reimbursing already advanced money twice.
  const draft = await call(firm, 'expenses', 'personal-draft', 'POST', '/expenses', { amount: 25, description: 'Tier personal reimbursement expense', status: 'DRAFT' },
    (r) => ok(r) && r.body.status === 'DRAFT', '2xx DRAFT', actor.token);
  assert(draft.body.id, 'Draft required');
  const claim = await call(firm, 'expenses', 'personal-submit', 'POST', '/expenses/submit', { expenseIds: [draft.body.id] },
    (r) => ok(r) && r.body.status === 'PENDING' && r.body.expenses?.some((e) => e.id === draft.body.id), '2xx PENDING containing expense', actor.token);
  assert(claim.body.id, 'Claim required');
  if (firm.plan !== 'FREE') {
    await call(firm, 'expenses', 'personal-approve', 'PATCH', `/expense-claims/${claim.body.id}/status`, { status: 'APPROVED' },
      (r) => ok(r) && r.body.status === 'APPROVED' && r.body.expenses?.every((e) => e.status === 'APPROVED'), '2xx claim + expenses APPROVED');
  }
}

async function features(firm) {
  const reporting = ['FIRM', 'PROFESSIONAL'].includes(firm.plan);
  await call(firm, 'features', 'reports', 'GET', '/reports/firm-metrics?period=this_month', undefined,
    (r) => reporting ? r.status === 200 : locked(r, 'PLAN_FEATURE_LOCKED'), reporting ? '200' : '403 PLAN_FEATURE_LOCKED');
  await call(firm, 'features', 'audit', 'GET', '/admin/audit-logs', undefined,
    (r) => firm.plan === 'PROFESSIONAL' ? r.status === 200 : locked(r, 'PLAN_FEATURE_LOCKED'), firm.plan === 'PROFESSIONAL' ? '200' : '403 PLAN_FEATURE_LOCKED');
  const invoice = await call(firm, 'features', 'invoice-write', 'POST', '/invoices', { lineItems: [{ description: 'Tier service', quantity: 1, unitPrice: 100 }] },
    (r) => reporting ? ok(r) && (r.body.id || r.body.invoices?.length || Array.isArray(r.body) && r.body.length) : locked(r, 'PLAN_FEATURE_LOCKED'), reporting ? '2xx invoice created' : '403 PLAN_FEATURE_LOCKED');
  const read = await call(firm, 'features', 'invoice-read', 'GET', '/invoices', undefined,
    (r) => r.status === 200 && Array.isArray(r.body), '200 invoice array on every plan');
  if (reporting && ok(invoice)) {
    const id = invoice.body.id ?? invoice.body.invoices?.[0]?.id ?? invoice.body[0]?.id;
    check(firm.plan, 'features', 'invoice-persisted', read, Boolean(id) && read.body.some((i) => i.id === id), 'created invoice appears in GET /invoices');
  }
}

async function caseLimit(firm) {
  while (firm.cases.length < 15) await newCase(firm, 'case-limit', `case-${firm.cases.length + 1}`);
  const id = firm.cases.at(-1);
  await call(firm, 'case-limit', 'close', 'POST', `/cases/${id}/close`, { closingSummary: 'Scenario test completed and case closed.', outcome: 'SETTLED', acknowledgeOutstanding: true },
    (r) => ok(r) && r.body.status === 'CLOSED', '2xx CLOSED');
  const counts = sql(`SELECT count(*) || ',' || count(*) FILTER (WHERE status='CLOSED') FROM "Case" WHERE "firmId"=${firmId(firm)};`);
  check(firm.plan, 'case-limit', 'all-including-closed', { method: 'SQL SELECT', path: 'Case count', status: 200, body: { counts }, requestBody: null }, counts === '15,1', '15 total, 1 closed');
  await call(firm, 'case-limit', 'sixteenth', 'POST', '/cases', { title: 'Tier forbidden sixteenth', courtLevel: 'TRIAL', leadLawyerId: firm.ownerId },
    (r) => locked(r, 'PLAN_LIMIT_CASES'), '403 PLAN_LIMIT_CASES');
  await call(firm, 'case-limit', 'reopen', 'POST', `/cases/${id}/reopen`, {},
    (r) => ok(r) && r.body.status !== 'CLOSED', '2xx reopened despite 15 cases');
  const reopened = await call(firm, 'case-limit', 'reopen-persisted', 'GET', `/cases/${id}`, undefined,
    (r) => r.status === 200 && r.body.status !== 'CLOSED', '200 reopened status persisted');
  assert(ok(reopened), 'Reopened case must be readable');
}

async function quotaTask(firm) {
  if (firm.quotaTaskId) return firm.quotaTaskId;
  const r = await call(firm, 'quota-setup', 'empty-task', 'POST', '/todos', { title: 'Quota-only task with no comments' },
    (r) => ok(r) && r.body.id, '2xx taskId');
  assert.match(r.body.id, /^[a-f0-9-]{36}$/i);
  firm.quotaTaskId = r.body.id;
  return r.body.id;
}

async function aiQuota(firm) {
  const taskId = await quotaTask(firm);
  // No comments means analyze() aborts before reading a key or contacting the AI provider.
  assert.equal(sql(`SELECT count(*) FROM "TaskComment" WHERE "taskId"='${taskId}';`), '0');
  const amount = firm.plan === 'FREE' ? 20 : 200;
  sql(`INSERT INTO "AiQuotaUse"(id,"firmId",action,"createdAt") SELECT gen_random_uuid(),${firmId(firm)},'seed',now() FROM generate_series(1,${amount});`);
  const rows = sql(`SELECT count(*) FROM "AiQuotaUse" WHERE "firmId"=${firmId(firm)};`);
  assert.equal(Number(rows), amount);
  await call(firm, 'ai-quota', 'exhausted', 'POST', `/tasks/${taskId}/ai-analysis`, {},
    (r) => locked(r, 'PLAN_LIMIT_AI'), '403 PLAN_LIMIT_AI');
  sql(`UPDATE "AiQuotaUse" SET "createdAt"=now()-interval '40 days' WHERE "firmId"=${firmId(firm)} AND action='seed';`);
  await call(firm, 'ai-quota', firm.plan === 'FREE' ? 'lifetime-persists' : 'monthly-resets', 'POST', `/tasks/${taskId}/ai-analysis`, {},
    (r) => firm.plan === 'FREE' ? locked(r, 'PLAN_LIMIT_AI') : r.body?.code !== 'PLAN_LIMIT_AI' && ![401, 404, 429].includes(r.status),
    firm.plan === 'FREE' ? '403 PLAN_LIMIT_AI after moving rows to last month' : 'not PLAN_LIMIT_AI after moving rows to last month');
}

async function storage(firm) {
  const taskId = await quotaTask(firm);
  sql(`INSERT INTO "StoredObject"(key,"firmId",bytes) VALUES ('tier-seed-${run}',${firmId(firm)},1073741824);`);
  const form = new FormData();
  form.append('file', new Blob(['tier'], { type: 'text/plain' }), 'tier.txt');
  await call(firm, 'storage', 'one-gb-upload', 'POST', `/tasks/${taskId}/attachments`, form,
    (r) => locked(r, 'PLAN_LIMIT_STORAGE'), '403 PLAN_LIMIT_STORAGE');
}

async function grandfathered(firm) {
  sql(`UPDATE "Firm" SET "createdAt"='2026-01-01' WHERE id=${firmId(firm)};`);
  try {
    await call(firm, 'grandfathered', 'reports', 'GET', '/reports/firm-metrics?period=this_month', undefined, (r) => r.status === 200, '200 grandfathered TEAM reports');
    await call(firm, 'grandfathered', 'audit', 'GET', '/admin/audit-logs', undefined, (r) => r.status === 200, '200 grandfathered TEAM audit');
  } finally {
    sql(`UPDATE "Firm" SET "createdAt"='2026-12-01' WHERE id=${firmId(firm)};`);
  }
}

function report() {
  const failed = results.filter((r) => !r.passed);
  const lines = [
    `Pricing tier API report — run ${run}`, `API: ${base}; existing build, no restart/rebuild/migration/app edits.`,
    '| Scenario | FREE | TEAM | FIRM | PROFESSIONAL |', '|---|---|---|---|---|',
  ];
  for (const scenario of [...new Set(results.map((r) => r.scenario))]) {
    const cells = Object.keys(plans).map((plan) => {
      const subset = results.filter((r) => r.plan === plan && r.scenario === scenario);
      return subset.length ? `${subset.every((r) => r.passed) ? 'PASS' : 'FAIL'} (${subset.filter((r) => r.passed).length}/${subset.length})` : 'N/A';
    });
    lines.push(`| ${scenario} | ${cells.join(' | ')} |`);
  }
  lines.push(`Total: ${results.length - failed.length} PASS, ${failed.length} FAIL, ${results.length} checks.`);
  for (const r of failed) {
    lines.push(`FAIL ${r.plan} ${r.scenario}/${r.name}: expected ${r.expected}`);
    lines.push(`Request: ${r.method} ${r.path} ${JSON.stringify(r.requestBody)}`);
    lines.push(`Response: HTTP ${r.status} ${JSON.stringify(redact(r.body))}`);
  }
  lines.push('Semantics: task accept/reject are reviewer actions (assignee gets 403); the assignee acknowledges, works, hands off; the owner reviews.');
  lines.push('Semantics: advance-funded expenses are PAID at once and cannot be claimed again (400); personal draft claims test submit/owner approval.');
  lines.push('Seat refusals accept the API seat-specific 400/403; feature/case/AI/storage refusals require the exact requested 403/code.');
  lines.push('AI is never called externally: quota probes use a fresh task with zero comments; analysis exits before the provider call.');
  lines.push(`Created fixtures retained (no deletes): ${firms.map((f) => `${f.plan}=${f.id}`).join(', ')}.`);
  lines.push('Only script file written. No commit, frontend/browser checks, payment flow, or concurrency stress test.');
  lines.push(`Rerun: ${rerun}`);
  assert(lines.length < 150, 'Report must stay under 150 lines');
  console.log(`\n${lines.join('\n')}\nSUMMARY ${results.length - failed.length} PASS ${failed.length} FAIL ${results.length} TOTAL`);
  process.exitCode = failed.length ? 1 : 0;
}

assert.equal(locked({ status: 403, body: { code: 'PLAN_LIMIT_AI' } }, 'PLAN_LIMIT_AI'), true);
assert.equal(locked({ status: 400, body: { code: 'PLAN_LIMIT_AI' } }, 'PLAN_LIMIT_AI'), false);
assert.equal(locked({ status: 403, body: { code: 'OTHER' } }, 'PLAN_LIMIT_AI'), false);
console.error(`INFO run=${run} node=${process.version} started=${new Date().toISOString()}`);
try {
  for (const plan of Object.keys(plans)) {
    let firm;
    try { firm = await register(plan); } catch (error) {
      check(plan, 'registration', 'prerequisite-or-runtime', { method: 'SCRIPT/SQL', path: 'registration', status: 0, requestBody: null, body: { error: error.message } }, false, 'registered firm configured');
      continue;
    }
    await section(firm, 'seats', () => seats(firm));
    if (plan !== 'FREE') await section(firm, 'assignment', () => assignment(firm));
    await section(firm, 'expenses', () => expenses(firm));
    await section(firm, 'features', () => features(firm));
    if (plan === 'FREE') await section(firm, 'case-limit', () => caseLimit(firm));
    if (['FREE', 'TEAM'].includes(plan)) await section(firm, 'ai-quota', () => aiQuota(firm));
    if (plan === 'FREE') await section(firm, 'storage', () => storage(firm));
    if (plan === 'TEAM') await section(firm, 'grandfathered', () => grandfathered(firm));
  }
} finally {
  report();
}
