import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventType } from '@lawfirm/shared';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { PrismaService } from '../prisma/prisma.module';
import { PDFParse } from 'pdf-parse';

jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));

describe('DocumentIntelligenceService — date extraction', () => {
  let service: DocumentIntelligenceService;
  const mockPrisma = {
    case: { findUnique: jest.fn() },
    documentDateSuggestion: { create: jest.fn() },
    document: { findUnique: jest.fn() },
    caseKnowledge: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
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

  describe('analysis quality guards', () => {
    it('rejects empty source before sending it to AI', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      await expect(service.summarizeWithAI('[หน้า 1]  ')).rejects.toThrow('ไม่พบข้อความ');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
    it('rejects no-document responses instead of saving them as knowledge', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'It seems there are no documents provided for analysis.' } }] }) } as Response);
      await expect(service.summarizeWithAI('ข้อมูลสมมติจากเอกสาร')).rejects.toThrow();
    });
    it('makes provider failure visible in strict research mode', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
      await expect(service.extractFactsWithAI('ข้อความ', { strict: true })).rejects.toThrow('จัดข้อเท็จจริงไม่สำเร็จ');
    });
    it('does not retain an invented citation page number', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ facts: [{ statement: 'มีค่าซ่อม', quote: 'ค่าซ่อม 50000 บาท', page: 9 }], flags: [] }) } }] }) } as Response);
      const result = await service.extractFactsWithAI('[หน้า 1]\nค่าซ่อม 50000 บาท', { strict: true });
      expect(result.facts).toEqual([expect.objectContaining({ page: null, quote: 'ค่าซ่อม 50000 บาท' })]);
    });
    it('refuses to mark a legacy unusable summary as reviewed', async () => {
      mockPrisma.caseKnowledge.findFirst.mockResolvedValue({ id: 'k-1', summary: 'No documents provided' });
      await expect(service.reviewKnowledge('case-1', 'k-1', 'user-1')).rejects.toThrow();
      expect(mockPrisma.caseKnowledge.update).not.toHaveBeenCalled();
    });
  });

  describe('extractText', () => {
    it('preserves original page numbers across blank pages and releases the parser', async () => {
      const destroy = jest.fn().mockResolvedValue(undefined);
      jest.mocked(PDFParse).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({ pages: [
          { num: 1, text: 'First fact' },
          { num: 2, text: '   ' },
          { num: 3, text: 'Third-page fact' },
        ] }), destroy,
      }) as unknown as PDFParse);
      expect(await service.extractText(Buffer.from('pdf'), 'application/pdf'))
        .toBe('[หน้า 1]\nFirst fact\n\n[หน้า 3]\nThird-page fact');
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('keeps textless PDFs empty so the caller can require OCR', async () => {
      jest.mocked(PDFParse).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({ pages: [{ num: 1, text: ' ' }] }),
        destroy: jest.fn().mockResolvedValue(undefined),
      }) as unknown as PDFParse);
      expect(await service.extractText(Buffer.from('pdf'), 'application/pdf')).toBe('');
    });

    it('releases the parser when PDF extraction fails', async () => {
      const destroy = jest.fn().mockResolvedValue(undefined);
      jest.mocked(PDFParse).mockImplementation(() => ({
        getText: jest.fn().mockRejectedValue(new Error('Malformed PDF')), destroy,
      }) as unknown as PDFParse);
      await expect(service.extractText(Buffer.from('pdf'), 'application/pdf')).rejects.toThrow('Malformed PDF');
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('rejects DOCX instead of treating the archive bytes as document text', async () => {
      await expect(service.extractText(Buffer.from('PK archive'),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
        .rejects.toThrow('DOCX');
      expect(PDFParse).not.toHaveBeenCalled();
    });

    it('preserves UTF-8 plain text', async () => {
      expect(await service.extractText(Buffer.from('ข้อเท็จจริง\nบรรทัดสอง'), 'text/plain'))
        .toBe('ข้อเท็จจริง\nบรรทัดสอง');
    });
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

  describe('extractFactsWithAI', () => {
    it('returns no facts or flags when OPENAI_API_KEY is not set', async () => {
      mockConfig.get.mockReturnValue(undefined);
      expect(await service.extractFactsWithAI('[หน้า 1]\nข้อความ')).toEqual({ facts: [], flags: [] });
    });

    it('keeps a fact whose quote appears verbatim in the source, with its page', async () => {
      mockConfig.get.mockReturnValue('test-key');
      const sourceText = '[หน้า 3]\nจำเลยรับสารภาพว่าได้กระทำผิดจริง';
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                facts: [{ statement: 'จำเลยรับสารภาพ', page: 3, quote: 'จำเลยรับสารภาพว่าได้กระทำผิดจริง' }],
                flags: [],
              }),
            },
          }],
        }),
      } as Response);

      const result = await service.extractFactsWithAI(sourceText);

      expect(result).toEqual({
        facts: [{ statement: 'จำเลยรับสารภาพ', page: 3, quote: 'จำเลยรับสารภาพว่าได้กระทำผิดจริง' }],
        flags: [],
      });
    });

    it('drops a fact whose quote cannot be found in the source — never invents a citation', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                facts: [{ statement: 'ข้ออ้างที่ไม่มีในเอกสาร', page: 1, quote: 'ข้อความที่ไม่เคยปรากฏในไฟล์นี้เลย' }],
                flags: [],
              }),
            },
          }],
        }),
      } as Response);

      const result = await service.extractFactsWithAI('[หน้า 1]\nเนื้อหาจริงในเอกสาร');
      expect(result.facts).toEqual([]);
    });

    it('tolerates re-wrapped whitespace in the quote', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                facts: [{ statement: 'ข้อเท็จจริง', page: null, quote: 'บรรทัดหนึ่ง   บรรทัดสอง' }],
                flags: [],
              }),
            },
          }],
        }),
      } as Response);

      const result = await service.extractFactsWithAI('บรรทัดหนึ่ง\nบรรทัดสอง');
      expect(result.facts).toHaveLength(1);
    });

    it('keeps only well-formed flags', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                facts: [],
                flags: [
                  { type: 'CONFLICT', description: 'วันที่ในสองเอกสารไม่ตรงกัน' },
                  { type: 'NOT_A_REAL_TYPE', description: 'should be dropped' },
                  { type: 'MISSING', description: '' },
                ],
              }),
            },
          }],
        }),
      } as Response);

      const result = await service.extractFactsWithAI('text');
      expect(result.flags).toEqual([{ type: 'CONFLICT', description: 'วันที่ในสองเอกสารไม่ตรงกัน' }]);
    });
  });

  describe('analyzeDocument — citations', () => {
    beforeEach(() => {
      mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1' });
      jest.spyOn(service, 'extractText').mockResolvedValue('[หน้า 1]\nข้อเท็จจริงในเอกสาร');
      jest.spyOn(service, 'summarizeWithAI').mockResolvedValue('สรุปผล');
    });

    it('attaches verified citations pinned to the document version when a documentId is given', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({ version: 2 });
      jest.spyOn(service, 'extractFactsWithAI').mockResolvedValue({
        facts: [{ statement: 'ข้อเท็จจริง', page: 1, quote: 'ข้อเท็จจริงในเอกสาร' }],
        flags: [{ type: 'MISSING', description: 'ไม่มีลายเซ็นผู้รับรอง' }],
      });
      mockPrisma.caseKnowledge.create.mockResolvedValue({ id: 'k-1' });

      await service.analyzeDocument(Buffer.from('x'), 'text/plain', 'case-1', 'user-1', 'doc-1');

      expect(mockPrisma.caseKnowledge.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          flags: [{ type: 'MISSING', description: 'ไม่มีลายเซ็นผู้รับรอง' }],
          citations: {
            create: [{
              documentId: 'doc-1',
              documentVersion: 2,
              page: 1,
              statement: 'ข้อเท็จจริง',
              quote: 'ข้อเท็จจริงในเอกสาร',
            }],
          },
        }),
      }));
    });

    it('skips fact extraction entirely for an ad-hoc analysis with no documentId', async () => {
      const extractFacts = jest.spyOn(service, 'extractFactsWithAI');
      mockPrisma.caseKnowledge.create.mockResolvedValue({ id: 'k-1' });

      await service.analyzeDocument(Buffer.from('x'), 'text/plain', 'case-1', 'user-1');

      expect(extractFacts).not.toHaveBeenCalled();
      expect(mockPrisma.document.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.caseKnowledge.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ citations: undefined, flags: undefined }),
      }));
    });

    it('keeps the summary when fact extraction fails', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({ version: 1 });
      jest.spyOn(service, 'extractFactsWithAI').mockRejectedValue(new Error('boom'));
      mockPrisma.caseKnowledge.create.mockResolvedValue({ id: 'k-1' });

      const result = await service.analyzeDocument(Buffer.from('x'), 'text/plain', 'case-1', 'user-1', 'doc-1');

      expect(result).toEqual({ id: 'k-1' });
      expect(mockPrisma.caseKnowledge.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ citations: undefined, flags: undefined }),
      }));
    });
  });

  describe('reviewKnowledge', () => {
    it('throws NotFoundException when the knowledge does not belong to this case', async () => {
      mockPrisma.caseKnowledge.findFirst.mockResolvedValue(null);
      await expect(service.reviewKnowledge('case-1', 'k-1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.caseKnowledge.update).not.toHaveBeenCalled();
    });

    it('marks the analysis reviewed without touching the summary when none is given', async () => {
      mockPrisma.caseKnowledge.findFirst.mockResolvedValue({ id: 'k-1', summary: 'ข้อเท็จจริงจากเอกสารที่ตรวจสอบได้' });
      mockPrisma.caseKnowledge.update.mockResolvedValue({ id: 'k-1', reviewedById: 'user-1' });

      await service.reviewKnowledge('case-1', 'k-1', 'user-1');

      const data = mockPrisma.caseKnowledge.update.mock.calls[0][0].data;
      expect(data.reviewedById).toBe('user-1');
      expect(data.reviewedAt).toBeInstanceOf(Date);
      expect(data.summary).toBeUndefined();
    });

    it('lets the lawyer correct the summary as part of approving it', async () => {
      mockPrisma.caseKnowledge.findFirst.mockResolvedValue({ id: 'k-1', summary: 'ข้อเท็จจริงจากเอกสารที่ตรวจสอบได้' });
      mockPrisma.caseKnowledge.update.mockResolvedValue({ id: 'k-1' });

      await service.reviewKnowledge('case-1', 'k-1', 'user-1', '  สรุปที่แก้ไขแล้ว  ');

      expect(mockPrisma.caseKnowledge.update.mock.calls[0][0].data.summary).toBe('สรุปที่แก้ไขแล้ว');
    });
  });

});
