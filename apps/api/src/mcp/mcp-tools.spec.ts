import { AuthUser, FirmRole } from '@lawfirm/shared';
import { McpToolsService } from './mcp-tools.service';

const tools = new Map<string, { config: { inputSchema: Record<string, unknown> }; run: (args: unknown) => Promise<any> }>();
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({ McpServer: class {
  registerTool(name: string, config: any, run: any) { tools.set(name, { config, run }); }
} }));

const user = { id: 'user-1', firmId: 'firm-1', firmSlug: 'firm', firmRole: FirmRole.LAWYER } as AuthUser;
const connection = { id: 'connection', clientName: 'Claude' };
const own = { firmId: 'firm-1', leadLawyerId: 'user-1' };
const appFilter = { firmId: 'firm-1', app: true };
const radar = { start: '2026-11-12', days: ['2026-11-12'], members: [
  { userId: 'u-a', firstName: 'A', lastName: 'One', role: 'LAWYER', openCount: 6, openPoints: 12, overdueCount: 1, reviewCount: 0, unscheduledCount: 0, days: [{ date: '2026-11-12', taskCount: 2, points: 4, eventCount: 1, courtCount: 1, onLeave: false, outlookBusyMinutes: 90 }] },
  { userId: 'u-b', firstName: 'B', lastName: 'Two', role: 'LAWYER', openCount: 1, openPoints: 2, overdueCount: 0, reviewCount: 0, unscheduledCount: 0, days: [{ date: '2026-11-12', taskCount: 0, points: 0, eventCount: 0, courtCount: 0, onLeave: true, outlookBusyMinutes: 0 }] },
] };
const decode = (r: any) => JSON.parse(r.content[0].text);

describe('MCP tools', () => {
  let prisma: any, secretary: any, tasks: any, comments: any, billing: any, operations: any;
  const make = (who: AuthUser) => { tools.clear(); new McpToolsService(prisma, secretary, { getOwnCaseFilterForUser: () => own, getCaseFilterForUser: () => appFilter } as any, tasks, comments, billing, { originForSlug: () => 'https://firm.samnuan.com' } as any, operations).createServer(who, connection); };
  beforeEach(() => {
    tools.clear();
    prisma = { case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) }, task: { findFirst: jest.fn() }, auditLog: { create: jest.fn() }, documentDateSuggestion: { create: jest.fn().mockResolvedValue({ id: 'suggestion' }) } };
    prisma.$transaction = (fn: any) => fn(prisma);
    secretary = { definitions: jest.fn().mockReturnValue([{ function: { name: 'lawyer_licenses', description: 'Own licenses' } }]), run: jest.fn().mockResolvedValue({ content: {}, cards: [] }) };
    tasks = { create: jest.fn(async (...args: any[]) => { await prisma.auditLog.create({ data: args[7]('task-1') }); return { id: 'task-1', source: 'MCP' }; }), update: jest.fn().mockResolvedValue({ id: 'task-1' }) };
    comments = { createComment: jest.fn(async (...args: any[]) => { await prisma.auditLog.create({ data: args[4].audit('comment') }); return { id: 'comment', viaAi: true }; }) };
    billing = { createAiExpenseDraft: jest.fn(async (...args: any[]) => { await prisma.auditLog.create({ data: args[2]('expense-1') }); return { id: 'expense-1', status: 'DRAFT', viaAi: true }; }), createTimeEntry: jest.fn(async (...args: any[]) => { await prisma.auditLog.create({ data: args[3].audit('time') }); return { id: 'time', viaAi: true }; }) };
    operations = { radar: jest.fn().mockResolvedValue(radar) };
    make(user);
  });
  it('registers only capability-filtered reads and always runs licenses in own scope', async () => {
    expect(tools.has('receivables')).toBe(false);
    expect(tools.has('petty_cash_balance')).toBe(false);
    await tools.get('lawyer_licenses')!.run({});
    expect(secretary.run).toHaveBeenCalledWith(user, 'lawyer_licenses', {}, 'own');
  });
  it('refuses a case outside own work for a LAWYER', async () => {
    prisma.case.findFirst.mockResolvedValue(null);
    const result = await tools.get('create_task')!.run({ caseId: 'other', title: 'Task' });
    expect(decode(result).error).toBe('ไม่พบคดีนี้ในงานของคุณ');
    expect(prisma.case.findFirst).toHaveBeenCalledWith({ where: { AND: [own, { id: 'other' }] }, select: { id: true } });
    expect(tasks.create).not.toHaveBeenCalled();
  });
  it.each([[FirmRole.OWNER, 'app'], [FirmRole.SENIOR_LAWYER, 'app'], [FirmRole.OFFICE_MANAGER, 'own'], [FirmRole.LAWYER, 'own'], [FirmRole.ASSISTANT, 'own']])('%s reads and writes with %s scope', async (firmRole, scope) => {
    const who = { ...user, firmRole } as AuthUser;
    make(who);
    await tools.get('lawyer_licenses')!.run({});
    expect(secretary.run).toHaveBeenLastCalledWith(who, 'lawyer_licenses', {}, scope);
    await tools.get('add_case_note')!.run({ caseId: 'case-1', text: 'x' });
    expect(prisma.case.findFirst).toHaveBeenLastCalledWith({ where: { AND: [scope === 'app' ? appFilter : own, { id: 'case-1' }] }, select: { id: true } });
  });
  it.each([[FirmRole.OWNER, true], [FirmRole.OFFICE_MANAGER, true], [FirmRole.SENIOR_LAWYER, false], [FirmRole.LAWYER, false]])('team_workload for %s registered=%s', (firmRole, registered) => {
    make({ ...user, firmRole } as AuthUser);
    expect(tools.has('team_workload')).toBe(registered);
  });
  it('team_workload returns counts and status only — no user ids, case or task content', async () => {
    make({ ...user, firmRole: FirmRole.OWNER } as AuthUser);
    const out = decode(await tools.get('team_workload')!.run({ from: '2026-11-12' }));
    expect(out.members[0].days[0].outlookBusyMinutes).toBe(90);
    expect(JSON.stringify(out)).not.toMatch(/subject|location|webLink/);
    expect(operations.radar).toHaveBeenCalledWith(expect.objectContaining({ firmRole: FirmRole.OWNER }), '2026-11-12');
    expect(out.standardPoints).toBe(10);
    expect(out.members.map((m: any) => [m.firstName, m.status, m.loadPercent])).toEqual([['A', 'over_standard', 120], ['B', 'on_leave_this_week', 20]]);
    expect(out.members[1].leaveDays).toEqual(['2026-11-12']);
    expect(JSON.stringify(out)).not.toMatch(/u-a|u-b|caseId|title/);
  });
  it.each([{ assigneeId: 'other', requiresReview: false }, { assigneeId: user.id, requiresReview: true }])('refuses other assignees and review work', async (task) => {
    prisma.task.findFirst.mockResolvedValue({ id: 'task', caseId: 'case-1', ...task });
    expect((await tools.get('complete_task')!.run({ taskId: 'task' })).isError).toBe(true);
    expect(tasks.update).not.toHaveBeenCalled();
  });
  it('passes the atomic own-completion guard to the reused task service', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'task', caseId: 'case-1', assigneeId: user.id, requiresReview: false });
    await tools.get('complete_task')!.run({ taskId: 'task' });
    expect(tasks.update).toHaveBeenCalledWith('task', { status: 'DONE' }, user, 'case-1', true, expect.any(Function));
  });
  it('marks writes and audits identifiers without note text', async () => {
    await tools.get('create_task')!.run({ caseId: 'case-1', title: 'Task' });
    expect(tasks.create).toHaveBeenCalledWith(user, 'case-1', expect.objectContaining({ assigneeId: user.id }), 'MCP', undefined, 0, undefined, expect.any(Function));
    await tools.get('add_case_note')!.run({ caseId: 'case-1', text: 'private note' });
    expect(comments.createComment).toHaveBeenCalledWith(user, 'case-1', 'private note', [], { viaAi: true, audit: expect.any(Function) });
    await tools.get('log_time')!.run({ caseId: 'case-1', hours: 1, description: 'work' });
    expect(billing.createTimeEntry).toHaveBeenCalledWith(user, 'case-1', expect.objectContaining({ hours: 1 }), { viaAi: true, audit: expect.any(Function) });
    expect(prisma.auditLog.create.mock.calls[1][0].data.metadata).toEqual({ connectionId: connection.id, clientName: connection.clientName, tool: 'add_case_note', caseId: 'case-1', entityId: 'comment' });
  });
  it('draft_expense without a case is an office cost; never checks or touches a case', async () => {
    prisma.case.findFirst.mockClear();
    const out = decode(await tools.get('draft_expense')!.run({ amount: 350, description: 'แท็กซี่ไปศาลแพ่ง', category: 'ค่าเดินทาง' }));
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(billing.createAiExpenseDraft).toHaveBeenCalledWith(user, { caseId: null, amount: 350, description: 'แท็กซี่ไปศาลแพ่ง', category: 'ค่าเดินทาง', date: undefined }, expect.any(Function));
    expect(out.status).toBe('DRAFT');
    expect(out.message).toContain('ส่งเบิกในแอป');
    expect(prisma.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: 'mcp.draft_expense' }) });
  });
  it('draft_expense on a case outside the scope is refused', async () => {
    prisma.case.findFirst.mockResolvedValue(null);
    const result = await tools.get('draft_expense')!.run({ caseId: 'other', amount: 100, description: 'x' });
    expect(decode(result).error).toBe('ไม่พบคดีนี้ในงานของคุณ');
    expect(billing.createAiExpenseDraft).not.toHaveBeenCalled();
  });
  it('draft_expense rejects amounts outside money bounds and unknown categories', async () => {
    const { z } = await import('zod');
    const schema = z.object(tools.get('draft_expense')!.config.inputSchema as any);
    expect(schema.safeParse({ amount: 0, description: 'x' }).success).toBe(false);
    expect(schema.safeParse({ amount: 10, description: 'x', category: 'ค่ากาแฟ' }).success).toBe(false);
    expect(schema.safeParse({ amount: 10.5, description: 'x', category: 'ค่าเดินทาง' }).success).toBe(true);
  });
  it('preserves task identifiers and adds the real task query route', async () => {
    const result = decode(await tools.get('create_task')!.run({ caseId: 'case-1', title: 'Task' }));
    expect(result.url).toBe('https://firm.samnuan.com/cases/case-1?task=task-1');
  });
  it('adds task links to a case brief while preserving redacted text and identifiers', async () => {
    secretary.run.mockResolvedValue({ content: { kind: 'case', id: 'case-1', openTasks: [{ id: 'task-2', title: 'Call 0812345678' }] }, cards: [] });
    const result = decode(await tools.get('lawyer_licenses')!.run({}));
    expect(result.content.url).toBe('https://firm.samnuan.com/cases/case-1');
    expect(result.content.openTasks[0].url).toBe('https://firm.samnuan.com/cases/case-1?task=task-2');
    expect(result.content.openTasks[0].title).not.toContain('0812345678');
  });
  it('rejects impossible dates and interprets offset-free court dates in Bangkok', async () => {
    const { z } = await import('zod');
    const schema = z.object(tools.get('propose_court_date')!.config.inputSchema as any);
    expect(schema.safeParse({ caseId: 'case-1', title: 'Hearing', startAt: '2026-02-30T10:00' }).success).toBe(false);
    expect(schema.safeParse({ caseId: 'case-1', title: 'Hearing', startAt: '2026-02-28T25:00' }).success).toBe(false);
    await tools.get('propose_court_date')!.run({ caseId: 'case-1', title: 'Hearing', startAt: '2026-02-28T10:00', courtName: 'ศาล', note: 'note' });
    expect(prisma.documentDateSuggestion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: 'MCP', status: 'PENDING', eventType: 'COURT_DATE', suggestedDate: new Date('2026-02-28T03:00:00Z'), sourceExcerpt: 'ศาล: ศาล\nnote' }) });
  });
});
