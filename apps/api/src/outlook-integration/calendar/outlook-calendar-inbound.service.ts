import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventType, NotificationCategory } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.module';
import { OutlookConnectionsService } from '../outlook-connections.service';
import { GraphCalendarClient, GraphEventChange } from '../graph/graph-calendar.client';
import { GraphApiError } from '../graph/graph-http';
import { AssignmentNotifierService } from '../../notifications/assignment-notifier.service';
import { eventPeopleIds } from '../../calendar/event-people';
import { effectiveEnd } from './outlook-event-payload';

const DAY = 86_400_000;
const WINDOW_MAX_AGE = 7 * DAY;
const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
const when = (d: Date) => d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });

/**
 * Reads moves/deletions the owner made to their Outlook copies (delta query) and
 * either follows them or turns them into proposals. Legal dates are never moved here.
 */
@Injectable()
export class OutlookCalendarInboundService {
  private readonly logger = new Logger(OutlookCalendarInboundService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private connections: OutlookConnectionsService,
    private calendar: GraphCalendarClient,
    private notifier: AssignmentNotifierService,
  ) {}

  @Cron('*/5 * * * *')
  async pollAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.prisma.mailboxConnection.findMany({ where: { status: 'ACTIVE', syncCalendar: true, userId: { not: null } } });
      for (const connection of rows) {
        try {
          await this.pollConnection(connection);
        } catch (error) {
          this.logger.warn(`Outlook calendar delta for connection ${connection.id} failed: ${error}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async pollConnection(connection: { id: string; calendarDeltaLink: string | null; calendarDeltaStartedAt: Date | null }) {
    const copies = await this.prisma.calendarEventOutlookCopy.findMany({ where: { connectionId: connection.id } });
    if (!copies.length) return;
    const token = await this.connections.getValidAccessToken(connection.id);
    const fresh = connection.calendarDeltaLink && connection.calendarDeltaStartedAt && connection.calendarDeltaStartedAt.getTime() > Date.now() - WINDOW_MAX_AGE;

    if (!fresh) {
      // Baseline: remember where we are, act on nothing in the first full page set.
      const now = new Date();
      const { deltaLink } = await this.calendar.calendarViewDelta(token, { start: new Date(now.getTime() - DAY), end: new Date(now.getTime() + 400 * DAY) });
      await this.prisma.mailboxConnection.update({ where: { id: connection.id }, data: { calendarDeltaLink: deltaLink ?? null, calendarDeltaStartedAt: now } });
      return;
    }

    let delta;
    try {
      delta = await this.calendar.calendarViewDelta(token, { deltaLink: connection.calendarDeltaLink! });
    } catch (error) {
      if (error instanceof GraphApiError && error.status === 410) {
        await this.prisma.mailboxConnection.update({ where: { id: connection.id }, data: { calendarDeltaLink: null, calendarDeltaStartedAt: null } });
        return;
      }
      throw error;
    }
    const byGraphId = new Map(copies.map((c) => [c.graphEventId, c]));
    for (const change of delta.events) {
      const copy = byGraphId.get(change.id);
      if (!copy) continue;
      try {
        await this.handle(copy, change);
      } catch (error) {
        this.logger.warn(`Outlook change for copy ${copy.id} failed: ${error}`);
      }
    }
    if (delta.deltaLink) await this.prisma.mailboxConnection.update({ where: { id: connection.id }, data: { calendarDeltaLink: delta.deltaLink } });
  }

  private async handle(
    copy: { id: string; eventId: string; userId: string; syncedAt: Date; removedInOutlookAt: Date | null },
    change: GraphEventChange,
  ) {
    if (copy.removedInOutlookAt) return;
    if (change.removed || change.isCancelled) {
      await this.prisma.calendarEventOutlookCopy.update({ where: { id: copy.id }, data: { removedInOutlookAt: new Date() } });
      return;
    }
    if (!change.start || !change.end) return;
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: copy.eventId },
      include: { case: { select: { firmId: true, leadLawyerId: true, ownRef: true } }, assignees: { select: { userId: true } } },
    });
    // Not yet written out to Outlook: the difference is ours, not the owner's.
    if (!event || copy.syncedAt < event.updatedAt) return;
    const oldEnd = effectiveEnd(event);
    if (minute(change.start) === minute(event.startAt) && minute(change.end) === minute(oldEnd)) return;

    const organizerId = event.onlineMeeting ? event.meetingOrganizerId : null;
    const responsible = eventPeopleIds(event).includes(copy.userId) || organizerId === copy.userId;
    const movable = event.type === EventType.CLIENT_MEETING || event.type === EventType.OTHER;
    const owner = await this.prisma.user.findUnique({ where: { id: copy.userId }, select: { firstName: true, lastName: true } });
    const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : 'ผู้ใช้';
    const { ownRef, firmId, leadLawyerId } = event.case;

    if (movable && responsible) {
      // Like a reschedule: the old reminders were for the old time, so they must fire again.
      await this.prisma.$transaction([
        this.prisma.calendarEvent.update({ where: { id: event.id }, data: { startAt: change.start, endAt: change.end } }),
        this.prisma.reminderLog.deleteMany({ where: { eventId: event.id } }),
      ]);
      await this.prisma.auditLog.create({
        data: {
          firmId, userId: copy.userId, action: 'CALENDAR_EVENT_MOVED_FROM_OUTLOOK',
          metadata: { eventId: event.id, from: event.startAt.toISOString(), to: change.start.toISOString() },
        },
      });
      await this.notifier.notifyAssigned({
        firmId, userIds: [...eventPeopleIds(event), ...(organizerId ? [organizerId] : []), ...(leadLawyerId ? [leadLawyerId] : [])],
        actorUserId: copy.userId, category: NotificationCategory.CALENDAR,
        summaryText: `🗓️ ${ownerName} ย้ายนัดใน Outlook · ${ownRef}\n${event.title}: ${when(event.startAt)} → ${when(change.start)}`,
        entityPath: `/court-day/${event.id}`,
      });
      return;
    }

    const open = await this.prisma.calendarEventOutlookChange.findFirst({ where: { eventId: event.id, userId: copy.userId, resolvedAt: null } });
    if (open && open.proposedStartAt.getTime() === change.start.getTime() && open.proposedEndAt?.getTime() === change.end.getTime()) return;
    if (open) {
      await this.prisma.calendarEventOutlookChange.update({ where: { id: open.id }, data: { proposedStartAt: change.start, proposedEndAt: change.end, detectedAt: new Date() } });
    } else {
      await this.prisma.calendarEventOutlookChange.create({
        data: { eventId: event.id, userId: copy.userId, copyId: copy.id, proposedStartAt: change.start, proposedEndAt: change.end },
      });
    }
    await this.notifier.notifyAssigned({
      firmId, userIds: [copy.userId, ...(leadLawyerId ? [leadLawyerId] : [])], actorUserId: '', category: NotificationCategory.CALENDAR,
      summaryText: `⚠️ นัดศาล/วันครบกำหนดถูกย้ายใน Outlook · ${ownRef} — เปิดระบบเพื่อยืนยัน\n${event.title}: ${when(event.startAt)} → ${when(change.start)}`,
      entityPath: `/court-day/${event.id}`,
    });
  }
}
