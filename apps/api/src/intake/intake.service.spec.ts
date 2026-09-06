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
      noticeFacts: 'ข้อเท็จจริงที่เตรียมไว้แล้วจากการวิเคราะห์ฎีกา',
    });

    const { content } = await service.draftNotice(user, 'intake-1', 'analysis-1');

    expect(mockAnalysisService.getOne).toHaveBeenCalledWith(user, 'intake-1', 'analysis-1');
    expect(content).toContain('ข้อเท็จจริงที่เตรียมไว้แล้วจากการวิเคราะห์ฎีกา');
  });
});
