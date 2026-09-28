// Only creates synthetic data in the dedicated local E2E database.
const { PrismaClient } = require('../../api/src/generated/prisma');
const bcrypt = require('bcrypt');
const url = new URL(process.env.DATABASE_URL ?? '');
if (url.hostname !== '127.0.0.1' || url.pathname !== '/samnuan_mobile_e2e') throw new Error('Requires dedicated local mobile E2E database');
const db = new PrismaClient();
async function main() {
  const password = 'Mobile-E2E-only-2026';
  const passwordHash = await bcrypt.hash(password, 10);
  const firm = await db.firm.upsert({
    where: { slug: 'mobile-e2e' }, update: {},
    create: { name: 'สำนักงานทดสอบมือถือ', slug: 'mobile-e2e', maxUsers: 10, trialEndAt: new Date(Date.now() + 30 * 86400000) },
  });
  const users = {};
  for (const [key, firstName, firmRole] of [
    ['owner', 'เจ้าของ', 'OWNER'], ['lawyer', 'ทนาย', 'LAWYER'], ['assistant', 'ผู้ช่วย', 'ASSISTANT'], ['senior', 'ทนายอาวุโส', 'SENIOR_LAWYER'],
  ]) {
    const email = `mobile-${key}@example.test`;
    const user = await db.user.upsert({ where: { email }, update: { passwordHash },
      create: { email, passwordHash, firstName, lastName: 'ทดสอบ', role: key === 'owner' ? 'ADMIN' : 'LAWYER', dailyDigestEnabled: false } });
    await db.firmMember.upsert({ where: { firmId_userId: { firmId: firm.id, userId: user.id } }, update: { role: firmRole },
      create: { firmId: firm.id, userId: user.id, role: firmRole } });
    users[key] = user;
  }
  const legalCase = await db.case.create({ data: { firmId: firm.id, ownRef: 'E2E-MOBILE-001', title: 'คดีทดสอบใช้งานที่ศาล',
    folderId: 'mobile-e2e-folder', leadLawyerId: users.lawyer.id, courtName: 'ศาลแพ่ง (ทดสอบ)',
    assignments: { create: [{ userId: users.assistant.id, assignmentType: 'BUDDY' }] } } });
  const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const date = (time) => new Date(`${day}T${time}:00+07:00`);
  const event = await db.calendarEvent.create({ data: { caseId: legalCase.id, title: 'นัดสืบพยาน · ทดสอบมือถือ',
    courtName: 'ศาลแพ่ง (ทดสอบ)', type: 'COURT_DATE', startAt: date('09:00'), endAt: date('10:00'),
    assigneeId: users.lawyer.id, reminderMinutes: [], assignees: { create: [{ userId: users.lawyer.id }, { userId: users.assistant.id }] } } });
  await db.calendarEvent.create({ data: { caseId: legalCase.id, title: 'พบลูกความ · ทดสอบมือถือ', type: 'CLIENT_MEETING',
    startAt: date('14:00'), assigneeId: users.lawyer.id, reminderMinutes: [], assignees: { create: [{ userId: users.lawyer.id }] } } });
  await db.task.createMany({ data: [
    { caseId: legalCase.id, title: 'ตรวจพยานหลักฐาน (ทดสอบ)', createdById: users.owner.id, assigneeId: users.lawyer.id, dueDate: date('17:00') },
    { caseId: legalCase.id, title: 'เตรียมแฟ้ม (ทดสอบ)', createdById: users.owner.id, assigneeId: users.assistant.id, dueDate: new Date(Date.now() - 86400000) },
  ] });
  await db.leaveRequest.create({ data: { firmId: firm.id, userId: users.assistant.id, type: 'SICK', status: 'APPROVED',
    startDate: new Date(day), endDate: new Date(day) } });
  await db.pettyCashFund.upsert({ where: { firmId: firm.id }, create: { firmId: firm.id, balance: 50000 }, update: {} });
  const drafts = [];
  for (const [category, amount] of [['ค่าเดินทาง', 350], ['ค่าคัดสำเนา', 120]]) {
    drafts.push(await db.expense.create({ data: { caseId: legalCase.id, userId: users.lawyer.id, category, description: `${category} (ทดสอบ)`, amount, status: 'DRAFT', date: date('10:00') } }));
  }
  const claim = await db.expenseClaim.create({ data: { firmId: firm.id, submittedById: users.lawyer.id, status: 'PENDING',
    expenses: { create: [
      { caseId: legalCase.id, userId: users.lawyer.id, category: 'ค่าเดินทาง', description: 'ค่าแท็กซี่ (ทดสอบ)', amount: 400, status: 'PENDING' },
      { caseId: legalCase.id, userId: users.lawyer.id, category: 'ค่าคัดสำเนา', description: 'สำเนาเอกสาร (ทดสอบ)', amount: 190, status: 'PENDING' },
    ] } } });
  console.log(JSON.stringify({ password, users: Object.fromEntries(Object.entries(users).map(([key, value]) => [key, { id: value.id, email: value.email }])),
    firmId: firm.id, caseId: legalCase.id, eventId: event.id, claimId: claim.id, draftIds: drafts.map((item) => item.id), day }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
