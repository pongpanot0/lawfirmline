import { Test } from '@nestjs/testing';
import { ExternalController } from './external.controller';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { TasksService } from '../tasks/tasks.service';
import { FirmRole } from '@lawfirm/shared';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('ExternalController', () => {
  let controller: ExternalController;
  let prisma: PrismaService;
  let fileStorage: FileStorageService;
  let tasksService: TasksService;

  const mockPrisma = {
    task: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    taskAttachment: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    firmMember: { findFirst: jest.fn() },
  };

  const mockFileStorage = {
    getBuffer: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };

  const mockTasksService = {
    completeWorkflowStep: jest.fn(),
  };

  const externalUser = {
    id: 'external1',
    firmId: 'firm1',
    firmRole: FirmRole.EXTERNAL,
    email: 'ext@example.com',
    firstName: 'External',
    lastName: 'User',
    firmSlug: 'firm1',
    lineUserId: null,
  } as any;

  const staffUser = {
    id: 'staff1',
    firmId: 'firm1',
    firmRole: FirmRole.LAWYER,
    email: 'staff@example.com',
    firstName: 'Staff',
    lastName: 'User',
    firmSlug: 'firm1',
    lineUserId: null,
  } as any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ExternalController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockFileStorage },
        { provide: TasksService, useValue: mockTasksService },
      ],
    }).compile();

    controller = module.get(ExternalController);
    prisma = module.get(PrismaService);
    fileStorage = module.get(FileStorageService);
    tasksService = module.get(TasksService);
  });

  describe('getMySteps', () => {
    it('should list only my assigned workflow tasks', async () => {
      const tasks = [
        {
          id: 'task1',
          title: 'Translate',
          description: 'Translate doc',
          status: 'TODO',
          dueDate: new Date('2026-10-15'),
          blockedById: null,
          workflowRunId: 'run1',
          workflowStep: 0,
          attachments: [],
          workflowRun: {
            id: 'run1',
            name: 'Doc Translation',
            case: { ownRef: 'CASE-001' },
            tasks: [],
          },
        },
      ];

      jest.spyOn(mockPrisma.task, 'findMany').mockResolvedValue(tasks);

      const result = await controller.getMySteps(externalUser);

      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe('task1');
      expect(result[0].blocked).toBe(false);
    });

    it('should deny non-external users', async () => {
      await expect(controller.getMySteps(staffUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('downloadFile', () => {
    it('should allow download of file from own task', async () => {
      const attachment = {
        id: 'att1',
        storagePath: 'tasks/t1/file.pdf',
        filename: 'file.pdf',
        mimeType: 'application/pdf',
        task: {
          assigneeId: externalUser.id,
          firmId: externalUser.firmId,
          workflowRunId: null,
          workflowStep: null,
        },
      };

      jest.spyOn(mockPrisma.taskAttachment, 'findUnique').mockResolvedValue(attachment);
      jest.spyOn(mockFileStorage, 'getBuffer').mockResolvedValue(Buffer.from('test'));

      await expect(controller.downloadFile(externalUser, 'att1')).resolves.toBeDefined();
    });

    it('should deny download from another user\'s task', async () => {
      const attachment = {
        id: 'att1',
        storagePath: 'tasks/t1/file.pdf',
        task: {
          assigneeId: 'other_user',
          firmId: externalUser.firmId,
          workflowRunId: null,
        },
      };

      jest.spyOn(mockPrisma.taskAttachment, 'findUnique').mockResolvedValue(attachment);

      await expect(controller.downloadFile(externalUser, 'att1')).rejects.toThrow(ForbiddenException);
    });

    it('should deny access to cross-firm attachment', async () => {
      const attachment = {
        id: 'att1',
        task: { assigneeId: externalUser.id, firmId: 'other_firm', workflowRunId: null },
      };

      jest.spyOn(mockPrisma.taskAttachment, 'findUnique').mockResolvedValue(attachment);

      await expect(controller.downloadFile(externalUser, 'att1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('uploadFile', () => {
    it('should upload file to own task', async () => {
      const task = {
        assigneeId: externalUser.id,
        firmId: externalUser.firmId,
        status: 'TODO',
      };
      const file = { buffer: Buffer.from('test'), originalname: 'test.pdf', size: 1024, mimetype: 'application/pdf' };

      jest.spyOn(mockPrisma.task, 'findUnique').mockResolvedValue(task);
      jest.spyOn(mockFileStorage, 'put').mockResolvedValue(undefined);
      jest.spyOn(mockPrisma.taskAttachment, 'create').mockResolvedValue({
        id: 'att1',
        filename: 'test.pdf',
        size: 1024,
      });

      const result = await controller.uploadFile(externalUser, 'task1', file as Express.Multer.File);

      expect(result.id).toBe('att1');
      expect(mockFileStorage.put).toHaveBeenCalled();
    });

    it('should deny upload to completed task', async () => {
      const task = {
        assigneeId: externalUser.id,
        firmId: externalUser.firmId,
        status: 'DONE',
      };
      const file = { buffer: Buffer.from('test'), originalname: 'test.pdf', size: 1024, mimetype: 'application/pdf' };

      jest.spyOn(mockPrisma.task, 'findUnique').mockResolvedValue(task);

      await expect(controller.uploadFile(externalUser, 'task1', file as Express.Multer.File)).rejects.toThrow(BadRequestException);
    });

    it('should reject oversized file', async () => {
      const file = { size: 100 * 1024 * 1024 } as Express.Multer.File;

      await expect(controller.uploadFile(externalUser, 'task1', file)).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeStep', () => {
    it('should complete own task', async () => {
      const task = {
        id: 'task1',
        assigneeId: externalUser.id,
        firmId: externalUser.firmId,
        status: 'TODO',
        blockedById: null,
        requiresReview: false,
      };

      jest.spyOn(mockPrisma.task, 'findUnique').mockResolvedValue(task);
      jest.spyOn(mockTasksService, 'completeWorkflowStep').mockResolvedValue({});

      const result = await controller.completeStep(externalUser, 'task1');

      expect(result.completed).toBe(true);
      expect(mockTasksService.completeWorkflowStep).toHaveBeenCalledWith('task1', externalUser);
    });

    it('should deny completion of another user\'s task', async () => {
      const task = {
        id: 'task1',
        assigneeId: 'other_user',
        firmId: externalUser.firmId,
      };

      jest.spyOn(mockPrisma.task, 'findUnique').mockResolvedValue(task);

      await expect(controller.completeStep(externalUser, 'task1')).rejects.toThrow(ForbiddenException);
    });
  });
});
