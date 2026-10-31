import type { AuthUser } from '@lawfirm/shared';
import { SecretaryToolsService } from './secretary-tools.service';

describe('SecretaryToolsService', () => {
  const user = { id: 'u1', firmId: 'f1' } as AuthUser;
  const caseFilter = { firmId: 'f1', deletedAt: null };
  const intakeFilter = { firmId: 'f1' };

  function build() {
    const prisma = {
      case: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      intake: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      documentChunk: { count: jest.fn().mockResolvedValue(0) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const access = {
      getCaseFilterForUser: jest.fn().mockReturnValue(caseFilter),
      getIntakeFilterForUser: jest.fn().mockResolvedValue(intakeFilter),
    };
    const brief = { getCaseBrief: jest.fn().mockResolvedValue(null), getIntakeBrief: jest.fn().mockResolvedValue(null) };
    const rag = {
      searchDocumentsByContent: jest.fn().mockResolvedValue([]),
      retrieve: jest.fn().mockResolvedValue([]),
      ensureCaseIndexed: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new SecretaryToolsService(prisma as any, access as any, brief as any, rag as any);
    return { svc, prisma, brief, rag };
  }

  it('find_matters searches only accessible cases and intakes', async () => {
    const { svc, prisma } = build();
    prisma.case.findMany.mockResolvedValue([{ id: 'c1', title: 'คดี A', ownRef: 'A-1', stage: 'FIRST_INSTANCE' }]);
    prisma.intake.findMany.mockResolvedValue([{ id: 'i1', title: 'เรื่อง B', clientName: 'x', stage: 'NEW_INQUIRY' }]);
    const r = await svc.run(user, 'find_matters', { query: 'สมชาย' });
    expect(prisma.case.findMany.mock.calls[0][0].where.AND).toContainEqual(caseFilter);
    expect(prisma.intake.findMany.mock.calls[0][0].where.AND).toContainEqual(intakeFilter);
    expect(r.cards.map((c) => c.type)).toEqual(['case', 'intake']);
  });

  it('case_overview rejects inaccessible case', async () => {
    const { svc } = build();
    expect(await svc.run(user, 'case_overview', { caseId: 'nope' })).toEqual({ content: { error: 'not_found' }, cards: [] });
  });

  it('read_document rejects inaccessible document', async () => {
    const { svc, prisma, rag } = build();
    const r = await svc.run(user, 'read_document', { documentId: 'd1', question: 'q' });
    expect(r).toEqual({ content: { error: 'not_found' }, cards: [] });
    expect(prisma.document.findFirst.mock.calls[0][0].where.OR).toContainEqual({ case: caseFilter });
    expect(rag.retrieve).not.toHaveBeenCalled();
  });

  it('read_document on unindexed doc returns notIndexed and triggers indexing', async () => {
    const { svc, prisma, rag } = build();
    prisma.document.findFirst.mockResolvedValue({ id: 'd1', caseId: 'c1', filename: 'a.pdf' });
    const r = await svc.run(user, 'read_document', { documentId: 'd1', question: 'q' });
    expect(r.content).toEqual({ notIndexed: true });
    expect(rag.ensureCaseIndexed).toHaveBeenCalledWith('c1', 'f1');
  });

  it('read_document returns top chunks when indexed', async () => {
    const { svc, prisma, rag } = build();
    prisma.document.findFirst.mockResolvedValue({ id: 'd1', caseId: 'c1', filename: 'a.pdf' });
    prisma.documentChunk.count.mockResolvedValue(3);
    rag.retrieve.mockResolvedValue([{ documentId: 'd1', filename: 'a.pdf', pageStart: 1, pageEnd: 1, content: 'text', score: 0.9 }]);
    const r = await svc.run(user, 'read_document', { documentId: 'd1', question: 'q' });
    expect(rag.retrieve).toHaveBeenCalledWith('c1', 'f1', 'q', ['d1'], 'u1');
    expect((r.content as any).chunks[0].content).toBe('text');
  });

  it('list_events rejects inaccessible case', async () => {
    const { svc } = build();
    const r = await svc.run(user, 'list_events', { from: '2026-11-01', to: '2026-11-30', caseId: 'nope' });
    expect(r).toEqual({ content: { error: 'not_found' }, cards: [] });
  });

  it('list_events mineOnly filters by assignee or co-assignee', async () => {
    const { svc, prisma } = build();
    await svc.run(user, 'list_events', { from: '2026-11-01', to: '2026-11-30', mineOnly: true });
    const where = prisma.calendarEvent.findMany.mock.calls[0][0].where;
    expect(where.case).toEqual(caseFilter);
    expect(where.OR).toEqual([{ assigneeId: 'u1' }, { assignees: { some: { userId: 'u1' } } }]);
  });

  it('unknown tool returns error content', async () => {
    const { svc } = build();
    expect((await svc.run(user, 'drop_tables', {})).content).toHaveProperty('error');
  });

  it('redacts content (phone number in participant name)', async () => {
    const { svc, brief } = build();
    brief.getCaseBrief.mockResolvedValue({ kind: 'case', id: 'c1', title: 'คดี', ourParties: ['สมชาย 081-234-5678'] });
    const r = await svc.run(user, 'case_overview', { caseId: 'c1' });
    expect(JSON.stringify(r.content)).not.toContain('081-234-5678');
    expect((r.content as any).id).toBe('c1');
  });

  it('redaction leaves record ids intact (uuid hyphens look like a phone number)', async () => {
    const { svc, brief } = build();
    const id = '5b053993-059d-4627-b506-ae90bcc6a513';
    brief.getCaseBrief.mockResolvedValue({
      kind: 'case', id, title: 'คดี', ourParties: ['สมชาย 081-234-5678'],
      openTasks: [{ id, title: 'งาน', status: 'TODO' }], nextEvent: { id, title: 'นัด' },
    });
    const r = (await svc.run(user, 'case_overview', { caseId: id })).content as any;
    expect(r.id).toBe(id);
    expect(r.openTasks[0].id).toBe(id);
    expect(r.nextEvent.id).toBe(id);
    expect(JSON.stringify(r)).not.toContain('081-234-5678');
  });

  it('find_matters skips intakes already converted to a case', async () => {
    const { svc, prisma } = build();
    await svc.run(user, 'find_matters', { query: 'สมชาย' });
    expect(prisma.intake.findMany.mock.calls[0][0].where.AND).toContainEqual({ case: null });
  });

  it('definitions lists the 5 tools', () => {
    expect(build().svc.definitions().map((d) => d.function.name)).toEqual(
      ['find_matters', 'case_overview', 'search_documents', 'read_document', 'list_events'],
    );
  });
});
