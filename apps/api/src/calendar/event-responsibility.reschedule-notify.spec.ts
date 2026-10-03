import { EventResponsibilityService } from './event-responsibility.service';

describe('EventResponsibilityService reschedule notice', () => {
  const user = { id: 'lawyer-1', firmId: 'f1', firmRole: 'LAWYER' } as any;
  const oldAt = new Date('2026-10-05T02:00:00Z');
  const newAt = '2026-10-12T02:00:00.000Z';
  const event = {
    id: 'e1', title: 'สืบพยาน', startAt: oldAt, endAt: null, updatedAt: new Date('2026-10-01T00:00:00Z'),
    case: { status: 'OPEN', leadLawyerId: 'lead-1' }, reminderLogs: [],
  };

  const build = (notifier: any) => {
    const prisma: any = {
      calendarEvent: {
        findFirst: jest.fn().mockResolvedValue(event),
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: 'e1', title: 'สืบพยาน', startAt: new Date(newAt), assignees: [{ userId: 'att-1' }],
          case: { firmId: 'f1', leadLawyerId: 'lead-1', title: 'คดี', ownRef: 'R-1', blackCaseNumber: null, redCaseNumber: null },
        }),
      },
      documentDateSuggestion: { findMany: jest.fn().mockResolvedValue([]) },
      publicHoliday: { findMany: jest.fn().mockResolvedValue([]) },
      reminderLog: { deleteMany: jest.fn() },
      auditLog: { create: jest.fn() },
      $queryRaw: jest.fn(),
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    const access = { getCaseFilterForUser: jest.fn().mockReturnValue({}) } as any;
    return new EventResponsibilityService(prisma, access, {} as any, notifier);
  };

  it('tells the attendees and the lead lawyer, with old and new time', async () => {
    const notifier = { notifyAssigned: jest.fn() };
    const svc = build(notifier);
    const { fingerprint } = await svc.preview(user, 'e1', newAt);

    await expect(svc.reschedule(user, 'e1', { startAt: newAt, fingerprint, reason: 'ศาลเลื่อน' }))
      .resolves.toEqual({ updated: true, impacted: 0 });

    const sent = notifier.notifyAssigned.mock.calls[0][0];
    expect(sent).toMatchObject({ firmId: 'f1', userIds: ['att-1', 'lead-1'], actorUserId: 'lawyer-1', category: 'CALENDAR', entityPath: '/court-day/e1' });
    expect(sent.summaryText).toContain('05/10/2026 09:00 → 12/10/2026 09:00');
    expect(sent.summaryText).toContain('ศาลเลื่อน');
  });

  it('a failed notice does not fail a reschedule that is already saved', async () => {
    const svc = build({ notifyAssigned: jest.fn().mockRejectedValue(new Error('down')) });
    const { fingerprint } = await svc.preview(user, 'e1', newAt);
    await expect(svc.reschedule(user, 'e1', { startAt: newAt, fingerprint, reason: 'x' }))
      .resolves.toEqual({ updated: true, impacted: 0 });
  });
});
