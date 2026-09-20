import { RelevanceService } from './relevance.service';
import { EmbeddingService } from './embedding.service';

// Deterministic "embeddings": vector depends on whether the text mentions รถ.
const fakeEmbed = (texts: string[]) => ({
  vectors: texts.map((t) => (t.includes('รถ') ? [1, 0] : [0, 1])),
  model: 'fake',
  inputTokens: texts.length,
});

const embedding = (enabled: boolean) =>
  ({
    enabled,
    embed: jest.fn(async (texts: string[]) => fakeEmbed(texts)),
  }) as unknown as EmbeddingService;

describe('RelevanceService', () => {
  it('returns null when embeddings are disabled', async () => {
    const service = new RelevanceService(embedding(false));
    expect(await service.selectRelevant([{ label: 'a', text: 'x' }], 'q', 100)).toBeNull();
  });

  it('picks the chunks most similar to the query and labels files', async () => {
    const service = new RelevanceService(embedding(true));
    const carText = 'รถชนที่แยก '.repeat(200); // ~2400 chars → 2+ chunks
    const otherText = 'สัญญาเช่าบ้าน '.repeat(200);
    const result = await service.selectRelevant(
      [
        { label: 'car.pdf', text: carText },
        { label: 'lease.pdf', text: otherText },
      ],
      'อุบัติเหตุรถยนต์',
      1500,
    );
    expect(result).not.toBeNull();
    expect(result!.text).toContain('[ไฟล์: car.pdf]');
    expect(result!.text).not.toContain('lease.pdf');
    expect(result!.text.length).toBeLessThanOrEqual(1600);
    // Only part of car.pdf fit → flagged truncated.
    expect(result!.truncatedLabels).toContain('car.pdf');
  });

  it('falls back to null when embedding throws', async () => {
    const service = new RelevanceService({
      enabled: true,
      embed: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as EmbeddingService);
    expect(await service.selectRelevant([{ label: 'a', text: 'x'.repeat(100) }], 'q', 100)).toBeNull();
  });
});
