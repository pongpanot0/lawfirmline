import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * USD per 1M tokens, for a rough cost estimate on the dashboard. Unknown
 * models show tokens only (cost 0) rather than a made-up number. Update
 * alongside the OPENAI_MODEL_* envs when models change.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

function estimateUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_MTOK[model];
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

@Injectable()
export class AiUsageService {
  constructor(private prisma: PrismaService) {}

  async summary(firmId: string, days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const runs = await this.prisma.aiRun.findMany({
      where: { firmId, createdAt: { gte: since } },
      select: { model: true, operation: true, caseId: true, inputTokens: true, outputTokens: true, status: true },
    });

    type Bucket = { runs: number; inputTokens: number; outputTokens: number; estimatedUsd: number };
    const add = (map: Map<string, Bucket>, key: string, r: (typeof runs)[number]) => {
      const bucket = map.get(key) ?? { runs: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };
      bucket.runs += 1;
      bucket.inputTokens += r.inputTokens;
      bucket.outputTokens += r.outputTokens;
      bucket.estimatedUsd += estimateUsd(r.model, r.inputTokens, r.outputTokens);
      map.set(key, bucket);
    };

    const byOperation = new Map<string, Bucket>();
    const byModel = new Map<string, Bucket>();
    const byCase = new Map<string, Bucket>();
    const total: Bucket = { runs: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };
    let errors = 0;

    for (const r of runs) {
      add(byOperation, r.operation, r);
      add(byModel, r.model, r);
      if (r.caseId) add(byCase, r.caseId, r);
      total.runs += 1;
      total.inputTokens += r.inputTokens;
      total.outputTokens += r.outputTokens;
      total.estimatedUsd += estimateUsd(r.model, r.inputTokens, r.outputTokens);
      if (r.status !== 'success') errors += 1;
    }

    const topCaseIds = [...byCase.entries()]
      .sort((a, b) => b[1].estimatedUsd - a[1].estimatedUsd || b[1].runs - a[1].runs)
      .slice(0, 10);
    const cases = topCaseIds.length
      ? await this.prisma.case.findMany({
          where: { id: { in: topCaseIds.map(([id]) => id) }, firmId },
          select: { id: true, ownRef: true, title: true },
        })
      : [];
    const caseById = new Map(cases.map((c) => [c.id, c]));

    const round = (b: Bucket) => ({ ...b, estimatedUsd: Math.round(b.estimatedUsd * 10000) / 10000 });
    const toRows = (map: Map<string, Bucket>) =>
      [...map.entries()]
        .sort((a, b) => b[1].estimatedUsd - a[1].estimatedUsd || b[1].runs - a[1].runs)
        .map(([key, bucket]) => ({ key, ...round(bucket) }));

    return {
      days,
      total: round(total),
      errors,
      byOperation: toRows(byOperation),
      byModel: toRows(byModel),
      byCase: topCaseIds.map(([id, bucket]) => ({
        caseId: id,
        ownRef: caseById.get(id)?.ownRef ?? null,
        title: caseById.get(id)?.title ?? null,
        ...round(bucket),
      })),
    };
  }
}
