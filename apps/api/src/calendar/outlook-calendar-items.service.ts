import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser, OutlookCalendarItemDto, OutlookCalendarItemsResponse } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class OutlookCalendarItemsService {
  constructor(private prisma: PrismaService) {}

  async get(user: AuthUser, from?: string, to?: string): Promise<OutlookCalendarItemsResponse> {
    const start = new Date(from ?? ''), end = new Date(to ?? '');
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new BadRequestException('ช่วงวันที่ไม่ถูกต้อง');
    }
    if (end.getTime() - start.getTime() > 62 * 86400000) throw new BadRequestException('ช่วงวันที่ยาวเกินไป (สูงสุด 62 วัน)');
    const [connections, owner] = await Promise.all([
      this.prisma.mailboxConnection.findMany({
        where: { userId: user.id, firmId: user.firmId, status: 'ACTIVE', showCalendar: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, mailboxAddress: true, calendarSyncedAt: true },
      }),
      this.prisma.user.findUnique({ where: { id: user.id }, select: { primaryMailboxConnectionId: true } }),
    ]);
    const rows = await this.prisma.outlookCalendarItem.findMany({
      where: { userId: user.id, connectionId: { in: connections.map((c) => c.id) }, startAt: { lt: end }, endAt: { gt: start } },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    const priority = (id: string) => id === owner?.primaryMailboxConnectionId ? -1 : connections.findIndex((c) => c.id === id);
    rows.sort((a, b) => priority(a.connectionId) - priority(b.connectionId));
    const seen = new Set<string>();
    const items: OutlookCalendarItemDto[] = [];
    for (const row of rows) {
      if (row.iCalUId && seen.has(row.iCalUId)) continue;
      if (row.iCalUId) seen.add(row.iCalUId);
      items.push({
        id: row.id, connectionId: row.connectionId, mailboxAddress: connections.find((c) => c.id === row.connectionId)!.mailboxAddress,
        subject: row.subject, location: row.location, startAt: row.startAt.toISOString(), endAt: row.endAt.toISOString(),
        isAllDay: row.isAllDay, showAs: (['free', 'tentative', 'busy', 'oof', 'workingElsewhere'].includes(row.showAs) ? row.showAs : 'unknown') as OutlookCalendarItemDto['showAs'], webLink: row.webLink?.startsWith('https://') ? row.webLink : null,
      });
    }
    items.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
    const syncedAt = connections.length && connections.every((c) => c.calendarSyncedAt)
      ? new Date(Math.min(...connections.map((c) => c.calendarSyncedAt!.getTime()))).toISOString() : null;
    return { items, syncedAt };
  }
}
