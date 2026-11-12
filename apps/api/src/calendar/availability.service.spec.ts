import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { OutlookConnectionsService } from '../outlook-integration/outlook-connections.service';
import { GraphCalendarClient } from '../outlook-integration/graph/graph-calendar.client';

const user = { id: 'me', firmId: 'f1' } as any;
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const dto = { userIds: [A, B], date: '2026-11-02' };
const member = (id: string, n: string) => ({ user: { id, firstName: n, lastName: 'X' } });
const ev = (over: any) => ({ id: 'e1', caseId: 'c1', title: 'ศาล', startAt: new Date('2026-11-02T03:00:00Z'), endAt: new Date('2026-11-02T04:00:00Z'), type: 'OTHER', assignees: [{ userId: A }], case: { leadLawyerId: null }, ...over });

describe('AvailabilityService', () => {
  let svc: AvailabilityService;
  const prisma = { firmMember: { findMany: jest.fn() }, calendarEvent: { findMany: jest.fn() }, mailboxConnection: { findMany: jest.fn() }, outlookCalendarItem: { findMany: jest.fn() } };
  const access = { canAccessCase: jest.fn() };
  const conns = { findActiveForUser: jest.fn(), getValidAccessToken: jest.fn() };
  const graph = { getSchedule: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.firmMember.findMany.mockResolvedValue([member(A, 'a'), member(B, 'b')]);
    prisma.calendarEvent.findMany.mockResolvedValue([]);
    conns.findActiveForUser.mockResolvedValue({ id: 'conn' });
    conns.getValidAccessToken.mockResolvedValue('tok');
    prisma.mailboxConnection.findMany.mockResolvedValue([{ userId: A, calendarSyncedAt: new Date() }]);
    graph.getSchedule.mockResolvedValue([]);
    prisma.outlookCalendarItem.findMany.mockResolvedValue([]);
    const mod = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseAccessService, useValue: access },
        { provide: OutlookConnectionsService, useValue: conns },
        { provide: GraphCalendarClient, useValue: graph },
      ],
    }).compile();
    svc = mod.get(AvailabilityService);
  });

  it('rejects users outside the firm', async () => {
    prisma.firmMember.findMany.mockResolvedValue([member(A, 'a')]);
    await expect(svc.get(user, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.firmMember.findMany.mock.calls[0][0].where.firmId).toBe('f1');
  });

  it('uses shown mirrors without needing a viewer connection, excludes free and exposes only times', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([ev({})]);
    access.canAccessCase.mockResolvedValue(true);
    conns.findActiveForUser.mockResolvedValue(null);
    prisma.outlookCalendarItem.findMany.mockResolvedValue([
      { userId: A, startAt: new Date('2026-11-02T06:00:00Z'), endAt: new Date('2026-11-02T07:00:00Z'), showAs: 'tentative', subject: 'private', location: 'secret', webLink: 'secret' },
      { userId: A, startAt: new Date('2026-11-02T08:00:00Z'), endAt: new Date('2026-11-02T09:00:00Z'), showAs: 'free' },
    ]);
    const r = await svc.get(user, dto);
    expect(graph.getSchedule).not.toHaveBeenCalled();
    expect(conns.findActiveForUser).not.toHaveBeenCalled();
    expect(prisma.outlookCalendarItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: { in: [A, B] }, showAs: { in: ['busy', 'oof', 'tentative', 'workingElsewhere'] }, connection: { firmId: 'f1', userId: { in: [A, B] }, showCalendar: true, status: 'ACTIVE' } }),
      select: { userId: true, startAt: true, endAt: true, showAs: true },
    }));
    const a = r.people.find((p) => p.userId === A)!;
    expect(a.source).toBe('OUTLOOK');
    expect(a.busy).toEqual([
      { start: '2026-11-02T03:00:00.000Z', end: '2026-11-02T04:00:00.000Z', label: 'ศาล' },
      { start: '2026-11-02T06:00:00.000Z', end: '2026-11-02T07:00:00.000Z' },
    ]);
    expect(r.people.find((p) => p.userId === B)!.source).toBe('SYSTEM_ONLY');
    expect(JSON.stringify(r)).not.toMatch(/private|secret|subject|webLink|location/);
  });

  it('hides the title when the caller cannot access the case', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([ev({})]);
    access.canAccessCase.mockResolvedValue(false);
    const r = await svc.get(user, dto);
    expect(r.people[0].busy[0].label).toBe('ไม่ว่าง');
  });

  it('a member without shown connections has no Outlook blocks or error', async () => {
    prisma.mailboxConnection.findMany.mockResolvedValue([]);
    const r = await svc.get(user, dto);
    expect(r.people.every((p) => p.source === 'SYSTEM_ONLY' && !('error' in p))).toBe(true);
    expect(graph.getSchedule).not.toHaveBeenCalled();
  });

  it('reports stale data only for the member whose shown connection is over one hour old', async () => {
    prisma.mailboxConnection.findMany.mockResolvedValue([{ userId: A, calendarSyncedAt: new Date(Date.now() - 3600001) }]);
    const r = await svc.get(user, dto);
    expect(r.people.find((p) => p.userId === A)).toMatchObject({ error: 'ข้อมูล Outlook ยังไม่อัปเดต', busy: [] });
    expect(r.people.find((p) => p.userId === B)).not.toHaveProperty('error');
  });
});
