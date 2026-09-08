import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { PrismaService } from '../prisma/prisma.module';

/**
 * A suggested value goes straight into a form a lawyer will file from, so what
 * matters here is what the service refuses to pass on: an unsupported value, a
 * field it was not asked for, a number that is not one, and the two money
 * fields being told apart.
 */
describe('DocumentIntelligenceService.extractFieldsWithAI', () => {
  let service: DocumentIntelligenceService;
  const mockConfig = { get: jest.fn().mockReturnValue('test-key') };
  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue('test-key');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentIntelligenceService,
        { provide: PrismaService, useValue: {} },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(DocumentIntelligenceService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function replyWith(fields: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ fields }) } }],
      }),
    }) as unknown as typeof fetch;
  }

  it('keeps the two money fields apart instead of folding them together', async () => {
    replyWith([
      {
        field: 'claimedAmount',
        value: '1,500,000',
        sourceFilename: 'คำฟ้อง.pdf',
        sourceExcerpt: 'ขอให้จำเลยชำระเงินจำนวน 1,500,000 บาท',
      },
      {
        field: 'estimatedDamage',
        value: '900000',
        sourceFilename: 'รายงาน.pdf',
        sourceExcerpt: 'ประเมินความเสียหายไว้ที่ 900,000 บาท',
      },
    ]);

    const result = await service.extractFieldsWithAI('เอกสาร');

    expect(result).toEqual([
      expect.objectContaining({ field: 'claimedAmount', value: '1500000' }),
      expect.objectContaining({ field: 'estimatedDamage', value: '900000' }),
    ]);
  });

  it('drops a value with no sentence behind it', async () => {
    replyWith([
      { field: 'opposingParty', value: 'บริษัท เอบีซี จำกัด', sourceExcerpt: '   ' },
      {
        field: 'opposingParty',
        value: 'บริษัท เอ็กซ์วาย จำกัด',
        sourceFilename: 'สัญญา.pdf',
        sourceExcerpt: 'คู่สัญญาอีกฝ่ายคือ บริษัท เอ็กซ์วาย จำกัด',
      },
    ]);

    const result = await service.extractFieldsWithAI('เอกสาร');

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('บริษัท เอ็กซ์วาย จำกัด');
  });

  it('returns both readings when the documents disagree, rather than choosing', async () => {
    replyWith([
      {
        field: 'incidentDate',
        value: '2026-03-01',
        sourceFilename: 'a.pdf',
        sourceExcerpt: 'เหตุเกิดวันที่ 1 มีนาคม 2569',
      },
      {
        field: 'incidentDate',
        value: '2026-03-04',
        sourceFilename: 'b.pdf',
        sourceExcerpt: 'เหตุเกิดวันที่ 4 มีนาคม 2569',
      },
    ]);

    const result = await service.extractFieldsWithAI('เอกสาร');

    expect(result.map((item) => item.value)).toEqual([
      '2026-03-01T00:00:00.000Z',
      '2026-03-04T00:00:00.000Z',
    ]);
  });

  it('ignores a field it was never asked for and a number that is not one', async () => {
    replyWith([
      { field: 'leadLawyerId', value: 'user-1', sourceExcerpt: 'ทนายคือ...' },
      { field: 'incidentDate', value: 'เร็วๆ นี้', sourceExcerpt: 'เกิดเหตุเร็วๆ นี้' },
      { field: 'claimedAmount', value: 'ประมาณหนึ่งล้าน', sourceExcerpt: 'ราวหนึ่งล้าน' },
    ]);

    expect(await service.extractFieldsWithAI('เอกสาร')).toEqual([]);
  });

  it('suggests nothing rather than failing when the model is unavailable', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    expect(await service.extractFieldsWithAI('เอกสาร')).toEqual([]);
  });

  it('suggests nothing when no API key is configured, leaving manual entry alone', async () => {
    mockConfig.get.mockReturnValue(undefined);
    global.fetch = jest.fn() as unknown as typeof fetch;

    expect(await service.extractFieldsWithAI('เอกสาร')).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
