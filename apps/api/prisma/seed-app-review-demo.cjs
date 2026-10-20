// Additive seed: one ACTIVE demo firm for App Store review (owner + lawyer + Thai sample data).
// Never deletes anything; refuses to run if the demo firm already exists.
// Plain JS so it can be piped into the running prod container without a deploy:
//   DEMO_PASSWORD='...' docker compose -f docker-compose.prod.yml exec -T -e DEMO_PASSWORD api node - < seed-app-review-demo.cjs
// Local: cd apps/api && DEMO_PASSWORD='...' node prisma/seed-app-review-demo.cjs
const path = require('path');
const bcrypt = require('bcrypt');
const { DEFAULT_CASE_TYPES } = require('@lawfirm/shared');
const { PrismaClient } = require(path.resolve(process.cwd(), 'src/generated/prisma'));

const SLUG = 'samnuan-demo';
const OWNER_EMAIL = 'appreview-owner@samnuan.com';
const LAWYER_EMAIL = 'appreview-lawyer@samnuan.com';
const DAY = 86400000;

const prisma = new PrismaClient();

// Bangkok is fixed UTC+7.
function bkk(daysFromNow, hhmm) {
  const day = new Date(Date.now() + daysFromNow * DAY + 7 * 3600000).toISOString().slice(0, 10);
  return new Date(`${day}T${hhmm}:00+07:00`);
}

async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) throw new Error('Set DEMO_PASSWORD (min 8 chars)');

  if (await prisma.firm.findUnique({ where: { slug: SLUG } })) throw new Error(`Firm ${SLUG} already exists — nothing done`);
  const taken = await prisma.user.findMany({ where: { email: { in: [OWNER_EMAIL, LAWYER_EMAIL] } }, select: { email: true } });
  if (taken.length) throw new Error(`Users already exist: ${taken.map((u) => u.email).join(', ')} — nothing done`);

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    const firm = await tx.firm.create({
      data: {
        name: 'สำนักงานกฎหมาย สำนวน (ตัวอย่าง)',
        slug: SLUG,
        subscriptionStatus: 'ACTIVE', // no Stripe subscription, currentPeriodEnd null → never lapses
        subscriptionPlan: 'TEAM',
        trialStartAt: new Date(),
        trialEndAt: new Date(),
        maxUsers: 5,
        ownRefPrefix: 'SND',
      },
    });
    await tx.pettyCashFund.create({ data: { firmId: firm.id } });
    await tx.caseType.createMany({
      data: DEFAULT_CASE_TYPES.map((t) => ({ firmId: firm.id, name: t.name, description: t.description, fieldSchema: t.fieldSchema ?? undefined })),
    });

    const owner = await tx.user.create({
      data: { email: OWNER_EMAIL, passwordHash, firstName: 'สมชาย', lastName: 'ใจดี', role: 'ADMIN' },
    });
    const lawyer = await tx.user.create({
      data: { email: LAWYER_EMAIL, passwordHash, firstName: 'พิมพ์ชนก', lastName: 'วิริยะ', role: 'LAWYER' },
    });
    await tx.firmMember.createMany({
      data: [
        { firmId: firm.id, userId: owner.id, role: 'OWNER' },
        { firmId: firm.id, userId: lawyer.id, role: 'LAWYER' },
      ],
    });

    const clientA = await tx.client.create({
      data: { firmId: firm.id, name: 'บริษัท ไทยรุ่งเรือง จำกัด', type: 'COMPANY',
        contacts: { create: [{ name: 'คุณวิชัย ผู้จัดการ', phone: '02-000-0001', isPrimary: true }] } },
    });
    const clientB = await tx.client.create({
      data: { firmId: firm.id, name: 'นางสาวมาลี ศรีสุข', type: 'INDIVIDUAL',
        contacts: { create: [{ name: 'นางสาวมาลี ศรีสุข', phone: '081-000-0002', isPrimary: true }] } },
    });

    const caseDefs = [
      { title: 'ผิดสัญญาซื้อขาย ไทยรุ่งเรือง v. บจ.เอบีซี', clientId: clientA.id, status: 'IN_PROGRESS', leadLawyerId: lawyer.id,
        courtName: 'ศาลแพ่งกรุงเทพใต้', blackCaseNumber: 'พ.1234/2569', description: 'เรียกค่าเสียหายจากการผิดสัญญาซื้อขายสินค้า' },
      { title: 'กู้ยืมเงิน มาลี v. นายสมศักดิ์', clientId: clientB.id, status: 'COURT_DATE', leadLawyerId: lawyer.id,
        courtName: 'ศาลแขวงพระนครเหนือ', blackCaseNumber: 'ผบ.567/2569', description: 'ฟ้องเรียกเงินกู้พร้อมดอกเบี้ย' },
      { title: 'แรงงาน เลิกจ้างไม่เป็นธรรม', clientId: clientA.id, status: 'OPEN', leadLawyerId: owner.id,
        courtName: 'ศาลแรงงานกลาง', description: 'ลูกจ้างฟ้องเรียกค่าชดเชย บริษัทเป็นจำเลย' },
    ];
    const cases = [];
    for (const [i, c] of caseDefs.entries()) {
      const n = String(i + 1).padStart(4, '0');
      cases.push(await tx.case.create({
        data: { ...c, firmId: firm.id, ownRef: `SND2569${n}`, folderId: `SND-2569-${n}`,
          assignments: { create: [{ userId: c.leadLawyerId === owner.id ? lawyer.id : owner.id, assignmentType: 'BUDDY' }] } },
      }));
    }

    const task = (caseIdx, title, status, assigneeId, dueDays) => ({
      firmId: firm.id, caseId: cases[caseIdx].id, title, status, assigneeId, createdById: owner.id, dueDate: bkk(dueDays, '17:00'),
    });
    await tx.task.createMany({
      data: [
        task(0, 'ร่างคำฟ้องและบัญชีพยาน', 'DONE', lawyer.id, -5),
        task(0, 'รวบรวมใบส่งของและใบแจ้งหนี้เป็นพยานเอกสาร', 'IN_PROGRESS', lawyer.id, 2),
        task(1, 'เตรียมคำถามสืบพยานโจทก์', 'TODO', lawyer.id, 1),
        task(1, 'ยื่นบัญชีระบุพยานเพิ่มเติม', 'TODO', lawyer.id, -1),
        task(2, 'ประชุมลูกความ ตรวจสัญญาจ้าง', 'TODO', owner.id, 4),
      ],
    });

    await tx.calendarEvent.createMany({
      data: [
        { caseId: cases[1].id, title: 'นัดสืบพยานโจทก์', type: 'COURT_DATE', startAt: bkk(1, '09:00'), courtName: caseDefs[1].courtName,
          assigneeId: lawyer.id, reminderMinutes: [1440, 60] },
        { caseId: cases[0].id, title: 'นัดชี้สองสถาน', type: 'COURT_DATE', startAt: bkk(6, '09:30'), courtName: caseDefs[0].courtName,
          assigneeId: lawyer.id, reminderMinutes: [1440, 60] },
        { caseId: cases[2].id, title: 'ประชุมลูกความ', type: 'CLIENT_MEETING', startAt: bkk(3, '14:00'), assigneeId: owner.id, reminderMinutes: [60] },
        { caseId: cases[0].id, title: 'ครบกำหนดยื่นคำให้การแก้ฟ้องแย้ง', type: 'DEADLINE', startAt: bkk(10, '16:30'), reminderMinutes: [4320, 1440] },
      ],
    });

    await tx.expense.createMany({
      data: [
        { caseId: cases[0].id, userId: lawyer.id, amount: 2000, description: 'ค่าธรรมเนียมศาล', category: 'ค่าธรรมเนียมศาล', status: 'APPROVED', date: bkk(-6, '10:00') },
        { caseId: cases[1].id, userId: lawyer.id, amount: 420, description: 'ค่าเดินทางไปศาล', category: 'ค่าเดินทาง', status: 'PENDING', date: bkk(-1, '10:00') },
      ],
    });
  });

  console.log(`Created firm ${SLUG}: ${OWNER_EMAIL} (owner), ${LAWYER_EMAIL} (lawyer)`);
}

main()
  .catch((e) => { console.error(e.message || e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
