import { Test, TestingModule } from '@nestjs/testing';
import { ReminderScheduler } from './reminder.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentNotifierService } from './assignment-notifier.service';

const NOW = new Date('2026-09-07T03:00:00Z');

describe('ReminderScheduler', () => {
  let scheduler: ReminderScheduler;
  const mockPrisma = {
    calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
    reminderLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const mockNotifier = { notifyAssigned: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    mockPrisma.calendarEvent.findMany.mockResolvedValue([]);
    mockPrisma.reminderLog.create.mockResolvedValue({});
    mockNotifier.notifyAssigned.mockResolvedValue({ recipients: 1, push: false, line: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
    }).compile();
    scheduler = module.get(ReminderScheduler);
  });

  afterEach(() => jest.useRealTimers());

  it('only loads events inside the reminder window', async () => {
    await scheduler.processReminders();

    const where = mockPrisma.calendarEvent.findMany.mock.calls[0][0].where;
    expect(where.startAt.gt).toEqual(NOW);
    // 30 days ahead — without an upper bound this query read the whole future.
    expect(where.startAt.lte).toEqual(new Date('2026-10-07T03:00:00Z'));
  });

  it('skips a reminder whose lead time exceeds the window instead of never firing it silently', async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        title: 'นัดไกล',
        startAt: new Date('2026-09-08T03:00:00Z'),
        caseId: 'case-1',
        reminderMinutes: [60 * 24 * 45],
        reminderLogs: [],
        case: { ownRef: 'C-001' },
      },
    ]);

    await scheduler.processReminders();

    expect(mockNotifier.notifyAssigned).not.toHaveBeenCalled();
    expect(mockPrisma.reminderLog.create).not.toHaveBeenCalled();
  });

  it('sends a due reminder once, to the event\'s own recipients', async () => {
    const event = {
      id: 'evt-1',
      title: 'สืบพยาน',
      startAt: new Date('2026-09-07T03:30:00Z'),
      caseId: 'case-1',
      assigneeId: 'user-attending',
      assignees: [{ userId: 'user-attending' }],
      reminderMinutes: [60],
      reminderLogs: [],
      case: { ownRef: 'C-001', firmId: 'firm-1' },
    };
    mockPrisma.calendarEvent.findMany.mockResolvedValue([event]);

    await scheduler.processReminders();

    // Resolved per event, so a buddy on the case is not pulled in.
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledTimes(1);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({
      firmId: 'firm-1',
      userIds: ['user-attending'],
      category: 'CALENDAR',
      entityPath: '/court-day/evt-1',
    }));
    expect(mockPrisma.reminderLog.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', channel: 'line', minutesBefore: 60 },
    });
  });

  it('pushes to every assignee on a multi-assignee event', async () => {
    const event = {
      id: 'evt-2',
      title: 'สืบพยาน',
      startAt: new Date('2026-09-07T03:30:00Z'),
      caseId: 'case-1',
      assigneeId: 'user-a',
      assignees: [{ userId: 'user-a' }, { userId: 'user-b' }],
      reminderMinutes: [60],
      reminderLogs: [],
      case: { ownRef: 'C-001', leadLawyerId: 'user-a', title: 'คดี' },
    };
    mockPrisma.calendarEvent.findMany.mockResolvedValue([event]);

    await scheduler.processReminders();

    expect(mockNotifier.notifyAssigned.mock.calls[0][0].userIds).toEqual(['user-a', 'user-b']);
  });

  it('logs push as the channel when only push got through', async () => {
    mockNotifier.notifyAssigned.mockResolvedValue({ recipients: 1, push: true, line: false });
    mockPrisma.calendarEvent.findMany.mockResolvedValue([{
      id: 'evt-3', title: 'นัด', startAt: new Date('2026-09-07T03:30:00Z'), caseId: 'case-1',
      assigneeId: 'u', reminderMinutes: [60], reminderLogs: [], case: { ownRef: 'C-1', firmId: 'f' },
    }]);

    await scheduler.processReminders();

    expect(mockPrisma.reminderLog.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-3', channel: 'push', minutesBefore: 60 },
    });
  });

  it('includes every assignee in the reminder window query', async () => {
    await scheduler.processReminders();

    const query = mockPrisma.calendarEvent.findMany.mock.calls[0][0];
    expect(query.include.assignees).toBeDefined();
  });
});
