import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutlookChangesService } from './outlook-changes.service';
import { PrismaService } from '../prisma/prisma.module';
import { CalendarService } from './calendar.service';
import { OutlookCalendarSyncService } from '../outlook-integration/calendar/outlook-calendar-sync.service';

const user = { id: 'me', firmId: 'f1' } as any;
const change = { id: 'ch1', eventId: 'e1', userId: 'u1', proposedStartAt: new Date('2026-11-01T05:00:00Z'), proposedEndAt: new Date('2026-11-01T06:00:00Z'), detectedAt: new Date() };

describe('OutlookChangesService', () => {
  let svc: OutlookChangesService;
  const prisma = {
    calendarEvent: { update: jest.fn() },
    calendarEventOutlookChange: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    calendarEventOutlookCopy: { findFirst: jest.fn(), updateMany: jest.fn() },
    user: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const calendar = { findOne: jest.fn() };
  const outlook = { syncEventSoon: jest.fn() };

  beforeEach(async () => {
    Object.values(prisma).forEach((m) => Object.values(m).forEach((f) => f.mockReset()));
    jest.clearAllMocks();
    calendar.findOne.mockResolvedValue({ id: 'e1', startAt: new Date('2026-11-01T03:00:00Z'), case: { firmId: 'f1' } });
    const mod = await Test.createTestingModule({
      providers: [
        OutlookChangesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CalendarService, useValue: calendar },
        { provide: OutlookCalendarSyncService, useValue: outlook },
      ],
    }).compile();
    svc = mod.get(OutlookChangesService);
  });

  it('list returns open proposals with names and my removed flag', async () => {
    prisma.calendarEventOutlookChange.findMany.mockResolvedValue([change]);
    prisma.calendarEventOutlookCopy.findFirst.mockResolvedValue({ removedInOutlookAt: new Date() });
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', firstName: 'สมชาย', lastName: 'ใจดี' }]);
    const res = await svc.list(user, 'e1');
    expect(prisma.calendarEventOutlookChange.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: 'e1', resolvedAt: null } }));
    expect(res.changes[0]).toEqual(expect.objectContaining({ id: 'ch1', userName: 'สมชาย ใจดี' }));
    expect(res.myCopyRemovedInOutlook).toBe(true);
  });

  it('every endpoint is gated by the calendar event access check', async () => {
    calendar.findOne.mockRejectedValue(new ForbiddenException());
    await expect(svc.list(user, 'e1')).rejects.toThrow(ForbiddenException);
    await expect(svc.apply(user, 'e1', 'ch1')).rejects.toThrow(ForbiddenException);
    await expect(svc.keep(user, 'e1', 'ch1')).rejects.toThrow(ForbiddenException);
    await expect(svc.restoreMyCopy(user, 'e1')).rejects.toThrow(ForbiddenException);
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
  });

  it('apply sets the event times, resolves APPLIED and the rest KEPT, audits', async () => {
    prisma.calendarEventOutlookChange.findFirst.mockResolvedValue(change);
    await svc.apply(user, 'e1', 'ch1');
    expect(prisma.calendarEvent.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { startAt: change.proposedStartAt, endAt: change.proposedEndAt } });
    expect(prisma.calendarEventOutlookChange.update).toHaveBeenCalledWith({ where: { id: 'ch1' }, data: expect.objectContaining({ resolution: 'APPLIED', resolvedById: 'me' }) });
    expect(prisma.calendarEventOutlookChange.updateMany).toHaveBeenCalledWith({ where: { eventId: 'e1', resolvedAt: null }, data: expect.objectContaining({ resolution: 'KEPT' }) });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('apply/keep on an unknown or already resolved change is 404', async () => {
    prisma.calendarEventOutlookChange.findFirst.mockResolvedValue(null);
    await expect(svc.apply(user, 'e1', 'x')).rejects.toThrow(NotFoundException);
    await expect(svc.keep(user, 'e1', 'x')).rejects.toThrow(NotFoundException);
  });

  it('keep resolves KEPT and forces the owner copy to re-sync', async () => {
    prisma.calendarEventOutlookChange.findFirst.mockResolvedValue(change);
    await svc.keep(user, 'e1', 'ch1');
    expect(prisma.calendarEventOutlookChange.update).toHaveBeenCalledWith({ where: { id: 'ch1' }, data: expect.objectContaining({ resolution: 'KEPT' }) });
    expect(prisma.calendarEventOutlookCopy.updateMany).toHaveBeenCalledWith({ where: { eventId: 'e1', userId: 'u1' }, data: { syncedAt: new Date(0) } });
    expect(outlook.syncEventSoon).toHaveBeenCalledWith('e1');
    expect(prisma.calendarEvent.update).not.toHaveBeenCalled();
  });

  it('restore clears only the caller\'s removed flag and re-syncs', async () => {
    prisma.calendarEventOutlookCopy.updateMany.mockResolvedValue({ count: 1 });
    await svc.restoreMyCopy(user, 'e1');
    expect(prisma.calendarEventOutlookCopy.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'e1', userId: 'me', removedInOutlookAt: { not: null } }, data: { removedInOutlookAt: null, syncedAt: new Date(0) },
    });
    expect(outlook.syncEventSoon).toHaveBeenCalledWith('e1');
  });

  it('restore with nothing removed is 404', async () => {
    prisma.calendarEventOutlookCopy.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.restoreMyCopy(user, 'e1')).rejects.toThrow(NotFoundException);
    expect(outlook.syncEventSoon).not.toHaveBeenCalled();
  });
});
