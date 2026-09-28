// Run against an isolated API and scratch database. Never points at a real office database.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { PrismaClient } = req('./src/generated/prisma');
const { JwtService } = req('@nestjs/jwt');
const prisma = new PrismaClient();
const base = process.env.DAILY_TEST_API || 'http://localhost:3011';
const db = new URL(process.env.DATABASE_URL);
assert.match(db.pathname, /^\/lawfirm_owner_daily_/);
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const jwt = new JwtService({ secret: process.env.JWT_SECRET || 'owner-daily-test-secret' });

async function main() {
  const suffix = Date.now();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const firm = await prisma.firm.create({ data: { slug: `daily-${suffix}`, name: 'สำนักงานทดสอบงานรายวัน', trialEndAt: new Date(Date.now() + 86400000 * 10), maxUsers: 20 } });
  const foreign = await prisma.firm.create({ data: { slug: `other-${suffix}`, name: 'สำนักงานอื่น', trialEndAt: new Date(Date.now() + 86400000 * 10) } });
  const make = async (firstName, role, target = firm) => {
    const user = await prisma.user.create({ data: { firstName, lastName: 'ทดสอบ', email: `${require('node:crypto').randomUUID()}@example.test`, passwordHash: 'not-a-login', role: role === 'OWNER' ? 'ADMIN' : 'LAWYER' } });
    await prisma.firmMember.create({ data: { firmId: target.id, userId: user.id, role } });
    return { ...user, token: jwt.sign({ sub: user.id, firmId: target.id }, { expiresIn: '2h' }) };
  };
  const owner = await make('อธิป', 'OWNER');
  const senior = await make('วิภา', 'SENIOR_LAWYER');
  const worker = await make('พิม', 'LAWYER');
  const absent = await make('ณัฐ', 'LAWYER');
  const other = await make('ผู้ดูแลอื่น', 'OWNER', foreign);
  // Same person belongs to two offices: explicit task tenancy must still hold.
  await prisma.firmMember.create({ data: { firmId: foreign.id, userId: worker.id, role: 'LAWYER' } });
  const legalCase = await prisma.case.create({ data: { firmId: firm.id, ownRef: 'TEST20260001', folderId: 'test', title: 'คดีเรียกค่าเสียหาย', leadLawyerId: senior.id } });
  await prisma.leaveRequest.create({ data: { firmId: firm.id, userId: absent.id, type: 'VACATION', status: 'APPROVED', startDate: new Date(`${today}T00:00:00Z`), endDate: new Date(`${today}T00:00:00Z`) } });
  await prisma.calendarEvent.create({ data: { caseId: legalCase.id, title: 'นัดหารือพยาน', startAt: new Date(`${today}T09:00:00+07:00`), endAt: new Date(`${today}T10:00:00+07:00`), assigneeId: worker.id } });
  const call = async (actor, url, method = 'GET', body, expected = 200) => {
    const response = await fetch(`${base}${url}`, { method, headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${url}: ${JSON.stringify(data)}`);
    return data;
  };
  await call(owner, `/operations/members/${worker.id}/work-types`, 'PATCH', { workTypes: ['TRANSCRIPTION', 'DOCUMENTS'] });
  const due = '2026-10-10T02:30:00.000Z';
  const task = await call(owner, '/operations/tasks', 'POST', { title: 'ถอดเทปคำให้การพยาน', caseId: legalCase.id, workType: 'TRANSCRIPTION', dueDate: due, scheduledFor: today, requiresReview: true, reviewerId: senior.id }, 201);
  assert.equal(task.assigneeId, null);
  await call(owner, `/operations/tasks/${task.id}/assign`, 'PATCH', { assigneeId: worker.id, placeFirst: false });
  const second = await call(owner, '/operations/tasks', 'POST', { title: 'รวบรวมเอกสารประกอบ', assigneeId: worker.id, workType: 'DOCUMENTS', scheduledFor: today, dueDate: due }, 201);
  const third = await call(owner, '/operations/tasks', 'POST', { title: 'ร่างหนังสือแจ้งคู่กรณี', workType: 'DRAFTING', scheduledFor: today }, 201);
  await call(worker, `/operations/daily?date=${today}`, 'GET', undefined, 403);
  await call(other, `/operations/tasks/${task.id}/order`, 'PATCH', { direction: 'UP' }, 404);
  await call(owner, `/operations/tasks/${second.id}/order`, 'PATCH', { direction: 'UP' });
  let board = await call(owner, `/operations/daily?date=${today}`);
  assert.ok(board.tasks.findIndex((t) => t.id === second.id) < board.tasks.findIndex((t) => t.id === task.id));
  assert.equal(board.tasks.find((t) => t.id === task.id).dueDate, due);
  assert.equal(board.members.find((m) => m.userId === absent.id).onLeave, true);
  assert.equal(board.members.find((m) => m.userId === worker.id).appointments.length, 1);
  await call(owner, `/tasks/${task.id}/acknowledge`, 'POST', {}, 403);
  await call(worker, `/tasks/${task.id}/acknowledge`, 'POST', {}, 201);
  await call(worker, `/tasks/${task.id}/confirm-plan`, 'POST', { date: today }, 201);
  await call(worker, `/tasks/${task.id}/daily-update`, 'POST', { completed: 'ถอดแล้ว 12 หน้า', remaining: 'ตรวจชื่อพยาน', blocker: 'รอไฟล์เสียงช่วงท้าย' }, 201);
  await call(worker, `/cases/${legalCase.id}/tasks/${task.id}`, 'PATCH', { status: 'DONE' }, 400);
  await call(worker, `/cases/${legalCase.id}/tasks`, 'POST', { title: 'มอบหมายข้ามสิทธิ์', assigneeId: absent.id }, 403);
  await call(worker, `/cases/${legalCase.id}/tasks/${task.id}/handoff`, 'PATCH', { note: 'ส่งผลงานให้ตรวจ' });
  board = await call(owner, `/operations/daily?date=${today}`);
  assert.equal(board.tasks.find((t) => t.id === task.id).status, 'PENDING_REVIEW');
  assert.equal(board.tasks.find((t) => t.id === task.id).workerId, worker.id);
  await call(senior, `/cases/${legalCase.id}/tasks/${task.id}/reject`, 'POST', { reason: 'ตรวจชื่อให้ตรงกับเอกสาร' }, 201);
  await call(worker, `/cases/${legalCase.id}/tasks/${task.id}/handoff`, 'PATCH', {});
  await call(senior, `/cases/${legalCase.id}/tasks/${task.id}/accept`, 'POST', {}, 201);
  board = await call(owner, `/operations/daily?date=${today}`);
  assert.equal(board.tasks.find((t) => t.id === task.id).status, 'DONE');
  const foreignBoard = await call(other, `/operations/daily?date=${today}`);
  assert.equal(foreignBoard.tasks.length, 0);
  const crossWorker = { ...worker, token: jwt.sign({ sub: worker.id, firmId: foreign.id }) };
  await call(crossWorker, `/tasks/${second.id}`, 'GET', undefined, 404);
  await call(owner, '/operations/tasks', 'POST', { title: 'วันที่ไม่ถูกต้อง', scheduledFor: '2026-02-30' }, 400);
  await call(owner, '/operations/tasks', 'POST', { title: 'ผู้ตรวจข้ามสำนักงาน', requiresReview: false, reviewerId: other.id }, 400);
  assert.equal((await prisma.task.findUnique({ where: { id: task.id } })).dueDate.toISOString(), due);
  // Reopen a separate active reviewable task for interactive UI checks.
  const liveTask = await call(owner, '/operations/tasks', 'POST', { title: 'ตรวจถอดเทปช่วงท้าย', assigneeId: worker.id, workType: 'TRANSCRIPTION', scheduledFor: today, dueDate: due, requiresReview: true, reviewerId: senior.id }, 201);
  if (process.env.DAILY_TEST_FIXTURE) require('node:fs').writeFileSync(process.env.DAILY_TEST_FIXTURE, JSON.stringify({ owner, worker, senior, firmId: firm.id, today, second, third, liveTask }));
  console.log('PASS: live API assignment, acknowledgment, daily plan, progress, reorder, review/revision, leave/calendar, cross-firm isolation, date validation, persisted deadlines');
}
main().finally(() => prisma.$disconnect()).catch((err) => { console.error(err.message); process.exitCode = 1; });
