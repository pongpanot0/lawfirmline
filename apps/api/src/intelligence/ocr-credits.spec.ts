import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { aiCreditContext, requestAiCredits } from '../common/ai-credit-context';
import { PlanQuotaService } from '../common/services/plan-quota.service';
import { PrismaService } from '../prisma/prisma.module';

jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));

describe('OCR credits', () => {
  const buffer = Buffer.from('scanned PDF');
  const user = { id: 'u', firmId: 'f' } as any;
  const quota = { assertAiAvailable: jest.fn() };
  const aiRun = { create: jest.fn() };
  const config = { get: jest.fn((key: string): string | undefined => key === 'OPENAI_API_KEY' ? 'key' : undefined) };
  const service = new DocumentIntelligenceService({ aiRun } as unknown as PrismaService, config as unknown as ConfigService);
  const state = () => ({ user, quota: quota as unknown as PlanQuotaService, files: new Map<Buffer, number>() });
  const pages = Array.from({ length: 5 }, (_, i) => ({ pageNumber: i + 1, dataUrl: 'data:image/png;base64,eA==' }));
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    quota.assertAiAvailable.mockResolvedValue(undefined);
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: async () => ({ pages: [{ num: 1, text: '' }] }),
      getInfo: async () => ({ total: 5 }),
      getScreenshot: async () => ({ total: 5, pages }),
      destroy: jest.fn(),
    }));
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ข้อความ' } }], usage: { prompt_tokens: 2400, completion_tokens: 100 } }) } as Response);
  });
  afterEach(() => jest.restoreAllMocks());

  it('five scanned pages cost three credits and log luna model/tokens with low reasoning', async () => {
    await aiCreditContext.run(state(), async () => {
      await service.extractTextWithOcr(buffer, 'application/pdf');
      expect(requestAiCredits()).toBe(3);
    });
    expect(quota.assertAiAvailable).toHaveBeenCalledWith(user, 3);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: 'gpt-6-luna', reasoning_effort: 'low', max_completion_tokens: 8000 });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('max_tokens');
    expect(aiRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ model: 'gpt-6-luna', inputTokens: 12000, outputTokens: 500 }) });
  });

  it('keeps the OCR model override and legacy non-reasoning parameters', async () => {
    config.get.mockImplementation((key: string) => key === 'OPENAI_API_KEY' ? 'key' : key === 'OPENAI_OCR_MODEL' ? 'gpt-4o-mini' : undefined);
    try {
      await service.ocrPdf(buffer);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toMatchObject({ model: 'gpt-4o-mini', temperature: 0 });
      expect(body).not.toHaveProperty('reasoning_effort');
    } finally { config.get.mockImplementation((key: string) => key === 'OPENAI_API_KEY' ? 'key' : undefined); }
  });

  it('refuses before any OpenAI call when the full scan does not fit', async () => {
    quota.assertAiAvailable.mockRejectedValue(new ForbiddenException({ code: 'PLAN_LIMIT_AI' }));
    await expect(aiCreditContext.run(state(), () => service.ocrPdf(buffer))).rejects.toThrow(ForbiddenException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('batch checks text + scanned credits before the first OCR call', async () => {
    quota.assertAiAvailable.mockImplementation(async (_user, credits) => { if (credits > 3) throw new ForbiddenException(); });
    await expect(aiCreditContext.run(state(), () => service.analyzeBatch([
      { buffer, mimeType: 'application/pdf', filename: 'scan.pdf' },
      { buffer: Buffer.from('text'), mimeType: 'text/plain', filename: 'text.txt' },
    ], 'u'))).rejects.toThrow(ForbiddenException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('estimate uses the same scan detection, without calling OpenAI', async () => {
    expect(await service.estimateFileCredits(buffer, 'application/pdf')).toEqual({ pages: 5, scanned: true, credits: 3 });
    expect(await service.estimateFileCredits(Buffer.from('text'), 'text/plain')).toEqual({ pages: 1, scanned: false, credits: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('text PDFs cost one credit and over-cap scans are refused', async () => {
    jest.spyOn(service, 'extractText').mockResolvedValue('t'.repeat(100));
    expect(await service.estimateFileCredits(buffer, 'application/pdf')).toEqual({ pages: 5, scanned: false, credits: 1 });
    jest.spyOn(service, 'extractText').mockResolvedValue('');
    config.get.mockImplementation((key: string) => key === 'OCR_MAX_PAGES' ? '4' : key === 'OPENAI_API_KEY' ? 'key' : undefined);
    await expect(service.estimateFileCredits(buffer, 'application/pdf')).rejects.toThrow(BadRequestException);
    config.get.mockImplementation((key: string) => key === 'OPENAI_API_KEY' ? 'key' : undefined);
  });
});
