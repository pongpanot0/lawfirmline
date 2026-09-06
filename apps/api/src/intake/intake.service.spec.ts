import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { IntakeService } from './intake.service';
import { PrismaService } from '../prisma/prisma.module';
import { TasksService } from '../tasks/tasks.service';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

describe('IntakeService attachments', () => {
  let service: IntakeService;
  const mockPrisma = {
    intake: { findFirst: jest.fn() },
    intakeAttachment: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  };
  const mockTasksService = { create: jest.fn() };
  const mockConfig = { get: jest.fn() };
  const mockAnalysisService = { getOne: jest.fn(), analyze: jest.fn(), listForIntake: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue('./uploads');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TasksService, useValue: mockTasksService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: IntakePrecedentAnalysisService, useValue: mockAnalysisService },
      ],
    }).compile();
    service = module.get(IntakeService);
  });

  describe('uploadAttachment', () => {
    it('throws NotFoundException when the intake does not belong to the firm', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(null);
      const file = { originalname: 'a.pdf', mimetype: 'application/pdf', buffer: Buffer.from('x') } as any;
      await expect(service.uploadAttachment(user, 'intake-1', file)).rejects.toThrow(NotFoundException);
    });

    it('rejects a file whose mime type is not application/pdf', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', firmId: 'firm-1' });
      const file = {
        originalname: 'a.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('x'),
      } as any;

      await expect(service.uploadAttachment(user, 'intake-1', file)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.intakeAttachment.create).not.toHaveBeenCalled();
    });

    it('rejects a PDF larger than the 10MB limit', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', firmId: 'firm-1' });
      const file = {
        originalname: 'big.pdf',
        mimetype: 'application/pdf',
        size: 10 * 1024 * 1024 + 1,
        buffer: Buffer.from('x'),
      } as any;

      await expect(service.uploadAttachment(user, 'intake-1', file)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.intakeAttachment.create).not.toHaveBeenCalled();
    });

    it('writes the file to disk and creates an IntakeAttachment row', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', firmId: 'firm-1' });
      mockPrisma.intakeAttachment.create.mockResolvedValue({
        id: 'att-1',
        intakeId: 'intake-1',
        filename: 'a.pdf',
        mimeType: 'application/pdf',
        storagePath: 'uploads/intake-1/att-1.pdf',
        uploadedById: 'user-1',
        createdAt: new Date('2026-09-06'),
      });
      const file = { originalname: 'a.pdf', mimetype: 'application/pdf', buffer: Buffer.from('x') } as any;

      const result = await service.uploadAttachment(user, 'intake-1', file);

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(mockPrisma.intakeAttachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          intakeId: 'intake-1',
          filename: 'a.pdf',
          mimeType: 'application/pdf',
          uploadedById: 'user-1',
        }),
      });
      expect(result.id).toBe('att-1');
    });
  });

  describe('deleteAttachment', () => {
    it('throws NotFoundException when the attachment does not belong to the intake', async () => {
      mockPrisma.intakeAttachment.findFirst.mockResolvedValue(null);
      await expect(service.deleteAttachment(user, 'intake-1', 'att-1')).rejects.toThrow(NotFoundException);
    });

    it('deletes the file from disk and the DB row', async () => {
      mockPrisma.intakeAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        intakeId: 'intake-1',
        storagePath: 'uploads/intake-1/att-1.pdf',
        intake: { firmId: 'firm-1' },
      });
      mockPrisma.intakeAttachment.delete.mockResolvedValue({});

      await service.deleteAttachment(user, 'intake-1', 'att-1');

      expect(fs.unlinkSync).toHaveBeenCalledWith('uploads/intake-1/att-1.pdf');
      expect(mockPrisma.intakeAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
    });
  });
});

describe('IntakeService draftNotice with analysisId', () => {
  let service: IntakeService;
  const mockPrisma = {
    intake: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const mockTasksService = { create: jest.fn() };
  const mockConfig = { get: jest.fn() };
  const mockAnalysisService = { getOne: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue(undefined); // demo mode: no OPENAI_API_KEY needed for this test
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TasksService, useValue: mockTasksService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: IntakePrecedentAnalysisService, useValue: mockAnalysisService },
      ],
    }).compile();
    service = module.get(IntakeService);
  });

  it('behaves exactly as before when analysisId is omitted (regression check)', async () => {
    mockPrisma.intake.findFirst.mockResolvedValue({
      id: 'intake-1',
      clientName: 'คุณสมชาย',
      opposingParty: 'บริษัท เอบีซี',
      matterType: 'แรงงาน',
      description: 'รายละเอียด',
      estimatedDamage: null,
      deadlineDate: null,
      client: null,
    });

    const { content } = await service.draftNotice(user, 'intake-1');

    expect(mockAnalysisService.getOne).not.toHaveBeenCalled();
    expect(content).toContain('คุณสมชาย');
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('uses noticeFacts from the analysis when analysisId is provided', async () => {
    mockPrisma.intake.findFirst.mockResolvedValue({
      id: 'intake-1',
      clientName: 'คุณสมชาย',
      opposingParty: 'บริษัท เอบีซี',
      matterType: 'แรงงาน',
      description: 'รายละเอียด',
      estimatedDamage: null,
      deadlineDate: null,
      client: null,
    });
    mockAnalysisService.getOne.mockResolvedValue({
      id: 'analysis-1',
      status: 'COMPLETE',
      noticeFacts: 'ข้อเท็จจริงที่เตรียมไว้แล้วจากการวิเคราะห์ฎีกา',
    });

    const { content } = await service.draftNotice(user, 'intake-1', 'analysis-1');

    expect(mockAnalysisService.getOne).toHaveBeenCalledWith(user, 'intake-1', 'analysis-1');
    expect(content).toContain('ข้อเท็จจริงที่เตรียมไว้แล้วจากการวิเคราะห์ฎีกา');
  });

  it('throws BadRequestException when the analysis is not COMPLETE, so no credit is charged', async () => {
    mockPrisma.intake.findFirst.mockResolvedValue({
      id: 'intake-1',
      clientName: 'คุณสมชาย',
      opposingParty: 'บริษัท เอบีซี',
      matterType: 'แรงงาน',
      description: 'รายละเอียด',
      estimatedDamage: null,
      deadlineDate: null,
      client: null,
    });
    mockAnalysisService.getOne.mockResolvedValue({
      id: 'analysis-1',
      status: 'FAILED',
      noticeFacts: '',
    });

    await expect(service.draftNotice(user, 'intake-1', 'analysis-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('IntakeService convertToCase', () => {
  let service: IntakeService;
  const mockPrisma = {
    intake: { findFirst: jest.fn(), update: jest.fn() },
    firm: { findUnique: jest.fn() },
    case: { findMany: jest.fn(), create: jest.fn() },
    caseAssignment: { createMany: jest.fn() },
    calendarEvent: { create: jest.fn() },
    intakePrecedentAnalysis: { updateMany: jest.fn() },
  };
  const mockTasksService = { create: jest.fn() };
  const mockConfig = { get: jest.fn() };
  const mockAnalysisService = { getOne: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TasksService, useValue: mockTasksService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: IntakePrecedentAnalysisService, useValue: mockAnalysisService },
      ],
    }).compile();
    service = module.get(IntakeService);
  });

  it('backfills caseId on every precedent-analysis row belonging to the intake', async () => {
    mockPrisma.intake.findFirst.mockResolvedValue({
      id: 'intake-1',
      firmId: 'firm-1',
      title: 'คดีทดสอบ',
      clientName: 'คุณสมชาย',
      matterType: 'แรงงาน',
      description: 'รายละเอียด',
      clientId: null,
      referralName: null,
      deadlineDate: null,
      assignedUserIds: [],
    });
    mockPrisma.firm.findUnique.mockResolvedValue({ ownRefPrefix: 'TSBREF' });
    mockPrisma.case.findMany.mockResolvedValue([]);
    mockPrisma.case.create.mockResolvedValue({
      id: 'case-1',
      title: 'คดีทดสอบ',
      leadLawyerId: 'user-1',
    });
    mockPrisma.intake.update.mockResolvedValue({});
    mockPrisma.intakePrecedentAnalysis.updateMany.mockResolvedValue({ count: 2 });
    mockTasksService.create.mockResolvedValue({});

    const result = await service.convertToCase(user, 'intake-1', {} as any);

    expect(result.id).toBe('case-1');
    expect(mockPrisma.intakePrecedentAnalysis.updateMany).toHaveBeenCalledWith({
      where: { intakeId: 'intake-1' },
      data: { caseId: 'case-1' },
    });
  });
});

describe('IntakeService relatedCase / isOngoingElsewhere fields', () => {
  let service: IntakeService;
  const mockPrisma = {
    intake: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    case: { findFirst: jest.fn() },
  };
  const mockTasksService = { create: jest.fn() };
  const mockConfig = { get: jest.fn() };
  const mockAnalysisService = { getOne: jest.fn(), analyze: jest.fn(), listForIntake: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TasksService, useValue: mockTasksService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: IntakePrecedentAnalysisService, useValue: mockAnalysisService },
      ],
    }).compile();
    service = module.get(IntakeService);
  });

  it('passes relatedCaseId, isOngoingElsewhere, externalCaseNumber, currentStageNote through on create', async () => {
    mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1', firmId: 'firm-1' });
    mockPrisma.intake.create.mockResolvedValue({ id: 'intake-1' });

    await service.create(user, {
      receivedDate: '2026-09-06',
      relatedCaseId: 'case-1',
      isOngoingElsewhere: true,
      externalCaseNumber: 'ดำที่ 123/2569',
      currentStageNote: 'นัดสืบพยาน 15 ต.ค.',
    } as any);

    expect(mockPrisma.intake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relatedCaseId: 'case-1',
          isOngoingElsewhere: true,
          externalCaseNumber: 'ดำที่ 123/2569',
          currentStageNote: 'นัดสืบพยาน 15 ต.ค.',
        }),
      }),
    );
  });

  it('passes the same four fields through on update', async () => {
    mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', firmId: 'firm-1' });
    mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-2', firmId: 'firm-1' });
    mockPrisma.intake.update.mockResolvedValue({ id: 'intake-1' });

    await service.update(user, 'intake-1', {
      relatedCaseId: 'case-2',
      isOngoingElsewhere: false,
      externalCaseNumber: 'ดำที่ 456/2569',
      currentStageNote: 'อยู่ระหว่างอุทธรณ์',
    } as any);

    expect(mockPrisma.intake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relatedCaseId: 'case-2',
          isOngoingElsewhere: false,
          externalCaseNumber: 'ดำที่ 456/2569',
          currentStageNote: 'อยู่ระหว่างอุทธรณ์',
        }),
      }),
    );
  });

  it('rejects create() when relatedCaseId does not belong to the firm', async () => {
    mockPrisma.case.findFirst.mockResolvedValue(null);
    await expect(
      service.create(user, { receivedDate: '2026-09-06', relatedCaseId: 'other-firm-case' } as any),
    ).rejects.toThrow('ไม่พบคดีที่เลือกไว้ในสำนักงานนี้');
    expect(mockPrisma.intake.create).not.toHaveBeenCalled();
  });

  it('allows create() when relatedCaseId is omitted', async () => {
    mockPrisma.intake.create.mockResolvedValue({ id: 'intake-1' });
    await service.create(user, { receivedDate: '2026-09-06' } as any);
    expect(mockPrisma.case.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.intake.create).toHaveBeenCalled();
  });
});
