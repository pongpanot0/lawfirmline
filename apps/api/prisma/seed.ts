import {
  PrismaClient,
  Role,
  CaseStatus,
  TaskStatus,
  AssignmentType,
  EventType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.reminderLog.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.caseAssignment.deleteMany();
  await prisma.case.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@lawfirm.com',
      passwordHash,
      firstName: 'Somchai',
      lastName: 'Admin',
      role: Role.ADMIN,
    },
  });

  const lawyer1 = await prisma.user.create({
    data: {
      email: 'lawyer1@lawfirm.com',
      passwordHash,
      firstName: 'Nattapong',
      lastName: 'Srisawat',
      role: Role.LAWYER,
    },
  });

  const lawyer2 = await prisma.user.create({
    data: {
      email: 'lawyer2@lawfirm.com',
      passwordHash,
      firstName: 'Pimchanok',
      lastName: 'Viriya',
      role: Role.LAWYER,
    },
  });

  const clerk1 = await prisma.user.create({
    data: {
      email: 'clerk1@lawfirm.com',
      passwordHash,
      firstName: 'Siriporn',
      lastName: 'Kaew',
      role: Role.CLERK,
    },
  });

  const clerk2 = await prisma.user.create({
    data: {
      email: 'clerk2@lawfirm.com',
      passwordHash,
      firstName: 'Anan',
      lastName: 'Boonma',
      role: Role.CLERK,
    },
  });

  const cases = [
    {
      caseNumber: 'LF-2025-001',
      title: 'Smith vs. Johnson Contract Dispute',
      description: 'Breach of contract litigation',
      clientName: 'John Smith',
      status: CaseStatus.IN_PROGRESS,
      leadLawyerId: lawyer1.id,
      coCounsel: [lawyer2.id],
      clerks: [clerk1.id],
    },
    {
      caseNumber: 'LF-2025-002',
      title: 'ABC Corp Intellectual Property',
      description: 'Patent infringement case',
      clientName: 'ABC Corporation',
      status: CaseStatus.OPEN,
      leadLawyerId: lawyer2.id,
      coCounsel: [],
      clerks: [clerk1.id, clerk2.id],
    },
    {
      caseNumber: 'LF-2025-003',
      title: 'Real Estate Transaction - Sukhumvit',
      description: 'Property transfer and due diligence',
      clientName: 'Thai Property Ltd.',
      status: CaseStatus.PENDING,
      leadLawyerId: lawyer1.id,
      coCounsel: [],
      clerks: [clerk2.id],
    },
    {
      caseNumber: 'LF-2025-004',
      title: 'Employment Dispute - Tech Startup',
      description: 'Wrongful termination claim',
      clientName: 'StartupXYZ',
      status: CaseStatus.IN_PROGRESS,
      leadLawyerId: lawyer2.id,
      coCounsel: [lawyer1.id],
      clerks: [clerk1.id],
    },
    {
      caseNumber: 'LF-2025-005',
      title: 'Family Law - Divorce Proceedings',
      description: 'Asset division and custody',
      clientName: 'Private Client',
      status: CaseStatus.CLOSED,
      leadLawyerId: lawyer1.id,
      coCounsel: [],
      clerks: [],
    },
  ];

  const createdCases = [];
  for (const c of cases) {
    const { coCounsel, clerks, ...caseData } = c;
    const year = new Date().getFullYear();
    const folderId = `LF-${year}-${caseData.caseNumber.split('-').pop()}`;
    const legalCase = await prisma.case.create({
      data: {
        ...caseData,
        folderId,
        courtName: 'ศาลแพ่งกรุงเทพใต้',
        assignments: {
          create: [
            ...coCounsel.map((userId) => ({
              userId,
              assignmentType: AssignmentType.CO_COUNSEL,
            })),
            ...clerks.map((userId) => ({
              userId,
              assignmentType: AssignmentType.CLERK,
            })),
          ],
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
      assigneeId: clerk1.id,
      createdById: lawyer1.id,
      dueDate: new Date(now.getTime() - 7 * 86400000),
    },
    {
      caseId: createdCases[0].id,
      title: 'Gather evidence documents',
      status: TaskStatus.IN_PROGRESS,
      assigneeId: clerk1.id,
      createdById: lawyer1.id,
      dueDate: new Date(now.getTime() + 3 * 86400000),
    },
    {
      caseId: createdCases[0].id,
      title: 'Prepare witness list',
      status: TaskStatus.TODO,
      assigneeId: clerk1.id,
      createdById: lawyer2.id,
      dueDate: new Date(now.getTime() + 14 * 86400000),
    },
    {
      caseId: createdCases[1].id,
      title: 'Patent prior art search',
      status: TaskStatus.IN_PROGRESS,
      assigneeId: clerk2.id,
      createdById: lawyer2.id,
      dueDate: new Date(now.getTime() + 5 * 86400000),
    },
    {
      caseId: createdCases[3].id,
      title: 'Review employment contract',
      status: TaskStatus.TODO,
      assigneeId: clerk1.id,
      createdById: lawyer2.id,
      dueDate: new Date(now.getTime() - 2 * 86400000),
    },
  ];

  for (const task of tasks) {
    await prisma.task.create({ data: task });
  }

  const events = [
    {
      caseId: createdCases[0].id,
      title: 'Court Hearing - Preliminary',
      type: EventType.COURT_DATE,
      startAt: new Date(now.getTime() + 7 * 86400000),
      reminderMinutes: [1440, 60],
    },
    {
      caseId: createdCases[0].id,
      title: 'Client Meeting',
      type: EventType.CLIENT_MEETING,
      startAt: new Date(now.getTime() + 2 * 86400000),
      reminderMinutes: [60],
    },
    {
      caseId: createdCases[1].id,
      title: 'Patent Filing Deadline',
      type: EventType.DEADLINE,
      startAt: new Date(now.getTime() + 30 * 86400000),
      reminderMinutes: [10080, 1440],
    },
    {
      caseId: createdCases[3].id,
      title: 'Mediation Session',
      type: EventType.COURT_DATE,
      startAt: new Date(now.getTime() + 14 * 86400000),
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

  console.log('Seed completed!');
  console.log('Login credentials (all use password: password123):');
  console.log('  Admin:  admin@lawfirm.com');
  console.log('  Lawyer: lawyer1@lawfirm.com, lawyer2@lawfirm.com');
  console.log('  Clerk:  clerk1@lawfirm.com, clerk2@lawfirm.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
