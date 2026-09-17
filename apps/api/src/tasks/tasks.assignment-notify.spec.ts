import { Test, TestingModule } from '@nestjs/testing';
import { TaskStatus } from '@lawfirm/shared';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('TasksService assignment notifications', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    case: { findUnique: jest.fn() },
    caseAssignment: { upsert: jest.fn() },
    firmMember: { count: jest.fn(), findFirst: jest.fn() },
    caseActivity: { create: jest.fn() },
    taskAssignmentLog: { create: jest.fn(), findFirst: jest.fn() },
  };
  const mockNotifier = { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: 'OWNER' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.firmMember.count.mockResolvedValue(1);
    mockPrisma.firmMember.findFirst.mockResolvedValue({ role: 'LAWYER' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: { getTaskFilterForUser: jest.fn() } },
        { provide: FileStorageService, useValue: { delete: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  it('notifies the assignee when a todo is created for someone else', async () => {
    const created = { id: 't1', title: 'ทดสอบ', caseId: null };
    mockPrisma.task.create.mockResolvedValue(created);
    mockPrisma.task.findUnique.mockResolvedValue(created);
    await service.create(user, null, { title: 'ทดสอบ', assigneeId: 'u2' } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      userIds: ['u2'],
      actorUserId: 'user-1',
      summaryText: expect.stringContaining('ทดสอบ'),
      entityPath: '/todos',
    });
  });

  it('does not notify on self-assign at create', async () => {
    const created = { id: 't1', title: 'ทดสอบ', caseId: null };
    mockPrisma.task.create.mockResolvedValue(created);
    mockPrisma.task.findUnique.mockResolvedValue(created);
    await service.create(user, null, { title: 'ทดสอบ', assigneeId: 'user-1' } as any);
    expect(mockNotifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it('notifies the new assignee on reassignment', async () => {
    const existing = { id: 't1', title: 'งานเดิม', caseId: 'c1', assigneeId: 'u2' };
    mockPrisma.task.findFirst.mockResolvedValue({ id: 't1' });
    mockPrisma.task.findUnique.mockResolvedValue(existing);
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'c1', leadLawyerId: 'user-1' });
    mockPrisma.task.update.mockResolvedValue({ ...existing, assigneeId: 'u3' });
    await service.update('t1', { assigneeId: 'u3' } as any, user, 'c1');
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      userIds: ['u3'],
      actorUserId: 'user-1',
      summaryText: expect.stringContaining('งานเดิม'),
      entityPath: '/cases/c1',
    });
  });

  it('does not notify when update leaves the assignee unchanged', async () => {
    const existing = { id: 't1', title: 'งานเดิม', caseId: 'c1', assigneeId: 'u2' };
    mockPrisma.task.findFirst.mockResolvedValue({ id: 't1' });
    mockPrisma.task.findUnique.mockResolvedValue(existing);
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'c1', leadLawyerId: 'user-1' });
    mockPrisma.task.update.mockResolvedValue(existing);
    await service.update('t1', { assigneeId: 'u2' } as any, user, 'c1');
    expect(mockNotifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it('notifies the returned-to user on reject (NEEDS_REVISION)', async () => {
    const task = {
      id: 't1',
      title: 'งานตรวจ',
      caseId: 'c1',
      status: TaskStatus.PENDING_REVIEW,
      createdById: 'u2',
    };
    mockPrisma.task.findFirst.mockResolvedValue(task);
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'c1', leadLawyerId: 'user-1' });
    mockPrisma.taskAssignmentLog.findFirst.mockResolvedValue({ fromUserId: 'u2' });
    mockPrisma.task.update.mockResolvedValue({ ...task, status: TaskStatus.NEEDS_REVISION });
    mockPrisma.task.findUnique.mockResolvedValue(task);
    await service.reject('c1', 't1', user, { reason: 'แก้ตัวเลข' } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      userIds: ['u2'],
      actorUserId: 'user-1',
      summaryText: expect.stringContaining('ตีกลับ'),
      entityPath: '/cases/c1',
    });
  });
});
