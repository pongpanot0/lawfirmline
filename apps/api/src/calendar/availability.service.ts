import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { OutlookConnectionsService } from '../outlook-integration/outlook-connections.service';
import { GraphCalendarClient } from '../outlook-integration/graph/graph-calendar.client';
import { effectiveEnd } from '../outlook-integration/calendar/outlook-event-payload';
import { eventForUserWhere } from './event-people';

export interface BusyBlock { start: string; end: string; label?: string }
const BUSY = new Set(['busy', 'oof', 'tentative', 'workingElsewhere']);
const HIDDEN_LABEL = 'ไม่ว่าง';

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private connections: OutlookConnectionsService,
    private graph: GraphCalendarClient,
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

    const mine = await this.connections.findActiveForUser(user.id);
    const conns = mine
      ? await this.prisma.mailboxConnection.findMany({ where: { userId: { in: userIds }, firmId: user.firmId, status: 'ACTIVE' }, select: { userId: true, mailboxAddress: true } })
      : [];
    const emailOf = new Map(conns.flatMap((c) => (c.userId ? [[c.userId, c.mailboxAddress] as [string, string]] : [])));
    const outlook = new Map<string, { error?: string; blocks: BusyBlock[] }>();
    if (mine && emailOf.size) {
      const emails = [...emailOf.values()];
      let rows: Awaited<ReturnType<GraphCalendarClient['getSchedule']>> = [];
      let failed = false;
      try {
        const token = await this.connections.getValidAccessToken(mine.id);
        rows = await this.graph.getSchedule(token, emails, `${dto.date}T07:00:00`, `${dto.date}T21:00:00`);
      } catch (err) {
        failed = true;
        this.logger.warn(`getSchedule failed: ${(err as Error).message}`);
      }
      for (const [uid, email] of emailOf) {
        const row = rows.find((r) => r.scheduleId.toLowerCase() === email.toLowerCase());
        if (failed || !row || row.error) { outlook.set(uid, { error: 'ดูปฏิทิน Outlook ไม่ได้', blocks: [] }); continue; }
        const sys = system.get(uid) ?? [];
        outlook.set(uid, {
          blocks: row.items
            .filter((i) => BUSY.has(i.status))
            .filter((i) => !sys.some((b) => b.start === i.start.toISOString() && b.end === i.end.toISOString())) // our own copy
            .map((i) => ({ start: i.start.toISOString(), end: i.end.toISOString() })),
        });
      }
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
    return { date: dto.date, people, ...(mine ? {} : { hint: 'เชื่อมต่อ Microsoft 365 เพื่อดูเวลาว่างจาก Outlook' }) };
  }
}
