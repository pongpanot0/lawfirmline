import { Test } from '@nestjs/testing';
import { OutlookCalendarInboundService } from './outlook-calendar-inbound.service';
import { PrismaService } from '../../prisma/prisma.module';
import { OutlookConnectionsService } from '../outlook-connections.service';
import { GraphCalendarClient } from '../graph/graph-calendar.client';
import { GraphApiError } from '../graph/graph-http';
import { AssignmentNotifierService } from '../../notifications/assignment-notifier.service';

const START = new Date('2026-11-01T03:00:00Z');
const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1', caseId: 'c1', title: 'ประชุม', type: 'CLIENT_MEETING', startAt: START, endAt: null,
  updatedAt: new Date('2026-10-13T10:00:00Z'), onlineMeeting: false, meetingOrganizerId: null,
  case: { firmId: 'f1', leadLawyerId: 'lead', ownRef: 'R1' }, assignees: [{ userId: 'u1' }, { userId: 'u2' }], ...over,
});
const copy = (over: Record<string, unknown> = {}) => ({
  id: 'cp1', eventId: 'e1', userId: 'u1', connectionId: 'c-1', graphEventId: 'g1',
  syncedAt: new Date('2026-10-13T11:00:00Z'), removedInOutlookAt: null, ...over,
});
const connection = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', userId: 'u1', status: 'ACTIVE', syncCalendar: true, calendarDeltaLink: 'DL', calendarDeltaStartedAt: new Date(), ...over,
});
const moved = (start = new Date('2026-11-01T05:00:00Z'), end = new Date('2026-11-01T06:00:00Z')) => ({ id: 'g1', start, end });

describe('OutlookCalendarInboundService', () => {
  let svc: OutlookCalendarInboundService;
  const prisma = {
    mailboxConnection: { findMany: jest.fn(), update: jest.fn() },
    calendarEventOutlookCopy: { findMany: jest.fn(), update: jest.fn() },
    calendarEvent: { findUnique: jest.fn(), update: jest.fn() },
    calendarEventOutlookChange: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    reminderLog: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
    auditLog: { create: jest.fn() },
  };
  const connections = { getValidAccessToken: jest.fn() };
  const calendar = { calendarViewDelta: jest.fn() };
  const notifier = { notifyAssigned: jest.fn() };

  beforeEach(async () => {
    Object.values(prisma).forEach((m) => (typeof m === 'function' ? m.mockReset() : Object.values(m).forEach((f) => f.mockReset())));
    jest.clearAllMocks();
    connections.getValidAccessToken.mockResolvedValue('tok');
    prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    prisma.mailboxConnection.findMany.mockResolvedValue([connection()]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([copy()]);
    prisma.calendarEvent.findUnique.mockResolvedValue(event());
    prisma.user.findUnique.mockResolvedValue({ firstName: 'สมชาย', lastName: 'ใจดี' });
    calendar.calendarViewDelta.mockResolvedValue({ events: [], deltaLink: 'DL2' });
    const mod = await Test.createTestingModule({
      providers: [
        OutlookCalendarInboundService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutlookConnectionsService, useValue: connections },
        { provide: GraphCalendarClient, useValue: calendar },
        { provide: AssignmentNotifierService, useValue: notifier },
      ],
    }).compile();
    svc = mod.get(OutlookCalendarInboundService);
  });

  it('first window is baseline only: stores the link, acts on nothing', async () => {
    prisma.mailboxConnection.findMany.mockResolvedValue([connection({ calendarDeltaLink: null, calendarDeltaStartedAt: null })]);
    calendar.calendarViewDelta.mockResolvedValue({ events: [moved()], deltaLink: 'DL1' });
    await svc.pollAll();
    expect(calendar.calendarViewDelta.mock.calls[0][1]).toHaveProperty('start');
    expect(prisma.mailboxConnection.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: expect.objectContaining({ calendarDeltaLink: 'DL1' }) });
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
    expect(prisma.calendarEventOutlookChange.create).not.toHaveBeenCalled();
  });

  it('a window older than 7 days restarts as a baseline', async () => {
    prisma.mailboxConnection.findMany.mockResolvedValue([connection({ calendarDeltaStartedAt: new Date(Date.now() - 8 * 86_400_000) })]);
    calendar.calendarViewDelta.mockResolvedValue({ events: [moved()], deltaLink: 'DL1' });
    await svc.pollAll();
    expect(calendar.calendarViewDelta.mock.calls[0][1]).toHaveProperty('start');
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
  });

  it('skips connections without copies', async () => {
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    await svc.pollAll();
    expect(calendar.calendarViewDelta).not.toHaveBeenCalled();
  });

  it('ignores our own write echo (default 60 min end, minute precision)', async () => {
    calendar.calendarViewDelta.mockResolvedValue({
      events: [{ id: 'g1', start: new Date(START.getTime() + 20_000), end: new Date(START.getTime() + 3_600_000) }], deltaLink: 'DL2',
    });
    await svc.pollAll();
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
    expect(prisma.calendarEventOutlookChange.create).not.toHaveBeenCalled();
    expect(prisma.mailboxConnection.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: { calendarDeltaLink: 'DL2' } });
  });

  it('ignores a diff while the system change is not yet synced out', async () => {
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([copy({ syncedAt: new Date('2026-10-13T09:00:00Z') })]);
    calendar.calendarViewDelta.mockResolvedValue({ events: [moved()], deltaLink: 'DL2' });
    await svc.pollAll();
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
    expect(prisma.calendarEventOutlookChange.create).not.toHaveBeenCalled();
  });

  it('meeting moved by a responsible person is applied and the others are told', async () => {
    calendar.calendarViewDelta.mockResolvedValue({ events: [moved()], deltaLink: 'DL2' });
    await svc.pollAll();
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' }, data: { startAt: new Date('2026-11-01T05:00:00Z'), endAt: new Date('2026-11-01T06:00:00Z') },
    });
    const n = notifier.notifyAssigned.mock.calls[0][0];
    expect(n).toEqual(expect.objectContaining({ actorUserId: 'u1', category: 'CALENDAR', firmId: 'f1' }));
    expect(n.userIds.sort()).toEqual(['lead', 'u1', 'u2']);
    expect(n.summaryText).toContain('สมชาย ใจดี ย้ายนัดใน Outlook · R1');
    expect(n.entityPath).toBe('/court-day/e1');
    expect(prisma.reminderLog.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'e1' } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'CALENDAR_EVENT_MOVED_FROM_OUTLOOK', firmId: 'f1', userId: 'u1' }) });
  });

  it.each(['COURT_DATE', 'DEADLINE'])('%s moved is only a proposal', async (type) => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ type }));
    prisma.calendarEventOutlookChange.findFirst.mockResolvedValue(null);
    calendar.calendarViewDelta.mockResolvedValue({ events: [moved()], deltaLink: 'DL2' });
    await svc.pollAll();
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
    expect(prisma.calendarEventOutlookChange.create).toHaveBeenCalledWith({
      data: { eventId: 'e1', userId: 'u1', copyId: 'cp1', proposedStartAt: new Date('2026-11-01T05:00:00Z'), proposedEndAt: new Date('2026-11-01T06:00:00Z') },
    });
    const n = notifier.notifyAssigned.mock.calls[0][0];
    expect(n.userIds.sort()).toEqual(['lead', 'u1']);
    expect(n.summaryText).toContain('นัดศาล/วันครบกำหนดถูกย้ายใน Outlook · R1');
  });

  it('an existing open proposal is updated, not duplicated, and not re-notified when unchanged', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ type: 'COURT_DATE' }));
    prisma.calendarEventOutlookChange.findFirst.mockResolvedValue({
      id: 'ch1', proposedStartAt: new Date('2026-11-01T05:00:00Z'), proposedEndAt: new Date('2026-11-01T06:00:00Z'),
    });
    calendar.calendarViewDelta.mockResolvedValue({ events: [moved()], deltaLink: 'DL2' });
    await svc.pollAll();
    expect(prisma.calendarEventOutlookChange.create).not.toHaveBeenCalled();
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it('a move by someone who is not responsible is a proposal even for a meeting', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u2' }] }));
    prisma.calendarEventOutlookChange.findFirst.mockResolvedValue(null);
    calendar.calendarViewDelta.mockResolvedValue({ events: [moved()], deltaLink: 'DL2' });
    await svc.pollAll();
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
    expect(prisma.calendarEventOutlookChange.create).toHaveBeenCalled();
  });

  it('the Teams organizer counts as responsible', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u2' }], onlineMeeting: true, meetingOrganizerId: 'u1' }));
    calendar.calendarViewDelta.mockResolvedValue({ events: [moved()], deltaLink: 'DL2' });
    await svc.pollAll();
    expect(prisma.calendarEvent.update).toHaveBeenCalled();
  });

  it.each([{ removed: true }, { isCancelled: true }])('%j flags the copy and never touches the event', async (flag) => {
    calendar.calendarViewDelta.mockResolvedValue({ events: [{ id: 'g1', ...flag }], deltaLink: 'DL2' });
    await svc.pollAll();
    expect(prisma.calendarEventOutlookCopy.update).toHaveBeenCalledWith({ where: { id: 'cp1' }, data: { removedInOutlookAt: expect.any(Date) } });
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
  });

  it('410 Gone clears the delta link so the next run restarts', async () => {
    calendar.calendarViewDelta.mockRejectedValue(new GraphApiError(410, 'gone'));
    await svc.pollAll();
    expect(prisma.mailboxConnection.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: { calendarDeltaLink: null, calendarDeltaStartedAt: null } });
  });

  it('one failing connection does not stop the next', async () => {
    prisma.mailboxConnection.findMany.mockResolvedValue([connection(), connection({ id: 'c-2', userId: 'u2' })]);
    calendar.calendarViewDelta.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ events: [], deltaLink: 'DL3' });
    await svc.pollAll();
    expect(calendar.calendarViewDelta).toHaveBeenCalledTimes(2);
  });
});
