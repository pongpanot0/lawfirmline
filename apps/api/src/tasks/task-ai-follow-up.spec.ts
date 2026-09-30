import { ConflictException } from '@nestjs/common';
import { TaskDetailService } from './task-detail.service';

describe('AI follow-up creation', () => {
  const taskId = 'parent-task';
  const user = { id: 'author', firmId: 'firm' } as any;
  const task = { id: taskId, caseId: null, intakeId: null, parentId: null, updatedAt: new Date('2026-09-30T00:00:00.000Z') };
  const dto = { sourceCommentId: 'source-comment', latestCommentId: 'source-comment', taskUpdatedAt: task.updatedAt.toISOString(), quote: 'ยังไม่ได้รับเอกสาร', title: 'ติดตามเอกสาร', description: 'ติดต่อผู้ส่ง', assigneeId: 'author', followUpDate: '2030-01-01' };
  let prisma: any;
  let tasks: any;
  let service: TaskDetailService;

  beforeEach(() => {
    prisma = {
      auditLog: { create: jest.fn().mockResolvedValue({ createdAt: new Date() }) },
      taskComment: { findFirst: jest.fn().mockResolvedValueOnce({ id: dto.latestCommentId }).mockResolvedValueOnce({ body: `แจ้งแล้ว แต่${dto.quote}` }) },
      task: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    tasks = { assertAccess: jest.fn().mockResolvedValue(task), create: jest.fn().mockResolvedValue({ id: 'follow-up' }) };
    service = new TaskDetailService(prisma, tasks, {} as any, {} as any);
  });

  it('links a confirmed task to the exact source and keeps the original task untouched', async () => {
    await expect(service.createAiFollowUp(taskId, user, dto)).resolves.toEqual({ id: 'follow-up', alreadyCreated: false });
    expect(tasks.create).toHaveBeenCalledWith(user, null, expect.objectContaining({ title: dto.title, dueDate: dto.followUpDate }), undefined, undefined, 0, {
      parentId: taskId, sourceTaskId: taskId, sourceCommentId: dto.sourceCommentId, sourceQuote: dto.quote,
    });
  });

  it('rejects stale analysis before creating a task', async () => {
    prisma.taskComment.findFirst = jest.fn().mockResolvedValueOnce({ id: 'newer-comment' }).mockResolvedValueOnce({ body: dto.quote });
    await expect(service.createAiFollowUp(taskId, user, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('returns the existing follow-up when the action is repeated', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 'follow-up', followUpSourceTaskId: taskId });
    await expect(service.createAiFollowUp(taskId, user, dto)).resolves.toEqual({ id: 'follow-up', alreadyCreated: true });
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('redacts identifiers before sending task updates to AI', async () => {
    tasks.assertAccess.mockResolvedValue({ ...task, title: 'ติดตามลูกค้า' });
    prisma.taskComment.findMany = jest.fn().mockResolvedValue([{
      id: 'source-comment', body: 'โทร 081-234-5678 และส่งที่ test@example.com', createdAt: new Date(),
      author: { id: 'author', firstName: 'ทดสอบ', lastName: 'ระบบ' },
    }]);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ choices: [{ message: { content: '{"status":"clear"}' } }] }),
    } as Response);
    try {
      service = new TaskDetailService(prisma, tasks, {} as any, { get: (key: string) => key === 'OPENAI_API_KEY' ? 'test-key' : undefined } as any);
      await service.analyze(taskId, user);
      const request = JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1]!.body as string));
      expect(request).not.toContain('081-234-5678');
      expect(request).not.toContain('test@example.com');
      expect(request).toContain('[เบอร์โทร]');
      expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
