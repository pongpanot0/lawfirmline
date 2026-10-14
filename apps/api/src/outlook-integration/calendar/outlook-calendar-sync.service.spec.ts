import { Test } from '@nestjs/testing';
import { OutlookCalendarSyncService } from './outlook-calendar-sync.service';
import { PrismaService } from '../../prisma/prisma.module';
import { OutlookConnectionsService } from '../outlook-connections.service';
import { GraphCalendarClient } from '../graph/graph-calendar.client';
import { GraphApiError } from '../graph/graph-http';
import { FirmLinkService } from '../../notifications/firm-link.service';

const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1', caseId: 'c1', title: 'นัด', description: null, courtName: null, type: 'COURT_DATE',
  startAt: new Date(Date.now() + 86_400_000), endAt: null, reminderMinutes: [60],
  updatedAt: new Date('2026-10-13T10:00:00Z'), onlineMeeting: false, meetingOrganizerId: null, inviteeEmails: [],
  onlineMeetingUrl: null,
  case: { firmId: 'f1', leadLawyerId: 'lead', ownRef: 'R1', title: 'คดี', blackCaseNumber: null, redCaseNumber: null },
  assignees: [{ userId: 'u1' }],
  ...over,
});
const conn = (userId: string, over: Record<string, unknown> = {}) => ({ id: `conn-${userId}`, userId, status: 'ACTIVE', syncCalendar: true, ...over });

describe('OutlookCalendarSyncService', () => {
  let svc: OutlookCalendarSyncService;
  const prisma = {
    calendarEvent: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    calendarEventOutlookCopy: { findMany: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    mailboxConnection: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  // doSync loads each user's ACTIVE connections (where.userId); reconcileAll loads by status.
  const activeFor = (byUser: (id: string) => unknown[]) =>
    prisma.mailboxConnection.findMany.mockImplementation(async (args: any) => (args.where.userId ? byUser(args.where.userId) : []));
  const connections = { getValidAccessToken: jest.fn().mockResolvedValue('tok') };
  const calendar = { createEvent: jest.fn(), updateEvent: jest.fn(), deleteEvent: jest.fn() };
  const firmLink = { originForFirm: jest.fn().mockResolvedValue('https://firm.samnuan.com') };

  beforeEach(async () => {
    Object.values(prisma).forEach((m) => Object.values(m).forEach((f) => f.mockReset()));
    jest.clearAllMocks();
    prisma.mailboxConnection.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.calendarEvent.findMany.mockResolvedValue([]); // reconcile's Teams-organizer lookup
    connections.getValidAccessToken.mockResolvedValue('tok');
    const mod = await Test.createTestingModule({
      providers: [
        OutlookCalendarSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutlookConnectionsService, useValue: connections },
        { provide: GraphCalendarClient, useValue: calendar },
        { provide: FirmLinkService, useValue: firmLink },
      ],
    }).compile();
    svc = mod.get(OutlookCalendarSyncService);
  });

  it('creates a copy for each responsible person with calendar sync on', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u1' }, { userId: 'u2' }] }));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    activeFor((id) => (id === 'u1' ? [conn('u1')] : [conn('u2', { syncCalendar: false })]));
    calendar.createEvent.mockResolvedValue({ id: 'g1' });
    await svc.syncEvent('e1');
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
    expect(calendar.createEvent.mock.calls[0][1].transactionId).toBe('e1:u1');
    expect(prisma.calendarEventOutlookCopy.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId_userId: { eventId: 'e1', userId: 'u1' } },
    }));
  });

  it('falls back to the lead lawyer when the event has no assignees', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [] }));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    activeFor((id) => [conn(id)]);
    calendar.createEvent.mockResolvedValue({ id: 'g1' });
    await svc.syncEvent('e1');
    expect(prisma.mailboxConnection.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'lead', status: 'ACTIVE' } }));
  });

  it('updates a stale copy and leaves a fresh one alone', async () => {
    const e = event();
    prisma.calendarEvent.findUnique.mockResolvedValue(e);
    activeFor((id) => [conn(id)]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: new Date('2026-10-01') }]);
    calendar.updateEvent.mockResolvedValue({ id: 'g1' });
    await svc.syncEvent('e1');
    expect(calendar.updateEvent).toHaveBeenCalledWith('tok', 'g1', expect.any(Object));

    Object.values(prisma).forEach((m) => Object.values(m).forEach((f) => f.mockReset()));
    jest.clearAllMocks();
    prisma.mailboxConnection.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    connections.getValidAccessToken.mockResolvedValue('tok');
    prisma.calendarEvent.findUnique.mockResolvedValue(e);
    activeFor((id) => [conn(id)]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: e.updatedAt }]);
    await svc.syncEvent('e1');
    expect(calendar.updateEvent).not.toHaveBeenCalled();
    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('deletes Outlook copies of an event that no longer exists', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(null);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: new Date() }]);
    await svc.syncEvent('e1');
    expect(connections.getValidAccessToken).toHaveBeenCalledWith('conn-u1');
    expect(calendar.deleteEvent).toHaveBeenCalledWith('tok', 'g1');
    expect(prisma.calendarEventOutlookCopy.deleteMany).toHaveBeenCalledWith({ where: { id: 'cp' } });
  });

  it('removes the copy of someone no longer responsible', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u2' }] }));
    activeFor((id) => [conn(id)]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: new Date() }]);
    calendar.createEvent.mockResolvedValue({ id: 'g2' });
    await svc.syncEvent('e1');
    expect(calendar.deleteEvent).toHaveBeenCalledWith('tok', 'g1');
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
  });

  it('404 on update drops the copy and recreates it', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event());
    activeFor((id) => [conn(id)]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'gone', syncedAt: new Date('2026-01-01') }]);
    calendar.updateEvent.mockRejectedValue(new GraphApiError(404, 'gone'));
    calendar.createEvent.mockResolvedValue({ id: 'g-new' });
    await svc.syncEvent('e1');
    expect(calendar.createEvent).toHaveBeenCalled();
    expect(prisma.calendarEventOutlookCopy.delete).not.toHaveBeenCalled();
    expect(prisma.calendarEventOutlookCopy.deleteMany).not.toHaveBeenCalled();
    expect(prisma.calendarEventOutlookCopy.upsert.mock.calls.at(-1)[0].update.graphEventId).toBe('g-new');
  });

  it('token failure for one user does not stop others', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u1' }, { userId: 'u2' }] }));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    activeFor((id) => [conn(id)]);
    connections.getValidAccessToken.mockImplementation(async (cid: string) => {
      if (cid === 'conn-u1') throw new Error('expired');
      return 'tok';
    });
    calendar.createEvent.mockResolvedValue({ id: 'g2' });
    await expect(svc.syncEvent('e1')).resolves.toBeUndefined();
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
  });

  it('does nothing for events more than a day in the past', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ startAt: new Date(Date.now() - 3 * 86_400_000) }));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    await svc.syncEvent('e1');
    expect(prisma.mailboxConnection.findMany).not.toHaveBeenCalled();
  });

  it('concurrent syncEvent calls for the same event make one create', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event());
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    activeFor((id) => [conn(id)]);
    calendar.createEvent.mockResolvedValue({ id: 'g1' });
    await Promise.all([svc.syncEvent('e1'), svc.syncEvent('e1')]);
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
  });

  it('syncEventSoon never throws', async () => {
    prisma.calendarEvent.findUnique.mockRejectedValue(new Error('db down'));
    expect(() => svc.syncEventSoon('e1')).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });

  it('404 on update whose recreate also fails does not stop the next user', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u1' }, { userId: 'u2' }] }));
    activeFor((id) => [conn(id)]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'gone', syncedAt: new Date('2026-01-01') }]);
    calendar.updateEvent.mockRejectedValue(new GraphApiError(404, 'gone'));
    calendar.createEvent.mockRejectedValueOnce(new Error('graph down')).mockResolvedValueOnce({ id: 'g2' });
    await expect(svc.syncEvent('e1')).resolves.toBeUndefined();
    expect(calendar.createEvent).toHaveBeenCalledTimes(2);
    expect(prisma.calendarEventOutlookCopy.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.calendarEventOutlookCopy.upsert.mock.calls[0][0].where).toEqual({ eventId_userId: { eventId: 'e1', userId: 'u2' } });
    expect(prisma.calendarEventOutlookCopy.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'e1', userId: 'u1' },
      data: { lastError: expect.stringContaining('graph down') },
    });
  });

  describe('Teams meetings', () => {
    const teams = (over: Record<string, unknown> = {}) =>
      event({ type: 'CLIENT_MEETING', onlineMeeting: true, meetingOrganizerId: 'u1', inviteeEmails: ['c@x.com'], ...over });

    it('stores the Teams join URL from the organizer copy without re-patching it', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValue(teams());
      prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
      activeFor((id) => [conn(id)]);
      calendar.createEvent.mockResolvedValue({ id: 'g1', onlineMeeting: { joinUrl: 'https://teams/x' } });
      const bumped = new Date('2026-10-13T10:05:00Z');
      prisma.calendarEvent.updateMany.mockResolvedValue({ count: 1 });
      prisma.calendarEvent.findUnique.mockResolvedValueOnce(teams()).mockResolvedValueOnce({ updatedAt: bumped });
      await svc.syncEvent('e1');
      expect(calendar.createEvent.mock.calls[0][1]).toMatchObject({ isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' });
      expect(prisma.calendarEvent.updateMany).toHaveBeenCalledWith({ where: { id: 'e1', updatedAt: new Date('2026-10-13T10:00:00Z') }, data: { onlineMeetingUrl: 'https://teams/x' } });
      expect(prisma.calendarEventOutlookCopy.update).toHaveBeenCalledWith({ where: { eventId_userId: { eventId: 'e1', userId: 'u1' } }, data: { syncedAt: bumped } });
    });

    it('never stores a non-https join URL', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValue(teams());
      prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
      activeFor((id) => [conn(id)]);
      calendar.createEvent.mockResolvedValue({ id: 'g1', onlineMeeting: { joinUrl: 'javascript:alert(1)' } });
      await svc.syncEvent('e1');
      expect(prisma.calendarEvent.updateMany).not.toHaveBeenCalled();
      expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
    });

    it('when the event was edited meanwhile it stores the URL but leaves the copy stale', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValue(teams());
      prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
      activeFor((id) => [conn(id)]);
      calendar.createEvent.mockResolvedValue({ id: 'g1', onlineMeeting: { joinUrl: 'https://teams/x' } });
      prisma.calendarEvent.updateMany.mockResolvedValue({ count: 0 });
      await svc.syncEvent('e1');
      expect(prisma.calendarEvent.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { onlineMeetingUrl: 'https://teams/x' } });
      expect(prisma.calendarEventOutlookCopy.update).not.toHaveBeenCalled();
    });

    it('overwrites a different stored join URL and ignores an equal one', async () => {
      prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
      activeFor((id) => [conn(id)]);
      calendar.createEvent.mockResolvedValue({ id: 'g1', onlineMeeting: { joinUrl: 'https://teams/new' } });
      prisma.calendarEvent.updateMany.mockResolvedValue({ count: 1 });
      prisma.calendarEvent.findUnique.mockResolvedValueOnce(teams({ onlineMeetingUrl: 'https://teams/old' })).mockResolvedValueOnce({ updatedAt: new Date() });
      await svc.syncEvent('e1');
      expect(prisma.calendarEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { onlineMeetingUrl: 'https://teams/new' } }));

      prisma.calendarEvent.updateMany.mockClear();
      prisma.calendarEvent.findUnique.mockResolvedValue(teams({ onlineMeetingUrl: 'https://teams/new' }));
      await svc.syncEvent('e1');
      expect(prisma.calendarEvent.updateMany).not.toHaveBeenCalled();
    });

    it('the organizer gets the meeting even with calendar sync off', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValue(teams({ meetingOrganizerId: 'org', assignees: [{ userId: 'u1' }] }));
      prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
      activeFor((id) => [conn(id, { syncCalendar: false })]);
      calendar.createEvent.mockResolvedValue({ id: 'g1' });
      await svc.syncEvent('e1');
      expect(calendar.createEvent).toHaveBeenCalledTimes(1); // org only; u1 has sync off
      expect(calendar.createEvent.mock.calls[0][1]).toMatchObject({ isOnlineMeeting: true });
      expect(prisma.calendarEventOutlookCopy.upsert.mock.calls[0][0].where).toEqual({ eventId_userId: { eventId: 'e1', userId: 'org' } });
    });

    describe('withdrawing the organizer copy', () => {
      const copyRow = { id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: new Date() };
      const settle = () => new Promise((r) => setTimeout(r, 20));

      it('an organizer who still attends gets a plain copy back', async () => {
        prisma.calendarEvent.findUnique.mockResolvedValue(event({ type: 'CLIENT_MEETING', onlineMeeting: false, assignees: [{ userId: 'u1' }] }));
        prisma.calendarEventOutlookCopy.findMany.mockResolvedValueOnce([copyRow]).mockResolvedValue([]);
        activeFor((id) => [conn(id)]);
        calendar.createEvent.mockResolvedValue({ id: 'g2' });
        svc.withdrawOrganizerCopySoon('e1', 'u1');
        await settle();
        expect(calendar.deleteEvent).toHaveBeenCalledWith('tok', 'g1');
        expect(calendar.createEvent).toHaveBeenCalledTimes(1);
        const payload = calendar.createEvent.mock.calls[0][1];
        expect(payload.isOnlineMeeting).toBeUndefined();
        expect(payload.attendees).toBeUndefined();
        expect(calendar.deleteEvent.mock.invocationCallOrder[0]).toBeLessThan(calendar.createEvent.mock.invocationCallOrder[0]);
      });

      it('an organizer who does not attend only loses the copy', async () => {
        prisma.calendarEvent.findUnique.mockResolvedValue(event({ type: 'CLIENT_MEETING', onlineMeeting: false, assignees: [{ userId: 'u2' }] }));
        prisma.calendarEventOutlookCopy.findMany.mockResolvedValueOnce([copyRow]).mockResolvedValue([]);
        activeFor((id) => (id === 'u2' ? [conn('u2', { syncCalendar: false })] : [conn(id)]));
        svc.withdrawOrganizerCopySoon('e1', 'u1');
        await settle();
        expect(calendar.deleteEvent).toHaveBeenCalledWith('tok', 'g1');
        expect(calendar.createEvent).not.toHaveBeenCalled();
      });

      it('never throws', async () => {
        prisma.calendarEventOutlookCopy.findMany.mockRejectedValue(new Error('db down'));
        expect(() => svc.withdrawOrganizerCopySoon('e1', 'u1')).not.toThrow();
        await settle();
      });
    });
  });

  describe('connection choice', () => {
    const two = [conn('u1', { id: 'old', createdAt: new Date('2026-01-01') }), conn('u1', { id: 'new', createdAt: new Date('2026-06-01') })];

    it('keeps a stale copy on its existing (newer) connection: update only, no delete/recreate', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValue(event());
      activeFor(() => two);
      prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'new', graphEventId: 'g1', syncedAt: new Date('2026-01-01') }]);
      calendar.updateEvent.mockResolvedValue({ id: 'g1' });
      await svc.syncEvent('e1');
      expect(connections.getValidAccessToken).toHaveBeenCalledWith('new');
      expect(calendar.updateEvent).toHaveBeenCalledWith('tok', 'g1', expect.any(Object));
      expect(calendar.deleteEvent).not.toHaveBeenCalled();
      expect(calendar.createEvent).not.toHaveBeenCalled();
      expect(prisma.calendarEventOutlookCopy.deleteMany).not.toHaveBeenCalled();
    });

    it('leaves a fresh copy on the newer connection completely alone', async () => {
      const e = event();
      prisma.calendarEvent.findUnique.mockResolvedValue(e);
      activeFor(() => two);
      prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'new', graphEventId: 'g1', syncedAt: e.updatedAt }]);
      await svc.syncEvent('e1');
      expect(calendar.updateEvent).not.toHaveBeenCalled();
      expect(calendar.deleteEvent).not.toHaveBeenCalled();
      expect(calendar.createEvent).not.toHaveBeenCalled();
      expect(prisma.calendarEventOutlookCopy.deleteMany).not.toHaveBeenCalled();
    });

    it('skips a user whose copy sits on an EXPIRED connection (no update, create or delete)', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValue(event());
      activeFor(() => [conn('u1', { id: 'other' })]);
      prisma.mailboxConnection.findUnique.mockResolvedValue({ status: 'EXPIRED' });
      prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-x', graphEventId: 'g1', syncedAt: new Date('2026-01-01') }]);
      await svc.syncEvent('e1');
      expect(calendar.updateEvent).not.toHaveBeenCalled();
      expect(calendar.createEvent).not.toHaveBeenCalled();
      expect(calendar.deleteEvent).not.toHaveBeenCalled();
      expect(prisma.calendarEventOutlookCopy.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('deleting copies', () => {
    const gone = () => {
      prisma.calendarEvent.findUnique.mockResolvedValue(null);
      prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: new Date() }]);
    };

    it('keeps the row (with lastError) when the connection is EXPIRED and no token is available', async () => {
      gone();
      prisma.mailboxConnection.findUnique.mockResolvedValue({ status: 'EXPIRED' });
      connections.getValidAccessToken.mockRejectedValue(new Error('expired'));
      await svc.syncEvent('e1');
      expect(prisma.calendarEventOutlookCopy.deleteMany).not.toHaveBeenCalled();
      expect(prisma.calendarEventOutlookCopy.updateMany).toHaveBeenCalledWith({ where: { id: 'cp' }, data: { lastError: expect.stringContaining('expired') } });
    });

    it('keeps the row on a non-404 Graph failure', async () => {
      gone();
      calendar.deleteEvent.mockRejectedValue(new GraphApiError(500, 'boom'));
      await svc.syncEvent('e1');
      expect(prisma.calendarEventOutlookCopy.deleteMany).not.toHaveBeenCalled();
    });

    it('drops the row without calling Graph when the connection is REVOKED', async () => {
      gone();
      prisma.mailboxConnection.findUnique.mockResolvedValue({ status: 'REVOKED' });
      await svc.syncEvent('e1');
      expect(connections.getValidAccessToken).not.toHaveBeenCalled();
      expect(calendar.deleteEvent).not.toHaveBeenCalled();
      expect(prisma.calendarEventOutlookCopy.deleteMany).toHaveBeenCalledWith({ where: { id: 'cp' } });
    });

    it('drops the row when the connection no longer exists', async () => {
      gone();
      prisma.mailboxConnection.findUnique.mockResolvedValue(null);
      await svc.syncEvent('e1');
      expect(calendar.deleteEvent).not.toHaveBeenCalled();
      expect(prisma.calendarEventOutlookCopy.deleteMany).toHaveBeenCalledWith({ where: { id: 'cp' } });
    });

    it('drops the row when Graph says 404', async () => {
      gone();
      calendar.deleteEvent.mockRejectedValue(new GraphApiError(404, 'gone'));
      await svc.syncEvent('e1');
      expect(prisma.calendarEventOutlookCopy.deleteMany).toHaveBeenCalledWith({ where: { id: 'cp' } });
    });
  });

  describe('connection choice without a copy', () => {
    it('with no copy yet, uses the oldest eligible connection (asks for createdAt asc)', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValue(event());
      activeFor(() => [conn('u1', { id: 'old' }), conn('u1', { id: 'new' })]);
      prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
      calendar.createEvent.mockResolvedValue({ id: 'g1' });
      await svc.syncEvent('e1');
      expect(connections.getValidAccessToken).toHaveBeenCalledWith('old');
      expect(prisma.mailboxConnection.findMany).toHaveBeenCalledWith({ where: { userId: 'u1', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    });
  });

  // reconcileAll: first mailboxConnection.findMany = ACTIVE ones, second = non-REVOKED ids.
  const reconcileConns = (active: unknown[], live: { id: string }[] = []) =>
    prisma.mailboxConnection.findMany.mockImplementation(async (args: any) => (args.where.status === 'ACTIVE' ? active : live));

  it('reconcileAll queues changed, missing and orphaned copies', async () => {
    reconcileConns([conn('u1')], [{ id: 'conn-u1' }]);
    prisma.calendarEvent.findMany
      .mockResolvedValueOnce([
        { id: 'new', updatedAt: new Date() },
        { id: 'same', updatedAt: new Date('2026-10-01') },
      ])
      .mockResolvedValueOnce([]); // leftover lookup: 'deleted' no longer exists
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValueOnce([
      { eventId: 'same', syncedAt: new Date('2026-10-01'), connectionId: 'conn-u1' },
      { eventId: 'deleted', syncedAt: new Date('2026-10-01'), connectionId: 'conn-u1' },
    ]);
    const spy = jest.spyOn(svc, 'syncEvent').mockResolvedValue(undefined);
    await svc.reconcileAll();
    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual(['deleted', 'new']);
  });

  it('reconcileAll does not re-queue copies of events that merely slipped into the past', async () => {
    reconcileConns([conn('u1')], [{ id: 'conn-u1' }]);
    prisma.calendarEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'old', startAt: new Date(Date.now() - 3 * 86_400_000) }]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValueOnce([
      { eventId: 'old', syncedAt: new Date('2026-10-01'), connectionId: 'conn-u1' },
      { eventId: 'deleted', syncedAt: new Date('2026-10-01'), connectionId: 'conn-u1' },
    ]);
    const spy = jest.spyOn(svc, 'syncEvent').mockResolvedValue(undefined);
    await svc.reconcileAll();
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['deleted']);
  });

  it('reconcileAll: calendar-sync-off user keeps copies of past events but gets live ones queued for removal', async () => {
    reconcileConns([conn('u1', { syncCalendar: false })], [{ id: 'conn-u1' }]);
    prisma.calendarEvent.findMany.mockResolvedValueOnce([
      { id: 'past', startAt: new Date(Date.now() - 3 * 86_400_000) },
      { id: 'future', startAt: new Date(Date.now() + 86_400_000) },
    ]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValueOnce([
      { eventId: 'past', syncedAt: new Date(), connectionId: 'conn-u1' },
      { eventId: 'future', syncedAt: new Date(), connectionId: 'conn-u1' },
    ]);
    const spy = jest.spyOn(svc, 'syncEvent').mockResolvedValue(undefined);
    await svc.reconcileAll();
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['future']);
  });

  it('reconcileAll queues a Teams meeting whose sync-off organizer has no copy yet', async () => {
    reconcileConns([conn('org', { syncCalendar: false })], [{ id: 'conn-org' }]);
    prisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'meet', updatedAt: new Date('2026-10-13'), meetingOrganizerId: 'org' },
      { id: 'other', updatedAt: new Date('2026-10-13'), meetingOrganizerId: 'nobody' }, // no active connection
    ]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    const spy = jest.spyOn(svc, 'syncEvent').mockResolvedValue(undefined);
    await svc.reconcileAll();
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['meet']);
  });

  it('reconcileAll only forgets copies of REVOKED / missing connections (EXPIRED may recover)', async () => {
    reconcileConns([], [{ id: 'conn-active' }, { id: 'conn-expired' }]);
    await svc.reconcileAll();
    expect(prisma.mailboxConnection.findMany).toHaveBeenCalledWith({ where: { status: { not: 'REVOKED' } }, select: { id: true } });
    expect(prisma.calendarEventOutlookCopy.deleteMany).toHaveBeenCalledWith({
      where: { connectionId: { notIn: ['conn-active', 'conn-expired'] } },
    });
  });

  it('reconcileAll ignores a call while a run is in progress', async () => {
    let release!: () => void;
    prisma.mailboxConnection.findMany
      .mockImplementationOnce(() => new Promise((r) => { release = () => r([]); }))
      .mockResolvedValue([]);
    const first = svc.reconcileAll();
    await svc.reconcileAll();
    expect(prisma.mailboxConnection.findMany).toHaveBeenCalledTimes(1);
    release();
    await first;
    reconcileConns([], []);
    await svc.reconcileAll();
    expect(prisma.mailboxConnection.findMany).toHaveBeenCalledTimes(4); // two lookups per completed run
  });
});
