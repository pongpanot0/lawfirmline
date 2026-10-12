import { reviewQueueWhere, toReviewQueueItem } from './review-queue';

describe('review queue', () => {
  it('is PENDING_REVIEW where I am the named reviewer, or the lead of a reviewer-less case task, inside my firm', () => {
    expect(reviewQueueWhere({ id: 'me', firmId: 'f1' })).toEqual({
      status: 'PENDING_REVIEW',
      AND: [
        { OR: [{ firmId: 'f1' }, { case: { firmId: 'f1' } }, { firmId: null, caseId: null, createdBy: { firmMembers: { some: { firmId: 'f1' } } } }] },
        { OR: [{ assigneeId: null }, { assigneeId: { not: 'me' } }] },
        { OR: [{ reviewerId: 'me', OR: [{ caseId: null }, { case: { deletedAt: null } }] }, { reviewerId: null, case: { leadLawyerId: 'me', deletedAt: null } }] },
      ],
    });
  });

  it('maps a row to the card the reviewer sees', () => {
    expect(toReviewQueueItem({
      id: 't1', title: 'ร่างคำฟ้อง', caseId: 'c1', dueDate: null, submittedAt: new Date('2026-10-11T03:00:00Z'),
      case: { id: 'c1', ownRef: 'TSB-1', title: 'ผิดสัญญา' }, assignee: { id: 'w', firstName: 'สมชาย', lastName: 'ใจดี' },
    })).toEqual({
      id: 't1', title: 'ร่างคำฟ้อง', caseId: 'c1', caseRef: 'TSB-1', caseTitle: 'ผิดสัญญา',
      workerName: 'สมชาย ใจดี', submittedAt: '2026-10-11T03:00:00.000Z', dueDate: null,
    });
  });
});
