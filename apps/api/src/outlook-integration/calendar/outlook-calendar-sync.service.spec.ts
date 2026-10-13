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
    calendarEvent: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    calendarEventOutlookCopy: { findMany: jest.fn(), upsert: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    mailboxConnection: { findMany: jest.fn() },
  };
  const connections = { findActiveForUser: jest.fn(), getValidAccessToken: jest.fn().mockResolvedValue('tok') };
  const calendar = { createEvent: jest.fn(), updateEvent: jest.fn(), deleteEvent: jest.fn() };
  const firmLink = { originForFirm: jest.fn().mockResolvedValue('https://firm.samnuan.com') };

  beforeEach(async () => {
    jest.clearAllMocks();
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
    connections.findActiveForUser.mockImplementation(async (id: string) => (id === 'u1' ? conn('u1') : conn('u2', { syncCalendar: false })));
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
    connections.findActiveForUser.mockResolvedValue(conn('lead'));
    calendar.createEvent.mockResolvedValue({ id: 'g1' });
    await svc.syncEvent('e1');
    expect(connections.findActiveForUser).toHaveBeenCalledWith('lead');
  });

  it('updates a stale copy and leaves a fresh one alone', async () => {
    const e = event();
    prisma.calendarEvent.findUnique.mockResolvedValue(e);
    connections.findActiveForUser.mockResolvedValue(conn('u1'));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: new Date('2026-10-01') }]);
    calendar.updateEvent.mockResolvedValue({ id: 'g1' });
    await svc.syncEvent('e1');
    expect(calendar.updateEvent).toHaveBeenCalledWith('tok', 'g1', expect.any(Object));

    jest.clearAllMocks();
    connections.getValidAccessToken.mockResolvedValue('tok');
    prisma.calendarEvent.findUnique.mockResolvedValue(e);
    connections.findActiveForUser.mockResolvedValue(conn('u1'));
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
    expect(prisma.calendarEventOutlookCopy.delete).toHaveBeenCalledWith({ where: { id: 'cp' } });
  });

  it('removes the copy of someone no longer responsible', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u2' }] }));
    connections.findActiveForUser.mockImplementation(async (id: string) => conn(id));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'g1', syncedAt: new Date() }]);
    calendar.createEvent.mockResolvedValue({ id: 'g2' });
    await svc.syncEvent('e1');
    expect(calendar.deleteEvent).toHaveBeenCalledWith('tok', 'g1');
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
  });

  it('404 on update drops the copy and recreates it', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event());
    connections.findActiveForUser.mockResolvedValue(conn('u1'));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([{ id: 'cp', eventId: 'e1', userId: 'u1', connectionId: 'conn-u1', graphEventId: 'gone', syncedAt: new Date('2026-01-01') }]);
    calendar.updateEvent.mockRejectedValue(new GraphApiError(404, 'gone'));
    calendar.createEvent.mockResolvedValue({ id: 'g-new' });
    await svc.syncEvent('e1');
    expect(calendar.createEvent).toHaveBeenCalled();
    expect(prisma.calendarEventOutlookCopy.upsert.mock.calls.at(-1)[0].update.graphEventId).toBe('g-new');
  });

  it('token failure for one user does not stop others', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event({ assignees: [{ userId: 'u1' }, { userId: 'u2' }] }));
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    connections.findActiveForUser.mockImplementation(async (id: string) => conn(id));
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
    expect(connections.findActiveForUser).not.toHaveBeenCalled();
  });

  it('concurrent syncEvent calls for the same event make one create', async () => {
    prisma.calendarEvent.findUnique.mockResolvedValue(event());
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValue([]);
    connections.findActiveForUser.mockResolvedValue(conn('u1'));
    calendar.createEvent.mockResolvedValue({ id: 'g1' });
    await Promise.all([svc.syncEvent('e1'), svc.syncEvent('e1')]);
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
  });

  it('syncEventSoon never throws', async () => {
    prisma.calendarEvent.findUnique.mockRejectedValue(new Error('db down'));
    expect(() => svc.syncEventSoon('e1')).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });

  it('reconcileAll queues changed, missing and orphaned copies', async () => {
    prisma.mailboxConnection.findMany.mockResolvedValue([conn('u1')]);
    prisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'new', updatedAt: new Date() },
      { id: 'same', updatedAt: new Date('2026-10-01') },
    ]);
    prisma.calendarEventOutlookCopy.findMany.mockResolvedValueOnce([
      { eventId: 'same', syncedAt: new Date('2026-10-01'), connectionId: 'conn-u1' },
      { eventId: 'deleted', syncedAt: new Date('2026-10-01'), connectionId: 'conn-u1' },
    ]);
    const spy = jest.spyOn(svc, 'syncEvent').mockResolvedValue(undefined);
    await svc.reconcileAll();
    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual(['deleted', 'new']);
  });

  it('reconcileAll does not re-queue copies of events that merely slipped into the past', async () => {
    prisma.mailboxConnection.findMany.mockResolvedValue([conn('u1')]);
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
});
