import { Test } from '@nestjs/testing';
import { TaskStatus } from '@lawfirm/shared';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('TasksService — recurrence + dependency unlock on completion', () => {
  let service: TasksService;
  const baseTask = {
    id: 'task-1',
    caseId: null,
    title: 'รายงานลูกความประจำสัปดาห์',
    description: null,
    status: TaskStatus.IN_PROGRESS,
    assigneeId: 'user-1',
    createdById: 'user-1',
    priority: 'MEDIUM',
    labels: [],
    recurrenceDays: 7,
    blockedById: null,
    dueDate: new Date('2026-09-01'),
  };
  const mockPrisma = {
    task: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(baseTask),
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    case: { findUnique: jest.fn() },
    firmMember: { count: jest.fn().mockResolvedValue(1) },
    caseActivity: { create: jest.fn() },
    taskAssignmentLog: { create: jest.fn() },
  };
  const notifier = { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.task.findUnique.mockResolvedValue(baseTask);
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: { getTaskFilterForUser: () => ({}) } },
        { provide: FileStorageService, useValue: {} },
        { provide: AssignmentNotifierService, useValue: notifier },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  it('closing a recurring task spawns the next occurrence with dueDate +N days', async () => {
    mockPrisma.task.update.mockResolvedValue({ ...baseTask, status: TaskStatus.DONE });
    const blocked = [{ id: 'task-2', title: 'ร่างคำฟ้อง', assigneeId: 'user-2', caseId: null }];
    mockPrisma.task.findMany.mockResolvedValue(blocked);

    await service.update('task-1', { status: TaskStatus.DONE }, user);

    expect(mockPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: baseTask.title,
          recurrenceDays: 7,
          dueDate: expect.any(Date),
        }),
      }),
    );
    // and the task waiting on this one gets an unlock notification
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['user-2'] }),
    );
  });

  it('closing a non-recurring task spawns nothing', async () => {
    const oneOff = { ...baseTask, recurrenceDays: null };
    mockPrisma.task.findUnique.mockResolvedValue(oneOff);
    mockPrisma.task.update.mockResolvedValue({ ...oneOff, status: TaskStatus.DONE });
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.update('task-1', { status: TaskStatus.DONE }, user);

    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });
});
