import { FirmRole, type AuthUser } from '@lawfirm/shared';
import { CaseAccessService } from '../common/services/case-access.service';
import { SecretaryToolsService } from './secretary-tools.service';
import { AgendaService } from '../agenda/agenda.service';
import { CollectionsService } from '../billing/collections.service';

describe('MCP own scope', () => {
  const own = { firmId: 'f1', deletedAt: null, OR: [
    { leadLawyerId: 'u1' }, { assignments: { some: { userId: 'u1' } } }, { tasks: { some: { assigneeId: 'u1' } } },
  ] };
  const member = (firmRole: FirmRole) => ({ id: 'u1', firmId: 'f1', firmRole }) as AuthUser;
  const access = new CaseAccessService({} as any);

  it.each([FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.LAWYER])('does not widen own cases or intakes for %s', role => {
    const user = member(role);
    expect(access.getOwnCaseFilterForUser(user)).toEqual(own);
    expect(access.getOwnIntakeFilterForUser(user)).toEqual({ firmId: 'f1', OR: [
      { case: own }, { case: { is: null }, OR: [
        { receivedById: 'u1' }, { assignedUserIds: { has: 'u1' } }, { relatedCase: own },
      ] },
    ] });
  });

  function tools() {
    const prisma = {
      case: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      intake: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      documentChunk: { count: jest.fn() }, user: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const brief = { getCaseBrief: jest.fn().mockResolvedValue(null), getIntakeBrief: jest.fn().mockResolvedValue(null) };
    const rag = { searchDocumentsByContent: jest.fn().mockResolvedValue([]), retrieve: jest.fn(), ensureCaseIndexed: jest.fn() };
    const collections = { getReceivables: jest.fn().mockResolvedValue({ buckets: {}, rows: [] }) };
    return { prisma, brief, rag, collections, svc: new SecretaryToolsService(prisma as any, access, brief as any, rag as any, collections as any, {} as any) };
  }

  it.each([FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.LAWYER])('scopes every document path before reading for %s', async role => {
    const { svc, prisma, rag, brief } = tools();
    const user = member(role);
    await svc.run(user, 'search_documents', { query: 'contract' }, 'own');
    expect(prisma.document.findMany.mock.calls[0][0].where.AND).toContainEqual({ case: own });
    expect(rag.searchDocumentsByContent).toHaveBeenCalledWith(user, 'contract', 'own');
    const result = await svc.run(user, 'read_document', { documentId: 'outside-or-intake', question: 'read' }, 'own');
    expect(prisma.document.findFirst).toHaveBeenCalledWith({ where: { id: 'outside-or-intake', case: own }, select: { id: true, caseId: true, filename: true } });
    expect(result.content).toEqual({ error: 'not_found' });
    expect(rag.retrieve).not.toHaveBeenCalled();
    expect(prisma.documentChunk.count).not.toHaveBeenCalled();
    await svc.run(user, 'case_overview', { caseId: 'outside' }, 'own');
    expect(brief.getCaseBrief).toHaveBeenCalledWith(user, 'outside', 'own');
    await svc.run(user, 'find_matters', { query: 'contract' }, 'own');
    expect(prisma.case.findMany.mock.calls[0][0].where.AND).toContainEqual(own);
    await svc.run(user, 'list_events', { from: '2026-11-01', to: '2026-12-01' }, 'own');
    expect(prisma.calendarEvent.findMany.mock.calls[0][0].where.case).toEqual(own);
  });

  it('keeps owner licences personal and receivables scoped; capability gates still apply', async () => {
    const { svc, prisma, collections } = tools();
    const user = member(FirmRole.OWNER);
    await svc.run(user, 'lawyer_licenses', {}, 'own');
    expect(prisma.user.findMany.mock.calls[0][0].where.id).toBe(user.id);
    await svc.run(user, 'receivables', {}, 'own');
    expect(collections.getReceivables).toHaveBeenCalledWith(user, undefined, own);
    expect((await svc.run(member(FirmRole.LAWYER), 'receivables', {}, 'own')).content).toEqual({ error: 'forbidden' });
  });

  it('filters agenda rows and review queue in SQL before warning generation', async () => {
    const prisma = { calendarEvent: { findMany: jest.fn().mockResolvedValue([]) }, task: { findMany: jest.fn().mockResolvedValue([]) } };
    const travel = { getOfficeAddress: jest.fn(), calculateTravel: jest.fn() };
    const agenda = new AgendaService(prisma as any, access, travel as any);
    await agenda.getMyDay(member(FirmRole.OWNER), 'own');
    for (const [query] of prisma.calendarEvent.findMany.mock.calls) expect(query.where.case.AND).toContainEqual(own);
    for (const [query] of prisma.task.findMany.mock.calls) {
      const serialized = JSON.stringify(query.where);
      expect(serialized).toContain(JSON.stringify(own));
      expect(serialized).not.toContain('"caseId":null,"assignee"');
    }
    expect(travel.calculateTravel).not.toHaveBeenCalled();
  });

  it('scopes receivable totals at the source query', async () => {
    const prisma = { invoice: { findMany: jest.fn().mockResolvedValue([]) } };
    const collections = new CollectionsService(prisma as any, {} as any, {} as any);
    const result = await collections.getReceivables(member(FirmRole.OWNER), new Date(), own);
    expect(prisma.invoice.findMany.mock.calls[0][0].where.case).toEqual(own);
    expect(result.rows).toEqual([]);
  });
});
