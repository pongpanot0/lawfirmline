import { ConfigService } from '@nestjs/config';
import { InsufficientCreditsError, ReceiptExtractionService } from './receipt-extraction.service';

describe('ReceiptExtractionService', () => {
  const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } } as any;
  const image = { buffer: Buffer.from('fake-image'), contentType: 'image/jpeg' };

  const makeService = (apiKey?: string) =>
    new ReceiptExtractionService(
      prisma,
      { get: (k: string) => (k === 'OPENAI_API_KEY' ? apiKey : undefined) } as unknown as ConfigService,
    );

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('extracts amount/description and debits credits on success', async () => {
    prisma.user.findUnique.mockResolvedValue({ aiCredits: 100 });
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"amount": 1500, "description": "ค่าส่งเอกสาร"}' } }],
      }),
    } as any);
    const svc = makeService('key');
    const result = await svc.extractReceipt('u1', image);
    expect(result).toEqual({ amount: 1500, description: 'ค่าส่งเอกสาร' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { aiCredits: { decrement: 5 } },
    });
  });

  it('throws InsufficientCreditsError without calling the API', async () => {
    prisma.user.findUnique.mockResolvedValue({ aiCredits: 2 });
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    const svc = makeService('key');
    await expect(svc.extractReceipt('u1', image)).rejects.toThrow(InsufficientCreditsError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null without debiting when no API key is configured', async () => {
    prisma.user.findUnique.mockResolvedValue({ aiCredits: 100 });
    const svc = makeService(undefined);
    expect(await svc.extractReceipt('u1', image)).toBeNull();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns null without debiting on unparseable output', async () => {
    prisma.user.findUnique.mockResolvedValue({ aiCredits: 100 });
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'sorry, cannot read' } }] }),
    } as any);
    const svc = makeService('key');
    expect(await svc.extractReceipt('u1', image)).toBeNull();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
