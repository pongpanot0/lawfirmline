import {
  Prisma,
  PrismaClient,
  Role,
  CaseStatus,
  TaskStatus,
  AssignmentType,
  EventType,
} from '../src/generated/prisma';
import { DEFAULT_CASE_TYPES, DEFAULT_THAI_COURTS } from '@lawfirm/shared';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.reminderLog.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.caseActivity.deleteMany();
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.caseAssignment.deleteMany();
  await prisma.case.deleteMany();
  await prisma.clientContact.deleteMany();
  await prisma.client.deleteMany();
  await prisma.court.deleteMany();
  await prisma.caseType.deleteMany();
  await prisma.firmMember.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.billingInvoice.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.pettyCashFund.deleteMany();
  await prisma.firm.deleteMany();
  await prisma.user.deleteMany();

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 30);

  const firm = await prisma.firm.create({
    data: {
      name: 'The Siam Barrister',
      slug: 'thesiambarristers',
      subscriptionStatus: 'TRIAL',
      trialStartAt: new Date(),
      trialEndAt: trialEnd,
      maxUsers: 20,
      ownRefPrefix: 'TSBREF',
    },
  });

  await prisma.pettyCashFund.create({ data: { firmId: firm.id } });

  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@lawfirm.com',
      passwordHash,
      firstName: 'Somchai',
      lastName: 'Admin',
      role: Role.ADMIN,
      lineUserId: 'U-e2e-test-line-user',
      lineConnectedAt: new Date(),
    },
  });

  const senior = await prisma.user.create({
    data: {
      email: 'senior@lawfirm.com',
      passwordHash,
      firstName: 'Nattapong',
      lastName: 'Srisawat',
      role: Role.LAWYER,
    },
  });

  const lawyer1 = await prisma.user.create({
    data: {
      email: 'lawyer1@lawfirm.com',
      passwordHash,
      firstName: 'Pimchanok',
      lastName: 'Viriya',
      role: Role.LAWYER,
    },
  });

  const lawyer2 = await prisma.user.create({
    data: {
      email: 'lawyer2@lawfirm.com',
      passwordHash,
      firstName: 'Siriporn',
      lastName: 'Kaew',
      role: Role.LAWYER,
    },
  });

  const assistant = await prisma.user.create({
    data: {
      email: 'assistant@lawfirm.com',
      passwordHash,
      firstName: 'Anan',
      lastName: 'Boonma',
      role: Role.LAWYER,
    },
  });

  await prisma.firmMember.createMany({
    data: [
      { firmId: firm.id, userId: admin.id, role: 'OWNER' },
      { firmId: firm.id, userId: senior.id, role: 'SENIOR_LAWYER' },
      { firmId: firm.id, userId: lawyer1.id, role: 'LAWYER' },
      { firmId: firm.id, userId: lawyer2.id, role: 'LAWYER' },
      { firmId: firm.id, userId: assistant.id, role: 'ASSISTANT' },
    ],
  });

  await prisma.caseType.createMany({
    data: DEFAULT_CASE_TYPES.map((type) => ({
      firmId: firm.id,
      name: type.name,
      description: type.description,
      fieldSchema: (type.fieldSchema ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  });

  await prisma.court.createMany({
    data: DEFAULT_THAI_COURTS.map((name) => ({ name })),
    skipDuplicates: true,
  });

  const existingRules = await prisma.deadlineRule.count();
  if (existingRules === 0) {
    await prisma.deadlineRule.createMany({
      data: [
        { trigger: 'COMPLAINT_SERVED', label: 'ยื่นคำให้การ', offsetDays: 15, dayBasis: 'CALENDAR' },
        { trigger: 'JUDGMENT', label: 'ยื่นอุทธรณ์', offsetDays: 30, dayBasis: 'CALENDAR' },
        { trigger: 'ORDER_RECEIVED', label: 'โต้แย้งคำสั่งศาล', offsetDays: 15, dayBasis: 'CALENDAR' },
        { trigger: 'COURT_DATE', label: 'สรุปผลนัดและรายงานลูกความ', offsetDays: 3, dayBasis: 'BUSINESS' },
      ],
    });
  }

  const clientSmith = await prisma.client.create({
    data: {
      firmId: firm.id,
      name: 'John Smith',
      type: 'INDIVIDUAL',
      contacts: {
        create: [
          { name: 'John Smith', email: 'john.smith@email.com', phone: '081-234-5678', isPrimary: true, portalEnabled: true },
          { name: 'Jane Smith', email: 'jane.smith@email.com', phone: '082-345-6789', position: 'Spouse' },
        ],
      },
    },
  });

  const clientAbc = await prisma.client.create({
    data: {
      firmId: firm.id,
      name: 'ABC Corporation',
      type: 'COMPANY',
      contacts: {
        create: [
          { name: 'Somsak CEO', email: 'ceo@abc.com', phone: '02-111-2222', position: 'CEO', isPrimary: true },
          { name: 'Legal Dept', email: 'legal@abc.com', phone: '02-111-2223', position: 'Legal' },
        ],
      },
    },
  });

  const clientMap: Record<string, string> = {
    'John Smith': clientSmith.id,
    'ABC Corporation': clientAbc.id,
  };

  const cases = [
    {
      ownRef: 'TSBREF20250001',
      customerRef: 'CUST-001',
      title: 'Smith vs. Johnson Contract Dispute',
      description: 'Breach of contract litigation',
      clientName: 'John Smith',
      status: CaseStatus.IN_PROGRESS,
      leadLawyerId: lawyer1.id,
      buddies: [lawyer2.id, assistant.id],
    },
    {
      ownRef: 'TSBREF20250002',
      customerRef: 'CUST-002',
      title: 'ABC Corp Intellectual Property',
      description: 'Patent infringement case',
      clientName: 'ABC Corporation',
      status: CaseStatus.OPEN,
      leadLawyerId: lawyer2.id,
      buddies: [assistant.id, senior.id],
    },
    {
      ownRef: 'TSBREF20250003',
      customerRef: 'CUST-003',
      title: 'Real Estate Transaction - Sukhumvit',
      description: 'Property transfer and due diligence',
      clientName: 'Thai Property Ltd.',
      status: CaseStatus.PENDING,
      leadLawyerId: lawyer1.id,
      buddies: [senior.id],
    },
    {
      ownRef: 'TSBREF20250004',
      customerRef: 'CUST-004',
      title: 'Employment Dispute - Tech Startup',
      description: 'Wrongful termination claim',
      clientName: 'StartupXYZ',
      status: CaseStatus.IN_PROGRESS,
      leadLawyerId: lawyer2.id,
      buddies: [lawyer1.id, assistant.id],
    },
    {
      ownRef: 'TSBREF20250005',
      customerRef: 'CUST-005',
      title: 'Family Law - Divorce Proceedings',
      description: 'Asset division and custody',
      clientName: 'Private Client',
      status: CaseStatus.CLOSED,
      leadLawyerId: lawyer1.id,
      buddies: [],
    },
  ];

  const createdCases = [];
  for (const c of cases) {
    const { buddies, ...caseData } = c;
    const year = new Date().getFullYear();
    const folderId = `LF-${year}-${caseData.ownRef.split('-').pop()}`;
    const legalCase = await prisma.case.create({
      data: {
        ...caseData,
        firmId: firm.id,
        folderId,
        clientId: clientMap[caseData.clientName ?? ''],
        courtName: 'ศาลแพ่งกรุงเทพใต้',
        assignments: {
          create: buddies.map((userId) => ({
            userId,
            assignmentType: AssignmentType.BUDDY,
          })),
        },
      },
    });
    createdCases.push(legalCase);
  }

  const now = new Date();
  const tasks = [
    {
      caseId: createdCases[0].id,
      title: 'Draft initial complaint',
      status: TaskStatus.DONE,
      assigneeId: assistant.id,
      createdById: lawyer1.id,
      dueDate: new Date(now.getTime() - 7 * 86400000),
    },
    {
      caseId: createdCases[0].id,
      title: 'Gather evidence documents',
      status: TaskStatus.IN_PROGRESS,
      assigneeId: assistant.id,
      createdById: lawyer1.id,
      dueDate: new Date(now.getTime() + 3 * 86400000),
    },
    {
      caseId: createdCases[0].id,
      title: 'Prepare witness list',
      status: TaskStatus.TODO,
      assigneeId: assistant.id,
      createdById: lawyer2.id,
      dueDate: new Date(now.getTime() + 14 * 86400000),
    },
    {
      caseId: createdCases[1].id,
      title: 'Patent prior art search',
      status: TaskStatus.IN_PROGRESS,
      assigneeId: senior.id,
      createdById: lawyer2.id,
      dueDate: new Date(now.getTime() + 5 * 86400000),
    },
    {
      caseId: createdCases[3].id,
      title: 'Review employment contract',
      status: TaskStatus.TODO,
      assigneeId: assistant.id,
      createdById: lawyer2.id,
      dueDate: new Date(now.getTime() - 2 * 86400000),
    },
  ];

  for (const task of tasks) {
    await prisma.task.create({ data: task });
  }

  // Pin seeded events to a sensible business-hours time (9:00 AM local) instead
  // of inheriting whatever wall-clock time `now` happens to be when the seed
  // script runs — otherwise every event shows the same odd time (e.g. 00:14)
  // in the calendar UI.
  // Bangkok is a fixed UTC+7, so the offset is written explicitly rather than
  // via setHours(), which would use whatever zone the seed process runs in.
  const atNine = (daysFromNow: number) => {
    const day = new Date(now.getTime() + daysFromNow * 86400000 + 7 * 3600000)
      .toISOString()
      .slice(0, 10);
    return new Date(`${day}T09:00:00+07:00`);
  };

  const events = [
    {
      caseId: createdCases[0].id,
      title: 'Court Hearing - Preliminary',
      type: EventType.COURT_DATE,
      startAt: atNine(7),
      reminderMinutes: [1440, 60],
    },
    {
      caseId: createdCases[0].id,
      title: 'Client Meeting',
      type: EventType.CLIENT_MEETING,
      startAt: atNine(2),
      reminderMinutes: [60],
    },
    {
      caseId: createdCases[1].id,
      title: 'Patent Filing Deadline',
      type: EventType.DEADLINE,
      startAt: atNine(30),
      reminderMinutes: [10080, 1440],
    },
    {
      caseId: createdCases[3].id,
      title: 'Mediation Session',
      type: EventType.COURT_DATE,
      startAt: atNine(14),
      reminderMinutes: [1440, 60],
    },
  ];

  for (const event of events) {
    await prisma.calendarEvent.create({ data: event });
  }

  await prisma.timeEntry.createMany({
    data: [
      {
        caseId: createdCases[0].id,
        userId: lawyer1.id,
        hours: 4.5,
        rate: 5000,
        description: 'Client consultation and case review',
        date: new Date(now.getTime() - 5 * 86400000),
      },
      {
        caseId: createdCases[0].id,
        userId: lawyer2.id,
        hours: 2,
        rate: 4500,
        description: 'Co-counsel research',
        date: new Date(now.getTime() - 3 * 86400000),
      },
      {
        caseId: createdCases[1].id,
        userId: lawyer2.id,
        hours: 6,
        rate: 5000,
        description: 'Patent analysis',
        date: new Date(now.getTime() - 1 * 86400000),
      },
    ],
  });

  await prisma.expense.createMany({
    data: [
      {
        caseId: createdCases[0].id,
        userId: lawyer1.id,
        amount: 1500,
        description: 'Court filing fees',
        category: 'ค่าธรรมเนียมศาล',
        status: 'PENDING',
        date: new Date(now.getTime() - 10 * 86400000),
      },
      {
        caseId: createdCases[1].id,
        userId: lawyer2.id,
        amount: 800,
        description: 'Patent search database access',
        category: 'ค่าบริการค้นหาข้อมูล',
        status: 'APPROVED',
        date: new Date(now.getTime() - 2 * 86400000),
      },
      {
        caseId: createdCases[0].id,
        userId: lawyer1.id,
        amount: 350,
        description: 'Travel to court',
        category: 'ค่าเดินทาง',
        status: 'PAID',
        paidAt: new Date(now.getTime() - 5 * 86400000),
        paidById: admin.id,
        date: new Date(now.getTime() - 8 * 86400000),
      },
    ],
  });

  console.log('Seed completed! Firm slug: thesiambarristers');
  console.log('Login credentials (all use password: password123):');
  console.log('  Owner:     admin@lawfirm.com');
  console.log('  Senior:    senior@lawfirm.com');
  console.log('  Lawyers:   lawyer1@lawfirm.com, lawyer2@lawfirm.com');
  console.log('  Assistant: assistant@lawfirm.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
