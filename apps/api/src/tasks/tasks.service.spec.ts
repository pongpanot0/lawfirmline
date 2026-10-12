import { Test, TestingModule } from '@nestjs/testing';
import { mockTaskHistoryTransaction } from '../../test/task-history-prisma';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmRole, TaskLogAction, TaskStatus } from '@lawfirm/shared';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('TasksService on-hold', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', recurrenceDays: null }) },
    taskObserver: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    case: { findUnique: jest.fn() },
    caseAssignment: { upsert: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'สมชาย', lastName: 'ใจดี' }) },
    taskAttachment: { count: jest.fn().mockResolvedValue(1) },
    firmMember: { count: jest.fn(), findFirst: jest.fn() },
    caseActivity: { create: jest.fn() },
    taskAssignmentLog: { create: jest.fn(), findFirst: jest.fn() },
    taskOnHold: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const mockCaseAccess = {
    getTaskFilterForUser: jest.fn(),
    getTaskAccessFilterForUser: jest.fn().mockReturnValue({}),
  };
  const notifier = { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: the chosen reviewer belongs to the caller's firm.
    mockTaskHistoryTransaction(mockPrisma);
    mockPrisma.firmMember.count.mockResolvedValue(1);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: FileStorageService, useValue: { delete: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: notifier },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  describe('startOnHold', () => {
    it('throws NotFoundException when task does not exist in the given case', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      await expect(
        service.startOnHold('case-1', 'missing-task', user, { reason: 'รอลูกความ' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: 'missing-task', caseId: 'case-1' },
        include: { onHold: true },
      });
    });

    it('throws BadRequestException when task is already on hold', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        onHold: { id: 'hold-1', endedAt: null },
      });
      await expect(
        service.startOnHold('case-1', 'task-1', user, { reason: 'รอศาล' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a TaskOnHold row when task exists and is not already on hold', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 'task-1', onHold: null });
      mockPrisma.taskOnHold.create.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        reason: 'รอลูกความส่งเอกสาร',
        startedAt: new Date('2026-09-05'),
        endedAt: null,
        followerUserId: 'user-1',
        lastFollowUpAt: null,
        nextFollowUpAt: null,
        notes: null,
      });

      const result = await service.startOnHold('case-1', 'task-1', user, {
        reason: 'รอลูกความส่งเอกสาร',
        followerUserId: 'user-1',
      });

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: 'task-1', caseId: 'case-1' },
        include: { onHold: true },
      });
      expect(mockPrisma.taskOnHold.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          reason: 'รอลูกความส่งเอกสาร',
          followerUserId: 'user-1',
          nextFollowUpAt: undefined,
          createdById: 'user-1',
        },
      });
      expect(result.reason).toBe('รอลูกความส่งเอกสาร');
    });
  });

  describe('resumeFromOnHold', () => {
    it('throws NotFoundException when no active on-hold record exists', async () => {
      mockPrisma.taskOnHold.findFirst.mockResolvedValue(null);
      await expect(service.resumeFromOnHold('case-1', 'task-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.taskOnHold.findFirst).toHaveBeenCalledWith({
        where: { taskId: 'task-1', task: { caseId: 'case-1' } },
      });
    });

    it('throws NotFoundException when the on-hold record is already ended', async () => {
      mockPrisma.taskOnHold.findFirst.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        endedAt: new Date('2026-09-01'),
      });
      await expect(service.resumeFromOnHold('case-1', 'task-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets endedAt when the on-hold record is active', async () => {
      mockPrisma.taskOnHold.findFirst.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        endedAt: null,
      });
      mockPrisma.taskOnHold.update.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        endedAt: new Date('2026-09-05'),
      });

      const result = await service.resumeFromOnHold('case-1', 'task-1');

      expect(mockPrisma.taskOnHold.update).toHaveBeenCalledWith({
        where: { id: 'hold-1' },
        data: { endedAt: expect.any(Date) },
      });
      expect(result.endedAt).not.toBeNull();
    });
  });

  describe('handoff', () => {
    const legalCase = { id: 'case-1', leadLawyerId: 'senior-1', ownRef: 'TSB-1' };
    const working = { id: 'task-1', caseId: 'case-1', title: 'ถอดเทป', assigneeId: 'user-1', reviewerId: null, status: TaskStatus.IN_PROGRESS, requiresAttachment: false };

    beforeEach(() => {
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' });
    });

    it('refuses when the caller would be reviewing their own work', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...working, assigneeId: 'senior-1' });
      await expect(service.handoff('case-1', 'task-1', { id: 'senior-1', firmId: 'firm-1' } as any, { note: 'เสร็จแล้วครับ' }))
        .rejects.toThrow(BadRequestException);
    });

    it('refuses a caller who is not the assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...working, assigneeId: 'other-lawyer' });
      await expect(service.handoff('case-1', 'task-1', user, { note: 'เสร็จแล้วครับ' })).rejects.toThrow(ForbiddenException);
    });

    it('requires a note of at least 5 characters (whitespace does not count)', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(working);
      await expect(service.handoff('case-1', 'task-1', user, { note: '  ok   ' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it('requires an attachment when the task demands one', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...working, requiresAttachment: true });
      mockPrisma.taskAttachment.count.mockResolvedValueOnce(0);
      await expect(service.handoff('case-1', 'task-1', user, { note: 'แนบร่างแล้ว' })).rejects.toThrow('แนบไฟล์');
    });

    it('keeps the worker as assignee, stamps submittedAt, logs and notifies the reviewer with LINE buttons', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(working);

      await service.handoff('case-1', 'task-1', user, { note: 'เสร็จแล้วครับ' });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.PENDING_REVIEW, assigneeId: 'user-1', submittedAt: expect.any(Date), completedAt: null },
      });
      expect(mockPrisma.taskAssignmentLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: TaskLogAction.HANDED_OFF, fromUserId: 'user-1', toUserId: 'senior-1', note: 'เสร็จแล้วครับ' }),
      });
      const call = notifier.notifyAssigned.mock.calls[0][0];
      expect(call.userIds).toEqual(['senior-1']);
      expect(call.summaryText).toContain('เสร็จแล้วครับ');
      expect(call.lineActions('senior-1').map((a: any) => a.data)).toEqual(['task:accept:task-1', 'task:reject:task-1']);
    });

    it('records IN_PROGRESS before PENDING_REVIEW when handed off straight from TODO', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...working, status: TaskStatus.TODO });
      await service.handoff('case-1', 'task-1', user, { note: 'เสร็จแล้วครับ' });
      expect(mockPrisma.task.update.mock.calls.map((c: any[]) => c[0].data.status)).toEqual([TaskStatus.IN_PROGRESS, TaskStatus.PENDING_REVIEW]);
    });
  });

  describe('accept / reject', () => {
    const legalCase = { id: 'case-1', leadLawyerId: 'senior-1' };
    const lead = { id: 'senior-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
    const namedReviewer = { id: 'reviewer-9', firmId: 'firm-1', firmRole: FirmRole.SENIOR_LAWYER } as any;
    const pending = { id: 'task-1', caseId: 'case-1', title: 'ถอดเทป', status: TaskStatus.PENDING_REVIEW, assigneeId: 'user-1', reviewerId: null, createdById: 'user-1' };

    beforeEach(() => {
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' });
    });

    it('a stranger cannot accept', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await expect(service.accept('case-1', 'task-1', { id: 'x', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any)).rejects.toThrow(ForbiddenException);
    });

    it('OFFICE_MANAGER cannot accept or reject a reviewer-less task', async () => {
      const manager = { id: 'om-1', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as any;
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await expect(service.accept('case-1', 'task-1', manager)).rejects.toThrow(ForbiddenException);
      await expect(service.reject('case-1', 'task-1', manager, { reason: 'x' })).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it('the case lead and the OWNER pass the reviewer-less check', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await service.accept('case-1', 'task-1', lead);
      await service.accept('case-1', 'task-1', { id: 'owner-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any);
      expect(mockPrisma.task.update).toHaveBeenCalledTimes(2);
    });

    it('a named reviewer who is not on the case accepts; the lead then cannot', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...pending, reviewerId: 'reviewer-9' });
      await service.accept('case-1', 'task-1', namedReviewer);
      expect(mockPrisma.task.update).toHaveBeenCalledWith({ where: { id: 'task-1' }, data: { status: TaskStatus.DONE, completedAt: expect.any(Date) } });
      await expect(service.accept('case-1', 'task-1', lead)).rejects.toThrow(ForbiddenException);
    });

    it('accept tells the worker', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await service.accept('case-1', 'task-1', lead);
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['user-1'], summaryText: expect.stringContaining('ผ่านการตรวจ') }));
    });

    it('reject requires PENDING_REVIEW', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...pending, status: TaskStatus.TODO });
      await expect(service.reject('case-1', 'task-1', lead, { reason: 'แก้คำผิด' })).rejects.toThrow(BadRequestException);
    });

    it('reject sends the task back to NEEDS_REVISION with the same assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await service.reject('case-1', 'task-1', lead, { reason: 'แก้คำผิด' });
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.NEEDS_REVISION, assigneeId: 'user-1', submittedAt: null, routineCompletedChecks: [] },
      });
      expect(mockPrisma.taskAssignmentLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: TaskLogAction.REJECTED, toUserId: 'user-1', note: 'แก้คำผิด' }),
      });
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['user-1'] }));
    });
  });

  describe('handoffStandalone', () => {
    const todo = { id: 'task-1', caseId: null, firmId: 'firm-1', title: 'ร่างสัญญา', assigneeId: 'user-1', reviewerId: null, status: TaskStatus.IN_PROGRESS, requiresAttachment: false };

    beforeEach(() => {
      mockPrisma.task.findUnique.mockResolvedValue(todo);
      mockPrisma.task.findFirst.mockResolvedValue(todo);
    });

    it('refuses a caller who is not the assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...todo, assigneeId: 'other-user' });
      await expect(service.handoffStandalone('task-1', user, { reviewerId: 'reviewer-1', note: 'ส่งตรวจครับ' })).rejects.toThrow(ForbiddenException);
    });

    it('refuses the caller as their own reviewer', async () => {
      await expect(service.handoffStandalone('task-1', user, { reviewerId: 'user-1', note: 'ส่งตรวจครับ' })).rejects.toThrow(BadRequestException);
    });

    it('refuses a reviewer who is not OWNER/SENIOR_LAWYER in this firm (office manager included)', async () => {
      mockPrisma.firmMember.findFirst.mockResolvedValue({ role: FirmRole.OFFICE_MANAGER });
      await expect(service.handoffStandalone('task-1', user, { reviewerId: 'om-1', note: 'ส่งตรวจครับ' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it('keeps the worker, records the reviewer and notifies them', async () => {
      mockPrisma.firmMember.findFirst.mockResolvedValue({ role: FirmRole.SENIOR_LAWYER });
      await service.handoffStandalone('task-1', user, { reviewerId: 'reviewer-1', note: 'ส่งตรวจครับ' });
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.PENDING_REVIEW, reviewerId: 'reviewer-1', submittedAt: expect.any(Date), completedAt: null },
      });
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['reviewer-1'] }));
    });
  });

  describe('acceptStandalone / rejectStandalone', () => {
    const reviewer = { id: 'reviewer-1', firmId: 'firm-1', firmRole: FirmRole.SENIOR_LAWYER } as any;
    const pending = { id: 'task-1', caseId: null, firmId: 'firm-1', title: 'ร่างสัญญา', assigneeId: 'user-1', reviewerId: 'reviewer-1', status: TaskStatus.PENDING_REVIEW, createdById: 'user-1' };

    beforeEach(() => mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' }));

    it('only the reviewer may accept — not the worker', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await expect(service.acceptStandalone('task-1', user)).rejects.toThrow(ForbiddenException);
    });

    it('the reviewer accepts and the worker is told', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await service.acceptStandalone('task-1', reviewer);
      expect(mockPrisma.task.update).toHaveBeenCalledWith({ where: { id: 'task-1' }, data: { status: TaskStatus.DONE, completedAt: expect.any(Date) } });
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['user-1'] }));
    });

    it('rejectStandalone requires PENDING_REVIEW', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ ...pending, status: TaskStatus.TODO });
      await expect(service.rejectStandalone('task-1', reviewer, { reason: 'แก้คำผิด' })).rejects.toThrow(BadRequestException);
    });

    it('rejectStandalone keeps the worker as assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(pending);
      await service.rejectStandalone('task-1', reviewer, { reason: 'แก้คำผิด' });
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.NEEDS_REVISION, assigneeId: 'user-1', submittedAt: null, routineCompletedChecks: [] },
      });
    });
  });

  describe('findByCase', () => {
    it('merges the role-based task filter into the case task query', async () => {
      mockCaseAccess.getTaskFilterForUser.mockReturnValue({ assigneeId: 'user-1' });
      mockPrisma.task.findMany.mockResolvedValue([]);

      await service.findByCase('case-1', user);

      expect(mockCaseAccess.getTaskFilterForUser).toHaveBeenCalledWith(user);
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { caseId: 'case-1', parentId: null, assigneeId: 'user-1' },
        }),
      );
    });

    it('composes the real SENIOR_LAWYER filter (including the unassigned-task branch) into the query', async () => {
      const realCaseAccess = new CaseAccessService({} as any);
      const seniorUser = { id: 'user-2', firmId: 'firm-1', firmRole: FirmRole.SENIOR_LAWYER } as any;
      const realFilter = realCaseAccess.getTaskFilterForUser(seniorUser);
      mockCaseAccess.getTaskFilterForUser.mockReturnValue(realFilter);
      mockPrisma.task.findMany.mockResolvedValue([]);

      await service.findByCase('case-1', seniorUser);

      expect(realFilter).toEqual({
        AND: [
          {
            OR: [
              { case: { firmId: 'firm-1', deletedAt: null } },
              { caseId: null, OR: [{ firmId: 'firm-1' }, { firmId: null, createdBy: { firmMembers: { some: { firmId: 'firm-1' } } } }] },
            ],
          },
          {
            OR: [
              { assigneeId: 'user-2' },
              {
                assignee: {
                  firmMembers: { some: { firmId: 'firm-1', role: FirmRole.LAWYER } },
                },
              },
              { assigneeId: null },
              { status: { in: ['PENDING_REVIEW', 'DONE'] }, assignmentLogs: { some: { action: 'HANDED_OFF', fromUserId: 'user-2' } } },
            ],
          },
        ],
      });
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { caseId: 'case-1', parentId: null, ...realFilter },
        }),
      );
    });
  });

  describe('findMine', () => {
    it('scopes tasks (standalone and case alike) to the firm and the role-based filter', async () => {
      mockCaseAccess.getTaskFilterForUser.mockReturnValue({ assigneeId: 'user-1' });
      mockPrisma.task.findMany.mockResolvedValue([]);

      await service.findMine(user);

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            parentId: null,
            assignee: { firmMembers: { some: { firmId: 'firm-1' } } },
            assigneeId: 'user-1',
          },
        }),
      );
    });
  });
});

/**
 * A supervisor's day view lists the team's work, so the button that closes a
 * task has to be the thing that is scoped — not the list. Hiding it in the UI
 * is a courtesy; this is what actually stops it.
 */
describe('TasksService.update — who may change a status', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', recurrenceDays: null }) },
    taskObserver: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    case: { findUnique: jest.fn() },
    caseActivity: { create: jest.fn() },
    taskAssignmentLog: { create: jest.fn() },
    firmMember: { count: jest.fn() },
  };
  const mockCaseAccess = {
    getTaskFilterForUser: jest.fn(),
    getTaskAccessFilterForUser: jest.fn().mockReturnValue({}),
  };

  const lawyer = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
  const owner = { id: 'owner-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;
  const legalCase = { id: 'case-1', firmId: 'firm-1', leadLawyerId: 'lead-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.task.update.mockResolvedValue({ id: 'task-1' });
    mockTaskHistoryTransaction(mockPrisma);
    mockPrisma.case.findUnique.mockResolvedValue(legalCase);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: FileStorageService, useValue: { delete: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() } },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  it('refuses to let a lawyer close a colleague’s task', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({
      id: 'task-1',
      caseId: 'case-1',
      assigneeId: 'someone-else',
      title: 'ยื่นคำร้อง',
    });

    await expect(
      service.update('task-1', { status: TaskStatus.DONE }, lawyer),
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });

  it('lets the assignee close their own task', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({
      id: 'task-1',
      caseId: 'case-1',
      assigneeId: 'user-1',
      title: 'ยื่นคำร้อง',
    });

    await service.update('task-1', { status: TaskStatus.DONE }, lawyer);

    expect(mockPrisma.task.update).toHaveBeenCalled();
  });

  it('leaves an unassigned task open to anyone who can reach the case', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({
      id: 'task-1',
      caseId: 'case-1',
      assigneeId: null,
      title: 'ตรวจเอกสาร',
    });

    await service.update('task-1', { status: TaskStatus.DONE }, lawyer);

    expect(mockPrisma.task.update).toHaveBeenCalled();
  });

  it('still lets the owner close it, since they may reassign it anyway', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({
      id: 'task-1',
      caseId: 'case-1',
      assigneeId: 'someone-else',
      title: 'ยื่นคำร้อง',
    });

    await service.update('task-1', { status: TaskStatus.DONE }, owner);

    expect(mockPrisma.task.update).toHaveBeenCalled();
  });

  it('does not gate edits that leave the status alone', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({
      id: 'task-1',
      caseId: 'case-1',
      assigneeId: 'someone-else',
      title: 'ยื่นคำร้อง',
    });

    await service.update('task-1', { title: 'ยื่นคำร้องแก้ไข' }, lawyer);

    expect(mockPrisma.task.update).toHaveBeenCalled();
  });
});

describe('TasksService — OFFICE_MANAGER', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', recurrenceDays: null }) },
    taskObserver: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    case: { findUnique: jest.fn() },
    caseActivity: { create: jest.fn() },
    taskAssignmentLog: { create: jest.fn() },
    firmMember: { count: jest.fn(), findFirst: jest.fn() },
  };
  const mockCaseAccess = {
    getTaskFilterForUser: jest.fn(),
    getTaskAccessFilterForUser: jest.fn().mockReturnValue({}),
  };
  const manager = { id: 'om-1', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.task.update.mockResolvedValue({ id: 'task-1' });
    mockTaskHistoryTransaction(mockPrisma);
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1', firmId: 'firm-1', leadLawyerId: 'lead-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: FileStorageService, useValue: { delete: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() } },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  it('can assign a todo to a LAWYER', async () => {
    mockPrisma.firmMember.findFirst.mockResolvedValue({ role: FirmRole.LAWYER });
    await expect((service as any).assertCanAssignTodo(manager, 'lawyer-1')).resolves.toBeUndefined();
  });

  it('cannot assign a todo to an OWNER', async () => {
    mockPrisma.firmMember.findFirst.mockResolvedValue({ role: FirmRole.OWNER });
    await expect((service as any).assertCanAssignTodo(manager, 'owner-1')).rejects.toThrow(ForbiddenException);
  });

  it('can change the status of a colleague’s task (runs operations)', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1', caseId: 'case-1', assigneeId: 'someone-else', title: 'x' });
    await service.update('task-1', { status: TaskStatus.DONE }, manager);
    expect(mockPrisma.task.update).toHaveBeenCalled();
  });

  it('is never offered as a reviewer', async () => {
    mockPrisma.firmMember.findFirst.mockResolvedValue(null);
    await expect((service as any).validateReview(manager, true, 'om-2')).rejects.toThrow(BadRequestException);
    expect(mockPrisma.firmMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: { in: [FirmRole.OWNER, FirmRole.SENIOR_LAWYER] } }),
      }),
    );
  });

  it('accepts the case lead as reviewer whatever their role, never the assignee', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({ leadLawyerId: 'lead-lawyer' });
    await expect((service as any).validateReview(manager, true, 'lead-lawyer', { caseId: 'case-1', assigneeId: 'a1' })).resolves.toBeUndefined();
    await expect((service as any).validateReview(manager, true, 'a1', { caseId: 'case-1', assigneeId: 'a1' })).rejects.toThrow('คนละคน');
  });
});
