import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmRole, TaskPriority } from '@lawfirm/shared';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';

describe('TasksService detail support', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
    case: { findUnique: jest.fn() },
    caseAssignment: { upsert: jest.fn() },
    caseActivity: { create: jest.fn() },
    taskAssignmentLog: { create: jest.fn() },
  };
  const mockCaseAccess = { getTaskFilterForUser: jest.fn().mockReturnValue({}), canAccessCase: jest.fn() };
  const mockStorage = { delete: jest.fn() };
  const lawyer = { id: 'u1', firmId: 'f1', firmRole: FirmRole.LAWYER } as any;
  const senior = { id: 'u5', firmId: 'f1', firmRole: FirmRole.SENIOR_LAWYER } as any;
  const ownerOfOtherFirm = { id: 'u9', firmId: 'f2', firmRole: FirmRole.OWNER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCaseAccess.getTaskFilterForUser.mockReturnValue({});
    mockStorage.delete.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: FileStorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  describe('assertAccess', () => {
    it('404s when the task is missing', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);
      await expect(service.assertAccess('t1', lawyer)).rejects.toThrow(NotFoundException);
    });
    it('allows a standalone task for its assignee', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: null, assigneeId: 'u1', createdById: 'u9' });
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1' });
      await expect(service.assertAccess('t1', lawyer)).resolves.toMatchObject({ id: 't1' });
    });
    it('scopes a standalone task to the caller firm before anything else', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: null, assigneeId: 'u1', createdById: 'u9' });
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1' });
      await service.assertAccess('t1', lawyer);
      expect(mockPrisma.task.findFirst.mock.calls[0][0].where).toMatchObject({
        id: 't1',
        caseId: null,
        OR: [
          { assignee: { firmMembers: { some: { firmId: 'f1' } } } },
          { createdBy: { firmMembers: { some: { firmId: 'f1' } } } },
        ],
      });
    });
    it('forbids a standalone task for a stranger in the same firm', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: null, assigneeId: 'u2', createdById: 'u8' });
      // in-firm, but not on this lawyer's board
      mockPrisma.task.findFirst.mockResolvedValueOnce({ id: 't1' }).mockResolvedValueOnce(null);
      await expect(service.assertAccess('t1', lawyer)).rejects.toThrow(ForbiddenException);
    });
    it('hides another firm standalone task from an OWNER', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: null, assigneeId: 'u2', createdById: 'u8' });
      mockPrisma.task.findFirst.mockResolvedValue(null);
      await expect(service.assertAccess('t1', ownerOfOtherFirm)).rejects.toThrow(NotFoundException);
    });
    it('lets a SENIOR_LAWYER open a lawyer task their board already lists', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: null, assigneeId: 'u2', createdById: 'u2' });
      mockCaseAccess.getTaskFilterForUser.mockReturnValue({
        OR: [{ assigneeId: 'u5' }, { assignee: { firmMembers: { some: { firmId: 'f1', role: FirmRole.LAWYER } } } }],
      });
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1' });
      await expect(service.assertAccess('t1', senior)).resolves.toMatchObject({ id: 't1' });
      expect(mockPrisma.task.findFirst.mock.calls[1][0].where).toMatchObject({ id: 't1', caseId: null });
    });
    it('uses case access for a case task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: 'c1', assigneeId: null, createdById: 'u9' });
      mockCaseAccess.canAccessCase.mockResolvedValue(false);
      await expect(service.assertAccess('t1', lawyer)).rejects.toThrow(ForbiddenException);
      expect(mockCaseAccess.canAccessCase).toHaveBeenCalledWith(lawyer, 'c1');
    });
  });

  describe('board lists', () => {
    it('findMine returns top-level tasks only, with counts', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        {
          id: 't1', priority: TaskPriority.HIGH, labels: ['ศาล'],
          subtasks: [{ status: 'DONE' }, { status: 'TODO' }],
          _count: { attachments: 2, comments: 1 },
        },
      ]);
      const [item] = await service.findMine(lawyer);
      expect(mockPrisma.task.findMany.mock.calls[0][0].where).toMatchObject({ caseId: null, parentId: null });
      expect(item).toMatchObject({ subtaskCount: 2, subtaskDoneCount: 1, attachmentCount: 2, commentCount: 1 });
      expect((item as any).subtasks).toBeUndefined();
      expect((item as any)._count).toBeUndefined();
    });
    it('findByCase filters parentId null too', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      await service.findByCase('c1', lawyer);
      expect(mockPrisma.task.findMany.mock.calls[0][0].where).toMatchObject({ caseId: 'c1', parentId: null });
    });
  });

  describe('labels and priority', () => {
    it('create stores normalized labels and priority', async () => {
      mockPrisma.task.create.mockResolvedValue({ id: 't1' });
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1' });
      await service.create(lawyer, null, { title: 'x', labels: [' a ', 'a'], priority: TaskPriority.LOW } as any);
      expect(mockPrisma.task.create.mock.calls[0][0].data).toMatchObject({ labels: ['a'], priority: TaskPriority.LOW });
    });
    it('update rejects too many labels with 400', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: null, assigneeId: 'u1' });
      const many = Array.from({ length: 11 }, (_, i) => `l${i}`);
      await expect(service.update('t1', { labels: many } as any, lawyer)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update bound to a case', () => {
    it('404s when the task does not belong to the case in the path', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      await expect(service.update('t1', { title: 'x' } as any, lawyer, 'c1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.task.findFirst.mock.calls[0][0].where).toMatchObject({ id: 't1', caseId: 'c1' });
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });
    it('proceeds when the task belongs to the case', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 't1' });
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: 'c1', assigneeId: 'u1' });
      mockPrisma.task.update.mockResolvedValue({ id: 't1' });
      await expect(service.update('t1', { title: 'x' } as any, lawyer, 'c1')).resolves.toMatchObject({
        id: 't1',
      });
    });
  });

  describe('remove', () => {
    const withAttachments = {
      id: 't1',
      attachments: [{ storagePath: 'tasks/t1/a.pdf' }],
      subtasks: [{ attachments: [{ storagePath: 'tasks/s1/b.pdf' }] }],
    };

    it('removes the bytes of the task and its subtasks before deleting the row', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(withAttachments);
      mockPrisma.task.delete.mockResolvedValue({ id: 't1' });
      await expect(service.remove('t1')).resolves.toEqual({ deleted: true });
      expect(mockStorage.delete).toHaveBeenCalledWith('tasks/t1/a.pdf');
      expect(mockStorage.delete).toHaveBeenCalledWith('tasks/s1/b.pdf');
      expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('still deletes the task when storage removal fails', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(withAttachments);
      mockStorage.delete.mockRejectedValue(new Error('s3 down'));
      mockPrisma.task.delete.mockResolvedValue({ id: 't1' });
      await expect(service.remove('t1')).resolves.toEqual({ deleted: true });
      expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('404s for a missing task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);
      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.task.delete).not.toHaveBeenCalled();
    });
  });
});
