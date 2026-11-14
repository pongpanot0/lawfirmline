import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { AiCreditsController } from './ai-credits.controller';
import { CreditsEstimateDto } from './dto/credits-estimate.dto';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('AI credits estimate access and validation', () => {
  const user = { id: 'u', firmId: 'f' } as any;
  const prisma = { document: { findMany: jest.fn() } };
  const documents = { getFilePath: jest.fn(), getFilePathForIntake: jest.fn() };
  const access = { canAccessCase: jest.fn() };
  const storage = { getBuffer: jest.fn() };
  const intelligence = { estimateFileCredits: jest.fn() };
  const quota = { aiBalance: jest.fn() };
  const controller = new AiCreditsController(prisma as any, documents as any, access as any, storage as any, intelligence as any, quota as any);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.document.findMany.mockResolvedValue([{ id: UUID, caseId: 'case', intakeId: null }]);
    documents.getFilePath.mockResolvedValue({ path: 'file.pdf', mimeType: 'application/pdf' });
    documents.getFilePathForIntake.mockResolvedValue({ path: 'file.pdf', mimeType: 'application/pdf' });
    access.canAccessCase.mockResolvedValue(true);
    storage.getBuffer.mockResolvedValue(Buffer.from('scan'));
    intelligence.estimateFileCredits.mockResolvedValue({ pages: 5, scanned: true, credits: 3 });
    quota.aiBalance.mockResolvedValue({ unlimited: false, remaining: 20 });
  });

  it('returns the per-document estimate and balance without charging', async () => {
    await expect(controller.estimate(user, { documentIds: [UUID] })).resolves.toEqual({
      items: [{ documentId: UUID, pages: 5, scanned: true, credits: 3 }], total: 3, balance: { unlimited: false, remaining: 20 },
    });
    expect(documents.getFilePath).toHaveBeenCalledWith(user, 'case', UUID);
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [UUID] }, OR: [{ case: { firmId: 'f' } }, { intake: { firmId: 'f' } }] } }));
  });

  it('denies another case before reading content', async () => {
    access.canAccessCase.mockResolvedValue(false);
    await expect(controller.estimate(user, { documentIds: [UUID] })).rejects.toThrow(ForbiddenException);
    expect(storage.getBuffer).not.toHaveBeenCalled();
  });

  it('does not reveal a missing or foreign-firm document', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    await expect(controller.estimate(user, { documentIds: [UUID] })).rejects.toThrow(NotFoundException);
    expect(storage.getBuffer).not.toHaveBeenCalled();
  });

  it('intake documents reuse the same intake access check as analyze', async () => {
    prisma.document.findMany.mockResolvedValue([{ id: UUID, caseId: null, intakeId: 'intake' }]);
    documents.getFilePathForIntake.mockRejectedValue(new ForbiddenException());
    await expect(controller.estimate(user, { documentIds: [UUID] })).rejects.toThrow(ForbiddenException);
    expect(documents.getFilePathForIntake).toHaveBeenCalledWith(user, 'intake', UUID);
    expect(storage.getBuffer).not.toHaveBeenCalled();
  });

  it('validates 1–20 distinct UUIDs', async () => {
    for (const documentIds of [[], ['invalid'], [UUID, UUID], Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)]) {
      expect(await validate(Object.assign(new CreditsEstimateDto(), { documentIds }))).not.toHaveLength(0);
    }
    expect(await validate(Object.assign(new CreditsEstimateDto(), { documentIds: Array.from({ length: 20 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }))).toHaveLength(0);
  });
});
