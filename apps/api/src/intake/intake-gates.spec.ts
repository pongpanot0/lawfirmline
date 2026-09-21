import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeService } from './intake.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { TasksService } from '../tasks/tasks.service';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { DocumentsService } from '../documents/documents.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { ConflictCheckService } from '../conflict-check/conflict-check.service';

/**
 * สองด่านที่เพิ่มเข้ามา: เอกสารยังไม่ครบก่อนออกหนังสือ และยังไม่ตรวจ conflict
 * ก่อนเปิดคดี. ทั้งสองด่านข้ามได้ แต่ต้องตั้งใจข้าม
 */
describe('IntakeService — ด่านก่อนออกหนังสือ / ก่อนเปิดคดี', () => {
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: 'OWNER' } as any;
  let service: IntakeService;
  let prisma: any;
  let conflictCheck: { latestForIntake: jest.Mock };

  const intake = {
    id: 'intake-1',
    firmId: 'firm-1',
    title: 'เรื่องทดสอบ',
    stage: 'CONSULTED',
    status: 'RECEIVED',
    noticeIssuedAt: null,
    preLitigationStatus: 'NOT_STARTED',
    case: null,
    relatedCaseId: null,
    customers: [],
    assignedUserIds: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      intake: {
        findFirst: jest.fn().mockResolvedValue(intake),
        findUnique: jest.fn().mockResolvedValue({ stage: 'CONSULTED' }),
        update: jest.fn().mockResolvedValue({ ...intake, noticeIssuedAt: new Date() }),
      },
      intakeDocumentRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
        // เรื่องนี้มี checklist อยู่แล้ว → seed ไม่ทำงาน (ทดสอบ seed แยกด้านล่าง)
        count: jest.fn().mockResolvedValue(3),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: { data: Record<string, unknown> }) => ({ id: 'new', ...args.data })),
        update: jest.fn((args: { data: Record<string, unknown> }) => ({ id: 'req-1', name: 'x', ...args.data })),
      },
      intakeFollowUp: { create: jest.fn() },
      intakeFieldProposal: { updateMany: jest.fn() },
      case: { findFirst: jest.fn(), findUnique: jest.fn() },
      firm: { findUnique: jest.fn().mockResolvedValue({ ownRefPrefix: 'REF' }) },
    };
    conflictCheck = { latestForIntake: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
        { provide: ConflictCheckService, useValue: conflictCheck },
        { provide: CaseAccessService, useValue: { getIntakeFilterForUser: jest.fn().mockResolvedValue({}) } },
        { provide: FileStorageService, useValue: {} },
        { provide: TasksService, useValue: { create: jest.fn() } },
        { provide: IntakePrecedentAnalysisService, useValue: {} },
        { provide: DocumentsService, useValue: { adoptIntakeAttachments: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn() } },
      ],
    }).compile();
    service = module.get(IntakeService);
  });

  const missingRequest = {
    id: 'req-1',
    name: 'สำเนาบัตรประชาชน',
    required: true,
    status: 'REQUESTED',
    receivedAt: null,
  };

  it('ออกหนังสือไม่ได้เมื่อเอกสารที่ขอไว้ยังไม่ครบ', async () => {
    prisma.intakeDocumentRequest.findMany.mockResolvedValue([missingRequest]);

    await expect(
      service.issueNotice(user, 'intake-1', { noticeRecipient: 'คู่กรณี' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.intake.update).not.toHaveBeenCalled();
  });

  it('ออกหนังสือได้เมื่อกดรับทราบว่ายังขาดเอกสาร', async () => {
    prisma.intakeDocumentRequest.findMany.mockResolvedValue([missingRequest]);

    await service.issueNotice(user, 'intake-1', {
      noticeRecipient: 'คู่กรณี',
      acknowledgeMissingDocuments: true,
    } as any);

    expect(prisma.intake.update).toHaveBeenCalled();
    expect(prisma.intake.update.mock.calls[0][0].data.stage).toBe('PRE_LITIGATION_NOTICE');
  });

  it('เอกสารที่ไม่จำเป็น หรือที่ระบุว่าไม่เกี่ยวข้อง ไม่กั้นการออกหนังสือ', async () => {
    prisma.intakeDocumentRequest.findMany.mockResolvedValue([
      { ...missingRequest, required: false },
      { ...missingRequest, id: 'req-2', status: 'NOT_APPLICABLE' },
      { ...missingRequest, id: 'req-3', status: 'RECEIVED' },
    ]);

    await expect(
      service.issueNotice(user, 'intake-1', { noticeRecipient: 'คู่กรณี' } as any),
    ).resolves.toBeDefined();
  });

  // conflict check ไม่ใช่ด่านอีกต่อไป — ตรวจได้ แต่ไม่กั้นการเปิดคดี (ทีมตัดสินใจเอง)
  it('เปิดคดีได้แม้ยังไม่เคยตรวจ conflict', async () => {
    conflictCheck.latestForIntake.mockResolvedValue(null);
    prisma.case.findMany = jest.fn().mockResolvedValue([]);
    prisma.case.create = jest.fn().mockResolvedValue({ id: 'case-1', title: 'x', leadLawyerId: 'user-1' });
    prisma.caseAssignment = { createMany: jest.fn() };
    prisma.calendarEvent = { create: jest.fn() };
    prisma.intakePrecedentAnalysis = { updateMany: jest.fn() };
    prisma.insuranceClaim = { create: jest.fn() };
    prisma.document = { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
    prisma.intakeAttachment = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.task = { updateMany: jest.fn() };

    const result = await service.convertToCase(user, 'intake-1', {} as any);

    expect(result?.id).toBe('case-1');
  });

  it('ขอเอกสารเพิ่มแล้วย้ายขั้นตอนไปรอเอกสารให้เอง', async () => {
    await service.addDocumentRequests(user, 'intake-1', {
      items: [{ name: 'สัญญา' }, { name: 'ใบเสร็จ', required: false }],
    } as any);

    expect(prisma.intakeDocumentRequest.createMany).toHaveBeenCalled();
    const rows = prisma.intakeDocumentRequest.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'สัญญา', required: true, createdById: 'user-1' });
    expect(prisma.intake.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: 'WAITING_DOCUMENTS' }) }),
    );
  });

  it('ขั้นตอนที่เดินไปไกลกว่าแล้วไม่ถูกดึงถอยกลับเพราะขอเอกสารเพิ่ม', async () => {
    prisma.intake.findUnique.mockResolvedValue({ stage: 'PROPOSAL' });

    await service.addDocumentRequests(user, 'intake-1', { items: [{ name: 'สัญญา' }] } as any);

    expect(prisma.intake.update).not.toHaveBeenCalled();
  });

  describe('checklist ชุดเดียว (ยุบจาก IntakeChecklistItem)', () => {
    it('เปิด checklist ครั้งแรก seed จาก template ตามประเภทงานก่อนฟ้อง', async () => {
      prisma.intakeDocumentRequest.count.mockResolvedValue(0);
      prisma.intake.findFirst.mockResolvedValue({ ...intake, preLitigationType: 'MEDICAL_CLAIM' });

      await service.missingDocuments(user, 'intake-1');

      const rows = prisma.intakeDocumentRequest.createMany.mock.calls[0][0].data;
      expect(rows.map((r: { name: string }) => r.name)).toContain('เวชระเบียน');
      expect(rows.every((r: { required: boolean }) => r.required)).toBe(true);
    });

    it('มี checklist อยู่แล้วไม่ seed ซ้ำ', async () => {
      prisma.intakeDocumentRequest.count.mockResolvedValue(5);
      await service.missingDocuments(user, 'intake-1');
      expect(prisma.intakeDocumentRequest.createMany).not.toHaveBeenCalled();
    });

    it('ยืนยันด้วยมือ (__manual__) = ได้รับแล้วแต่ไม่ผูกไฟล์', async () => {
      prisma.intakeDocumentRequest.findFirst.mockResolvedValue({ id: 'req-1', name: 'เวชระเบียน' });

      await service.setChecklistItem(user, 'intake-1', 'เวชระเบียน', '__manual__');

      const data = prisma.intakeDocumentRequest.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ status: 'RECEIVED', documentId: null });
      expect(data.receivedAt).toBeInstanceOf(Date);
    });

    it('__skipped__ = ไม่เกี่ยวข้อง จึงไม่กั้นการออกหนังสือ', async () => {
      prisma.intakeDocumentRequest.findFirst.mockResolvedValue({ id: 'req-1', name: 'เวชระเบียน' });

      await service.setChecklistItem(user, 'intake-1', 'เวชระเบียน', '__skipped__');

      expect(prisma.intakeDocumentRequest.update.mock.calls[0][0].data).toMatchObject({
        status: 'NOT_APPLICABLE',
      });
    });

    it('ผูกไฟล์จริง = RECEIVED พร้อม documentId', async () => {
      prisma.intakeDocumentRequest.findFirst.mockResolvedValue({ id: 'req-1', name: 'เวชระเบียน' });

      await service.setChecklistItem(user, 'intake-1', 'เวชระเบียน', 'doc-9');

      expect(prisma.intakeDocumentRequest.update.mock.calls[0][0].data).toMatchObject({
        status: 'RECEIVED',
        documentId: 'doc-9',
      });
    });

    it('ติ๊กออก (null) = กลับไปเป็นยังไม่ได้รับ', async () => {
      prisma.intakeDocumentRequest.findFirst.mockResolvedValue({ id: 'req-1', name: 'เวชระเบียน' });

      await service.setChecklistItem(user, 'intake-1', 'เวชระเบียน', null);

      expect(prisma.intakeDocumentRequest.update.mock.calls[0][0].data).toMatchObject({
        status: 'REQUESTED',
        documentId: null,
        receivedAt: null,
      });
    });

    it('label ที่ทนายเพิ่มเองและยังไม่มีแถว ถูกสร้างให้', async () => {
      prisma.intakeDocumentRequest.findFirst.mockResolvedValue(null);

      await service.setChecklistItem(user, 'intake-1', 'หนังสือมอบอำนาจ', '__manual__');

      expect(prisma.intakeDocumentRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'หนังสือมอบอำนาจ', status: 'RECEIVED' }),
        }),
      );
    });
  });
});
