import { NotFoundException } from '@nestjs/common';
import { AI_CREDIT_COST, DOCUMENT_ANALYSIS_MIME_TYPES, DateSuggestionSource, DateSuggestionStatus, type AuthUser } from '@lawfirm/shared';
import { AiTrayService } from './ai-tray.service';

describe('AiTrayService', () => {
  const user = { id: 'u1', firmId: 'f1' } as AuthUser;
  const caseFilter = { firmId: 'f1' };

  function build() {
    const prisma = {
      document: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      documentDateSuggestion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const access = { getCaseFilterForUser: jest.fn().mockReturnValue(caseFilter) };
    return { service: new AiTrayService(prisma as never, access as never), prisma, access };
  }

  it('queries only unhandled, analyzable, unread documents in cases the user can access', async () => {
    const { service, prisma } = build();
    await service.list(user, 'c1');
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        caseId: 'c1',
        case: caseFilter,
        aiTrayHandledAt: null,
        mimeType: { in: [...DOCUMENT_ANALYSIS_MIME_TYPES] },
        knowledge: { none: {} },
      },
      take: 200,
    }));
    expect(prisma.documentDateSuggestion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { caseId: 'c1', status: DateSuggestionStatus.PENDING, source: DateSuggestionSource.DOCUMENT, case: caseFilter },
      take: 500,
    }));
  });

  it('without caseId queries every accessible case', async () => {
    const { service, prisma } = build();
    await service.list(user);
    expect(prisma.document.findMany.mock.calls[0][0].where.caseId).toEqual({ not: null });
  });

  it('groups unread documents per case with a credit estimate, and counts pending dates per case', async () => {
    const { service, prisma } = build();
    const kase = { id: 'c1', title: 'คดี A', ownRef: 'A-1' };
    prisma.document.findMany.mockResolvedValue([
      { id: 'd2', filename: 'b.pdf', createdAt: new Date('2026-09-29T02:00:00Z'), caseId: 'c1', case: kase },
      { id: 'd1', filename: 'a.pdf', createdAt: new Date('2026-09-29T01:00:00Z'), caseId: 'c1', case: kase },
    ]);
    prisma.documentDateSuggestion.findMany.mockResolvedValue([
      { caseId: 'c2', case: { id: 'c2', title: 'คดี B', ownRef: null } },
      { caseId: 'c2', case: { id: 'c2', title: 'คดี B', ownRef: null } },
    ]);
    const cards = await service.list(user);
    expect(cards).toEqual([
      {
        type: 'UNREAD_DOCUMENTS', caseId: 'c1', caseTitle: 'คดี A', caseRef: 'A-1',
        documents: [
          { id: 'd2', filename: 'b.pdf', createdAt: '2026-09-29T02:00:00.000Z' },
          { id: 'd1', filename: 'a.pdf', createdAt: '2026-09-29T01:00:00.000Z' },
        ],
        creditCost: 2 * AI_CREDIT_COST.DOCUMENT_ANALYSIS * 2,
      },
      { type: 'PENDING_DATES', caseId: 'c2', caseTitle: 'คดี B', caseRef: null, count: 2 },
    ]);
  });

  it('markHandled stamps only documents in accessible cases', async () => {
    const { service, prisma } = build();
    prisma.document.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    prisma.document.updateMany.mockResolvedValue({ count: 2 });
    await expect(service.markHandled(user, ['d1', 'd2'])).resolves.toEqual({ handled: 2 });
    expect(prisma.document.findMany).toHaveBeenCalledWith({ where: { id: { in: ['d1', 'd2'] }, case: caseFilter }, select: { id: true } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['d1', 'd2'] } }, data: { aiTrayHandledAt: expect.any(Date) } });
  });

  it('markHandled rejects the whole request when any document is out of reach', async () => {
    const { service, prisma } = build();
    prisma.document.findMany.mockResolvedValue([{ id: 'd1' }]);
    await expect(service.markHandled(user, ['d1', 'other'])).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });
});
