import { Injectable, Logger } from '@nestjs/common';
import {
  AgendaDay,
  AgendaItem,
  AgendaItemKind,
  AgendaUrgency,
  AgendaWarning,
  AgendaWarningKind,
  AuthUser,
  EventType,
  MyDayResponse,
  TaskStatus,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { TravelService } from '../travel/travel.service';
import {
  addBangkokDays,
  bangkokDayKey,
  bangkokDayStart,
  bangkokDayDiff,
  formatBangkokTime,
} from '../common/utils/bangkok-time';

/** How far back overdue work is surfaced, and how many rows of it at most. */
const OVERDUE_LOOKBACK_DAYS = 90;
const OVERDUE_TAKE = 50;
/** Days beyond tomorrow returned in `upcoming`. */
const UPCOMING_DAYS = 5;
/** Assumed length of a timed event that has no explicit end. */
const DEFAULT_EVENT_MINUTES = 60;

const EVENT_KIND: Record<string, AgendaItemKind> = {
  [EventType.COURT_DATE]: AgendaItemKind.COURT_DATE,
  [EventType.CLIENT_MEETING]: AgendaItemKind.CLIENT_MEETING,
  [EventType.DEADLINE]: AgendaItemKind.DEADLINE,
  [EventType.OTHER]: AgendaItemKind.OTHER,
};

interface EventRow {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  type: string;
  courtName: string | null;
  caseId: string;
  case: { id: string; ownRef: string; title: string; courtName: string | null } | null;
}

interface TaskRow {
  id: string;
  title: string;
  dueDate: Date | null;
  caseId: string | null;
  case: { id: string; ownRef: string; title: string } | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
}

@Injectable()
export class AgendaService {
  private readonly logger = new Logger(AgendaService.name);

  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private travel: TravelService,
  ) {}

  /**
   * Court dates, meetings and deadlines live in `CalendarEvent`; everything
   * else the lawyer owes is a `Task`. Reading them separately is what forces a
   * lawyer to check four screens, so both are projected onto `AgendaItem` here
   * and nowhere else — the digest and the conflict checker consume this output.
   */
  async getAgenda(user: AuthUser, from: Date, to: Date): Promise<AgendaItem[]> {
    const [events, tasks] = await Promise.all([
      this.fetchEvents(user, from, to),
      this.fetchTasks(user, from, to),
    ]);
    const now = new Date();
    return this.sortItems([
      ...events.map((e) => this.eventToItem(e, now)),
      ...tasks.map((t) => this.taskToItem(t, now)),
    ]);
  }

  async getMyDay(user: AuthUser): Promise<MyDayResponse> {
    const now = new Date();
    const todayStart = bangkokDayStart(now);
    const horizonEnd = addBangkokDays(todayStart, UPCOMING_DAYS + 2);

    const [overdueItems, aheadItems] = await Promise.all([
      this.getOverdue(user, todayStart),
      this.getAgenda(user, todayStart, horizonEnd),
    ]);

    const todayKey = bangkokDayKey(now);
    const tomorrowKey = bangkokDayKey(addBangkokDays(todayStart, 1));

    const todayItems = aheadItems.filter((i) => bangkokDayKey(new Date(i.at)) === todayKey);
    const tomorrow = aheadItems.filter((i) => bangkokDayKey(new Date(i.at)) === tomorrowKey);
    const upcoming = this.groupByDay(
      aheadItems.filter((i) => {
        const key = bangkokDayKey(new Date(i.at));
        return key !== todayKey && key !== tomorrowKey;
      }),
    );

    // Travel estimates hit an external API. Only today and tomorrow are worth
    // the calls — a conflict five days out is not actionable this morning.
    const warnings = await this.buildWarnings(user, [...todayItems, ...tomorrow]);

    return { today: todayKey, overdue: overdueItems, todayItems, tomorrow, upcoming, warnings };
  }

  /**
   * One Bangkok day, with its conflicts already resolved — what the evening
   * digest sends and what a day view renders.
   */
  async getDayBrief(
    user: AuthUser,
    day: Date,
  ): Promise<{ date: string; items: AgendaItem[]; warnings: AgendaWarning[] }> {
    const start = bangkokDayStart(day);
    const items = await this.getAgenda(user, start, addBangkokDays(start, 1));
    return {
      date: bangkokDayKey(start),
      items,
      warnings: await this.buildWarnings(user, items),
    };
  }

  private async getOverdue(user: AuthUser, todayStart: Date): Promise<AgendaItem[]> {
    const from = addBangkokDays(todayStart, -OVERDUE_LOOKBACK_DAYS);
    const [events, tasks] = await Promise.all([
      this.fetchEvents(user, from, todayStart, OVERDUE_TAKE),
      this.fetchTasks(user, from, todayStart, OVERDUE_TAKE),
    ]);
    const now = new Date();
    return this.sortItems([
      ...events.map((e) => this.eventToItem(e, now)),
      ...tasks.map((t) => this.taskToItem(t, now)),
    ]);
  }

  private fetchEvents(user: AuthUser, from: Date, to: Date, take?: number) {
    return this.prisma.calendarEvent.findMany({
      where: {
        case: this.caseAccess.getCaseFilterForUser(user),
        startAt: { gte: from, lt: to },
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        type: true,
        courtName: true,
        caseId: true,
        case: { select: { id: true, ownRef: true, title: true, courtName: true } },
      },
      orderBy: { startAt: 'asc' },
      ...(take ? { take } : {}),
    }) as unknown as Promise<EventRow[]>;
  }

  private fetchTasks(user: AuthUser, from: Date, to: Date, take?: number) {
    return this.prisma.task.findMany({
      where: {
        status: { notIn: [TaskStatus.DONE] },
        dueDate: { gte: from, lt: to },
        // Standalone todos have no case to inherit tenancy from, so the
        // assignee's firm membership is what keeps them tenant-scoped.
        assignee: { firmMembers: { some: { firmId: user.firmId } } },
        AND: [
          this.caseAccess.getTaskFilterForUser(user),
          {
            OR: [
              { caseId: null },
              { case: this.caseAccess.getCaseFilterForUser(user) },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        caseId: true,
        case: { select: { id: true, ownRef: true, title: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { dueDate: 'asc' },
      ...(take ? { take } : {}),
    }) as unknown as Promise<TaskRow[]>;
  }

  private eventToItem(row: EventRow, now: Date): AgendaItem {
    const kind = EVENT_KIND[row.type] ?? AgendaItemKind.OTHER;
    // A DEADLINE carries a date, not an appointment time — showing "00:00" for
    // it would be noise, and it must not take part in travel/overlap checks.
    const allDay = kind === AgendaItemKind.DEADLINE;
    return {
      id: `event:${row.id}`,
      entityId: row.id,
      kind,
      title: row.title,
      at: row.startAt.toISOString(),
      endAt: row.endAt ? row.endAt.toISOString() : null,
      allDay,
      urgency: this.urgencyOf(row.startAt, now),
      caseId: row.caseId,
      caseRef: row.case?.ownRef ?? null,
      caseTitle: row.case?.title ?? null,
      // Only a court date inherits the case's court; a client meeting or an
      // internal appointment is not held there.
      location:
        row.courtName ??
        (kind === AgendaItemKind.COURT_DATE ? row.case?.courtName ?? null : null),
      departBy: null,
      url: `/cases/${row.caseId}/calendar`,
      assigneeId: null,
      assigneeName: null,
    };
  }

  private taskToItem(row: TaskRow, now: Date): AgendaItem {
    const due = row.dueDate as Date;
    return {
      id: `task:${row.id}`,
      entityId: row.id,
      kind: AgendaItemKind.TASK,
      title: row.title,
      at: due.toISOString(),
      endAt: null,
      allDay: true,
      urgency: this.urgencyOf(due, now),
      caseId: row.caseId,
      caseRef: row.case?.ownRef ?? null,
      caseTitle: row.case?.title ?? null,
      location: null,
      departBy: null,
      url: row.caseId ? `/cases/${row.caseId}/tasks` : '/todos',
      assigneeId: row.assignee?.id ?? null,
      assigneeName: row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : null,
    };
  }

  /**
   * Bucketed by whole Bangkok days, so a court date at 09:00 that has already
   * finished still reads as TODAY rather than jumping to OVERDUE at 09:01.
   */
  private urgencyOf(at: Date, now: Date): AgendaUrgency {
    const diff = bangkokDayDiff(now, at);
    if (diff < 0) return AgendaUrgency.OVERDUE;
    if (diff === 0) return AgendaUrgency.TODAY;
    if (diff === 1) return AgendaUrgency.TOMORROW;
    return AgendaUrgency.UPCOMING;
  }

  private sortItems(items: AgendaItem[]): AgendaItem[] {
    return items.sort((a, b) => {
      const dayA = bangkokDayKey(new Date(a.at));
      const dayB = bangkokDayKey(new Date(b.at));
      if (dayA !== dayB) return dayA < dayB ? -1 : 1;
      // Within a day an all-day item has no clock position, so it heads the day.
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return new Date(a.at).getTime() - new Date(b.at).getTime();
    });
  }

  private groupByDay(items: AgendaItem[]): AgendaDay[] {
    const byDay = new Map<string, AgendaItem[]>();
    for (const item of items) {
      const key = bangkokDayKey(new Date(item.at));
      const bucket = byDay.get(key);
      if (bucket) bucket.push(item);
      else byDay.set(key, [item]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, dayItems]) => ({ date, items: dayItems }));
  }

  private endOf(item: AgendaItem): number {
    const start = new Date(item.at).getTime();
    if (item.endAt) return new Date(item.endAt).getTime();
    return start + DEFAULT_EVENT_MINUTES * 60 * 1000;
  }

  private async buildWarnings(user: AuthUser, items: AgendaItem[]): Promise<AgendaWarning[]> {
    const timed = items.filter((i) => !i.allDay);
    const warnings: AgendaWarning[] = [
      ...this.overlapWarnings(timed),
      ...(await this.travelWarnings(user, timed)),
    ];
    return warnings;
  }

  private overlapWarnings(timed: AgendaItem[]): AgendaWarning[] {
    const warnings: AgendaWarning[] = [];
    for (let i = 0; i < timed.length - 1; i++) {
      const current = timed[i];
      const next = timed[i + 1];
      if (bangkokDayKey(new Date(current.at)) !== bangkokDayKey(new Date(next.at))) continue;
      if (this.endOf(current) > new Date(next.at).getTime()) {
        warnings.push({
          kind: AgendaWarningKind.OVERLAP,
          message:
            `เวลาชนกัน: "${current.title}" (${formatBangkokTime(new Date(current.at))})` +
            ` กับ "${next.title}" (${formatBangkokTime(new Date(next.at))})`,
          itemIds: [current.id, next.id],
        });
      }
    }
    return warnings;
  }

  /**
   * Also fills `departBy` on the first located item of each day, from the
   * office — that is the "what time do I have to leave" question.
   */
  private async travelWarnings(user: AuthUser, timed: AgendaItem[]): Promise<AgendaWarning[]> {
    const located = timed.filter((i) => i.location);
    if (located.length === 0) return [];

    const warnings: AgendaWarning[] = [];
    const seenDays = new Set<string>();

    for (let i = 0; i < located.length; i++) {
      const item = located[i];
      const day = bangkokDayKey(new Date(item.at));

      if (!seenDays.has(day)) {
        seenDays.add(day);
        const office = await this.safeOfficeAddress(user.firmId);
        const seconds = office ? await this.safeTravelSeconds(office, item.location!) : null;
        if (seconds !== null) {
          item.departBy = new Date(new Date(item.at).getTime() - seconds * 1000).toISOString();
        }
      }

      const next = located[i + 1];
      if (!next || bangkokDayKey(new Date(next.at)) !== day) continue;
      if (next.location === item.location) continue;

      const seconds = await this.safeTravelSeconds(item.location!, next.location!);
      if (seconds === null) continue;

      const gapSeconds = (new Date(next.at).getTime() - this.endOf(item)) / 1000;
      if (gapSeconds < seconds) {
        const need = Math.round(seconds / 60);
        const have = Math.max(0, Math.round(gapSeconds / 60));
        warnings.push({
          kind: AgendaWarningKind.TRAVEL,
          message:
            `เดินทางไม่ทัน: จาก "${item.location}" ไป "${next.location}"` +
            ` ใช้เวลาประมาณ ${need} นาที แต่มีเวลาว่างเพียง ${have} นาที`,
          itemIds: [item.id, next.id],
        });
      }
    }
    return warnings;
  }

  private async safeOfficeAddress(firmId: string): Promise<string | null> {
    try {
      return await this.travel.getOfficeAddress(firmId);
    } catch (err) {
      this.logger.warn(`Office address lookup failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** A maps outage must degrade the agenda, never fail it. */
  private async safeTravelSeconds(origin: string, destination: string): Promise<number | null> {
    try {
      const result = await this.travel.calculateTravel(origin, destination);
      return result.durationSeconds > 0 ? result.durationSeconds : null;
    } catch (err) {
      this.logger.warn(`Travel estimate failed (${origin} → ${destination}): ${(err as Error).message}`);
      return null;
    }
  }
}
