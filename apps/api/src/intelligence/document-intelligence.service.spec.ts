import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventType } from '@lawfirm/shared';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { PrismaService } from '../prisma/prisma.module';

describe('DocumentIntelligenceService — date extraction', () => {
  let service: DocumentIntelligenceService;
  const mockPrisma = {
    case: { findUnique: jest.fn() },
    documentDateSuggestion: { create: jest.fn() },
  };
  const mockConfig = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentIntelligenceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(DocumentIntelligenceService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('extractDatesWithAI', () => {
    it('returns [] when OPENAI_API_KEY is not set', async () => {
      mockConfig.get.mockReturnValue(undefined);
      const result = await service.extractDatesWithAI('some text');
      expect(result).toEqual([]);
    });

    it('parses a valid AI JSON response into candidates', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  dates: [
                    {
                      label: 'วันนัดไต่สวน',
                      date: '2026-10-01',
                      eventType: 'COURT_DATE',
                      sourceExcerpt: 'นัดไต่สวนวันที่ 1 ตุลาคม 2569',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      } as Response);

      const result = await service.extractDatesWithAI('document text');

      expect(result).toEqual([
        {
          label: 'วันนัดไต่สวน',
          date: new Date('2026-10-01').toISOString(),
          eventType: EventType.COURT_DATE,
          sourceExcerpt: 'นัดไต่สวนวันที่ 1 ตุลาคม 2569',
        },
      ]);
    });

    it('drops candidates with an unparseable date', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                dates: [{ label: 'x', date: 'not-a-date', eventType: 'OTHER', sourceExcerpt: 'y' }],
              }),
            },
          }],
        }),
      } as Response);

      const result = await service.extractDatesWithAI('text');
      expect(result).toEqual([]);
    });

    it('falls back to OTHER for an eventType the AI invented', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                dates: [{ label: 'x', date: '2026-10-01', eventType: 'BOGUS_TYPE', sourceExcerpt: 'y' }],
              }),
            },
          }],
        }),
      } as Response);

      const result = await service.extractDatesWithAI('text');
      expect(result[0].eventType).toBe(EventType.OTHER);
    });

    it('returns [] when the AI response content is not valid JSON', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
      } as Response);

      const result = await service.extractDatesWithAI('text');
      expect(result).toEqual([]);
    });

    it('returns [] when the AI response content is the JSON literal null', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'null' } }] }),
      } as Response);

      const result = await service.extractDatesWithAI('text');
      expect(result).toEqual([]);
    });

    it('returns [] when the OpenAI call itself fails', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);

      const result = await service.extractDatesWithAI('text');
      expect(result).toEqual([]);
    });
  });

  describe('extractDates', () => {
    it('throws NotFoundException when the case does not exist', async () => {
      mockPrisma.case.findUnique.mockResolvedValue(null);
      await expect(
        service.extractDates(Buffer.from('x'), 'text/plain', 'case-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates one DocumentDateSuggestion per extracted candidate', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1' });
      jest.spyOn(service, 'extractText').mockResolvedValue('some text');
      jest.spyOn(service, 'extractDatesWithAI').mockResolvedValue([
        {
          label: 'x',
          date: '2026-10-01T00:00:00.000Z',
          eventType: EventType.DEADLINE,
          sourceExcerpt: 'y',
        },
      ]);
      mockPrisma.documentDateSuggestion.create.mockResolvedValue({ id: 'sug-1' });

      const result = await service.extractDates(
        Buffer.from('x'),
        'text/plain',
        'case-1',
        'user-1',
        'doc-1',
      );

      expect(mockPrisma.documentDateSuggestion.create).toHaveBeenCalledWith({
        data: {
          caseId: 'case-1',
          documentId: 'doc-1',
          label: 'x',
          suggestedDate: new Date('2026-10-01T00:00:00.000Z'),
          eventType: EventType.DEADLINE,
          sourceExcerpt: 'y',
          createdById: 'user-1',
        },
      });
      expect(result).toEqual([{ id: 'sug-1' }]);
    });

    it('creates zero rows when no dates are found', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1' });
      jest.spyOn(service, 'extractText').mockResolvedValue('some text');
      jest.spyOn(service, 'extractDatesWithAI').mockResolvedValue([]);

      const result = await service.extractDates(Buffer.from('x'), 'text/plain', 'case-1', 'user-1');

      expect(mockPrisma.documentDateSuggestion.create).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('redaction before the summary leaves the firm', () => {
    it('never sends a client identifier to the model, but keeps the dates', async () => {
      mockConfig.get.mockReturnValue('test-key');
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'สรุป' } }] }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      await service.summarizeWithAI(
        'ผู้ป่วย HN 6512345 บัตร 1234567890123 โทร 081-234-5678 ผ่าตัดวันที่ 2026-03-30',
      );

      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).not.toContain('6512345');
      expect(body).not.toContain('1234567890123');
      expect(body).not.toContain('081-234-5678');
      expect(body).toContain('2026-03-30');
    });
  });

});
