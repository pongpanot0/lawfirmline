import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';

const owner = { id: 'owner', firmId: 'f1', firmRole: 'OWNER' } as any;
const lawyer = { id: 'lawyer-a', firmId: 'f1', firmRole: 'LAWYER' } as any;

const members = [
  { userId: 'owner', role: 'OWNER' },
  { userId: 'senior', role: 'SENIOR_LAWYER' },
  { userId: 'lawyer-a', role: 'LAWYER' },
  { userId: 'lawyer-b', role: 'LAWYER' },
  { userId: 'freelancer', role: 'EXTERNAL' },
];
const steps = [
  { title: 'แปลเอกสาร', role: 'EXTERNAL', durationDays: 2 },
  { title: 'ทำใบเบิกความ', role: 'LAWYER', durationDays: 3 },
  { title: 'เขียนคำฟ้อง', role: 'SENIOR_LAWYER', durationDays: 2, requiresReview: true },
];

function build() {
  const created: any[] = [];
  const tx: any = {
    workflowRun: { create: jest.fn(async ({ data }: any) => ({ id: 'run-1', ...data })) },
    task: {
      create: jest.fn(async ({ data }: any) => { const t = { id: `t${created.length}`, ...data }; created.push(t); return t; }),
      update: jest.fn(async () => ({})),
    },
    taskComment: { create: jest.fn() },
  };
  const prisma: any = {
    case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1', leadLawyerId: 'senior', status: 'OPEN' }) },
    workflowTemplate: { findFirst: jest.fn(), create: jest.fn(async ({ data }: any) => data), update: jest.fn() },
    firmMember: { findMany: jest.fn().mockResolvedValue(members), findFirst: jest.fn().mockResolvedValue({ role: 'LAWYER' }) },
    task: {
      // lawyer-a is busier than lawyer-b
      groupBy: jest.fn().mockResolvedValue([{ assigneeId: 'lawyer-a', _count: { _all: 5 } }, { assigneeId: 'lawyer-b', _count: { _all: 1 } }]),
      findUnique: jest.fn(),
      update: jest.fn((args: any) => args),
    },
    workflowRun: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    taskAssignmentLog: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(tx) : arg)),
  };
  // Business days with no holidays: Monday 2026-10-05 +2 → Wed 07, +5 → Mon 12, +7 → Wed 14.
  const deadlineRules: any = {
    loadHolidays: jest.fn().mockResolvedValue(new Set()),
    computeDueDate: jest.fn((_start: Date, days: number) => ({ 2: '2026-10-07', 5: '2026-10-12', 7: '2026-10-14', 3: '2026-10-08' } as any)[days] ?? '2026-12-31'),
  };
  const notifier: any = { notifyAssigned: jest.fn() };
  const caseAccess: any = { getCaseFilterForUser: jest.fn().mockReturnValue({ firmId: 'f1' }) };
  return { svc: new WorkflowsService(prisma, deadlineRules, notifier, caseAccess), prisma, tx, created, notifier, deadlineRules };
}

describe('WorkflowsService', () => {
  describe('templates', () => {
    it('stores cleaned steps only', async () => {
      const { svc, prisma } = build();
      await svc.createTemplate(owner, { name: 'แปล→เบิกความ→ฟ้อง', steps: [{ ...steps[0], title: '  แปล  ', extra: 'x' } as any] });
      expect(prisma.workflowTemplate.create.mock.calls[0][0].data.steps).toEqual([
        { title: 'แปล', instructions: undefined, role: 'EXTERNAL', durationDays: 2, requiresReview: false },
      ]);
    });

    it.each([
      [[], 'ต้องมี 1-20'],
      [[{ title: '', role: 'LAWYER', durationDays: 1 }], 'ต้องมีชื่อ'],
      [[{ title: 'x', role: 'LAWYER', durationDays: 0 }], 'ระยะเวลา'],
      [[{ title: 'x', role: 'LAWYER', durationDays: 1.5 }], 'ระยะเวลา'],
      [[{ title: 'x', role: 'JUDGE', durationDays: 1 }], 'บทบาท'],
      [[{ title: { evil: true }, role: 'LAWYER', durationDays: 1 }], 'ต้องมีชื่อ'],
    ])('rejects bad steps %#', async (bad, message) => {
      const { svc } = build();
      await expect(svc.createTemplate(owner, { name: 'x', steps: bad as any })).rejects.toThrow(message);
    });
  });

  describe('starting a run', () => {
    it('chains one task per step, in business days, staffed by role and load', async () => {
      const { svc, created, notifier } = build();
      await svc.createWorkflowRun(owner, 'case-1', { name: 'คำให้การพยาน ก.', steps: steps as any });

      expect(created.map((t) => t.assigneeId)).toEqual(['freelancer', 'lawyer-b', 'senior']);
      expect(created.map((t) => t.blockedById)).toEqual([null, 't0', 't1']);
      expect(created.map((t) => t.dueDate.toISOString().slice(0, 10))).toEqual(['2026-10-07', '2026-10-12', '2026-10-14']);
      expect(created.map((t) => t.workflowStep)).toEqual([0, 1, 2]);
      // Review falls to someone other than the step's own holder (lead = senior = assignee here).
      expect(created[2]).toMatchObject({ requiresReview: true, reviewerId: 'owner' });
      // The first holder hears about it even though they were auto-picked; a freelancer links to /work.
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['freelancer'], entityPath: '/work' }));
    });

    it('rejects a chosen person who does not hold the step\'s role (or is from another firm)', async () => {
      const { svc } = build();
      await expect(svc.createWorkflowRun(owner, 'case-1', { name: 'x', steps: steps as any, assignees: ['lawyer-a'] }))
        .rejects.toThrow('ขั้นที่ 1');
      await expect(svc.createWorkflowRun(owner, 'case-1', { name: 'x', steps: steps as any, assignees: [null, 'outsider'] }))
        .rejects.toThrow('ขั้นที่ 2');
    });

    it('refuses a role nobody in the firm holds', async () => {
      const { svc, prisma } = build();
      prisma.firmMember.findMany.mockResolvedValue(members.filter((m) => m.role !== 'EXTERNAL'));
      await expect(svc.createWorkflowRun(owner, 'case-1', { name: 'x', steps: steps as any })).rejects.toThrow('ไม่มีสมาชิกบทบาท EXTERNAL');
    });

    it('needs access to the case', async () => {
      const { svc, prisma } = build();
      prisma.case.findFirst.mockResolvedValue(null);
      await expect(svc.createWorkflowRun(lawyer, 'case-x', { name: 'x', steps: steps as any })).rejects.toThrow(NotFoundException);
    });
  });

  describe('when a step finishes', () => {
    const run = (statuses: string[]) => ({
      id: 'run-1', name: 'คำให้การพยาน ก.', status: 'ACTIVE', firmId: 'f1', caseId: 'case-1', createdById: 'owner',
      case: { leadLawyerId: 'senior' },
      tasks: statuses.map((status, i) => ({ id: `t${i}`, status, workflowStep: i, workflowDurationDays: [2, 3, 2][i] })),
    });

    it('re-plans the remaining steps from the real finish', async () => {
      const { svc, prisma } = build();
      prisma.task.findUnique.mockResolvedValue({ workflowRunId: 'run-1', workflowStep: 0 });
      prisma.workflowRun.findUnique.mockResolvedValue(run(['DONE', 'TODO', 'TODO']));
      await svc.onStepCompleted('t0', 'freelancer');
      const updates = prisma.$transaction.mock.calls[0][0];
      expect(updates.map((u: any) => [u.where.id, u.data.dueDate.toISOString().slice(0, 10)])).toEqual([['t1', '2026-10-08'], ['t2', '2026-10-12']]);
      expect(prisma.workflowRun.update).not.toHaveBeenCalled();
    });

    it('closes the run and tells its creator and the case lead when the last step is done', async () => {
      const { svc, prisma, notifier } = build();
      prisma.task.findUnique.mockResolvedValue({ workflowRunId: 'run-1', workflowStep: 2 });
      prisma.workflowRun.findUnique.mockResolvedValue(run(['DONE', 'DONE', 'DONE']));
      await svc.onStepCompleted('t2', 'senior');
      expect(prisma.workflowRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }));
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['owner', 'senior'], summaryText: expect.stringContaining('คำให้การพยาน ก.') }));
    });

    it('ignores ordinary tasks', async () => {
      const { svc, prisma } = build();
      prisma.task.findUnique.mockResolvedValue({ workflowRunId: null });
      await svc.onStepCompleted('x', 'u');
      expect(prisma.workflowRun.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('sending back', () => {
    const activeRun = {
      id: 'run-1', status: 'ACTIVE', createdById: 'owner', caseId: 'case-1',
      tasks: [
        { id: 't0', workflowStep: 0, assigneeId: 'freelancer', status: 'DONE', workflowDurationDays: 2 },
        { id: 't1', workflowStep: 1, assigneeId: 'lawyer-a', status: 'TODO', workflowDurationDays: 3 },
        { id: 't2', workflowStep: 2, assigneeId: 'senior', status: 'TODO', workflowDurationDays: 2 },
      ],
    };

    it('reopens the target step with the reason and tells its holder', async () => {
      const { svc, prisma, tx, notifier } = build();
      prisma.workflowRun.findFirst.mockResolvedValue(activeRun);
      prisma.case.findFirst.mockResolvedValue({ leadLawyerId: 'senior' });
      prisma.firmMember.findFirst.mockResolvedValue({ role: 'EXTERNAL' });
      await svc.sendBack(lawyer, 'run-1', { toStep: 0, reason: 'แปลชื่อผิด' });
      expect(tx.task.update).toHaveBeenCalledWith({ where: { id: 't0' }, data: { status: 'TODO', completedAt: null } });
      expect(tx.taskComment.create.mock.calls[0][0].data).toMatchObject({ taskId: 't0', body: expect.stringContaining('แปลชื่อผิด') });
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['freelancer'], entityPath: '/work' }));
    });

    it('gives a reviewed step back to the person who did it, not the reviewer', async () => {
      const { svc, prisma, tx, notifier } = build();
      prisma.workflowRun.findFirst.mockResolvedValue({
        ...activeRun,
        tasks: [{ ...activeRun.tasks[0], assigneeId: 'senior' }, ...activeRun.tasks.slice(1)],
      });
      prisma.case.findFirst.mockResolvedValue({ leadLawyerId: 'senior' });
      prisma.taskAssignmentLog.findMany.mockResolvedValue([{ taskId: 't0', fromUserId: 'freelancer' }]);
      await svc.sendBack(owner, 'run-1', { toStep: 0, reason: 'แก้คำแปล' });
      expect(tx.task.update).toHaveBeenCalledWith({ where: { id: 't0' }, data: { status: 'TODO', completedAt: null, assigneeId: 'freelancer' } });
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['freelancer'] }));
    });

    it('only goes backwards', async () => {
      const { svc, prisma } = build();
      prisma.workflowRun.findFirst.mockResolvedValue(activeRun);
      prisma.case.findFirst.mockResolvedValue({ leadLawyerId: 'senior' });
      await expect(svc.sendBack(owner, 'run-1', { toStep: 1, reason: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('is not open to people outside the run', async () => {
      const { svc, prisma } = build();
      prisma.workflowRun.findFirst.mockResolvedValue(activeRun);
      prisma.case.findFirst.mockResolvedValue({ leadLawyerId: 'senior' });
      await expect(svc.sendBack({ id: 'lawyer-b', firmId: 'f1', firmRole: 'LAWYER' } as any, 'run-1', { toStep: 0, reason: 'x' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  it('cancelling keeps every step that holds work and removes only untouched ones', async () => {
    const { svc, prisma } = build();
    prisma.task.deleteMany = jest.fn((args: any) => args);
    prisma.workflowRun.update.mockImplementation((args: any) => args);
    prisma.workflowRun.findFirst.mockResolvedValue({
      id: 'run-1', status: 'ACTIVE', createdById: 'owner', caseId: 'case-1',
      tasks: [
        { id: 'done', status: 'DONE', _count: { attachments: 1, comments: 0 } },
        { id: 'review', status: 'PENDING_REVIEW', _count: { attachments: 1, comments: 0 } },
        { id: 'withFile', status: 'TODO', _count: { attachments: 1, comments: 0 } },
        { id: 'empty', status: 'TODO', _count: { attachments: 0, comments: 0 } },
      ],
    });
    prisma.case.findFirst.mockResolvedValue({ leadLawyerId: 'senior' });
    await expect(svc.cancelRun(owner, 'run-1')).resolves.toEqual({ cancelled: true, removedSteps: 1, keptSteps: 2 });
    expect(prisma.task.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['empty'] } } });
    expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({ runId: 'run-1', caseId: 'case-1' });
  });

  it('cannot cancel a finished run', async () => {
    const { svc, prisma } = build();
    prisma.workflowRun.findFirst.mockResolvedValue({ id: 'run-1', status: 'DONE', createdById: 'owner', caseId: 'case-1', tasks: [] });
    prisma.case.findFirst.mockResolvedValue({ leadLawyerId: 'senior' });
    await expect(svc.cancelRun(owner, 'run-1')).rejects.toThrow('ไม่ได้เดินอยู่');
  });
});
