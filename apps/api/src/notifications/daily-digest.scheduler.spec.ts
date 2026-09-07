import { Test, TestingModule } from '@nestjs/testing';
import { AgendaItemKind, AgendaUrgency, AgendaWarningKind, FirmRole } from '@lawfirm/shared';
import { DailyDigestScheduler } from './daily-digest.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { AgendaService } from '../agenda/agenda.service';
import { LineMessagingService } from './line-messaging.service';
import { EmailService } from './email.service';
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
  const mockEmail = {
    sendDailyDigestEmail: jest.fn().mockResolvedValue(true),
    getAppUrl: jest.fn().mockReturnValue('https://app.example'),
  };

  const member = {
    firmId: 'firm-1',
    role: FirmRole.LAWYER,
    firm: { id: 'firm-1', name: 'Firm' },
    user: { id: 'user-1', email: 'a@example.com', lineUserId: 'L1', firstName: 'A', lastName: 'B' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    mockPrisma.firmMember.findMany.mockResolvedValue([member]);
    mockPrisma.dailyDigestLog.findMany.mockResolvedValue([]);
    mockPrisma.dailyDigestLog.create.mockResolvedValue({});
    mockLine.sendText.mockResolvedValue(true);
    mockEmail.sendDailyDigestEmail.mockResolvedValue(true);
    mockEmail.getAppUrl.mockReturnValue('https://app.example');
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
        { provide: EmailService, useValue: mockEmail },
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

  it('only considers members who have not opted out', async () => {
    await scheduler.sendDigests();

    expect(mockPrisma.firmMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user: { dailyDigestEnabled: true } } }),
    );
  });

  it('emails a member who has not linked LINE', async () => {
    mockPrisma.firmMember.findMany.mockResolvedValue([
      { ...member, user: { ...member.user, lineUserId: null } },
    ]);

    await scheduler.sendDigests();

    expect(mockLine.sendText).not.toHaveBeenCalled();
    const [params] = mockEmail.sendDailyDigestEmail.mock.calls[0];
    expect(params).toMatchObject({ to: 'a@example.com', dayLabel: 'อ. 8 ก.ย. 2569' });
    expect(params.lines[0]).toContain('สืบพยานโจทก์');
    expect(mockPrisma.dailyDigestLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: 'email' }),
    });
  });

  it('does not re-send over email once the day went out on LINE', async () => {
    mockPrisma.dailyDigestLog.findMany.mockResolvedValue([{ userId: 'user-1' }]);
    mockPrisma.firmMember.findMany.mockResolvedValue([
      { ...member, user: { ...member.user, lineUserId: null } },
    ]);

    await scheduler.sendDigests();

    expect(mockEmail.sendDailyDigestEmail).not.toHaveBeenCalled();
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
