import { DocumentReviewScheduler } from './document-review.scheduler';

describe('DocumentReviewScheduler', () => {
  const prisma = { reviewRound: { findMany: jest.fn(), updateMany: jest.fn() } } as any;
  const notifier = { notifyAssigned: jest.fn() } as any;
  const scheduler = new DocumentReviewScheduler(prisma, notifier);
  // 08:30 Bangkok, Mon 12 Oct 2026
  const now = new Date('2026-10-12T01:30:00Z');

  beforeEach(() => jest.clearAllMocks());

  it('reminds only reviewers who have not decided, on rounds due tomorrow, once', async () => {
    prisma.reviewRound.findMany.mockResolvedValue([{
      id: 'r1', reviewerIds: ['a', 'b'], decisions: [{ reviewerId: 'a' }], dueAt: new Date('2026-10-13T09:00:00Z'),
      documentVersion: { document: { filename: 'คำฟ้อง.docx', caseId: 'c1', case: { firmId: 'f1' } } },
    }]);
    prisma.reviewRound.updateMany.mockResolvedValue({ count: 1 });
    await expect(scheduler.remindDueTomorrow(now)).resolves.toBe(1);
    expect(prisma.reviewRound.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'WAITING_REVIEW', dueReminderSentAt: null,
        dueAt: { gte: new Date('2026-10-12T17:00:00Z'), lt: new Date('2026-10-13T17:00:00Z') },
      }),
    }));
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['b'], firmId: 'f1' }));
  });

  it('skips a round another instance already claimed', async () => {
    prisma.reviewRound.findMany.mockResolvedValue([{ id: 'r1', reviewerIds: ['a'], decisions: [], dueAt: new Date(), documentVersion: { document: { filename: 'x', caseId: 'c1', case: { firmId: 'f1' } } } }]);
    prisma.reviewRound.updateMany.mockResolvedValue({ count: 0 });
    await expect(scheduler.remindDueTomorrow(now)).resolves.toBe(0);
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });
});
