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
  const prisma = { firmMember: { findMany: jest.fn() }, calendarEvent: { findMany: jest.fn() }, mailboxConnection: { findMany: jest.fn() } };
  const access = { canAccessCase: jest.fn() };
  const conns = { findActiveForUser: jest.fn(), getValidAccessToken: jest.fn() };
  const graph = { getSchedule: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.firmMember.findMany.mockResolvedValue([member(A, 'a'), member(B, 'b')]);
    prisma.calendarEvent.findMany.mockResolvedValue([]);
    conns.findActiveForUser.mockResolvedValue({ id: 'conn' });
    conns.getValidAccessToken.mockResolvedValue('tok');
    prisma.mailboxConnection.findMany.mockResolvedValue([{ userId: A, mailboxAddress: 'a@x.com' }]);
    graph.getSchedule.mockResolvedValue([]);
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

  it('merges system + Outlook busy, drops Outlook copies of system events, uses Bangkok window', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([ev({})]);
    access.canAccessCase.mockResolvedValue(true);
    graph.getSchedule.mockResolvedValue([{ scheduleId: 'A@x.com', items: [
      { status: 'busy', start: new Date('2026-11-02T03:00:00Z'), end: new Date('2026-11-02T04:00:00Z') },
      { status: 'tentative', start: new Date('2026-11-02T06:00:00Z'), end: new Date('2026-11-02T07:00:00Z') },
      { status: 'free', start: new Date('2026-11-02T08:00:00Z'), end: new Date('2026-11-02T09:00:00Z') },
    ] }]);
    const r = await svc.get(user, dto);
    expect(graph.getSchedule).toHaveBeenCalledWith('tok', ['a@x.com'], '2026-11-02T07:00:00', '2026-11-02T21:00:00');
    expect(prisma.calendarEvent.findMany.mock.calls[0][0].where.startAt).toEqual({ gte: new Date('2026-10-31T17:00:00Z'), lt: new Date('2026-11-02T17:00:00Z') });
    const a = r.people.find((p) => p.userId === A)!;
    expect(a.source).toBe('OUTLOOK');
    expect(a.busy).toEqual([
      { start: '2026-11-02T03:00:00.000Z', end: '2026-11-02T04:00:00.000Z', label: 'ศาล' },
      { start: '2026-11-02T06:00:00.000Z', end: '2026-11-02T07:00:00.000Z' },
    ]);
    expect(r.people.find((p) => p.userId === B)!.source).toBe('SYSTEM_ONLY');
    expect((r as any).hint).toBeUndefined();
  });

  it('hides the title when the caller cannot access the case', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([ev({})]);
    access.canAccessCase.mockResolvedValue(false);
    const r = await svc.get(user, dto);
    expect(r.people[0].busy[0].label).toBe('ไม่ว่าง');
  });

  it('without a caller connection everyone is SYSTEM_ONLY with a hint and no Graph call', async () => {
    conns.findActiveForUser.mockResolvedValue(null);
    const r = await svc.get(user, dto);
    expect(graph.getSchedule).not.toHaveBeenCalled();
    expect(r.people.every((p) => p.source === 'SYSTEM_ONLY')).toBe(true);
    expect((r as any).hint).toContain('Microsoft 365');
  });

  it('reports a per-person error when getSchedule flags that schedule', async () => {
    graph.getSchedule.mockResolvedValue([{ scheduleId: 'a@x.com', error: 'boom', items: [] }]);
    const r = await svc.get(user, dto);
    expect(r.people.find((p) => p.userId === A)).toMatchObject({ error: 'ดูปฏิทิน Outlook ไม่ได้', busy: [] });
  });
});
