import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { PrismaService } from '../prisma/prisma.module';
import { IappLegalClient } from '../intelligence/iapp-legal.client';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';

describe('IntakePrecedentAnalysisService', () => {
  let service: IntakePrecedentAnalysisService;
  const mockPrisma = {
    intake: { findFirst: jest.fn() },
    intakePrecedentAnalysis: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
  };
  const mockIapp = { searchPrecedents: jest.fn(), getPrecedentDetail: jest.fn() };
  const mockDocIntel = { extractText: jest.fn() };
  const mockConfig = { get: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  const baseIntake = {
    id: 'intake-1',
    firmId: 'firm-1',
    description: 'ลูกความถูกไล่ออกโดยไม่จ่ายค่าชดเชย',
    matterType: 'แรงงาน',
    opposingParty: 'บริษัท เอบีซี จำกัด',
    estimatedDamage: 50000,
    incidentDate: new Date('2026-01-01'),
    attachments: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue('test-openai-key');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntakePrecedentAnalysisService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IappLegalClient, useValue: mockIapp },
        { provide: DocumentIntelligenceService, useValue: mockDocIntel },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(IntakePrecedentAnalysisService);
    global.fetch = jest.fn();
  });

  describe('analyze', () => {
    it('throws BadRequestException when the intake has no description and no attachments', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue({ ...baseIntake, description: null, attachments: [] });
      await expect(service.analyze(user, 'intake-1')).rejects.toThrow(BadRequestException);
      expect(mockIapp.searchPrecedents).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the intake does not belong to the firm', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(null);
      await expect(service.analyze(user, 'intake-1')).rejects.toThrow(NotFoundException);
    });

    it('runs the full pipeline and persists a COMPLETE record on success', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(baseIntake);

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'ค่าชดเชยเลิกจ้างไม่เป็นธรรม' } }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summaryBullets: '- ฎ. 1234/2565: ศาลตัดสินให้จ่ายค่าชดเชย',
                    noticeFacts: 'ชื่อลูกความ: ...\nคู่กรณี: บริษัท เอบีซี จำกัด',
                  }),
                },
              },
            ],
          }),
        });

      mockIapp.searchPrecedents.mockResolvedValue([
        {
          dekaId: '1234/2565',
          headnote: 'ค่าชดเชยเลิกจ้าง',
          citedStatutes: ['พรบ.คุ้มครองแรงงาน ม.118'],
          courtLevel: 'ศาลฎีกา',
          judgmentDate: '2022-05-01',
          sourceUrl: 'https://deka.supremecourt.or.th/search?q=1234%2F2565',
        },
      ]);

      mockPrisma.intakePrecedentAnalysis.create.mockImplementation(({ data }: any) => ({
        id: 'analysis-1',
        ...data,
      }));

      const result = await service.analyze(user, 'intake-1');

      expect(mockIapp.searchPrecedents).toHaveBeenCalledWith(
        'ค่าชดเชยเลิกจ้างไม่เป็นธรรม',
        expect.any(Object),
      );
      expect(mockPrisma.intakePrecedentAnalysis.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          intakeId: 'intake-1',
          status: 'COMPLETE',
          createdById: 'user-1',
        }),
      });
      expect(result.status).toBe('COMPLETE');
      expect(result.summaryBullets).toContain('1234/2565');
    });

    it('persists a FAILED record with errorMessage AND still throws (so no credit is charged) when iApp search fails', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(baseIntake);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'คำค้น' } }] }),
      });
      mockIapp.searchPrecedents.mockRejectedValue(new Error('iApp deka/search failed'));
      mockPrisma.intakePrecedentAnalysis.create.mockResolvedValue({ id: 'analysis-failed' });

      await expect(service.analyze(user, 'intake-1')).rejects.toThrow('iApp deka/search failed');

      // The failure must still be recorded for audit (how many times this was run,
      // and why it failed) — throwing is only how we avoid charging AI credit
      // (AiCreditsInterceptor decrements only after a successful handler response),
      // it must not also mean we lose the audit trail.
      expect(mockPrisma.intakePrecedentAnalysis.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          intakeId: 'intake-1',
          status: 'FAILED',
          errorMessage: expect.stringContaining('iApp deka/search failed'),
          createdById: 'user-1',
        }),
      });
    });

    it('re-throws the ORIGINAL pipeline error, not a secondary DB error, when persisting the FAILED audit record itself fails', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(baseIntake);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'คำค้น' } }] }),
      });
      mockIapp.searchPrecedents.mockRejectedValue(new Error('iApp deka/search failed'));
      // The catch block's own audit-persisting create() call rejects (e.g. DB unavailable).
      mockPrisma.intakePrecedentAnalysis.create.mockRejectedValueOnce(new Error('DB unavailable'));

      await expect(service.analyze(user, 'intake-1')).rejects.toThrow('iApp deka/search failed');
    });

    it('persists a usable errorMessage string when the pipeline throws a non-Error value', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(baseIntake);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'คำค้น' } }] }),
      });
      // eslint-disable-next-line prefer-promise-reject-errors
      mockIapp.searchPrecedents.mockRejectedValue('plain string failure');
      mockPrisma.intakePrecedentAnalysis.create.mockResolvedValue({ id: 'analysis-failed' });

      await expect(service.analyze(user, 'intake-1')).rejects.toBe('plain string failure');

      expect(mockPrisma.intakePrecedentAnalysis.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          intakeId: 'intake-1',
          status: 'FAILED',
          errorMessage: 'plain string failure',
          createdById: 'user-1',
        }),
      });
    });

    it('falls back gracefully when a PDF attachment fails to extract, still completing the analysis', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue({
        ...baseIntake,
        attachments: [{ id: 'att-1', storagePath: '/tmp/x.pdf', mimeType: 'application/pdf', filename: 'x.pdf' }],
      });
      mockDocIntel.extractText.mockRejectedValue(new Error('corrupt pdf'));

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'คำค้น' } }] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ summaryBullets: 'ไม่พบฎีกาที่เกี่ยวข้อง', noticeFacts: 'ข้อมูลจาก intake' }) } }],
          }),
        });
      mockIapp.searchPrecedents.mockResolvedValue([]);
      mockPrisma.intakePrecedentAnalysis.create.mockImplementation(({ data }: any) => ({ id: 'analysis-2', ...data }));

      const result = await service.analyze(user, 'intake-1');

      expect(result.status).toBe('COMPLETE');
      const facts = result.extractedFacts as Record<string, unknown>;
      expect(facts.attachmentExtractionFailed).toBe(true);
    });
  });

  describe('getOne', () => {
    it('throws NotFoundException when the analysis does not belong to the intake/firm', async () => {
      mockPrisma.intakePrecedentAnalysis.findFirst.mockResolvedValue(null);
      await expect(service.getOne(user, 'intake-1', 'analysis-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listForCase', () => {
    it('queries analyses for the case, firm-scoped through the case relation, newest first', async () => {
      mockPrisma.intakePrecedentAnalysis.findMany.mockResolvedValue([{ id: 'analysis-1' }]);

      const result = await service.listForCase(user, 'case-1');

      expect(mockPrisma.intakePrecedentAnalysis.findMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1', case: { firmId: 'firm-1' } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([{ id: 'analysis-1' }]);
    });

    it('returns an empty list when the case belongs to another firm', async () => {
      mockPrisma.intakePrecedentAnalysis.findMany.mockResolvedValue([]);

      const result = await service.listForCase(
        { id: 'user-2', firmId: 'firm-2' } as any,
        'case-1',
      );

      expect(mockPrisma.intakePrecedentAnalysis.findMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1', case: { firmId: 'firm-2' } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([]);
    });
  });
});
