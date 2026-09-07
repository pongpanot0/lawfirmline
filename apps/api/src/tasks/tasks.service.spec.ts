import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmRole, TaskLogAction, TaskStatus } from '@lawfirm/shared';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';

describe('TasksService on-hold', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    case: { findUnique: jest.fn() },
    caseAssignment: { upsert: jest.fn() },
    caseActivity: { create: jest.fn() },
    taskAssignmentLog: { create: jest.fn(), findFirst: jest.fn() },
    taskOnHold: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const mockCaseAccess = { getTaskFilterForUser: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
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
    const legalCase = { id: 'case-1', leadLawyerId: 'senior-1' };

    it('throws BadRequestException when the caller is already the lead lawyer', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        assigneeId: 'senior-1',
        status: TaskStatus.IN_PROGRESS,
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);

      await expect(
        service.handoff('case-1', 'task-1', { id: 'senior-1' } as any, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when the caller is not the current assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        assigneeId: 'other-lawyer',
        status: TaskStatus.IN_PROGRESS,
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);

      await expect(service.handoff('case-1', 'task-1', user, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('moves the task to PENDING_REVIEW, reassigns to the lead lawyer, and logs the handoff', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        title: 'ถอดเทป',
        assigneeId: 'user-1',
        status: TaskStatus.IN_PROGRESS,
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' });

      await service.handoff('case-1', 'task-1', user, { note: 'เสร็จแล้วครับ' });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.PENDING_REVIEW, assigneeId: 'senior-1' },
      });
      expect(mockPrisma.taskAssignmentLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-1',
          action: TaskLogAction.HANDED_OFF,
          fromUserId: 'user-1',
          toUserId: 'senior-1',
          performedById: 'user-1',
          note: 'เสร็จแล้วครับ',
        }),
      });
      expect(mockPrisma.caseActivity.create).toHaveBeenCalled();
    });
  });

  describe('accept / reject', () => {
    const legalCase = { id: 'case-1', leadLawyerId: 'senior-1' };
    const senior = { id: 'senior-1', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any;
    const stranger = { id: 'stranger-1', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any;

    it('accept throws ForbiddenException for a user who is neither lead lawyer nor owner', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.PENDING_REVIEW,
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);

      await expect(service.accept('case-1', 'task-1', stranger)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('accept sets status to DONE for the lead lawyer', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        title: 'ถอดเทป',
        status: TaskStatus.PENDING_REVIEW,
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' });

      await service.accept('case-1', 'task-1', senior);

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.DONE },
      });
    });

    it('reject requires the task to be PENDING_REVIEW', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.TODO,
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);

      await expect(
        service.reject('case-1', 'task-1', senior, { reason: 'แก้คำผิด' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('reject returns the task to whoever handed it off, with the reason logged', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        title: 'ถอดเทป',
        status: TaskStatus.PENDING_REVIEW,
        createdById: 'user-1',
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);
      mockPrisma.taskAssignmentLog.findFirst.mockResolvedValue({ fromUserId: 'user-1' });
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' });

      await service.reject('case-1', 'task-1', senior, { reason: 'แก้คำผิด' });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.NEEDS_REVISION, assigneeId: 'user-1' },
      });
      expect(mockPrisma.taskAssignmentLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: TaskLogAction.REJECTED,
          toUserId: 'user-1',
          note: 'แก้คำผิด',
        }),
      });
    });
  });

  describe('handoffStandalone', () => {
    it('throws ForbiddenException when the caller is not the current assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        caseId: null,
        assigneeId: 'other-user',
        status: TaskStatus.IN_PROGRESS,
      });

      await expect(
        service.handoffStandalone('task-1', user, { reviewerId: 'reviewer-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when the chosen reviewer is the caller themselves', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        caseId: null,
        assigneeId: 'user-1',
        status: TaskStatus.IN_PROGRESS,
      });

      await expect(
        service.handoffStandalone('task-1', user, { reviewerId: 'user-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('moves the task to PENDING_REVIEW, reassigns to the chosen reviewer, and logs the handoff', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        title: 'ร่างสัญญา',
        caseId: null,
        assigneeId: 'user-1',
        status: TaskStatus.IN_PROGRESS,
      });
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' });

      await service.handoffStandalone('task-1', user, {
        reviewerId: 'reviewer-1',
        note: 'ช่วยตรวจให้หน่อย',
      });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.PENDING_REVIEW, assigneeId: 'reviewer-1' },
      });
      expect(mockPrisma.taskAssignmentLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-1',
          action: TaskLogAction.HANDED_OFF,
          fromUserId: 'user-1',
          toUserId: 'reviewer-1',
          performedById: 'user-1',
          note: 'ช่วยตรวจให้หน่อย',
        }),
      });
    });
  });

  describe('acceptStandalone / rejectStandalone', () => {
    const reviewer = { id: 'reviewer-1', firmId: 'firm-1' } as any;

    it('acceptStandalone throws ForbiddenException for a user who is not the current assignee', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        caseId: null,
        assigneeId: 'reviewer-1',
        status: TaskStatus.PENDING_REVIEW,
      });

      await expect(service.acceptStandalone('task-1', user)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('acceptStandalone sets status to DONE for the chosen reviewer', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        title: 'ร่างสัญญา',
        caseId: null,
        assigneeId: 'reviewer-1',
        status: TaskStatus.PENDING_REVIEW,
      });
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' });

      await service.acceptStandalone('task-1', reviewer);

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.DONE },
      });
    });

    it('rejectStandalone requires the task to be PENDING_REVIEW', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        caseId: null,
        assigneeId: 'reviewer-1',
        status: TaskStatus.TODO,
      });

      await expect(
        service.rejectStandalone('task-1', reviewer, { reason: 'แก้คำผิด' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejectStandalone returns the task to whoever handed it off, with the reason logged', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        title: 'ร่างสัญญา',
        caseId: null,
        assigneeId: 'reviewer-1',
        status: TaskStatus.PENDING_REVIEW,
        createdById: 'user-1',
      });
      mockPrisma.taskAssignmentLog.findFirst.mockResolvedValue({ fromUserId: 'user-1' });
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1' });

      await service.rejectStandalone('task-1', reviewer, { reason: 'แก้คำผิด' });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.NEEDS_REVISION, assigneeId: 'user-1' },
      });
      expect(mockPrisma.taskAssignmentLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: TaskLogAction.REJECTED,
          toUserId: 'user-1',
          note: 'แก้คำผิด',
        }),
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
          where: { caseId: 'case-1', assigneeId: 'user-1' },
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
        OR: [
          { assigneeId: 'user-2' },
          {
            assignee: {
              firmMembers: { some: { firmId: 'firm-1', role: FirmRole.LAWYER } },
            },
          },
          { assigneeId: null },
        ],
      });
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { caseId: 'case-1', ...realFilter },
        }),
      );
    });
  });

  describe('findMine', () => {
    it('scopes standalone tasks to caseId null, the firm, and the role-based filter', async () => {
      mockCaseAccess.getTaskFilterForUser.mockReturnValue({ assigneeId: 'user-1' });
      mockPrisma.task.findMany.mockResolvedValue([]);

      await service.findMine(user);

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            caseId: null,
            assignee: { firmMembers: { some: { firmId: 'firm-1' } } },
            assigneeId: 'user-1',
          },
        }),
      );
    });
  });
});
