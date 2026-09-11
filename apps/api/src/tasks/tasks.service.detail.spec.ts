import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmRole, TaskPriority } from '@lawfirm/shared';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';

describe('TasksService detail support', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    case: { findUnique: jest.fn() },
    caseAssignment: { upsert: jest.fn() },
    caseActivity: { create: jest.fn() },
    taskAssignmentLog: { create: jest.fn() },
  };
  const mockCaseAccess = { getTaskFilterForUser: jest.fn().mockReturnValue({}), canAccessCase: jest.fn() };
  const lawyer = { id: 'u1', firmId: 'f1', firmRole: FirmRole.LAWYER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCaseAccess.getTaskFilterForUser.mockReturnValue({});
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
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
      await expect(service.assertAccess('t1', lawyer)).resolves.toMatchObject({ id: 't1' });
    });
    it('forbids a standalone task for a stranger', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', caseId: null, assigneeId: 'u2', createdById: 'u9' });
      await expect(service.assertAccess('t1', lawyer)).rejects.toThrow(ForbiddenException);
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
});
