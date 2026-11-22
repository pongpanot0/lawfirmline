import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FirmRole } from '@lawfirm/shared';
import { EventType, LeavePeriod, LeaveStatus, NotificationCategory } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { LineMessagingService, QuickReplyItem } from './line-messaging.service';
import { FirmLinkService } from './firm-link.service';
import { PushService } from './push.service';
import { NotificationCenterService } from './notification-center.service';
import { toAppRoute } from './app-route';
import { isBangkokWorkingDay, LEAVE_SPLIT_HOUR, usersOff, usersOnLeave } from '../holidays/working-day';
import { bangkokDateOnly, bangkokDayEnd, bangkokDayStart, bangkokHour, formatBangkokDateThai, formatBangkokTime } from '../common/utils/bangkok-time';
import { formatCaseNotificationReference } from './reference-label';

/** `firmId:userId` → a manager's one-line team summary for the 09:00 brief (built by TeamDigestScheduler). */
export type TeamBriefLines = Map<string, { lineUserId: string; summary: string }>;

/** The firm's day for the 09:00 brief. */
type FirmDay = { out: { userId: string; text: string }[]; court: { text: string; path: string }[] };
const HALF_DAY: Record<LeavePeriod, string> = { MORNING: 'ครึ่งเช้า', AFTERNOON: 'ครึ่งบ่าย' };

export interface NotifyParams {
  /** Null only when the trigger has no firm in hand (a standalone todo); the
   *  firm is then taken from the recipient's own membership. */
  firmId: string | null;
  userIds: string[];
  /** Never notified about their own action; '' for system triggers. */
  actorUserId: string;
  category: NotificationCategory;
  /** First line becomes the title, the rest the body. */
  summaryText: string;
  /** Web path — the LINE link and the inbox fallback. */
  entityPath: string;
  /** Mobile route, when the web path does not point at the exact screen (e.g. the task itself). */
  appPath?: string;
  /** false when the caller sends its own LINE message (quick replies, its own dedupe). */
  line?: boolean;
  /** One-tap LINE buttons for a recipient (see line-actions.ts); none when it returns nothing. */
  lineActions?: (userId: string) => QuickReplyItem[] | undefined;
}

export interface NotifyResult {
  recipients: number;
  push: boolean;
  line: boolean;
}

const NOTHING_SENT: NotifyResult = { recipients: 0, push: false, line: false };

/**
 * What a freelancer may read of a notification. They see one page (/work) and
 * a case only by its Own Ref, so only the first line (what happened to which
 * step) goes out — never the reference lines, party names or case links the
 * staff version carries — and no LINE buttons that act on staff routes.
 */
function forExternal(params: NotifyParams): NotifyParams {
  return {
    ...params,
    summaryText: params.summaryText.split('\n')[0],
    entityPath: '/work',
    appPath: undefined,
    lineActions: undefined,
  };
}

/** Expo rejects a message over ~4 KB; Thai is 3 bytes a character, so stay well under. */
const PUSH_TITLE_MAX = 120;
const PUSH_BODY_MAX = 400;
/** Titles listed in the 09:00 summary before "และอีก N รายการ". */
const SUMMARY_LINES = 5;
/** Court dates listed in the 09:00 brief before "และอีก N นัด". */
const COURT_LINES = 15;
/** LINE caps a text message at 5,000 characters. */
const LINE_TEXT_MAX = 4900;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The one place staff notifications go out: an inbox row for every recipient,
 * then mobile push and a LINE DM, each subject to the recipient's per-category
 * preferences. Depends only on notification-layer services so feature modules
 * can import it (via NotificationsModule forwardRef) without deep cycles. A
 * failure is logged and swallowed — it must never fail the mutation that
 * triggered it.
 */
@Injectable()
export class AssignmentNotifierService {
  private readonly logger = new Logger(AssignmentNotifierService.name);

  constructor(
    private prisma: PrismaService,
    private line: LineMessagingService,
    private firmLink: FirmLinkService,
    private push: PushService,
    private center: NotificationCenterService,
  ) {}

  async notifyAssigned(params: NotifyParams): Promise<NotifyResult> {
    try {
      const targets = [...new Set(params.userIds)].filter((id) => id && id !== params.actorUserId);
      if (!targets.length) return NOTHING_SENT;
      const users = await this.prisma.user.findMany({
        // With a firm in hand, only its members: an id that slipped past a
        // caller's checks must not receive this firm's case details.
        where: { id: { in: targets }, ...(params.firmId && { firmMembers: { some: { firmId: params.firmId } } }) },
        select: {
          id: true,
          lineUserId: true,
          firmMembers: { select: { firmId: true, role: true }, orderBy: { createdAt: 'asc' } },
        },
      });
      // Without a firm in hand each recipient's own firm is used, so a
      // multi-firm group never files a row under someone else's firm.
      // Freelancers (EXTERNAL) in the same firm get their own variant (see forExternal).
      const groups = new Map<string, { firmId: string; params: NotifyParams; users: typeof users }>();
      for (const u of users) {
        const firmId = params.firmId ?? u.firmMembers[0]?.firmId;
        if (!firmId) continue;
        const external = u.firmMembers.find((m) => m.firmId === firmId)?.role === FirmRole.EXTERNAL;
        const key = `${firmId}:${external}`;
        if (!groups.has(key)) groups.set(key, { firmId, params: external ? forExternal(params) : params, users: [] });
        groups.get(key)!.users.push(u);
      }

      const result = { ...NOTHING_SENT };
      for (const { firmId, params, users: group } of groups.values()) {
        const userIds = group.map((u) => u.id);
        const channels = await this.center.channelsFor(userIds, params.category);
        // Off now (outside office hours, a holiday, or on leave): inbox row only, held for sendHeldSummary.
        const off = await usersOff(this.prisma, userIds, new Date());
        const notificationIds = await this.recordInbox(firmId, userIds, params, off);
        const live = group.filter((u) => !off.has(u.id));
        const liveIds = live.map((u) => u.id);
        const push = liveIds.length ? await this.sendPush(firmId, liveIds, channels, notificationIds, params) : false;
        const line = params.line === false || !live.length
          ? false
          : await this.sendLine(firmId, live.filter((u) => channels.get(u.id)?.line), params);
        result.recipients += group.length;
        result.push ||= push;
        result.line ||= line;
      }
      return result;
    } catch (err) {
      this.logger.error('Failed to send notification', err);
      return NOTHING_SENT;
    }
  }

  /** Notifies the firm's owners, or every member holding one of `roles` when given. */
  async notifyFirmOwners({ roles, ...params }: Omit<NotifyParams, 'userIds' | 'firmId'> & { firmId: string; roles?: FirmRole[] }): Promise<void> {
    try {
      const owners = await this.prisma.firmMember.findMany({
        where: { firmId: params.firmId, role: roles ? { in: roles } : FirmRole.OWNER },
        select: { userId: true },
      });
      await this.notifyAssigned({ ...params, userIds: owners.map((o) => o.userId) });
    } catch (err) {
      this.logger.error('Failed to notify firm owners', err);
    }
  }

  /**
   * 09:00 and 12:00 on working days: one push + LINE per person listing their
   * held, still unread rows (nights, weekends, holidays, their own leave), each
   * with its case line and link. Someone still on leave keeps theirs; 12:00 is
   * when a morning half-day leave ends.
   * At 09:00 the same LINE message is the morning brief for every staff member:
   * who is out today and who is in court where, plus the team summary line for
   * managers, so the morning is one message. 09:00 is run by TeamDigestScheduler
   * (it builds the team lines first); 12:00 by the cron here.
   * ponytail: ignores per-category channel switches; filter here if someone turns everything off and still gets it.
   */
  @Cron('0 12 * * 1-5', { timeZone: 'Asia/Bangkok' })
  async sendHeldSummary(now: Date = new Date(), team: TeamBriefLines = new Map()): Promise<number> {
    if (!(await isBangkokWorkingDay(this.prisma, now))) return 0;
    const heldRows = await this.prisma.notification.findMany({
      where: { held: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, firmId: true, title: true, body: true, path: true, readAt: true, user: { select: { lineUserId: true } } },
    });
    const morning = bangkokHour(now) < LEAVE_SPLIT_HOUR;
    const staff = morning
      ? await this.prisma.firmMember.findMany({
          where: { role: { not: FirmRole.EXTERNAL }, user: { lineUserId: { not: null } } },
          select: { firmId: true, userId: true, user: { select: { lineUserId: true } } },
        })
      : [];
    const days = await this.firmDays([...new Set(staff.map((s) => s.firmId))], now);
    const away = await usersOnLeave(this.prisma, [...new Set([...heldRows.map((r) => r.userId), ...staff.map((s) => s.userId)])], now, true);
    const due = heldRows.filter((r) => !away.has(r.userId));
    // Released before sending: a crash mid-loop must not repeat the summary tomorrow.
    if (due.length) await this.prisma.notification.updateMany({ where: { id: { in: due.map((r) => r.id) } }, data: { held: false } });

    type Brief = { firmId: string; userId: string; lineUserId: string | null; held: typeof due; day: FirmDay | null; team?: string };
    const briefs = new Map<string, Brief>();
    const brief = (firmId: string, userId: string, lineUserId: string | null) => {
      const key = `${firmId}:${userId}`;
      if (!briefs.has(key)) briefs.set(key, { firmId, userId, lineUserId, held: [], day: null });
      return briefs.get(key)!;
    };
    for (const [key, t] of team) {
      const [firmId, userId] = key.split(':');
      if (!away.has(userId)) brief(firmId, userId, t.lineUserId).team = t.summary;
    }
    for (const row of due) if (!row.readAt) brief(row.firmId, row.userId, row.user.lineUserId).held.push(row);
    for (const s of staff) {
      if (!away.has(s.userId) && days.has(s.firmId)) brief(s.firmId, s.userId, s.user.lineUserId).day = days.get(s.firmId)!;
    }

    const origins = new Map<string, string>();
    let sent = 0;
    for (const { firmId, userId, lineUserId, held, day, team: teamSummary } of briefs.values()) {
      try {
        if (!origins.has(firmId)) origins.set(firmId, await this.firmLink.linkFor(firmId, ''));
        const origin = origins.get(firmId)!;
        const sections: string[] = [];
        if (held.length) {
          const title = `🔔 แจ้งเตือนระหว่างที่คุณไม่อยู่ ${held.length} รายการ`;
          const list = held.slice(0, SUMMARY_LINES).map((r) => `• ${r.title}`);
          if (held.length > SUMMARY_LINES) list.push(`และอีก ${held.length - SUMMARY_LINES} รายการ`);
          const badges = await this.center.unreadCounts([userId], firmId);
          await this.push.send([{ userId, title, body: clip(list.join('\n'), PUSH_BODY_MAX), data: { url: '/notifications' }, badge: badges.get(userId) ?? 0 }]);
          const detailed = held.slice(0, SUMMARY_LINES).map((r) => [
            `• ${r.title}`,
            ...(r.body ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).map((l) => `  ${clip(l, 120)}`),
            `  🔗 ${origin}${r.path}`,
          ].join('\n'));
          sections.push([title, ...detailed, ...list.slice(SUMMARY_LINES)].join('\n'));
        }
        const out = day?.out.filter((o) => o.userId !== userId) ?? [];
        if (out.length) sections.push(['📅 วันนี้ไม่อยู่', ...out.map((o) => o.text)].join('\n'));
        if (day?.court.length) {
          const shown = day.court.slice(0, COURT_LINES).map((c) => `${c.text}\n  🔗 ${origin}${c.path}`);
          if (day.court.length > COURT_LINES) shown.push(`และอีก ${day.court.length - COURT_LINES} นัด · ${origin}/calendar`);
          sections.push([`⚖️ นัดศาลวันนี้ ${day.court.length} นัด`, ...shown].join('\n'));
        }
        if (teamSummary) sections.push(`📋 ทีมวันนี้: ${teamSummary}\n  🔗 ${origin}/operations`);
        if (!sections.length) continue;
        if (lineUserId) {
          const text = day || teamSummary ? [`☀️ สรุปเช้านี้ (${formatBangkokDateThai(now)})`, ...sections].join('\n\n') : sections.join('\n\n');
          await this.line.pushTo(lineUserId, clip(text, LINE_TEXT_MAX));
        }
        sent++;
      } catch (err) {
        this.logger.error(`Morning brief / held summary failed for user ${userId}`, err);
      }
    }
    return sent;
  }

  /** Per firm: who is on approved leave today and every court date today, with who attends and the case. */
  private async firmDays(firmIds: string[], now: Date): Promise<Map<string, FirmDay>> {
    const days = new Map<string, FirmDay>();
    if (!firmIds.length) return days;
    const today = bangkokDateOnly(now);
    const [leaves, events] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: { firmId: { in: firmIds }, status: LeaveStatus.APPROVED, startDate: { lte: today }, endDate: { gte: today } },
        select: { firmId: true, userId: true, period: true, user: { select: { firstName: true, lastName: true } } },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.calendarEvent.findMany({
        where: { type: EventType.COURT_DATE, startAt: { gte: bangkokDayStart(now), lt: bangkokDayEnd(now) }, case: { firmId: { in: firmIds } } },
        orderBy: { startAt: 'asc' },
        select: {
          startAt: true,
          courtName: true,
          assignees: { select: { user: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } },
          case: { select: { id: true, firmId: true, title: true, ownRef: true, blackCaseNumber: true, redCaseNumber: true, courtName: true, leadLawyer: { select: { firstName: true, lastName: true } } } },
        },
      }),
    ]);
    const day = (firmId: string) => {
      if (!days.has(firmId)) days.set(firmId, { out: [], court: [] });
      return days.get(firmId)!;
    };
    const name = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
    for (const l of leaves) {
      day(l.firmId).out.push({ userId: l.userId, text: `• ${name(l.user)}${l.period ? ` (${HALF_DAY[l.period]})` : ''}` });
    }
    for (const e of events) {
      const people = e.assignees.length ? e.assignees.map((a) => name(a.user)) : [name(e.case.leadLawyer)];
      const court = e.courtName ?? e.case.courtName;
      const caseLine = [`คดี ${e.case.title}`, formatCaseNotificationReference(e.case)].filter(Boolean).join(' · ');
      day(e.case.firmId).court.push({
        text: `• ${formatBangkokTime(e.startAt)} ${people.join(', ')}${court ? ` — ${court}` : ''}\n  ${caseLine}`,
        path: `/cases/${e.case.id}`,
      });
    }
    return days;
  }

  private appPath(params: NotifyParams) {
    return params.appPath ?? toAppRoute(params.entityPath);
  }

  /** userId → inbox row id. An inbox failure still lets push and LINE go out. */
  private async recordInbox(firmId: string, userIds: string[], params: NotifyParams, held: Set<string>) {
    const [title, ...rest] = params.summaryText.split('\n');
    try {
      const rows = await this.prisma.notification.createManyAndReturn({
        data: userIds.map((userId) => ({
          firmId,
          userId,
          category: params.category,
          title: title.trim(),
          body: rest.join('\n').trim() || null,
          path: params.entityPath,
          appPath: this.appPath(params),
          held: held.has(userId),
        })),
        select: { id: true, userId: true },
      });
      return new Map(rows.map((row) => [row.userId, row.id]));
    } catch (err) {
      this.logger.error('Failed to record notification inbox rows', err);
      return new Map<string, string>();
    }
  }

  private async sendPush(
    firmId: string,
    userIds: string[],
    channels: Map<string, { push: boolean }>,
    notificationIds: Map<string, string>,
    params: NotifyParams,
  ): Promise<boolean> {
    const recipients = userIds.filter((id) => channels.get(id)?.push);
    if (!recipients.length) return false;
    try {
      const [title, ...rest] = params.summaryText.split('\n');
      const badges = notificationIds.size ? await this.center.unreadCounts(recipients, firmId) : new Map<string, number>();
      return await this.push.send(recipients.map((userId) => {
        const notificationId = notificationIds.get(userId);
        return {
          userId,
          title: clip(title.trim(), PUSH_TITLE_MAX),
          body: clip(rest.join('\n').trim(), PUSH_BODY_MAX),
          data: {
            url: this.appPath(params) ?? '/notifications',
            ...(notificationId && { notificationId }),
          },
          ...(notificationIds.size && { badge: badges.get(userId) ?? 0 }),
        };
      }));
    } catch (err) {
      this.logger.error('Failed to send push notifications', err);
      return false;
    }
  }

  private async sendLine(
    firmId: string,
    users: Array<{ id: string; lineUserId: string | null }>,
    params: NotifyParams,
  ): Promise<boolean> {
    const linked = users.filter((u) => u.lineUserId);
    if (!linked.length) return false;
    const link = await this.firmLink.linkFor(firmId, params.entityPath);
    const message = `${params.summaryText}\n\n🔗 ${link}`;
    let sent = false;
    for (const u of linked) {
      try {
        if (await this.line.pushTo(u.lineUserId!, message, params.lineActions?.(u.id))) sent = true;
      } catch (err) {
        this.logger.error(`Failed to DM user ${u.id}`, err);
      }
    }
    return sent;
  }
}
