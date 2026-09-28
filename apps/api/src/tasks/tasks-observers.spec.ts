import { Test, TestingModule } from '@nestjs/testing';
import { FirmRole, TaskStatus } from '@lawfirm/shared';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('TasksService - Observers', () => {
  let service: TasksService;
  let prisma: any;
  let notifier: any;

  const mockPrisma = {
    task: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    taskObserver: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    case: { findUnique: jest.fn() },
    caseAssignment: { upsert: jest.fn() },
    firmMember: { findFirst: jest.fn(), count: jest.fn() },
    caseActivity: { create: jest.fn() },
    taskAssignmentLog: { create: jest.fn() },
  };

  const mockCaseAccess = {
    getTaskFilterForUser: jest.fn().mockReturnValue({}),
    getTaskAccessFilterForUser: jest.fn().mockReturnValue({}),
  };

  const mockNotifier = {
    notifyAssigned: jest.fn().mockResolvedValue(undefined),
  };

  const owner = {
    id: 'owner-1',
    firmId: 'firm-1',
    firmRole: FirmRole.OWNER,
  } as any;

  const lawyer1 = {
    id: 'lawyer-1',
    firmId: 'firm-1',
    firmRole: FirmRole.LAWYER,
  } as any;

  const lawyer2 = {
    id: 'lawyer-2',
    firmId: 'firm-1',
    firmRole: FirmRole.LAWYER,
  } as any;

  const outsider = {
    id: 'outsider-1',
    firmId: 'firm-2',
    firmRole: FirmRole.LAWYER,
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.firmMember.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: FileStorageService, useValue: { delete: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
    }).compile();

    service = module.get(TasksService);
    prisma = mockPrisma;
    notifier = mockNotifier;
  });

  describe('create with observers', () => {
    it('rejects non-firm observers', async () => {
      // Test that outsider cannot be added as observer
      mockPrisma.firmMember.findFirst.mockResolvedValue(null); // outsider not in firm

      await expect(
        service.create(owner, null, {
          title: 'Test task',
          observerIds: ['outsider-1'],
        }),
      ).rejects.toThrow();
    });

    it('creates observers for firm members', async () => {
      const taskData = {
        id: 'task-1',
        title: 'Test task',
        createdById: 'owner-1',
        assigneeId: 'lawyer-1',
      };

      mockPrisma.task.create.mockResolvedValue(taskData);
      mockPrisma.task.findUnique.mockResolvedValue(taskData);
      mockPrisma.firmMember.findFirst.mockResolvedValue({ role: FirmRole.LAWYER });

      await service.create(owner, null, {
        title: 'Test task',
        assigneeId: 'lawyer-1',
        observerIds: ['lawyer-2'],
      });

      expect(prisma.taskObserver.createMany).toHaveBeenCalledWith({
        data: [
          {
            taskId: 'task-1',
            userId: 'lawyer-2',
            addedById: 'owner-1',
          },
        ],
      });
    });

    it('notifies observers and assignee on creation, excluding creator', async () => {
      const taskData = {
        id: 'task-1',
        title: 'Test task',
        createdById: 'owner-1',
        assigneeId: 'lawyer-1',
        caseId: null,
        intakeId: null,
      };

      mockPrisma.task.create.mockResolvedValue(taskData);
      mockPrisma.task.findUnique.mockResolvedValue(taskData);
      mockPrisma.firmMember.findFirst.mockResolvedValue({ role: FirmRole.LAWYER });
      mockPrisma.taskObserver.findMany.mockResolvedValue([
        { userId: 'lawyer-2' },
      ]);

      await service.create(owner, null, {
        title: 'Test task',
        assigneeId: 'lawyer-1',
        observerIds: ['lawyer-2'],
      });

      // Should notify assignee and observers, but not creator
      expect(notifier.notifyAssigned).toHaveBeenCalled();
      const callArgs = notifier.notifyAssigned.mock.calls[0][0];
      // Should include both lawyer-1 and lawyer-2
      expect(callArgs.userIds).toContain('lawyer-1');
      expect(callArgs.userIds).toContain('lawyer-2');
      // Should exclude creator (owner-1) and deduplicate
      expect(callArgs.userIds).not.toContain('owner-1');
    });
  });

  describe('access control with observers', () => {
    it('observers can see the task', async () => {
      const task = { id: 'task-1', caseId: null, assigneeId: 'lawyer-1' };
      mockPrisma.task.findUnique.mockResolvedValue(task);
      mockPrisma.task.findFirst.mockResolvedValue(task); // found in firm scope

      // Mock observer status
      mockPrisma.taskObserver.findMany.mockResolvedValue([
        { userId: 'lawyer-2' },
      ]);

      // Observers should have access via the task access filter
      const observer = { id: 'lawyer-2', firmId: 'firm-1' } as any;
      const result = await service.assertAccess('task-1', observer);

      expect(result).toBeDefined();
    });
  });

  describe('update observers', () => {
    it('syncs the observer list, never passes observerIds to Prisma, and notifies only new observers', async () => {
      const task = { id: 'task-1', title: 'ร่างคำฟ้อง', caseId: null, intakeId: null, assigneeId: null, status: TaskStatus.TODO };
      jest.spyOn(service, 'findOne').mockResolvedValue(task as any);
      mockPrisma.firmMember.findFirst.mockResolvedValue({ role: 'LAWYER' });
      mockPrisma.taskObserver.findMany.mockResolvedValue([{ userId: 'lawyer-1' }, { userId: 'gone-1' }]);
      mockPrisma.task.update.mockResolvedValue(task);

      await service.update('task-1', { observerIds: ['lawyer-1', 'lawyer-2'] } as any, owner);

      expect(mockPrisma.taskObserver.deleteMany).toHaveBeenCalledWith({ where: { taskId: 'task-1', userId: { notIn: ['lawyer-1', 'lawyer-2'] } } });
      expect(mockPrisma.taskObserver.createMany.mock.calls[0][0].data).toEqual([{ taskId: 'task-1', userId: 'lawyer-2', addedById: 'owner-1' }]);
      expect(mockPrisma.task.update.mock.calls[0][0].data).not.toHaveProperty('observerIds');
      expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['lawyer-2'] }));
    });
  });
});
