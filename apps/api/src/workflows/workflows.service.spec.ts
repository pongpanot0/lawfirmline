import { Test } from '@nestjs/testing';
import { WorkflowsService } from './workflows.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { PrismaService } from '../prisma/prisma.module';
import { FirmRole, WorkflowStepDefinition } from '@lawfirm/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  let prisma: PrismaService;
  let deadlineRules: DeadlineRulesService;
  let notifier: AssignmentNotifierService;

  const mockPrisma = {
    workflowTemplate: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    workflowRun: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    task: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn() },
    taskComment: { create: jest.fn() },
    case: { findFirst: jest.fn(), findUnique: jest.fn() },
    firmMember: { findMany: jest.fn(), findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockDeadlineRules = {
    computeDueDate: jest.fn().mockReturnValue('2026-10-10'),
    loadHolidays: jest.fn().mockResolvedValue(new Set()),
  };

  const mockNotifier = {
    notifyAssigned: jest.fn(),
  };

  const mockUser = {
    id: 'user1',
    firmId: 'firm1',
    firmRole: FirmRole.OWNER,
    email: 'user1@example.com',
    firstName: 'John',
    lastName: 'Doe',
    firmSlug: 'firm1',
    lineUserId: null,
  } as any;

  const mockCase = {
    id: 'case1',
    ownRef: 'CASE-001',
    title: 'Test Case',
    leadId: 'user2',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DeadlineRulesService, useValue: mockDeadlineRules },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
    }).compile();

    service = module.get(WorkflowsService);
    prisma = module.get(PrismaService);
    deadlineRules = module.get(DeadlineRulesService);
    notifier = module.get(AssignmentNotifierService);
  });

  describe('createTemplate', () => {
    it('should create a workflow template', async () => {
      const steps: WorkflowStepDefinition[] = [
        { title: 'Step 1', role: FirmRole.LAWYER, durationDays: 2 },
      ];
      const dto = { name: 'Template 1', steps };
      const expected = { id: 'tmpl1', ...dto, createdById: mockUser.id };

      jest.spyOn(mockPrisma.workflowTemplate, 'create').mockResolvedValue(expected);

      const result = await service.createTemplate(mockUser, dto);

      expect(result).toEqual(expected);
      expect(mockPrisma.workflowTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ firmId: mockUser.firmId }) }),
      );
    });

    it('should reject > 20 steps', async () => {
      const steps = Array(21).fill({ title: 'Step', role: FirmRole.LAWYER, durationDays: 1 });
      const dto = { name: 'Template', steps: steps as WorkflowStepDefinition[] };

      await expect(service.createTemplate(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('should reject missing step title', async () => {
      const steps = [{ title: '', role: FirmRole.LAWYER, durationDays: 2 }] as WorkflowStepDefinition[];
      const dto = { name: 'Template', steps };

      await expect(service.createTemplate(mockUser, dto)).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid durationDays', async () => {
      const steps = [{ title: 'Step', role: FirmRole.LAWYER, durationDays: 0 }] as WorkflowStepDefinition[];
      const dto = { name: 'Template', steps };

      await expect(service.createTemplate(mockUser, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAssigneesByRole', () => {
    it('should return assignees sorted by open task count', async () => {
      const members = [
        { userId: 'u1', user: { id: 'u1', name: 'Alice' } },
        { userId: 'u2', user: { id: 'u2', name: 'Bob' } },
      ];
      jest.spyOn(mockPrisma.firmMember, 'findMany').mockResolvedValue(members);
      jest.spyOn(mockPrisma.task, 'count').mockResolvedValueOnce(5).mockResolvedValueOnce(2);

      const result = await service.getAssigneesByRole(mockUser, FirmRole.LAWYER);

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe('u2'); // Bob has 2 tasks (lower)
      expect(result[1].userId).toBe('u1'); // Alice has 5 tasks
    });
  });

  describe('createWorkflowRun', () => {
    it('should create run with tasks and notify assignee', async () => {
      const steps: WorkflowStepDefinition[] = [
        { title: 'Translate', role: FirmRole.LAWYER, durationDays: 2 },
        { title: 'Review', role: FirmRole.SENIOR_LAWYER, durationDays: 1 },
      ];
      const dto = {
        name: 'Run 1',
        steps,
        record: { 0: 'u1', 1: 'u2' },
      };

      const mockRun = { id: 'run1', ...dto, firmId: mockUser.firmId, caseId: mockCase.id };

      jest.spyOn(mockPrisma.case, 'findFirst').mockResolvedValue(mockCase);
      jest.spyOn(mockPrisma.firmMember, 'findFirst').mockResolvedValue({ role: FirmRole.LAWYER, userId: 'u1' });
      jest.spyOn(mockPrisma, '$transaction').mockImplementation(async (cb) => {
        const mockTx = {
          workflowRun: { create: jest.fn().mockResolvedValue(mockRun) },
          task: { create: jest.fn().mockResolvedValue({ id: 'task1' }) },
          firmMember: { findFirst: jest.fn().mockResolvedValue({ role: FirmRole.LAWYER }) },
        };
        return cb(mockTx);
      });

      const result = await service.createWorkflowRun(mockUser, mockCase.id, dto);

      expect(result.id).toBe('run1');
      expect(mockNotifier.notifyAssigned).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('should reject cross-firm assignee', async () => {
      const steps = [{ title: 'Step', role: FirmRole.LAWYER, durationDays: 2 }] as WorkflowStepDefinition[];
      const dto = { name: 'Run', steps, record: { 0: 'other_user' } };

      jest.spyOn(mockPrisma.case, 'findFirst').mockResolvedValue(mockCase);
      jest.spyOn(mockPrisma.firmMember, 'findFirst').mockResolvedValue(null);

      await expect(service.createWorkflowRun(mockUser, mockCase.id, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendBack', () => {
    it('should reopen target step and notify assignee', async () => {
      const mockRun = {
        id: 'run1',
        createdById: mockUser.id,
        caseId: mockCase.id,
        tasks: [
          { id: 'task1', workflowStep: 0, status: 'DONE', assigneeId: 'u1' },
          { id: 'task2', workflowStep: 1, status: 'IN_PROGRESS', assigneeId: 'u2' },
        ],
      };
      const dto = { toStep: 0, reason: 'Need revision' };

      jest.spyOn(mockPrisma.workflowRun, 'findFirst').mockResolvedValue(mockRun);
      jest.spyOn(mockPrisma.case, 'findFirst').mockResolvedValue(mockCase);
      jest.spyOn(mockPrisma.firmMember, 'findFirst').mockResolvedValue({ role: FirmRole.LAWYER });
      jest.spyOn(mockPrisma, '$transaction').mockResolvedValue(undefined);

      const result = await service.sendBack(mockUser, mockRun.id, dto);

      expect(result.sentBack).toBe(true);
      expect(mockNotifier.notifyAssigned).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('cancelRun', () => {
    it('should delete undone tasks and mark run cancelled', async () => {
      const mockRun = {
        id: 'run1',
        createdById: mockUser.id,
        caseId: mockCase.id,
        tasks: [
          { id: 'task1', status: 'IN_PROGRESS' },
          { id: 'task2', status: 'DONE' },
        ],
      };

      jest.spyOn(mockPrisma.workflowRun, 'findFirst').mockResolvedValue(mockRun);
      jest.spyOn(mockPrisma.case, 'findFirst').mockResolvedValue(mockCase);
      jest.spyOn(mockPrisma, '$transaction').mockResolvedValue(undefined);

      const result = await service.cancelRun(mockUser, mockRun.id);

      expect(result.cancelled).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });
});
