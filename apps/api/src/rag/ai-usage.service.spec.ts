import { AiUsageService } from './ai-usage.service';

it('prices luna input and output tokens at $0.10 and $0.50 per million', async () => {
  const prisma = {
    aiRun: { findMany: jest.fn().mockResolvedValue([
      { model: 'gpt-6-luna', operation: 'rag_qa', caseId: null, inputTokens: 1_000_000, outputTokens: 1_000_000, status: 'success' },
    ]) },
  };
  const summary = await new AiUsageService(prisma as never).summary('f', 30);
  expect(summary.total.estimatedUsd).toBe(0.6);
  expect(summary.byModel).toEqual([{ key: 'gpt-6-luna', runs: 1, inputTokens: 1_000_000, outputTokens: 1_000_000, estimatedUsd: 0.6 }]);
});
