import { Test, TestingModule } from '@nestjs/testing';
import { AgendaItemKind, AgendaUrgency, AgendaWarningKind, FirmRole } from '@lawfirm/shared';
import { DailyDigestScheduler } from './daily-digest.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { AgendaService } from '../agenda/agenda.service';
import { LineMessagingService } from './line-messaging.service';
import { bangkokDayKey } from '../common/utils/bangkok-time';

const NOW = new Date('2026-09-07T11:00:00Z'); // Mon 7 Sep 2026, 18:00 Bangkok

function item(over: Record<string, unknown> = {}) {
  return {
    id: 'event:evt-1',
    kind: AgendaItemKind.COURT_DATE,
    title: 'สืบพยานโจทก์',
    at: '2026-09-08T02:00:00Z',
    endAt: null,
    allDay: false,
    urgency: AgendaUrgency.TOMORROW,
    caseId: 'case-1',
    caseRef: 'C-001',
    caseTitle: 'คดีทดสอบ',
    location: 'ศาลแพ่ง',
    departBy: '2026-09-08T01:30:00Z',
    url: '/cases/case-1/calendar',
    ...over,
  };
}

describe('DailyDigestScheduler', () => {
  let scheduler: DailyDigestScheduler;
  const mockPrisma = {
    firmMember: { findMany: jest.fn() },
    dailyDigestLog: { findMany: jest.fn(), create: jest.fn() },
  };
  const mockAgenda = { getDayBrief: jest.fn() };
  const mockLine = { sendText: jest.fn().mockResolvedValue(true) };

  const member = {
    firmId: 'firm-1',
    role: FirmRole.LAWYER,
    firm: { id: 'firm-1', name: 'Firm' },
    user: { id: 'user-1', lineUserId: 'L1', firstName: 'A', lastName: 'B' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    mockPrisma.firmMember.findMany.mockResolvedValue([member]);
    mockPrisma.dailyDigestLog.findMany.mockResolvedValue([]);
    mockPrisma.dailyDigestLog.create.mockResolvedValue({});
    mockLine.sendText.mockResolvedValue(true);
    mockAgenda.getDayBrief.mockResolvedValue({
      date: '2026-09-08',
      items: [item()],
      warnings: [],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyDigestScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AgendaService, useValue: mockAgenda },
        { provide: LineMessagingService, useValue: mockLine },
      ],
    }).compile();
    scheduler = module.get(DailyDigestScheduler);
  });

  afterEach(() => jest.useRealTimers());

  it('sends tomorrow\'s agenda to the member who owns the work', async () => {
    await scheduler.sendDigests();

    // 18:00 Bangkok on Mon 7 Sep → the digest covers Tue 8 Sep, whose Bangkok
    // midnight is 17:00Z on the 7th.
    const [, day] = mockAgenda.getDayBrief.mock.calls[0];
    expect(day.toISOString()).toBe('2026-09-07T17:00:00.000Z');
    expect(bangkokDayKey(day)).toBe('2026-09-08');

    expect(mockLine.sendText).toHaveBeenCalledTimes(1);
    const [message, recipients] = mockLine.sendText.mock.calls[0];
    expect(recipients).toEqual(['L1']);
    expect(message).toContain('อ. 8 ก.ย. 2569');
    expect(message).toContain('09:00');
    expect(message).toContain('สืบพยานโจทก์');
    expect(message).toContain('C-001');
    expect(message).toContain('08:30'); // depart-by time
  });

  it('builds the agenda with the member\'s own firm role, not a fixed one', async () => {
    mockPrisma.firmMember.findMany.mockResolvedValue([
      { ...member, role: FirmRole.OWNER },
    ]);

    await scheduler.sendDigests();

    const [authUser] = mockAgenda.getDayBrief.mock.calls[0];
    expect(authUser).toMatchObject({ id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.OWNER });
  });

  it('stays silent when the member has nothing scheduled', async () => {
    mockAgenda.getDayBrief.mockResolvedValue({ date: '2026-09-08', items: [], warnings: [] });

    await scheduler.sendDigests();

    expect(mockLine.sendText).not.toHaveBeenCalled();
    expect(mockPrisma.dailyDigestLog.create).not.toHaveBeenCalled();
  });

  it('does not send twice for the same day', async () => {
    mockPrisma.dailyDigestLog.findMany.mockResolvedValue([
      { userId: 'user-1', channel: 'line' },
    ]);

    await scheduler.sendDigests();

    expect(mockAgenda.getDayBrief).not.toHaveBeenCalled();
    expect(mockLine.sendText).not.toHaveBeenCalled();
  });

  it('records the digest only when LINE accepted it', async () => {
    mockLine.sendText.mockResolvedValue(false);

    await scheduler.sendDigests();

    expect(mockPrisma.dailyDigestLog.create).not.toHaveBeenCalled();
  });

  it('includes schedule conflicts in the message', async () => {
    mockAgenda.getDayBrief.mockResolvedValue({
      date: '2026-09-08',
      items: [item()],
      warnings: [
        { kind: AgendaWarningKind.TRAVEL, message: 'เดินทางไม่ทัน', itemIds: [] },
      ],
    });

    await scheduler.sendDigests();

    expect(mockLine.sendText.mock.calls[0][0]).toContain('เดินทางไม่ทัน');
  });

  it('keeps going when one member fails', async () => {
    mockPrisma.firmMember.findMany.mockResolvedValue([
      { ...member, user: { ...member.user, id: 'user-bad', lineUserId: 'L0' } },
      member,
    ]);
    mockAgenda.getDayBrief
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ date: '2026-09-08', items: [item()], warnings: [] });

    await scheduler.sendDigests();

    expect(mockLine.sendText).toHaveBeenCalledTimes(1);
  });
});
