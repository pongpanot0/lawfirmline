import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TasksService on-hold', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { findFirst: jest.fn() },
    taskOnHold: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TasksService, { provide: PrismaService, useValue: mockPrisma }],
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
});
