import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { TaskDetailService } from './task-detail.service';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../common/services/file-storage.service';

describe('TaskDetailService', () => {
  let service: TaskDetailService;
  const mockPrisma = {
    task: { findUnique: jest.fn(), create: jest.fn() },
    taskComment: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    taskAttachment: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  };
  const mockTasks = { assertAccess: jest.fn(), findOne: jest.fn() };
  const mockStorage = { put: jest.fn(), delete: jest.fn() };
  const lawyer = { id: 'u1', firmId: 'f1', firmRole: FirmRole.LAWYER } as any;
  const owner = { id: 'u0', firmId: 'f1', firmRole: FirmRole.OWNER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TaskDetailService,
        { provide: TasksService, useValue: mockTasks },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(TaskDetailService);
  });

  it('createSubtask inherits caseId and refuses nesting', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 'p1', caseId: 'c1', parentId: null });
    mockPrisma.task.create.mockResolvedValue({ id: 's1' });
    mockTasks.findOne.mockResolvedValue({ id: 's1' });
    await service.createSubtask('p1', lawyer, { title: 'sub' });
    expect(mockPrisma.task.create.mock.calls[0][0].data).toMatchObject({ parentId: 'p1', caseId: 'c1', createdById: 'u1' });

    mockTasks.assertAccess.mockResolvedValue({ id: 's1', caseId: 'c1', parentId: 'p1' });
    await expect(service.createSubtask('s1', lawyer, { title: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('uploadAttachment rejects disallowed mime types before touching storage', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: null, parentId: null });
    const file = { mimetype: 'application/x-msdownload', size: 10, buffer: Buffer.from('x'), originalname: 'a.exe' } as any;
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

  it('deleteComment allows author and owner, forbids others', async () => {
    mockTasks.assertAccess.mockResolvedValue({ id: 't1', caseId: null, parentId: null });
    mockPrisma.taskComment.findFirst.mockResolvedValue({ id: 'c1', taskId: 't1', authorId: 'u2' });
    await expect(service.deleteComment('t1', 'c1', lawyer)).rejects.toThrow(ForbiddenException);
    await expect(service.deleteComment('t1', 'c1', owner)).resolves.toEqual({ deleted: true });
  });
});
