import { Test, TestingModule } from '@nestjs/testing';
import { ReminderScheduler } from './reminder.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { LineMessagingService } from './line-messaging.service';
import { LineLinkService } from './line-link.service';

const NOW = new Date('2026-09-07T03:00:00Z');

describe('ReminderScheduler', () => {
  let scheduler: ReminderScheduler;
  const mockPrisma = {
    calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
    reminderLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const mockLine = { sendText: jest.fn().mockResolvedValue(true) };
  const mockLink = { getLineUserIdsForCase: jest.fn().mockResolvedValue(['L1']) };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    mockPrisma.calendarEvent.findMany.mockResolvedValue([]);
    mockPrisma.reminderLog.create.mockResolvedValue({});
    mockLine.sendText.mockResolvedValue(true);
    mockLink.getLineUserIdsForCase.mockResolvedValue(['L1']);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LineMessagingService, useValue: mockLine },
        { provide: LineLinkService, useValue: mockLink },
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

    expect(mockLine.sendText).not.toHaveBeenCalled();
    expect(mockPrisma.reminderLog.create).not.toHaveBeenCalled();
  });

  it('sends a due reminder once and logs it', async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        title: 'สืบพยาน',
        startAt: new Date('2026-09-07T03:30:00Z'),
        caseId: 'case-1',
        reminderMinutes: [60],
        reminderLogs: [],
        case: { ownRef: 'C-001' },
      },
    ]);

    await scheduler.processReminders();

    expect(mockLine.sendText).toHaveBeenCalledTimes(1);
    expect(mockPrisma.reminderLog.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', channel: 'line', minutesBefore: 60 },
    });
  });
});
