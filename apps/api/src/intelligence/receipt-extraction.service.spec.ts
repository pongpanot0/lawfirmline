import { ConfigService } from '@nestjs/config';
import { ReceiptExtractionService } from './receipt-extraction.service';

describe('ReceiptExtractionService', () => {
  const image = { buffer: Buffer.from('fake-image'), contentType: 'image/jpeg' };

  const makeService = (apiKey?: string) =>
    new ReceiptExtractionService(
      { get: (k: string) => (k === 'OPENAI_API_KEY' ? apiKey : undefined) } as unknown as ConfigService,
    );

  afterEach(() => jest.restoreAllMocks());

  it('extracts amount/description', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"amount": 1500, "description": "ค่าส่งเอกสาร"}' } }],
      }),
    } as any);
    const result = await makeService('key').extractReceipt(image);
    expect(result).toEqual({ amount: 1500, description: 'ค่าส่งเอกสาร' });
  });

  it('returns null without calling the API when no API key is configured', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    expect(await makeService(undefined).extractReceipt(image)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on unparseable output', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'sorry, cannot read' } }] }),
    } as any);
    expect(await makeService('key').extractReceipt(image)).toBeNull();
  });
});
