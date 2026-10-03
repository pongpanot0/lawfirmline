import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { TaskDetailService } from './task-detail.service';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('TaskDetailService', () => {
  let service: TaskDetailService;
  const mockPrisma = {
    auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    task: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    taskComment: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    taskAttachment: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    taskObserver: { findMany: jest.fn().mockResolvedValue([]) },
    workflowRun: { findUnique: jest.fn() },
  };
  const mockTasks = {
    assertAccess: jest.fn(),
    findOne: jest.fn(),
    getParentObserverIds: jest.fn().mockResolvedValue([]),
    notifyViaAssignmentNotifier: jest.fn().mockResolvedValue(undefined),
    create: jest.fn(),
    acknowledge: jest.fn(),
  };
  const mockStorage = { put: jest.fn(), delete: jest.fn() };
  const lawyer = { id: 'u1', firmId: 'f1', firmRole: FirmRole.LAWYER } as any;
  const owner = { id: 'u0', firmId: 'f1', firmRole: FirmRole.OWNER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TaskDetailService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: TasksService, useValue: mockTasks },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockStorage },
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() } },
      ],
    }).compile();
    service = module.get(TaskDetailService);
  });

  it('createSubtask inherits caseId and refuses nesting', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 'p1', caseId: 'c1', parentId: null });
    mockTasks.create.mockResolvedValue({ id: 's1' });
    mockTasks.findOne.mockResolvedValue({ id: 's1' });
    await service.createSubtask('p1', lawyer, { title: 'sub' });
    expect(mockTasks.create).toHaveBeenCalledWith(lawyer, 'c1', expect.objectContaining({ title: 'sub' }), undefined, undefined);
    expect(mockPrisma.task.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { parentId: 'p1' } });

    mockTasks.assertAccess.mockResolvedValue({ id: 's1', caseId: 'c1', parentId: 'p1' });
    await expect(service.createSubtask('s1', lawyer, { title: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('daily progress requires the worker, preserves blockers, and refuses blank progress', async () => {
    mockTasks.assertAccess.mockResolvedValue({ assigneeId: lawyer.id, status: 'IN_PROGRESS' });
    await service.dailyUpdate('t1', lawyer, { completed: ' ถอดแล้ว 2 หน้า ', remaining: 'อีก 3 หน้า', blocker: 'ขาดไฟล์เสียง' });
    expect(mockPrisma.taskComment.create).toHaveBeenCalledWith(expect.objectContaining({ data: { taskId: 't1', authorId: lawyer.id, kind: 'DAILY_UPDATE', body: 'ทำถึงไหน: ถอดแล้ว 2 หน้า\nเหลืออะไร: อีก 3 หน้า\nติดอะไร: ขาดไฟล์เสียง' } }));
    await expect(service.dailyUpdate('t1', owner, { completed: 'x', remaining: 'y' })).rejects.toThrow(ForbiddenException);
    await expect(service.dailyUpdate('t1', lawyer, { completed: ' ', remaining: 'y' })).rejects.toThrow(BadRequestException);
    mockTasks.assertAccess.mockResolvedValue({ assigneeId: lawyer.id, status: 'PENDING_REVIEW' });
    await expect(service.dailyUpdate('t1', lawyer, { completed: 'x', remaining: 'y' })).rejects.toThrow(ForbiddenException);
  });

  it('only the current worker confirms a daily plan, stored as a date without a timezone shift', async () => {
    mockTasks.assertAccess.mockResolvedValue({ assigneeId: lawyer.id, status: 'TODO' });
    mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });
    await service.confirmPlan('t1', lawyer, '2026-09-27');
    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { scheduledFor: new Date('2026-09-27T00:00:00Z'), planConfirmedAt: expect.any(Date) } }));
    await expect(service.confirmPlan('t1', owner, '2026-09-27')).rejects.toThrow(ForbiddenException);
  });

  it('uploadAttachment rejects disallowed mime types before touching storage', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: null, parentId: null });
    const file = { mimetype: 'application/x-msdownload', size: 10, buffer: Buffer.from('x'), originalname: 'a.exe' } as any;
    await expect(service.uploadAttachment('t1', lawyer, file)).rejects.toThrow(BadRequestException);
    expect(mockStorage.put).not.toHaveBeenCalled();
  });

  it('uploadAttachment rejects a file over 30MB before touching storage', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: null, parentId: null });
    const file = {
      mimetype: 'application/pdf',
      size: 30 * 1024 * 1024 + 1,
      buffer: Buffer.from('x'),
      originalname: 'big.pdf',
    } as any;
    await expect(service.uploadAttachment('t1', lawyer, file)).rejects.toThrow(BadRequestException);
    expect(mockStorage.put).not.toHaveBeenCalled();
  });

  it('uploadAttachment stores the file then the row, and removes the file if the row fails', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: null, parentId: null });
    mockStorage.put.mockResolvedValue('tasks/t1/abc.pdf');
    mockPrisma.taskAttachment.create.mockRejectedValue(new Error('db down'));
    const file = { mimetype: 'application/pdf', size: 10, buffer: Buffer.from('x'), originalname: 'a.pdf' } as any;
    await expect(service.uploadAttachment('t1', lawyer, file)).rejects.toThrow('db down');
    expect(mockStorage.delete).toHaveBeenCalledWith('tasks/t1/abc.pdf');
  });

  it('getDetail checks access before querying, and never queries when access is denied', async () => {
    mockTasks.assertAccess.mockRejectedValue(new ForbiddenException('no access'));
    await expect(service.getDetail('t1', lawyer)).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.task.findUnique).not.toHaveBeenCalled();
  });

  it('getDetail throws NotFoundException when the task does not exist', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: 'c1', parentId: null });
    mockPrisma.task.findUnique.mockResolvedValue(null);
    await expect(service.getDetail('t1', lawyer)).rejects.toThrow(NotFoundException);
  });

  it('getDetail returns the row from prisma and includes the expected relations', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: 'c1', parentId: null });
    const row = { id: 't1', title: 'Task' };
    mockPrisma.task.findUnique.mockResolvedValue(row);
    await expect(service.getDetail('t1', lawyer)).resolves.toMatchObject({ ...row, history: [], followUps: [], aiAnalysis: null });
    expect(mockTasks.assertAccess).toHaveBeenCalledWith('t1', lawyer);
    expect(mockPrisma.task.findUnique.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: { id: 't1' },
        include: expect.objectContaining({
          parent: expect.anything(),
          case: expect.anything(),
          subtasks: expect.anything(),
          attachments: expect.anything(),
          comments: expect.anything(),
          assignmentLogs: expect.anything(),
        }),
      }),
    );
  });

  it('getDetail includes workflow data when task has workflowRunId', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: 'c1', parentId: null });
    const row = { id: 't1', title: 'Task', workflowRunId: 'wr1', workflowStep: 1 };
    mockPrisma.task.findUnique.mockResolvedValue(row);
    mockPrisma.workflowRun.findUnique.mockResolvedValue({ id: 'wr1', name: 'Test Workflow' });
    mockPrisma.task.count.mockResolvedValue(3);
    mockPrisma.task.findFirst.mockResolvedValue({ assignee: { id: 'u2', firstName: 'John', lastName: 'Doe' } });
    mockPrisma.taskAttachment.findMany.mockResolvedValue([{ id: 'a1', taskId: 't0', filename: 'test.pdf', size: 1024 }]);
    const result = await service.getDetail('t1', lawyer);
    expect(result.workflow).toMatchObject({
      workflowRun: { id: 'wr1', name: 'Test Workflow' },
      workflowStep: 1,
      stepsTotal: 3,
      previousStepHolder: 'John',
      previousStepAttachments: [{ id: 'a1', taskId: 't0', filename: 'test.pdf', size: 1024 }],
    });
  });

  it('deleteComment allows author and owner, forbids others', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: null, parentId: null });
    mockPrisma.taskComment.findFirst.mockResolvedValue({ id: 'c1', taskId: 't1', authorId: 'u2' });
    await expect(service.deleteComment('t1', 'c1', lawyer)).rejects.toThrow(ForbiddenException);
    await expect(service.deleteComment('t1', 'c1', owner)).resolves.toEqual({ deleted: true });
  });

  it('deleteAttachment allows the uploader and the owner, forbids another lawyer', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: null, parentId: null });
    mockPrisma.taskAttachment.findFirst.mockResolvedValue({
      id: 'a1',
      taskId: 't1',
      storagePath: 'tasks/t1/a.pdf',
      uploadedById: 'u1',
    });

    await expect(service.deleteAttachment('t1', 'a1', lawyer)).resolves.toEqual({ deleted: true });
    expect(mockStorage.delete).toHaveBeenCalledWith('tasks/t1/a.pdf');
    await expect(service.deleteAttachment('t1', 'a1', owner)).resolves.toEqual({ deleted: true });

    const otherLawyer = { id: 'u2', firmId: 'f1', firmRole: FirmRole.LAWYER } as any;
    await expect(service.deleteAttachment('t1', 'a1', otherLawyer)).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.taskAttachment.delete).toHaveBeenCalledTimes(2);
  });
});
