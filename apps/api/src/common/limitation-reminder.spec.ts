import { LIMITATION_REMINDER_MINUTES, syncLimitationReminder } from './limitation-reminder';

describe('syncLimitationReminder', () => {
  const db = () => ({
    case: { findUnique: jest.fn(), update: jest.fn() },
    caseProceeding: { count: jest.fn().mockResolvedValue(0) },
    calendarEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'evt-new' }),
      update: jest.fn(),
      delete: jest.fn(),
    },
    reminderLog: { deleteMany: jest.fn() },
  });
  const caseRow = (over: object = {}) => ({
    limitationDeadline: new Date('2027-03-01T00:00:00.000Z'),
    limitationEventId: null,
    leadLawyerId: 'lead-1',
    ...over,
  });

  it('creates one DEADLINE event at 16:30 Bangkok with 90/30/7/1-day reminders and links it', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow());

    expect(await syncLimitationReminder(d as never, 'case-1')).toBe('evt-new');

    expect(d.calendarEvent.create).toHaveBeenCalledWith({
      data: {
        caseId: 'case-1',
        title: 'ครบอายุความ',
        type: 'DEADLINE',
        startAt: new Date('2027-03-01T09:30:00.000Z'),
        reminderMinutes: [129600, 43200, 10080, 1440],
        assigneeId: 'lead-1',
        assignees: { create: [{ userId: 'lead-1' }] },
      },
      select: { id: true },
    });
    expect(d.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { limitationEventId: 'evt-new' } });
    expect(LIMITATION_REMINDER_MINUTES).toEqual([90 * 1440, 30 * 1440, 7 * 1440, 1440]);
  });

  it('moves the existing event when the deadline changes and resets sent reminders', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationEventId: 'evt-1' }));
    d.calendarEvent.findUnique.mockResolvedValue({ id: 'evt-1', startAt: new Date('2027-01-01T09:30:00.000Z') });

    expect(await syncLimitationReminder(d as never, 'case-1')).toBe('evt-1');

    expect(d.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { startAt: new Date('2027-03-01T09:30:00.000Z'), title: 'ครบอายุความ', reminderMinutes: LIMITATION_REMINDER_MINUTES },
    });
    expect(d.reminderLog.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'evt-1' } });
    expect(d.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('is a no-op when the event already matches', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationEventId: 'evt-1' }));
    d.calendarEvent.findUnique.mockResolvedValue({ id: 'evt-1', startAt: new Date('2027-03-01T09:30:00.000Z') });

    await syncLimitationReminder(d as never, 'case-1');

    expect(d.calendarEvent.update).not.toHaveBeenCalled();
    expect(d.case.update).not.toHaveBeenCalled();
  });

  it('removes the event when the deadline is cleared', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationDeadline: null, limitationEventId: 'evt-1' }));
    d.calendarEvent.findUnique.mockResolvedValue({ id: 'evt-1', startAt: new Date() });

    expect(await syncLimitationReminder(d as never, 'case-1')).toBeNull();

    expect(d.calendarEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
    expect(d.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { limitationEventId: null } });
  });

  it('removes the event once the case is filed', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationEventId: 'evt-1' }));
    d.calendarEvent.findUnique.mockResolvedValue({ id: 'evt-1', startAt: new Date() });
    d.caseProceeding.count.mockResolvedValue(1);

    expect(await syncLimitationReminder(d as never, 'case-1')).toBeNull();

    expect(d.caseProceeding.count).toHaveBeenCalledWith({
      where: {
        caseId: 'case-1',
        OR: [{ filedAt: { not: null } }, { blackCaseNumber: { not: null } }, { judgmentAt: { not: null } }],
      },
    });
    expect(d.calendarEvent.delete).toHaveBeenCalled();
  });

  it('recreates the event when the linked one was deleted by hand', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationEventId: 'gone' }));
    d.calendarEvent.findUnique.mockResolvedValue(null);

    expect(await syncLimitationReminder(d as never, 'case-1')).toBe('evt-new');
    expect(d.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { limitationEventId: 'evt-new' } });
  });

  it('does not throw when the linked event is gone and the case no longer needs one', async () => {
    const d = db();
    d.case.findUnique.mockResolvedValue(caseRow({ limitationDeadline: null, limitationEventId: 'gone' }));
    d.calendarEvent.findUnique.mockResolvedValue(null);

    expect(await syncLimitationReminder(d as never, 'case-1')).toBeNull();
    expect(d.calendarEvent.delete).not.toHaveBeenCalled();
    expect(d.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { limitationEventId: null } });
  });
});
