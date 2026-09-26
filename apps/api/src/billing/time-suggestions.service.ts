import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { EventType, TaskStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { FirmLinkService } from '../notifications/firm-link.service';
import { bangkokDayKey } from '../common/utils/bangkok-time';
import { ConfirmTimeEntryDto } from './dto/billing.dto';

export type TimeSuggestion = {
  sourceKey: string;
  source: 'event' | 'task' | 'review' | 'messages';
  caseId: string;
  caseRef: string | null;
  description: string;
  hours: number | null;
  date: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMESHEET_DAYS = 93;

/** [date 00:00+07, next day 00:00+07) as UTC instants — Thailand's offset is fixed. */
function bangkokDayWindow(date: string): { from: Date; to: Date } {
  if (!DATE_RE.test(date)) throw new BadRequestException('วันที่ต้องเป็น YYYY-MM-DD');
  const from = new Date(`${date}T00:00:00.000+07:00`);
  if (Number.isNaN(from.getTime())) throw new BadRequestException('วันที่ไม่ถูกต้อง');
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

@Injectable()
export class TimeSuggestionsService {
  private readonly logger = new Logger(TimeSuggestionsService.name);

  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private line: LineMessagingService,
    private firmLink: FirmLinkService,
  ) {}

  async suggest(user: AuthUser, date: string): Promise<TimeSuggestion[]> {
    const { from, to } = bangkokDayWindow(date);
    const caseFilter = this.caseAccess.getCaseFilterForUser(user);
    const userId = user.id;

    const [events, tasks, reviews, messages] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where: {
          type: { in: [EventType.COURT_DATE, EventType.CLIENT_MEETING] },
          startAt: { gte: from, lt: to },
          OR: [{ assigneeId: userId }, { assigneeId: null, case: { leadLawyerId: userId } }],
          case: caseFilter,
        },
        select: {
          id: true,
          title: true,
          type: true,
          startAt: true,
          endAt: true,
          caseId: true,
          case: { select: { ownRef: true } },
        },
      }),
      this.prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: TaskStatus.DONE,
          completedAt: { gte: from, lt: to },
          caseId: { not: null },
          case: caseFilter,
        },
        select: { id: true, title: true, caseId: true, case: { select: { ownRef: true } } },
      }),
      this.prisma.reviewDecision.findMany({
        where: {
          reviewerId: userId,
          decidedAt: { gte: from, lt: to },
          reviewRound: { documentVersion: { document: { case: caseFilter } } },
        },
        select: {
          id: true,
          reviewRound: {
            select: {
              documentVersion: {
                select: {
                  document: {
                    select: { caseId: true, filename: true, case: { select: { ownRef: true } } },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.caseMessage.findMany({
        where: { senderUserId: userId, createdAt: { gte: from, lt: to }, case: caseFilter },
        select: { caseId: true, case: { select: { ownRef: true } } },
      }),
    ]);

    const eventSuggestions: TimeSuggestion[] = events.map((event) => ({
      sourceKey: `event:${event.id}`,
      source: 'event',
      caseId: event.caseId,
      caseRef: event.case?.ownRef ?? null,
      description:
        event.type === EventType.COURT_DATE
          ? `ไปศาล: ${event.title}`
          : `ประชุมลูกความ: ${event.title}`,
      hours: event.endAt ? Math.round((event.endAt.getTime() - event.startAt.getTime()) / 900000) / 4 : null,
      date,
    }));

    const taskSuggestions: TimeSuggestion[] = tasks
      .filter((task) => task.caseId)
      .map((task) => ({
        sourceKey: `task:${task.id}`,
        source: 'task',
        caseId: task.caseId as string,
        caseRef: task.case?.ownRef ?? null,
        description: `ปิดงาน: ${task.title}`,
        hours: null,
        date,
      }));

    const reviewSuggestions: TimeSuggestion[] = reviews
      .map((review): TimeSuggestion | null => {
        const document = review.reviewRound.documentVersion.document;
        if (!document.caseId) return null;
        return {
          sourceKey: `review:${review.id}`,
          source: 'review',
          caseId: document.caseId,
          caseRef: document.case?.ownRef ?? null,
          description: `ตรวจเอกสาร: ${document.filename}`,
          hours: null,
          date,
        };
      })
      .filter((s): s is TimeSuggestion => s !== null);

    const messagesByCase = new Map<string, { caseRef: string | null; count: number }>();
    for (const message of messages) {
      const entry = messagesByCase.get(message.caseId);
      if (entry) entry.count += 1;
      else messagesByCase.set(message.caseId, { caseRef: message.case?.ownRef ?? null, count: 1 });
    }
    const messageSuggestions: TimeSuggestion[] = [...messagesByCase.entries()].map(
      ([caseId, { caseRef, count }]) => ({
        sourceKey: `messages:${caseId}:${date}`,
        source: 'messages',
        caseId,
        caseRef,
        description: `ตอบลูกความ (${count} ข้อความ)`,
        hours: null,
        date,
      }),
    );

    const all = [...eventSuggestions, ...taskSuggestions, ...reviewSuggestions, ...messageSuggestions];
    if (all.length === 0) return all;

    const existing = await this.prisma.timeEntry.findMany({
      where: { userId, sourceKey: { in: all.map((s) => s.sourceKey) } },
      select: { sourceKey: true },
    });
    const confirmed = new Set(existing.map((e) => e.sourceKey));
    return all.filter((s) => !confirmed.has(s.sourceKey));
  }

  async confirm(user: AuthUser, entries: ConfirmTimeEntryDto[]): Promise<{ created: number }> {
    for (const entry of entries) {
      if (!(await this.caseAccess.canAccessCase(user, entry.caseId))) {
        throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงคดีนี้');
      }
    }
    const result = await this.prisma.timeEntry.createMany({
      data: entries.map((entry) => ({
        caseId: entry.caseId,
        userId: user.id,
        hours: entry.hours,
        // Same default as createTimeEntry (billing.service.ts) — this DTO carries no rate.
        rate: 0,
        description: entry.description,
        date: new Date(entry.date),
        billable: entry.billable ?? true,
        sourceKey: entry.sourceKey,
      })),
      skipDuplicates: true,
    });
    return { created: result.count };
  }

  async timesheet(
    user: AuthUser,
    q: { from: string; to: string; userId?: string },
  ): Promise<{
    entries: {
      id: string;
      date: string;
      hours: number;
      description: string | null;
      billable: boolean;
      caseId: string;
      caseRef: string | null;
      userId: string;
      userName: string;
      invoiced: boolean;
    }[];
    totals: { userId: string; userName: string; hours: number; billableHours: number }[];
  }> {
    if (!DATE_RE.test(q.from) || !DATE_RE.test(q.to)) throw new BadRequestException('วันที่ต้องเป็น YYYY-MM-DD');
    const from = new Date(`${q.from}T00:00:00.000+07:00`);
    const to = new Date(`${q.to}T00:00:00.000+07:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      throw new BadRequestException('ช่วงวันที่ไม่ถูกต้อง');
    }
    if ((to.getTime() - from.getTime()) / DAY_MS > MAX_TIMESHEET_DAYS) {
      throw new BadRequestException('ช่วงวันที่ต้องไม่เกิน 93 วัน');
    }
    const targetUserId = user.firmRole === FirmRole.OWNER ? q.userId : user.id;

    const rows = await this.prisma.timeEntry.findMany({
      where: {
        case: this.caseAccess.getCaseFilterForFinancials(user),
        date: { gte: from, lt: new Date(to.getTime() + DAY_MS) },
        ...(targetUserId ? { userId: targetUserId } : {}),
      },
      include: {
        case: { select: { ownRef: true } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { date: 'asc' },
    });

    const entries = rows.map((row) => ({
      id: row.id,
      date: bangkokDayKey(row.date),
      hours: row.hours,
      description: row.description,
      billable: row.billable,
      caseId: row.caseId,
      caseRef: row.case?.ownRef ?? null,
      userId: row.userId,
      userName: `${row.user.firstName} ${row.user.lastName}`.trim(),
      invoiced: !!row.invoiceId,
    }));

    const totalsByUser = new Map<string, { userName: string; hours: number; billableHours: number }>();
    for (const entry of entries) {
      const totals = totalsByUser.get(entry.userId) ?? {
        userName: entry.userName,
        hours: 0,
        billableHours: 0,
      };
      totals.hours += entry.hours;
      if (entry.billable) totals.billableHours += entry.hours;
      totalsByUser.set(entry.userId, totals);
    }

    return {
      entries,
      totals: [...totalsByUser.entries()].map(([userId, t]) => ({ userId, ...t })),
    };
  }

  /** ponytail: no send-once ledger; fine for a single api instance, add LeaveNoticeLog-style key if we scale out */
  @Cron('0 18 * * 1-5', { timeZone: 'Asia/Bangkok' })
  async sendDailyDigest(now: Date = new Date()): Promise<number> {
    const date = bangkokDayKey(now);
    const members = await this.prisma.firmMember.findMany({
      where: { user: { lineUserId: { not: null } } },
      select: { firmId: true, userId: true, role: true, user: { select: { lineUserId: true } } },
    });

    let sent = 0;
    for (const member of members) {
      try {
        const authUser = {
          id: member.userId,
          firmId: member.firmId,
          firmRole: member.role as FirmRole,
        } as AuthUser;
        const suggestions = await this.suggest(authUser, date);
        if (suggestions.length === 0) continue;
        const link = await this.firmLink.linkFor(member.firmId, '/timesheet');
        const ok = await this.line.pushTo(
          member.user.lineUserId as string,
          `มี ${suggestions.length} รายการเวลาทำงานวันนี้รอยืนยัน\n${link}`,
        );
        if (ok) sent++;
      } catch (error) {
        this.logger.error(`Daily time digest failed for user ${member.userId}: ${(error as Error).message}`);
      }
    }
    return sent;
  }
}
