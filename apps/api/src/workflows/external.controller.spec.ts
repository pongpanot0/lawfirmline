import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExternalController } from './external.controller';

const RUN = 'run-1';
const ext = { id: 'ext-1', firmId: 'firm-1', firmRole: 'EXTERNAL' } as any;
const staff = { id: 'staff-1', firmId: 'firm-1', firmRole: 'LAWYER' } as any;

/** Step 0 (translator) → step 1 (this freelancer). */
const tasks: Record<string, any> = {
  step0: { id: 'step0', status: 'TODO', blockedById: null, workflowRunId: RUN, workflowStep: 0, assigneeId: 'ext-other', firmId: 'firm-1' },
  step1: { id: 'step1', status: 'TODO', blockedById: 'step0', workflowRunId: RUN, workflowStep: 1, assigneeId: 'ext-1', firmId: 'firm-1' },
};

const build = () => {
  const prisma: any = {
    task: {
      findUnique: jest.fn(async ({ where }: any) => tasks[where.id] ?? null),
      findFirst: jest.fn(async ({ where }: any) => {
        const t = tasks[where.id];
        return t && t.assigneeId === where.assigneeId && t.firmId === where.firmId ? t : null;
      }),
      findMany: jest.fn(async ({ where }: any) => Object.values(tasks).filter((t: any) =>
        t.assigneeId === where.assigneeId && t.workflowRunId === where.workflowRunId && t.workflowStep > where.workflowStep.gt)),
    },
    taskAttachment: { findUnique: jest.fn(), create: jest.fn(async ({ data }: any) => ({ id: 'att-new', ...data })), delete: jest.fn() },
  };
  const fileStorage: any = {
    put: jest.fn(async (key: string) => `stored/${key}`),
    delete: jest.fn(async () => undefined),
    openDownloadStream: jest.fn(async () => ({ on: jest.fn(), pipe: jest.fn() })),
  };
  const tasksService: any = { completeWorkflowStep: jest.fn() };
  const res: any = { setHeader: jest.fn(), destroy: jest.fn() };
  return { ctrl: new ExternalController(prisma, fileStorage, tasksService), prisma, fileStorage, tasksService, res };
};
const pdf = { originalname: Buffer.from('คำแปล.pdf', 'utf8').toString('latin1'), mimetype: 'application/pdf', size: 1000, buffer: Buffer.from('x') } as any;

describe('ExternalController', () => {
  beforeEach(() => { tasks.step0.status = 'TODO'; tasks.step1.status = 'TODO'; });

  it('staff tokens cannot use the freelancer surface', async () => {
    const { ctrl } = build();
    await expect(ctrl.getMySteps(staff)).rejects.toThrow(ForbiddenException);
  });

  describe('downloading the previous step\'s output', () => {
    const fileOfStep0 = { storagePath: 's/a', filename: 'ต้นฉบับ.pdf', mimeType: 'application/pdf', task: { assigneeId: 'ext-other', firmId: 'firm-1', workflowRunId: RUN, workflowStep: 0 } };

    it('is refused while my step still waits for it', async () => {
      const { ctrl, prisma, res } = build();
      prisma.taskAttachment.findUnique.mockResolvedValue(fileOfStep0);
      await expect(ctrl.downloadFile(ext, 'a1', res)).rejects.toThrow(NotFoundException);
    });

    it('works once the previous step is done', async () => {
      tasks.step0.status = 'DONE';
      const { ctrl, prisma, fileStorage, res } = build();
      prisma.taskAttachment.findUnique.mockResolvedValue(fileOfStep0);
      await ctrl.downloadFile(ext, 'a1', res);
      expect(fileStorage.openDownloadStream).toHaveBeenCalledWith('s/a');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('never reaches a file of another firm', async () => {
      const { ctrl, prisma, res } = build();
      prisma.taskAttachment.findUnique.mockResolvedValue({ ...fileOfStep0, task: { ...fileOfStep0.task, firmId: 'firm-2' } });
      await expect(ctrl.downloadFile(ext, 'a1', res)).rejects.toThrow(NotFoundException);
    });

    it('never reaches a later step\'s file', async () => {
      tasks.step0.status = 'DONE';
      const { ctrl, prisma, res } = build();
      prisma.taskAttachment.findUnique.mockResolvedValue({ ...fileOfStep0, task: { ...fileOfStep0.task, workflowStep: 5 } });
      await expect(ctrl.downloadFile(ext, 'a1', res)).rejects.toThrow(NotFoundException);
    });
  });

  it('uploads to my own open step with a key that never contains the filename', async () => {
    const { ctrl, prisma, fileStorage } = build();
    const out = await ctrl.uploadFile(ext, 'step1', pdf);
    expect(out.filename).toBe('คำแปล.pdf');
    const key = fileStorage.put.mock.calls[0][0];
    expect(key).toMatch(/^tasks\/step1\/\d+-[a-z0-9]+\.pdf$/);
    expect(prisma.taskAttachment.create.mock.calls[0][0].data.storagePath).toBe(`stored/${key}`);
  });

  it('refuses uploads to someone else\'s step and unsupported types', async () => {
    const { ctrl } = build();
    await expect(ctrl.uploadFile(ext, 'step0', pdf)).rejects.toThrow(NotFoundException);
    await expect(ctrl.uploadFile(ext, 'step1', { ...pdf, mimetype: 'text/html' })).rejects.toThrow(BadRequestException);
  });

  it('cannot hand in a step that is still waiting, can once the previous is done', async () => {
    const { ctrl, tasksService } = build();
    await expect(ctrl.completeStep(ext, 'step1')).rejects.toThrow(BadRequestException);
    expect(tasksService.completeWorkflowStep).not.toHaveBeenCalled();
    tasks.step0.status = 'DONE';
    await ctrl.completeStep(ext, 'step1');
    expect(tasksService.completeWorkflowStep).toHaveBeenCalledWith('step1', ext);
  });

  it('cannot hand in twice', async () => {
    tasks.step0.status = 'DONE';
    tasks.step1.status = 'PENDING_REVIEW';
    const { ctrl } = build();
    await expect(ctrl.completeStep(ext, 'step1')).rejects.toThrow('ส่งงานนี้ไปแล้ว');
  });

  it('deletes only my own upload', async () => {
    const { ctrl, prisma } = build();
    prisma.taskAttachment.findUnique.mockResolvedValue({ storagePath: 's/x', uploadedById: 'ext-other', taskId: 'step1', task: { firmId: 'firm-1' } });
    await expect(ctrl.deleteFile(ext, 'a1')).rejects.toThrow(NotFoundException);
    expect(prisma.taskAttachment.delete).not.toHaveBeenCalled();
  });
});
