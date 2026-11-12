import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { effectiveEnd } from '../outlook-integration/calendar/outlook-event-payload';
import { eventForUserWhere } from './event-people';
import { OUTLOOK_BUSY_STATUSES } from './outlook-busy';

export interface BusyBlock { start: string; end: string; label?: string }
const HIDDEN_LABEL = 'ไม่ว่าง';

@Injectable()
export class AvailabilityService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
  ) {}

  async get(user: AuthUser, dto: { userIds: string[]; date: string; excludeEventId?: string }) {
    const userIds = [...new Set(dto.userIds)];
    const dayStart = new Date(`${dto.date}T00:00:00+07:00`); // Asia/Bangkok, no DST
    if (Number.isNaN(dayStart.getTime())) throw new BadRequestException('วันที่ไม่ถูกต้อง');
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const members = await this.prisma.firmMember.findMany({
      where: { firmId: user.firmId, userId: { in: userIds } },
      select: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (members.length !== userIds.length) throw new BadRequestException('มีผู้ใช้ที่ไม่ได้อยู่ในสำนักงานนี้');

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        case: { firmId: user.firmId },
        // Started up to a day earlier: an overnight event still blocks this morning.
        startAt: { gte: new Date(dayStart.getTime() - 24 * 60 * 60 * 1000), lt: dayEnd },
        ...(dto.excludeEventId ? { id: { not: dto.excludeEventId } } : {}),
        OR: userIds.map(eventForUserWhere),
      },
      select: {
        id: true, caseId: true, title: true, startAt: true, endAt: true, type: true,
        assignees: { select: { userId: true } }, case: { select: { leadLawyerId: true } },
      },
    });
    const accessible = new Map<string, boolean>();
    for (const caseId of new Set(events.map((e) => e.caseId))) accessible.set(caseId, await this.caseAccess.canAccessCase(user, caseId));

    const system = new Map<string, BusyBlock[]>(userIds.map((id) => [id, []]));
    for (const e of events) {
      if (effectiveEnd(e) <= dayStart) continue;
      const people = e.assignees.length ? e.assignees.map((a) => a.userId) : e.case?.leadLawyerId ? [e.case.leadLawyerId] : [];
      const block = { start: e.startAt.toISOString(), end: effectiveEnd(e).toISOString(), label: accessible.get(e.caseId) ? e.title : HIDDEN_LABEL };
      for (const id of people) system.get(id)?.push(block);
    }

    const [conns, items] = await Promise.all([
      this.prisma.mailboxConnection.findMany({
        where: { userId: { in: userIds }, firmId: user.firmId, status: 'ACTIVE', showCalendar: true },
        select: { userId: true, calendarSyncedAt: true },
      }),
      this.prisma.outlookCalendarItem.findMany({
        where: { userId: { in: userIds }, connection: { firmId: user.firmId, userId: { in: userIds }, showCalendar: true, status: 'ACTIVE' }, showAs: { in: OUTLOOK_BUSY_STATUSES }, startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
        select: { userId: true, startAt: true, endAt: true, showAs: true },
      }),
    ]);
    const outlook = new Map<string, { error?: string; blocks: BusyBlock[] }>();
    for (const id of userIds) {
      const shown = conns.filter((c) => c.userId === id);
      if (!shown.length) continue;
      outlook.set(id, {
        blocks: items.filter((i) => i.userId === id && OUTLOOK_BUSY_STATUSES.includes(i.showAs))
          .map((i) => ({ start: i.startAt.toISOString(), end: i.endAt.toISOString() })),
        ...(shown.some((c) => !c.calendarSyncedAt || c.calendarSyncedAt.getTime() < Date.now() - 3600000)
          ? { error: 'ข้อมูล Outlook ยังไม่อัปเดต' } : {}),
      });
    }

    const people = members.map((m) => {
      const o = outlook.get(m.user.id);
      return {
        userId: m.user.id,
        name: `${m.user.firstName} ${m.user.lastName}`.trim(),
        source: o ? ('OUTLOOK' as const) : ('SYSTEM_ONLY' as const),
        busy: [...(system.get(m.user.id) ?? []), ...(o?.blocks ?? [])].sort((a, b) => a.start.localeCompare(b.start)),
        ...(o?.error ? { error: o.error } : {}),
      };
    });
    return { date: dto.date, people };
  }
}
