import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailService } from '../notifications/email.service';
import { ClosingEmailService } from './closing-email.service';
import { PrismaService } from '../prisma/prisma.module';

describe('ClosingEmailService.gatherCaseData', () => {
  let service: ClosingEmailService;
  const mockPrisma = {
    case: { findUnique: jest.fn() },
    caseActivity: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClosingEmailService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: {} },
      ],
    }).compile();
    service = module.get(ClosingEmailService);
  });

  it('throws NotFoundException when case does not exist', async () => {
    mockPrisma.case.findUnique.mockResolvedValue(null);
    await expect(service.gatherCaseData('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns case data with activities and no missing-data notes when closingSummary and courtName are present', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      ownRef: 'CASE-001',
      customerRef: 'CUST-1',
      clientName: 'บริษัท ทดสอบ จำกัด',
      title: 'คดีทดสอบ',
      courtName: 'ศาลแพ่ง',
      closingSummary: 'สรุปคดี',
      closedAt: new Date('2026-08-01'),
    });
    mockPrisma.caseActivity.findMany.mockResolvedValue([
      {
        id: 'act-1',
        title: 'ยื่นฟ้อง',
        description: 'ยื่นคำฟ้องต่อศาล',
        activityAt: new Date('2026-01-15'),
      },
    ]);

    const result = await service.gatherCaseData('case-1');

    expect(result.ownRef).toBe('CASE-001');
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].title).toBe('ยื่นฟ้อง');
    expect(result.missingDataNotes).toEqual([]);
  });

  it('flags missing data when closingSummary is null', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      ownRef: 'CASE-001',
      customerRef: null,
      clientName: null,
      title: 'คดีทดสอบ',
      courtName: null,
      closingSummary: null,
      closedAt: null,
    });
    mockPrisma.caseActivity.findMany.mockResolvedValue([]);

    const result = await service.gatherCaseData('case-1');

    expect(result.missingDataNotes).toContain(
      'ยังไม่มีสรุปผลคดี (closingSummary) — กรอกก่อนส่งอีเมลจริง',
    );
  });
});

describe('ClosingEmailService.renderDraft', () => {
  let service: ClosingEmailService;
  const mockPrisma = {
    case: { findUnique: jest.fn() },
    caseActivity: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClosingEmailService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: {} },
      ],
    }).compile();
    service = module.get(ClosingEmailService);
  });

  it('builds subject and body including only selected activities', () => {
    const data = {
      caseId: 'case-1',
      ownRef: 'CASE-001',
      customerRef: 'CUST-1',
      clientName: 'บริษัท ทดสอบ จำกัด',
      title: 'คดีทดสอบ',
      courtName: 'ศาลแพ่ง',
      closingSummary: 'ศาลพิพากษาให้ชนะคดี',
      closedAt: new Date('2026-08-01'),
      activities: [
        {
          id: 'act-1',
          title: 'ยื่นฟ้อง',
          description: 'ยื่นคำฟ้องต่อศาล',
          activityAt: new Date('2026-01-15'),
        },
        {
          id: 'act-2',
          title: 'บันทึกภายใน',
          description: 'ไม่ควรถูกรวม',
          activityAt: new Date('2026-02-01'),
        },
      ],
      missingDataNotes: [],
    };

    const result = service.renderDraft(data, ['act-1']);

    expect(result.subject).toContain('CASE-001');
    expect(result.subject).toContain('บริษัท ทดสอบ จำกัด');
    expect(result.bodyText).toContain('ยื่นฟ้อง');
    expect(result.bodyText).toContain('ศาลพิพากษาให้ชนะคดี');
    expect(result.bodyText).not.toContain('ไม่ควรถูกรวม');
  });

  it('gives a skeleton to type into when the lawyer drafts without picking events', () => {
    const draft = service.renderDraft(
      {
        title: 'คดีทดสอบ',
        ownRef: 'TSBREF20260007',
        customerRef: null,
        clientName: 'นาย สมชาย',
        courtName: null,
        closingSummary: null,
        activities: [],
      } as any,
      [],
    );

    // ร่างเปล่าต้องเป็นโครงที่เขียนต่อได้ ไม่ใช่ข้อความบ่นว่ายังไม่ได้เลือกอะไร
    expect(draft.bodyText).toContain('(พิมพ์ลำดับการดำเนินงานที่นี่)');
    expect(draft.bodyText).toContain('(พิมพ์ผลที่ได้รับที่นี่)');
    expect(draft.subject).toContain('TSBREF20260007');
  });
});

describe('ClosingEmailService.approveDraft', () => {
  const prisma = {
    closingEmailDraft: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    clientContact: { findMany: jest.fn() },
  };
  const email = { isConfigured: jest.fn().mockReturnValue(true), sendClosingEmail: jest.fn() };
  const user = { id: 'u1', firmId: 'f1', firmName: 'สำนักงานทดสอบ' } as any;
  const draft = { id: 'd1', caseId: 'c1', status: 'DRAFT', subject: 'สรุปคดี', bodyText: 'เรียน ลูกความ', recipientClientId: 'cl1' };
  let service: ClosingEmailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    email.isConfigured.mockReturnValue(true);
    const module = await Test.createTestingModule({
      providers: [ClosingEmailService, { provide: PrismaService, useValue: prisma }, { provide: EmailService, useValue: email }],
    }).compile();
    service = module.get(ClosingEmailService);
    prisma.closingEmailDraft.findFirst.mockResolvedValue(draft);
    prisma.closingEmailDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.closingEmailDraft.update.mockImplementation(async ({ data }) => ({ ...draft, ...data }));
  });

  it('sends to the selected contacts of the draft client and records who got it', async () => {
    prisma.clientContact.findMany.mockResolvedValue([{ id: 'k1', email: 'a@x.co' }, { id: 'k2', email: 'b@x.co' }]);
    email.sendClosingEmail.mockResolvedValue(true);
    const result = await service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1', 'k2'] });
    expect(prisma.clientContact.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['k1', 'k2'] }, clientId: 'cl1', email: { not: null } }, select: { id: true, email: true },
    });
    expect(email.sendClosingEmail).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ status: 'APPROVED', sentTo: ['a@x.co', 'b@x.co'], sentAt: expect.any(Date) }));
  });

  it('refuses a contact that is not on the draft client or has no email', async () => {
    prisma.clientContact.findMany.mockResolvedValue([{ id: 'k1', email: 'a@x.co' }]);
    await expect(service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1', 'other'] })).rejects.toThrow(BadRequestException);
    expect(email.sendClosingEmail).not.toHaveBeenCalled();
  });

  it('refuses before sending when email is not configured', async () => {
    email.isConfigured.mockReturnValue(false);
    await expect(service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1'] })).rejects.toThrow('อีเมล');
    expect(prisma.closingEmailDraft.update).not.toHaveBeenCalled();
  });

  it('keeps the draft unsent when every delivery fails', async () => {
    prisma.clientContact.findMany.mockResolvedValue([{ id: 'k1', email: 'a@x.co' }]);
    email.sendClosingEmail.mockResolvedValue(false);
    await expect(service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1'] })).rejects.toThrow('ส่งอีเมลไม่สำเร็จ');
    expect(prisma.closingEmailDraft.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'DRAFT' } }));
  });

  it('records only the recipients that succeeded when some fail', async () => {
    prisma.clientContact.findMany.mockResolvedValue([{ id: 'k1', email: 'a@x.co' }, { id: 'k2', email: 'b@x.co' }]);
    email.sendClosingEmail.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const result = await service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1', 'k2'] });
    expect(result.sentTo).toEqual(['a@x.co']);
  });

  it('a second approve of an already-approved draft is refused without sending', async () => {
    prisma.closingEmailDraft.updateMany.mockResolvedValue({ count: 0 });
    prisma.clientContact.findMany.mockResolvedValue([{ id: 'k1', email: 'a@x.co' }]);
    await expect(service.approveDraft(user, 'c1', 'd1', { contactIds: ['k1'] })).rejects.toThrow('อนุมัติไปแล้ว');
    expect(email.sendClosingEmail).not.toHaveBeenCalled();
  });
});
