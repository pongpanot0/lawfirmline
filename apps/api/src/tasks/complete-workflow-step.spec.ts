import { BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';

describe('TasksService.completeWorkflowStep', () => {
  const user = { id: 'free', firmId: 'f1', firmRole: 'EXTERNAL' } as any;
  const build = (task: any, claimed = 1) => {
    const prisma: any = {
      task: {
        findUnique: jest.fn().mockResolvedValue(task),
        updateMany: jest.fn().mockResolvedValue({ count: claimed }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...task, status: 'DONE' }),
      },
      taskAssignmentLog: { create: jest.fn() },
    };
    const notifier: any = { notifyAssigned: jest.fn() };
    const svc = new TasksService(prisma, {} as any, {} as any, notifier, {} as any);
    const completed = jest.spyOn(svc as any, 'onTaskCompleted').mockResolvedValue(undefined);
    return { svc, prisma, notifier, completed };
  };

  it('a step with review goes to the reviewer and records who handed it in', async () => {
    const { svc, prisma, notifier, completed } = build({ id: 't1', assigneeId: 'free', requiresReview: true, reviewerId: 'senior', title: 'แปล', caseId: 'c1' });
    await svc.completeWorkflowStep('t1', user);
    expect(prisma.task.updateMany.mock.calls[0][0].data.status).toBe('PENDING_REVIEW');
    // A rejection returns the work to the last hand-off's sender — the freelancer.
    expect(prisma.taskAssignmentLog.create.mock.calls[0][0].data).toMatchObject({ action: 'HANDED_OFF', fromUserId: 'free', toUserId: 'senior' });
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['senior'] }));
    expect(completed).not.toHaveBeenCalled();
  });

  it('a step without review is done and moves the run on', async () => {
    const { svc, prisma, completed } = build({ id: 't1', assigneeId: 'free', requiresReview: false, reviewerId: null, title: 'แปล', caseId: 'c1' });
    await svc.completeWorkflowStep('t1', user);
    expect(prisma.task.updateMany.mock.calls[0][0].data.status).toBe('DONE');
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('a second click cannot hand in again', async () => {
    const { svc, completed } = build({ id: 't1', assigneeId: 'free', requiresReview: false, reviewerId: null, title: 'แปล', caseId: 'c1' }, 0);
    await expect(svc.completeWorkflowStep('t1', user)).rejects.toThrow(BadRequestException);
    expect(completed).not.toHaveBeenCalled();
  });
});
