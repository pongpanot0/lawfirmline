import { NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@lawfirm/shared';
import { DailyBriefService } from './daily-brief.service';
import type { StuckTaskRow } from './stuck';

const row = (o: Partial<StuckTaskRow>): StuckTaskRow => ({
  taskId: 't', title: 'งาน', status: 'IN_PROGRESS', caseId: 'c1', intakeId: null, matterTitle: 'คดี A',
  assigneeId: 'a1', assigneeName: 'สมชาย', dueDate: null, daysStuck: 0, daysOverdue: 0,
  holdReason: null, holdFollowUpOverdue: false, hearingWithin7Days: false, ...o,
});

describe('DailyBriefService', () => {
  const now = new Date('2026-10-31T00:30:00Z'); // 07:30 Bangkok
  let fetchSpy: jest.SpyInstance;
  const aiOk = { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'สรุป' } }], usage: { prompt_tokens: 5, completion_tokens: 3 } }) } as any;

  function build(env: Record<string, string> = {}, slaConfig: unknown = null, rows: StuckTaskRow[] = []) {
    const prisma = {
      firm: {
        findMany: jest.fn().mockResolvedValue([{ id: 'f1' }]),
        findUnique: jest.fn().mockResolvedValue({ slaConfig }),
      },
      dailyBrief: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue({ date: '2026-10-31', summary: 's', data: {}, createdAt: new Date() }),
        findMany: jest.fn().mockResolvedValue([{ date: '2026-10-31' }]),
      },
      case: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const briefs = { loadOpenTaskRows: jest.fn().mockResolvedValue(rows) };
    const notifier = { notifyFirmOwners: jest.fn().mockResolvedValue(undefined) };
    const rag = { logRun: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn((k: string) => (k === 'OPENAI_API_KEY' ? 'sk-test' : env[k])) };
    const svc = new DailyBriefService(prisma as never, config as never, briefs as never, notifier as never, rag as never);
    return { svc, prisma, briefs, notifier, rag };
  }
  const saved = (p: ReturnType<typeof build>['prisma']) => p.dailyBrief.create.mock.calls[0][0].data;

  beforeEach(() => { fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue(aiOk); });
  afterEach(() => fetchSpy.mockRestore());

  it('runAll only processes firms in AI_DAILY_BRIEF_FIRM_SLUGS', async () => {
    const { svc, prisma } = build({ AI_DAILY_BRIEF_FIRM_SLUGS: 'thesiambarristers, other' });
    await svc.runAll(now);
    expect(prisma.firm.findMany.mock.calls[0][0].where.slug.in).toEqual(['thesiambarristers', 'other']);
    expect(prisma.dailyBrief.create).toHaveBeenCalledTimes(1);
  });

  it('runAll does nothing when the env is empty', async () => {
    const { svc, prisma } = build();
    await svc.runAll(now);
    expect(prisma.firm.findMany).not.toHaveBeenCalled();
  });

  it('returns exists and does not notify when the row for today exists', async () => {
    const { svc, prisma, notifier } = build();
    prisma.dailyBrief.findUnique.mockResolvedValue({ id: 'x' });
    expect(await svc.generateForFirm('f1', now)).toBe('exists');
    expect(prisma.dailyBrief.findUnique.mock.calls[0][0].where).toEqual({ firmId_date: { firmId: 'f1', date: '2026-10-31' } });
    expect(notifier.notifyFirmOwners).not.toHaveBeenCalled();
  });

  it('treats a unique violation on create as exists', async () => {
    const { svc, prisma, notifier } = build();
    prisma.dailyBrief.create.mockRejectedValue({ code: 'P2002' });
    expect(await svc.generateForFirm('f1', now)).toBe('exists');
    expect(notifier.notifyFirmOwners).not.toHaveBeenCalled();
  });

  it('loads firm-scoped open tasks and respects the firm threshold (default 3)', async () => {
    const rows = [row({ taskId: 'a', daysStuck: 4 })];
    const d = build({}, null, rows);
    await d.svc.generateForFirm('f1', now);
    expect(d.briefs.loadOpenTaskRows).toHaveBeenCalledWith(
      { status: { not: 'DONE' }, OR: [{ case: { firmId: 'f1', deletedAt: null } }, { intake: { firmId: 'f1' } }] }, now);
    expect(saved(d.prisma).data.totals.stuckTasks).toBe(1);
    expect(saved(d.prisma).data.stuckTaskDays).toBe(3);

    const e = build({}, { stuckTaskDays: 5 }, rows);
    await e.svc.generateForFirm('f1', now);
    expect(saved(e.prisma).data.totals.stuckTasks).toBe(0);
    expect(saved(e.prisma).data.stuckTaskDays).toBe(5);
  });

  it('groups by assignee, worst first, unassigned last-named', async () => {
    const d = build({}, null, [
      row({ taskId: '1', assigneeId: 'a1', assigneeName: 'สมชาย', daysStuck: 4 }),
      row({ taskId: '2', assigneeId: null, assigneeName: null, daysOverdue: 9 }),
      row({ taskId: '3', assigneeId: 'a1', assigneeName: 'สมชาย', daysStuck: 6 }),
    ]);
    await d.svc.generateForFirm('f1', now);
    const data = saved(d.prisma).data;
    expect(data.groups.map((g: any) => g.assigneeName)).toEqual(['ยังไม่มีผู้รับผิดชอบ', 'สมชาย']);
    expect(data.groups[1].items.map((i: any) => i.id)).toEqual(['3', '1']);
    expect(data.totals).toEqual({ stuckTasks: 3, overdueTasks: 1, people: 2 });
  });

  it('includes stuck cases past stuckStatusDays', async () => {
    const d = build({}, { stuckStatusDays: 10 });
    d.prisma.case.findMany.mockResolvedValue([
      { id: 'c1', title: 'คดี A', stage: 'FIRST_INSTANCE', openedAt: new Date('2026-09-01T00:00:00Z'), statusLogs: [{ createdAt: new Date('2026-10-01T00:00:00Z') }] },
    ]);
    await d.svc.generateForFirm('f1', now);
    expect(d.prisma.case.findMany.mock.calls[0][0].where.statusLogs).toEqual({ none: { createdAt: { gte: new Date('2026-10-21T00:30:00Z') } } });
    expect(saved(d.prisma).data.stuckCases).toEqual([{ caseId: 'c1', title: 'คดี A', stage: 'FIRST_INSTANCE', daysSinceStageChange: 30 }]);
  });

  it('stuck cases exclude deleted and archived cases', async () => {
    const d = build({}, null, [row({ daysStuck: 5 })]);
    await d.svc.generateForFirm('f1', now);
    expect(d.prisma.case.findMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null, status: { notIn: ['CLOSED', 'ARCHIVED'] } });
  });

  it('the AI headline call carries a timeout signal', async () => {
    const d = build({}, null, [row({ daysStuck: 5 })]);
    await d.svc.generateForFirm('f1', now);
    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('sends computed brief when AI fails', async () => {
    fetchSpy.mockRejectedValue(new Error('down'));
    const d = build({}, null, [row({ daysStuck: 5 })]);
    expect(await d.svc.generateForFirm('f1', now)).toBe('created');
    expect(saved(d.prisma).summary).toBeNull();
    expect(d.notifier.notifyFirmOwners).toHaveBeenCalledWith(expect.objectContaining({
      firmId: 'f1', actorUserId: '', category: 'DAILY_BRIEF', entityPath: '/brief', appPath: '/brief', roles: ['OWNER', 'OFFICE_MANAGER'],
    }));
  });

  it('AI input is redacted, only counts, names and titles', async () => {
    const d = build({}, null, [row({ daysStuck: 5, title: 'โทรหา 081-234-5678', matterTitle: 'a@b.com' })]);
    await d.svc.generateForFirm('f1', now);
    const body = fetchSpy.mock.calls[0][1].body as string;
    expect(body).not.toContain('081-234-5678');
    expect(body).not.toContain('a@b.com');
    expect(body).toContain('[เบอร์โทร]');
    expect(d.rag.logRun).toHaveBeenCalledWith(expect.objectContaining({ operation: 'daily_brief', firmId: 'f1', status: 'success' }));
    expect(saved(d.prisma).summary).toBe('สรุป');
  });

  it("get scopes the query by the user's firm and 404s when none", async () => {
    const { svc, prisma } = build();
    const u = { firmId: 'f1' } as AuthUser;
    await svc.get(u, '2026-10-30');
    expect(prisma.dailyBrief.findFirst.mock.calls[0][0].where).toEqual({ firmId: 'f1', date: '2026-10-30' });
    prisma.dailyBrief.findFirst.mockResolvedValue(null);
    await expect(svc.get(u)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dailyBrief.findFirst.mock.calls[1][0].where).toEqual({ firmId: 'f1' });
    await svc.listDates(u);
    expect(prisma.dailyBrief.findMany.mock.calls[0][0]).toMatchObject({ where: { firmId: 'f1' }, take: 30 });
  });
});
