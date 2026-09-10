/**
 * Additive mock-email seed for the email-intake vertical slice.
 *
 * Unlike prisma/seed.ts (which wipes and rebuilds the whole database), this
 * script only ADDS rows onto whatever firm/users already exist — safe to run
 * against a shared dev database other sessions are also using.
 *
 * Usage: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-email-intake.ts
 */
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const firm = await prisma.firm.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!firm) {
    console.error('No firm found — run the main seed (npm run seed) first.');
    process.exit(1);
  }

  const receiver = await prisma.user.findFirst({
    where: { firmMembers: { some: { firmId: firm.id } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!receiver) {
    console.error('No user found for this firm — run the main seed first.');
    process.exit(1);
  }

  const mockThreads = [
    {
      threadKey: 'mock-thread-1',
      subject: 'ขอคำปรึกษาเรื่องเช่าซื้อรถผิดสัญญา',
      fromName: 'คุณสมหญิง ใจดี',
      fromAddress: 'somying.jaidee@example.com',
      body:
        'เรียนทนายความ ดิฉันทำสัญญาเช่าซื้อรถกับบริษัท เอบีซี ลิสซิ่ง จำกัด แต่บริษัทไม่ส่งมอบรถตามกำหนด ' +
        'มูลค่าความเสียหายประมาณ 450,000 บาท คู่กรณี: เอบีซี ลิสซิ่ง จำกัด กรุณาตอบกลับภายใน 7 วัน ขอบคุณค่ะ',
    },
    {
      threadKey: 'mock-thread-2',
      subject: 'แจ้งข้อพิพาทค่าเช่าพื้นที่ค้างชำระ',
      fromName: 'คุณประเสริฐ วงศ์ทอง',
      fromAddress: 'prasert.w@example.com',
      body:
        'เรียนทนายความ ผมเป็นเจ้าของอาคารพาณิชย์ให้เช่า ผู้เช่าค้างค่าเช่ารวม 120,000 บาท ' +
        'คู่กรณี: ร้านสไมล์มินิมาร์ท กรุณาตอบกลับภายใน 15/10/2026',
    },
  ];

  for (const mock of mockThreads) {
    const thread = await prisma.emailThread.upsert({
      where: { firmId_provider_threadKey: { firmId: firm.id, provider: 'mock', threadKey: mock.threadKey } },
      update: {},
      create: {
        firmId: firm.id,
        provider: 'mock',
        threadKey: mock.threadKey,
        subject: mock.subject,
        fromName: mock.fromName,
        fromAddress: mock.fromAddress,
        lastMessageAt: new Date(),
      },
    });

    const existingMessage = await prisma.emailMessage.findFirst({
      where: { threadId: thread.id, messageKey: `${mock.threadKey}-msg-1` },
    });
    if (!existingMessage) {
      await prisma.emailMessage.create({
        data: {
          threadId: thread.id,
          messageKey: `${mock.threadKey}-msg-1`,
          direction: 'INBOUND',
          fromName: mock.fromName,
          fromAddress: mock.fromAddress,
          bodyText: mock.body,
          receivedAt: new Date(),
        },
      });
    }
  }

  console.log(`Seeded ${mockThreads.length} mock email threads for firm "${firm.name}" (receiver: ${receiver.email}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
