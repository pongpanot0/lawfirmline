import { AuthUser, FirmRole } from '@lawfirm/shared';
import { aiWriteDefinitions, AiWriteToolsService, describeAiWrite } from './ai-write-tools.service';

describe('AiWriteToolsService.check — validates and scopes without saving', () => {
  const user = { id: 'u1', firmId: 'f1', firmSlug: 'firm', firmRole: FirmRole.LAWYER } as AuthUser;
  const own = { firmId: 'f1', leadLawyerId: 'u1' };
  let prisma: any, tasks: any, svc: AiWriteToolsService;
  beforeEach(() => {
    prisma = {
      case: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', ownRef: 'SN-14', title: 'ผิดสัญญา' }) },
      task: { findFirst: jest.fn() }, intake: { findFirst: jest.fn(), findUnique: jest.fn() },
    };
    tasks = { create: jest.fn(), update: jest.fn() };
    const access = { getOwnCaseFilterForUser: () => own, getCaseFilterForUser: () => ({ app: true }), getOwnIntakeFilterForUser: () => ({}) };
    svc = new AiWriteToolsService(prisma, access as any, tasks, {} as any, {} as any, { originForSlug: () => 'https://firm.samnuan.com' } as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('returns the parsed args and the case label, saving nothing', async () => {
    const proposal = await svc.check(user, 'create_task', { caseId: 'c1', title: '  เตรียมพยาน ', dueDate: '2026-11-14' });
    expect(proposal).toEqual({ tool: 'create_task', args: { caseId: 'c1', title: 'เตรียมพยาน', dueDate: '2026-11-14' }, labels: { case: 'SN-14 · ผิดสัญญา' } });
    expect(prisma.case.findFirst).toHaveBeenCalledWith({ where: { AND: [own, { id: 'c1' }] }, select: { id: true } });
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('refuses a case outside own work, bad args and a task waiting on review', async () => {
    prisma.case.findFirst.mockResolvedValueOnce(null);
    await expect(svc.check(user, 'add_case_note', { caseId: 'other', text: 'x' })).rejects.toThrow('ไม่พบคดีนี้ในงานของคุณ');
    await expect(svc.check(user, 'log_time', { caseId: 'c1', hours: 99, description: 'x' })).rejects.toThrow('ข้อมูลไม่ครบหรือไม่ถูกต้อง');
    prisma.task.findFirst.mockResolvedValueOnce({ id: 't1', caseId: 'c1', assigneeId: 'u1', requiresReview: true, title: 'ร่างฟ้อง' });
    await expect(svc.check(user, 'complete_task', { taskId: 't1' })).rejects.toThrow('ต้องส่งตรวจ');
  });

  it('a read-only subscription cannot even propose a write', async () => {
    await expect(svc.check({ ...user, subscriptionStatus: 'CANCELED' } as AuthUser, 'create_task', { title: 'x' })).rejects.toThrow('แพ็กเกจ');
  });

  it('labels the task being closed', async () => {
    prisma.task.findFirst.mockResolvedValueOnce({ id: 't1', caseId: null, assigneeId: 'u1', requiresReview: false, title: 'ประชุมทีม' });
    expect((await svc.check(user, 'complete_task', { taskId: 't1' })).labels).toEqual({ task: 'ประชุมทีม' });
  });

  it('run() audits under the channel it ran from', async () => {
    tasks.create.mockImplementation(async (...args: any[]) => ({ id: 't9', audit: args[7]('t9') }));
    const out = await svc.run(user, 'create_task', { title: 'x' }, { auditPrefix: 'line_ai', auditMetadata: { channel: 'line' }, clientName: 'LINE' });
    expect(out.audit).toEqual({ firmId: 'f1', userId: 'u1', action: 'line_ai.create_task', metadata: { channel: 'line', tool: 'create_task', caseId: undefined, entityId: 't9' } });
    expect(tasks.create.mock.calls[0][3]).toBe('MCP'); // TaskSource.MCP = the web's "made by AI" badge
  });
});

describe('aiWriteDefinitions / describeAiWrite', () => {
  it('builds OpenAI function schemas from the MCP zod schemas', () => {
    const [def] = aiWriteDefinitions(['log_time']);
    expect(def.function.name).toBe('log_time');
    expect(def.function.parameters).toMatchObject({ type: 'object', required: expect.arrayContaining(['caseId', 'hours', 'description']) });
    expect(def.function.parameters).not.toHaveProperty('$schema');
  });

  it('spells out what will be saved, in Thai, ending with the confirm hint', () => {
    const text = describeAiWrite({ tool: 'create_task', args: { title: 'เตรียมพยาน', dueDate: '2026-11-14' }, labels: { case: 'SN-14 · ผิดสัญญา' } });
    expect(text).toContain('📝 สร้างงาน');
    expect(text).toContain('ชื่องาน: เตรียมพยาน');
    expect(text).toContain('คดี: SN-14 · ผิดสัญญา');
    expect(text).toMatch(/กำหนดส่ง: 14 พ\.ย\. 2569/);
    expect(text).toMatch(/กด "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก"$/);
    expect(describeAiWrite({ tool: 'propose_court_date', args: { caseId: 'c1', title: 'สืบพยาน', startAt: '2026-12-01T09:30' }, labels: {} })).toMatch(/09:30/);
  });
});

describe('describeAiWrite — SOP and workflow', () => {
  it('lists the workflow steps the person is confirming', () => {
    const text = describeAiWrite({ tool: 'create_workflow', args: { name: 'ฟ้องผิดสัญญา', steps: [{ title: 'ร่างคำฟ้อง', role: 'LAWYER', durationDays: 3, requiresReview: true }, { title: 'ยื่นฟ้อง', role: 'LAWYER', durationDays: 1 }] }, labels: {} });
    expect(text).toContain('1. ร่างคำฟ้อง (3 วันทำการ, ต้องตรวจ)');
    expect(text).toContain('2. ยื่นฟ้อง (1 วันทำการ)');
    expect(describeAiWrite({ tool: 'create_sop', args: { title: 'รับเรื่องใหม่', content: '1. ตรวจเอกสาร' }, labels: {} })).toContain('ชื่อ: รับเรื่องใหม่');
  });
});

describe('describeAiWrite — leave', () => {
  it('names the leave type in Thai', () => {
    expect(describeAiWrite({ tool: 'request_leave', args: { type: 'SICK', startDate: '2026-11-13', endDate: '2026-11-13' }, labels: {} })).toContain('ประเภท: ลาป่วย');
  });
});
