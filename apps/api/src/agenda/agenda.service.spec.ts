import { Test, TestingModule } from '@nestjs/testing';
import { AgendaItemKind, AgendaUrgency, AgendaWarningKind, FirmRole } from '@lawfirm/shared';
import { AgendaService } from './agenda.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { TravelService } from '../travel/travel.service';

const NOW = new Date('2026-09-07T03:00:00Z'); // Mon 7 Sep 2026, 10:00 Bangkok

function makeEvent(over: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    title: 'สืบพยานโจทก์',
    startAt: new Date('2026-09-07T02:00:00Z'), // 09:00 Bangkok today
    endAt: null,
    type: 'COURT_DATE',
    courtName: 'ศาลแพ่ง',
    caseId: 'case-1',
    case: { id: 'case-1', ownRef: 'C-001', title: 'คดีทดสอบ', courtName: 'ศาลแพ่ง' },
    ...over,
  };
}

function makeTask(over: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'ยื่นคำให้การ',
    dueDate: new Date('2026-09-08T05:00:00Z'), // tomorrow Bangkok
    caseId: 'case-1',
    case: { id: 'case-1', ownRef: 'C-001', title: 'คดีทดสอบ' },
    ...over,
  };
}

describe('AgendaService', () => {
  let service: AgendaService;
  const mockPrisma = {
    calendarEvent: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
  };

  /**
   * The service issues one query for the past window and one for the days
   * ahead, so a mock that ignores `where` would hand the same rows to both and
   * hide any bucketing bug. Apply the date range the way Prisma would.
   */
  function inRange(rows: Array<Record<string, any>>, field: string, where: any) {
    const range = where?.[field];
    if (!range) return rows;
    return rows.filter((row) => {
      const value: Date = row[field];
      if (range.gte && value < range.gte) return false;
      if (range.lt && value >= range.lt) return false;
      return true;
    });
  }

  const setEvents = (rows: Array<Record<string, any>>) =>
    mockPrisma.calendarEvent.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(inRange(rows, 'startAt', where)),
    );
  const setTasks = (rows: Array<Record<string, any>>) =>
    mockPrisma.task.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(inRange(rows, 'dueDate', where)),
    );
  const mockCaseAccess = {
    getCaseFilterForUser: jest.fn().mockReturnValue({ firmId: 'firm-1' }),
    getTaskFilterForUser: jest.fn().mockReturnValue({ assigneeId: 'user-1' }),
  };
  const mockTravel = {
    getOfficeAddress: jest.fn().mockResolvedValue('สำนักงาน'),
    calculateTravel: jest.fn().mockResolvedValue({ durationSeconds: 1800 }),
  };
  const user = {
    id: 'user-1',
    firmId: 'firm-1',
    firmName: 'Firm',
    firmRole: FirmRole.LAWYER,
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    setEvents([]);
    setTasks([]);
    mockCaseAccess.getCaseFilterForUser.mockReturnValue({ firmId: 'firm-1' });
    mockCaseAccess.getTaskFilterForUser.mockReturnValue({ assigneeId: 'user-1' });
    mockTravel.getOfficeAddress.mockResolvedValue('สำนักงาน');
    mockTravel.calculateTravel.mockResolvedValue({ durationSeconds: 1800 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgendaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: TravelService, useValue: mockTravel },
      ],
    }).compile();
    service = module.get(AgendaService);
  });

  afterEach(() => jest.useRealTimers());

  it('projects calendar events and tasks onto one sorted list', async () => {
    setEvents([makeEvent()]);
    setTasks([
      makeTask({ dueDate: new Date('2026-09-07T05:00:00Z') }),
    ]);

    const result = await service.getMyDay(user);

    // The task is all-day, so it sorts ahead of the timed 09:00 court date.
    expect(result.todayItems.map((i) => i.id)).toEqual(['task:task-1', 'event:evt-1']);
    expect(result.todayItems[0].kind).toBe(AgendaItemKind.TASK);
    expect(result.todayItems[0].allDay).toBe(true);
    expect(result.todayItems[1].kind).toBe(AgendaItemKind.COURT_DATE);
    expect(result.todayItems[1].allDay).toBe(false);
  });

  it('buckets by Bangkok calendar day, not by UTC day', async () => {
    setEvents([
      // 2026-09-07T18:30Z is already Tue 8 Sep 01:30 in Bangkok → tomorrow.
      makeEvent({ id: 'evt-late', startAt: new Date('2026-09-07T18:30:00Z') }),
    ]);

    const result = await service.getMyDay(user);

    expect(result.today).toBe('2026-09-07');
    expect(result.todayItems).toHaveLength(0);
    expect(result.tomorrow.map((i) => i.id)).toEqual(['event:evt-late']);
    expect(result.tomorrow[0].urgency).toBe(AgendaUrgency.TOMORROW);
  });

  it('marks items from a past Bangkok day as overdue, not items earlier today', async () => {
    setEvents([
      makeEvent({ id: 'evt-past', startAt: new Date('2026-09-05T02:00:00Z') }),
      makeEvent({ id: 'evt-earlier', startAt: new Date('2026-09-07T01:00:00Z') }),
    ]);

    const result = await service.getMyDay(user);

    expect(result.overdue.map((i) => i.id)).toEqual(['event:evt-past']);
    expect(result.overdue[0].urgency).toBe(AgendaUrgency.OVERDUE);
    expect(result.todayItems.map((i) => i.id)).toEqual(['event:evt-earlier']);
  });

  it('includes standalone todos assigned to the user alongside case work', async () => {
    setTasks([
      makeTask({ id: 'task-solo', caseId: null, case: null, dueDate: new Date('2026-09-07T05:00:00Z') }),
    ]);

    const result = await service.getMyDay(user);

    expect(result.todayItems.map((i) => i.id)).toEqual(['task:task-solo']);
    expect(result.todayItems[0].caseId).toBeNull();
    expect(result.todayItems[0].entityId).toBe('task-solo');
    expect(result.todayItems[0].url).toBe('/todos');
  });

  it('scopes the queries with the caller role filters', async () => {
    await service.getMyDay(user);

    expect(mockPrisma.calendarEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ case: { firmId: 'firm-1' } }) }),
    );
    const taskWhere = mockPrisma.task.findMany.mock.calls[0][0].where;
    expect(taskWhere.AND).toEqual(
      expect.arrayContaining([{ assigneeId: 'user-1' }]),
    );
  });

  it('only lets a court date inherit the case court as its location', async () => {
    setEvents([
      makeEvent({ id: 'evt-court', courtName: null }),
      makeEvent({
        id: 'evt-meeting',
        type: 'CLIENT_MEETING',
        courtName: null,
        startAt: new Date('2026-09-07T07:00:00Z'),
      }),
    ]);

    const result = await service.getMyDay(user);

    const byId = Object.fromEntries(result.todayItems.map((i) => [i.id, i]));
    expect(byId['event:evt-court'].location).toBe('ศาลแพ่ง');
    expect(byId['event:evt-meeting'].location).toBeNull();
  });

  it('warns when two timed items on the same day overlap', async () => {
    setEvents([
      makeEvent({
        id: 'evt-a',
        startAt: new Date('2026-09-07T02:00:00Z'),
        endAt: new Date('2026-09-07T04:00:00Z'),
        courtName: null,
        case: { id: 'case-1', ownRef: 'C-001', title: 'คดี', courtName: null },
      }),
      makeEvent({
        id: 'evt-b',
        startAt: new Date('2026-09-07T03:00:00Z'),
        endAt: null,
        courtName: null,
        case: { id: 'case-2', ownRef: 'C-002', title: 'คดี 2', courtName: null },
      }),
    ]);

    const result = await service.getMyDay(user);

    const overlap = result.warnings.find((w) => w.kind === AgendaWarningKind.OVERLAP);
    expect(overlap).toBeDefined();
    expect(overlap!.itemIds).toEqual(['event:evt-a', 'event:evt-b']);
  });

  it('warns when the gap between two locations is shorter than the travel time', async () => {
    mockTravel.calculateTravel.mockResolvedValue({ durationSeconds: 5 * 3600 });
    setEvents([
      makeEvent({ id: 'evt-cm', startAt: new Date('2026-09-07T02:00:00Z'), courtName: 'ศาลเชียงใหม่' }),
      makeEvent({ id: 'evt-bkk', startAt: new Date('2026-09-07T06:00:00Z'), courtName: 'ศาลแพ่ง' }),
    ]);

    const result = await service.getMyDay(user);

    const travel = result.warnings.find((w) => w.kind === AgendaWarningKind.TRAVEL);
    expect(travel).toBeDefined();
    expect(travel!.itemIds).toEqual(['event:evt-cm', 'event:evt-bkk']);
  });

  it('sets departBy on the first located item of the day using the office address', async () => {
    setEvents([makeEvent()]);

    const result = await service.getMyDay(user);

    expect(mockTravel.getOfficeAddress).toHaveBeenCalledWith('firm-1');
    // 09:00 Bangkok start minus 30min travel.
    expect(result.todayItems[0].departBy).toBe('2026-09-07T01:30:00.000Z');
  });

  it('never lets a travel-estimate failure break the agenda', async () => {
    mockTravel.calculateTravel.mockRejectedValue(new Error('maps down'));
    setEvents([makeEvent()]);

    const result = await service.getMyDay(user);

    expect(result.todayItems).toHaveLength(1);
    expect(result.todayItems[0].departBy).toBeNull();
    expect(result.warnings).toEqual([]);
  });
});
