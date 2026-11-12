import { BadRequestException } from '@nestjs/common';
import { OutlookCalendarItemsService } from './outlook-calendar-items.service';
import { OutlookCalendarItemsController } from './outlook-calendar-items.controller';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';

const user = { id: 'me', firmId: 'firm' } as any;
const from = '2026-11-01T00:00:00Z', to = '2026-11-20T00:00:00Z';
const item = (id: string, connectionId: string, iCalUId: string | null) => ({
  id, connectionId, graphEventId: id, iCalUId, userId: 'me', subject: 'private', location: 'room',
  startAt: new Date('2026-11-12T03:00:00Z'), endAt: new Date('2026-11-12T04:00:00Z'), isAllDay: false, showAs: 'busy', webLink: null,
});
describe('owner-only Outlook calendar items', () => {
  const prisma = { user: { findUnique: jest.fn() }, mailboxConnection: { findMany: jest.fn() }, outlookCalendarItem: { findMany: jest.fn() } };
  const service = new OutlookCalendarItemsService(prisma as any);
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue({ primaryMailboxConnectionId: 'primary' });
    prisma.mailboxConnection.findMany.mockResolvedValue([
      { id: 'old', mailboxAddress: 'old@x.com', calendarSyncedAt: new Date('2026-11-12T01:00:00Z') },
      { id: 'primary', mailboxAddress: 'primary@x.com', calendarSyncedAt: new Date('2026-11-12T02:00:00Z') },
      { id: 'new', mailboxAddress: 'new@x.com', calendarSyncedAt: new Date('2026-11-12T03:00:00Z') },
    ]);
    prisma.outlookCalendarItem.findMany.mockResolvedValue([item('a', 'old', 'same'), item('b', 'primary', 'same'), item('c', 'new', 'other'), item('d', 'old', 'other'), item('e', 'old', null), item('f', 'new', null)]);
  });
  it('exposes the authenticated /calendar/outlook-items route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OutlookCalendarItemsController)).toBe('calendar/outlook-items');
    expect(Reflect.getMetadata(GUARDS_METADATA, OutlookCalendarItemsController)).toHaveLength(1);
  });
  it('queries caller-owned rows on shown active connections and prefers primary then oldest on iCalUId duplicates', async () => {
    const result = await new OutlookCalendarItemsController(service).get(user, from, to);
    expect(prisma.mailboxConnection.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'me', firmId: 'firm', status: 'ACTIVE', showCalendar: true } }));
    expect(prisma.outlookCalendarItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'me', connectionId: { in: ['old', 'primary', 'new'] }, startAt: { lt: new Date(to) }, endAt: { gt: new Date(from) } } }));
    expect(result.items.map((i) => i.id).sort()).toEqual(['b', 'd', 'e', 'f']);
    expect(result.items.find((i) => i.id === 'b')).toMatchObject({ mailboxAddress: 'primary@x.com', subject: 'private' });
    expect(result.syncedAt).toBe('2026-11-12T01:00:00.000Z');
    expect(result.items[0]).not.toHaveProperty('graphEventId');
  });
  it('rejects invalid/reversed ranges and more than 62 days before querying', async () => {
    await expect(service.get(user, from, '2027-01-03T00:00:00Z')).rejects.toThrow('ช่วงวันที่ยาวเกินไป (สูงสุด 62 วัน)');
    await expect(service.get(user, 'invalid', to)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.get(user, to, from)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.outlookCalendarItem.findMany).not.toHaveBeenCalled();
  });
  it('allows exactly 62 days and reports null freshness if an included connection never synced', async () => {
    prisma.mailboxConnection.findMany.mockResolvedValue([{ id: 'old', mailboxAddress: 'a@x.com', calendarSyncedAt: null }]);
    prisma.outlookCalendarItem.findMany.mockResolvedValue([]);
    expect((await service.get(user, from, new Date(new Date(from).getTime() + 62 * 86400000).toISOString())).syncedAt).toBeNull();
  });
});
