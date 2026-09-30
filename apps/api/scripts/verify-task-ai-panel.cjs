// Build API/shared and migrate the dedicated DB before running. Uses real AI.
// DATABASE_URL=postgresql://lawfirm:lawfirm@127.0.0.1:5433/samnuan_ai_panel_test \
// TASK_AI_ENV_FILE=/path/to/local/.env node scripts/verify-task-ai-panel.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('../src/generated/prisma');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const target = new URL(databaseUrl);
  assert(['127.0.0.1', 'localhost'].includes(target.hostname) && target.pathname === '/samnuan_ai_panel_test', 'Use only the isolated local test DB');
  const local = process.env.TASK_AI_ENV_FILE ? dotenv.parse(fs.readFileSync(process.env.TASK_AI_ENV_FILE)) : {};
  const apiKey = process.env.OPENAI_API_KEY || local.OPENAI_API_KEY;
  assert(apiKey, 'A real OPENAI_API_KEY is required');
  const prisma = new PrismaClient();
  const port = Number(process.env.TASK_AI_TEST_PORT || 3029);
  const password = 'Synthetic-Test-Only-2026!';
  const slug = 'ai-panel-test';
  const ownerEmail = 'owner-ai-panel@example.invalid';
  const outsiderEmail = 'outsider-ai-panel@example.invalid';
  const server = spawn(process.execPath, ['dist/main.js'], {
    cwd: require('node:path').resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: 'isolated-ai-panel-test-secret', JWT_REFRESH_SECRET: 'isolated-ai-panel-refresh-secret', OPENAI_API_KEY: apiKey, OPENAI_MODEL_MAIN: local.OPENAI_MODEL_MAIN || 'gpt-4o' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-12000); });
  server.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-12000); });
  const call = async (path, token, body, method = body ? 'POST' : 'GET', firmSlug = slug) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'X-Firm-Slug': firmSlug, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    return { status: response.status, data };
  };
  const ok = async (...args) => {
    const response = await call(...args);
    assert(response.status < 300, `${args[0]}: HTTP ${response.status} ${JSON.stringify(response.data)} ${response.status === 500 ? logs.split('\n').filter((line) => /Error|Exception/.test(line)).slice(-3).join('\n') : ''}`);
    return response.data;
  };
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    for (const [email, firmSlug] of [[ownerEmail, slug], [outsiderEmail, 'ai-panel-outsider']]) {
      const user = await prisma.user.upsert({ where: { email }, update: { passwordHash, aiCredits: 20 }, create: { email, passwordHash, firstName: 'ผู้ทดสอบ', lastName: 'นามสมมุติ', role: 'ADMIN', aiCredits: 20 } });
      const firm = await prisma.firm.upsert({ where: { slug: firmSlug }, update: {}, create: { name: 'สำนักงานทดสอบ (ข้อมูลสมมุติ)', slug: firmSlug, trialEndAt: new Date('2030-01-01'), maxUsers: 10 } });
      await prisma.firmMember.upsert({ where: { firmId_userId: { firmId: firm.id, userId: user.id } }, update: {}, create: { firmId: firm.id, userId: user.id, role: 'OWNER' } });
    }
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error(`Test API exited: ${logs.split('\n').filter((line) => /Error|Exception/.test(line)).slice(-5).join('\n')}`);
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
      if (attempt === 59) throw new Error('Test API did not start');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const session = await ok('/auth/login', null, { email: ownerEmail, password });
    const token = session.accessToken;
    const originalDue = '2030-01-02';
    const task = await ok('/todos', token, { title: `ตรวจเอกสารคดีสมมุติ ${randomUUID().slice(0, 6)}`, assigneeId: session.user.id, dueDate: originalDue });
    const path = `/tasks/${task.id}`;
    const creditsBefore = (await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).aiCredits;
    assert.equal((await call(`${path}/ai-analysis`, token, {})).status, 400);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).aiCredits, creditsBefore);
    await ok(`${path}/comments`, token, { body: 'ข้อมูลสมมุติ: เตรียมคำร้องแล้ว แต่ยังไม่ได้รับหนังสือมอบอำนาจ จึงยื่นคำร้องไม่ได้ ต้องติดตามเอกสารจากผู้ส่ง' });
    let insight = await ok(`${path}/ai-analysis`, token, {});
    assert.equal(insight.status, 'blocker');
    assert(insight.quote && insight.analyzedAt);
    assert.equal(await prisma.task.count({ where: { followUpSourceTaskId: task.id } }), 0, 'Analysis must not create work');
    assert.equal((await ok(path, token)).aiAnalysis.analyzedAt, insight.analyzedAt, 'Analysis survives reopening');
    const draft = () => ({ sourceCommentId: insight.sourceCommentId, latestCommentId: insight.latestCommentId, taskUpdatedAt: insight.taskUpdatedAt, quote: insight.quote, title: insight.title, description: insight.description, assigneeId: session.user.id, followUpDate: '2030-01-01' });
    assert.equal((await call(`${path}/ai-follow-up`, token, { ...draft(), quote: 'ข้อความที่ไม่ได้มีอยู่จริง' })).status, 400);
    await ok(`${path}/comments`, token, { body: 'ข้อมูลสมมุติ: ยังรอหนังสือมอบอำนาจเหมือนเดิม ผู้ส่งยังไม่ได้ส่งเอกสาร' });
    assert.equal((await call(`${path}/ai-follow-up`, token, draft())).status, 409);
    assert.equal(await prisma.task.count({ where: { followUpSourceTaskId: task.id } }), 0);
    insight = await ok(`${path}/ai-analysis`, token, {});
    assert.equal(insight.status, 'blocker');
    const [created, repeated] = await Promise.all([ok(`${path}/ai-follow-up`, token, draft()), ok(`${path}/ai-follow-up`, token, draft())]);
    assert.equal(created.id, repeated.id, 'Concurrent confirmation creates only one task');
    assert.equal(await prisma.task.count({ where: { followUpSourceTaskId: task.id } }), 1);
    const followUp = await ok(`/tasks/${created.id}`, token);
    assert.equal(followUp.parentId, task.id);
    assert.equal(followUp.followUpSourceCommentId, insight.sourceCommentId);
    let parent = await ok(path, token);
    assert.equal(parent.dueDate.slice(0, 10), originalDue);
    assert.equal(parent.status, 'TODO');
    assert.equal(parent.followUps[0].id, created.id);
    await ok(`/todos/${created.id}`, token, { status: 'DONE' }, 'PATCH');
    const completed = await ok(`/tasks/${created.id}`, token);
    assert.equal(completed.status, 'DONE');
    assert(completed.history.some((event) => event.metadata.changes.some((change) => change.after === 'DONE')));
    await ok(`/todos/${task.id}`, token, { status: 'IN_PROGRESS', dueDate: '2030-01-03' }, 'PATCH');
    parent = await ok(path, token);
    const history = parent.history.at(-1);
    assert.equal(history.user.id, session.user.id);
    assert.deepEqual(history.metadata.changes.map((change) => change.field).sort(), ['dueDate', 'status']);
    assert.notEqual(parent.updatedAt, parent.aiAnalysis.taskUpdatedAt, 'Changed task marks persisted analysis stale');
    const outsider = await ok('/auth/login', null, { email: outsiderEmail, password }, 'POST', 'ai-panel-outsider');
    assert.equal((await call(path, outsider.accessToken, undefined, 'GET', 'ai-panel-outsider')).status, 404);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).aiCredits, creditsBefore - 2);
    console.log(JSON.stringify({ result: 'PASS', realAiAnalyses: 2, checks: ['no automatic task creation', 'persisted analysis', 'source grounding', 'stale rejection', 'concurrent idempotency', 'parent unchanged', 'follow-up completed', 'history actor/status/due date', 'tenant isolation', 'credit debit'], taskId: task.id, followUpId: created.id, testLogin: ownerEmail, testPassword: password, testFirm: slug }));
  } finally {
    server.kill('SIGTERM');
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
