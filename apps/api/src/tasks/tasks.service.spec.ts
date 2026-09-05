import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TasksService on-hold', () => {
  let service: TasksService;
  const mockPrisma = {
    task: { findUnique: jest.fn() },
    taskOnHold: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
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
    it('throws NotFoundException when task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);
      await expect(
        service.startOnHold('missing-task', user, { reason: 'รอลูกความ' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when task is already on hold', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        onHold: { id: 'hold-1', endedAt: null },
      });
      await expect(
        service.startOnHold('task-1', user, { reason: 'รอศาล' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a TaskOnHold row when task exists and is not already on hold', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 'task-1', onHold: null });
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

      const result = await service.startOnHold('task-1', user, {
        reason: 'รอลูกความส่งเอกสาร',
        followerUserId: 'user-1',
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
      mockPrisma.taskOnHold.findUnique.mockResolvedValue(null);
      await expect(service.resumeFromOnHold('task-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the on-hold record is already ended', async () => {
      mockPrisma.taskOnHold.findUnique.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        endedAt: new Date('2026-09-01'),
      });
      await expect(service.resumeFromOnHold('task-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sets endedAt when the on-hold record is active', async () => {
      mockPrisma.taskOnHold.findUnique.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        endedAt: null,
      });
      mockPrisma.taskOnHold.update.mockResolvedValue({
        id: 'hold-1',
        taskId: 'task-1',
        endedAt: new Date('2026-09-05'),
      });

      const result = await service.resumeFromOnHold('task-1');

      expect(mockPrisma.taskOnHold.update).toHaveBeenCalledWith({
        where: { id: 'hold-1' },
        data: { endedAt: expect.any(Date) },
      });
      expect(result.endedAt).not.toBeNull();
    });
  });
});
