import { FirmRole, type AuthUser } from '@lawfirm/shared';
import { SecretaryToolsService } from './secretary-tools.service';

describe('SecretaryToolsService', () => {
  const user = { id: 'u1', firmId: 'f1', firmRole: FirmRole.OWNER } as AuthUser;
  const lawyer = { id: 'u2', firmId: 'f1', firmRole: FirmRole.LAWYER } as AuthUser;
  const caseFilter = { firmId: 'f1', deletedAt: null };
  const intakeFilter = { firmId: 'f1' };

  function build() {
    const prisma = {
      case: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      intake: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      documentChunk: { count: jest.fn().mockResolvedValue(0) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
      leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
      sop: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      pettyCashFund: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    };
    const collections = { getReceivables: jest.fn().mockResolvedValue({ buckets: {}, rows: [] }) };
    const agenda = { getMyDay: jest.fn() };
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
    const svc = new SecretaryToolsService(prisma as any, access as any, brief as any, rag as any, collections as any, agenda as any, {} as any);
    return { svc, prisma, brief, rag, collections, agenda };
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

  it('definitions gives office managers every tool', () => {
    expect(build().svc.definitions(user).map((d) => d.function.name)).toEqual([
      'find_matters', 'case_overview', 'search_documents', 'read_document', 'list_events',
      'list_leaves', 'search_sops', 'lawyer_licenses', 'receivables', 'petty_cash_balance', 'my_work', 'team_workload',
    ]);
  });

  it('definitions hides finance tools from a lawyer', () => {
    const names = build().svc.definitions(lawyer).map((d) => d.function.name);
    expect(names).toEqual(expect.arrayContaining(['list_leaves', 'search_sops', 'lawyer_licenses']));
    expect(names).not.toContain('receivables');
    expect(names).not.toContain('petty_cash_balance');
  });

  it('refuses a finance tool the lawyer was never offered', async () => {
    const { svc, collections, prisma } = build();
    expect(await svc.run(lawyer, 'receivables', {})).toEqual({ content: { error: 'forbidden' }, cards: [] });
    expect(await svc.run(lawyer, 'petty_cash_balance', {})).toEqual({ content: { error: 'forbidden' }, cards: [] });
    expect(collections.getReceivables).not.toHaveBeenCalled();
    expect(prisma.pettyCashFund.findUnique).not.toHaveBeenCalled();
  });

  it('receivables filters by days overdue, sorts worst first and totals everything', async () => {
    const { svc, collections } = build();
    const row = (n: string, days: number, outstanding: number) => ({ invoiceNumber: n, daysOverdue: days, outstanding, dueAt: null, lastReminderAt: null });
    collections.getReceivables.mockResolvedValue({ buckets: { '0-30': 100 }, rows: [row('A', 10, 100), row('B', 95, 50), row('C', 70, 25)] });
    const r = await svc.run(user, 'receivables', { minDaysOverdue: 60 });
    const c = r.content as { totalOutstanding: number; matchingOutstanding: number; matching: number; invoices: Array<{ invoiceNumber: string }> };
    expect(c.totalOutstanding).toBe(175);
    expect(c.matchingOutstanding).toBe(75);
    expect(c.matching).toBe(2);
    expect(c.invoices.map((i) => i.invoiceNumber)).toEqual(['B', 'C']);
  });

  it('lawyer_licenses limits a non-office member to their own licence', async () => {
    const { svc, prisma } = build();
    await svc.run(lawyer, 'lawyer_licenses', {});
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ id: 'u2', firmMembers: { some: { firmId: 'f1' } } });
    await svc.run(user, 'lawyer_licenses', {});
    expect(prisma.user.findMany.mock.calls[1][0].where.id).toBeUndefined();
  });

  it('list_leaves rejects an over-long range and scopes to the firm', async () => {
    const { svc, prisma } = build();
    expect(await svc.run(lawyer, 'list_leaves', { from: '2026-01-01', to: '2026-06-01' })).toEqual({ content: { error: 'invalid_date_range' }, cards: [] });
    prisma.leaveRequest.findMany.mockResolvedValueOnce([
      { userId: 'u2', type: 'VACATION', status: 'PENDING', startDate: new Date('2026-11-12'), endDate: new Date('2026-11-12'), user: { firstName: 'Me', lastName: 'M' } },
      { userId: 'u9', type: 'SICK', status: 'APPROVED', startDate: new Date('2026-11-12'), endDate: new Date('2026-11-12'), user: { firstName: 'Bob', lastName: 'B' } },
    ]);
    const { content } = await svc.run(lawyer, 'list_leaves', { from: '2026-11-10', to: '2026-11-20' }) as any;
    // Same rule as GET /leaves: own leave in full, others' approved leave without the type.
    expect(prisma.leaveRequest.findMany.mock.calls[0][0].where.AND[0]).toEqual({ firmId: 'f1', OR: [{ userId: 'u2' }, { status: 'APPROVED' }] });
    expect(content.leaves.map((l: any) => l.type)).toEqual(['VACATION', null]);
  });

  it('petty_cash_balance only reads, never creates the fund', async () => {
    const { svc, prisma } = build();
    expect((await svc.run(user, 'petty_cash_balance', {})).content).toEqual({ notSetUp: true });
    expect(prisma.pettyCashFund.upsert).not.toHaveBeenCalled();
  });

  it('my_work summarises the caller\'s my-day view, caps each section and links distinct cases', async () => {
    const { svc, agenda } = build();
    const item = (n: number, caseId: string | null) => ({
      id: `task:${n}`, entityId: `${n}`, kind: 'TASK', title: `งาน ${n}`, at: '2026-11-10T00:00:00.000Z', endAt: null, allDay: true,
      urgency: 'normal', caseId, caseRef: caseId ? `R-${caseId}` : null, caseTitle: caseId ? `คดี ${caseId}` : null,
      location: null, departBy: null, url: '/', assigneeId: 'u2', assigneeName: 'ทนาย ก', assignees: [],
    });
    agenda.getMyDay.mockResolvedValue({
      today: '2026-11-10',
      overdue: Array.from({ length: 20 }, (_, n) => item(n, n % 2 ? 'c1' : null)),
      todayItems: [item(100, 'c2')], tomorrow: [], upcoming: [{ date: '2026-11-12', items: [item(200, 'c1')] }],
      warnings: [{ kind: 'OVERLAP', message: 'นัดชนกัน', itemIds: [] }],
      reviewQueue: [{ id: 't9', title: 'ตรวจคำฟ้อง', caseId: null, caseRef: null, caseTitle: null, workerName: 'ทนาย ข', submittedAt: null, dueDate: '2026-11-11T00:00:00.000Z' }],
    });
    const r = await svc.run(user, 'my_work', {});
    const c = r.content as any;
    expect(agenda.getMyDay).toHaveBeenCalledWith(user);
    expect(c.overdue.total).toBe(20);
    expect(c.overdue.items).toHaveLength(15);
    expect(c.today_items.items[0]).toMatchObject({ id: '100', kind: 'TASK', caseId: 'c2' });
    expect(c.upcoming.items[0].title).toBe('งาน 200');
    expect(c.waitingForMyReview.items[0]).toEqual({ id: 't9', kind: 'TASK', caseId: null, title: 'ตรวจคำฟ้อง', caseRef: null, worker: 'ทนาย ข', dueDate: '2026-11-11' });
    expect(c.warnings).toEqual(['นัดชนกัน']);
    expect(r.cards.map((x) => x.id)).toEqual(['c1', 'c2']);
  });

  describe('team_workload', () => {
    const radar = { start: '2026-11-12', days: ['2026-11-12'], members: [{ userId: 'u-a', firstName: 'A', lastName: 'One', role: 'LAWYER', openCount: 6, openPoints: 12, standardPoints: 10, overdueCount: 0, reviewCount: 0, unscheduledCount: 0, days: [{ date: '2026-11-12', taskCount: 2, points: 4, eventCount: 1, courtCount: 0, onLeave: false, outlookBusyMinutes: 0 }] }] };
    const make = () => {
      const operations = { radar: jest.fn().mockResolvedValue(radar) };
      return { operations, svc: new SecretaryToolsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, operations as any) };
    };
    it('only owners / office managers get it, counts only with no user ids', async () => {
      const { svc, operations } = make();
      expect(svc.definitions({ firmRole: 'LAWYER' } as any).map((d) => d.function.name)).not.toContain('team_workload');
      expect(svc.definitions({ firmRole: 'OWNER' } as any).map((d) => d.function.name)).toContain('team_workload');
      expect((await svc.run({ firmRole: 'LAWYER' } as any, 'team_workload', {})).content).toEqual({ error: 'forbidden' });
      const out = await svc.run({ firmRole: 'OWNER' } as any, 'team_workload', { from: '2026-11-12' });
      expect(operations.radar).toHaveBeenCalledWith(expect.objectContaining({ firmRole: 'OWNER' }), '2026-11-12');
      expect((out.content as any).members[0]).toMatchObject({ status: 'over_standard', loadPercent: 120 });
      expect(JSON.stringify(out.content)).not.toContain('u-a');
      expect((await svc.run({ firmRole: 'OWNER' } as any, 'team_workload', { from: '2026-02-30' })).content).toEqual({ error: 'invalid_date_range' });
    });
  });
});
