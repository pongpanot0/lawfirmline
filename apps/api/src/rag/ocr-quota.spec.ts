import { ForbiddenException } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';

describe('RAG OCR quota', () => {
  it('propagates a quota refusal instead of skipping the scanned document', async () => {
    const prisma = {
      document: { findMany: async () => [{ id: 'doc', version: 1, storagePath: 'scan.pdf', mimeType: 'application/pdf', filename: 'scan.pdf' }] },
      documentChunk: { groupBy: async () => [] },
    };
    const intelligence = { extractTextWithOcr: jest.fn().mockRejectedValue(new ForbiddenException({ code: 'PLAN_LIMIT_AI' })) };
    const service = new RagService(prisma as any, {} as any, { getBuffer: async () => Buffer.from('scan') } as any, {} as any, intelligence as any, {} as any, { enabled: true } as any);
    await expect(service.ensureCaseIndexed('case', 'firm')).rejects.toThrow(ForbiddenException);
  });

  it('manual reindex establishes the same quota context as case Q&A', () => {
    expect(Reflect.getMetadata('aiAction', RagController.prototype.reindex)).toBe('rag-cases-caseid-rag-reindex');
  });
});
