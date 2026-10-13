import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.module';
import { OutlookConnectionsService } from '../outlook-connections.service';
import { GraphCalendarClient, GraphEventInput } from '../graph/graph-calendar.client';
import { GraphApiError } from '../graph/graph-http';
import { FirmLinkService } from '../../notifications/firm-link.service';
import { eventForUserWhere, eventPeopleIds } from '../../calendar/event-people';
import { buildOutlookEvent } from './outlook-event-payload';

const DAY = 86_400_000;
type Copy = { id: string; eventId: string; userId: string; connectionId: string; graphEventId: string; syncedAt: Date };

/**
 * Mirrors our calendar events into each responsible person's Outlook calendar
 * (one-way). syncEvent is the only writer of copies; reconcileAll finds work
 * from every event write site in the codebase, so callers never have to.
 */
@Injectable()
export class OutlookCalendarSyncService {
  private readonly logger = new Logger(OutlookCalendarSyncService.name);
  // ponytail: in-process lock — enough for the single api container; use a DB advisory lock if the api is ever scaled out.
  private inFlight = new Map<string, Promise<void>>();

  constructor(
    private prisma: PrismaService,
    private connections: OutlookConnectionsService,
    private calendar: GraphCalendarClient,
    private firmLink: FirmLinkService,
  ) {}

  syncEventSoon(eventId: string): void {
    this.syncEvent(eventId).catch((error) => this.logger.warn(`Outlook calendar sync for ${eventId} failed: ${error}`));
  }

  syncEvent(eventId: string): Promise<void> {
    const running = this.inFlight.get(eventId);
    if (running) return running;
    const job = this.doSync(eventId).finally(() => this.inFlight.delete(eventId));
    this.inFlight.set(eventId, job);
    return job;
  }

  private async doSync(eventId: string): Promise<void> {
    const [event, copies] = await Promise.all([
      this.prisma.calendarEvent.findUnique({
        where: { id: eventId },
        include: {
          case: { select: { firmId: true, leadLawyerId: true, ownRef: true, title: true, blackCaseNumber: true, redCaseNumber: true } },
          assignees: { select: { userId: true } },
        },
      }),
      this.prisma.calendarEventOutlookCopy.findMany({ where: { eventId } }) as Promise<Copy[]>,
    ]);

    if (!event) {
      for (const copy of copies) await this.deleteCopy(copy);
      return;
    }
    if (event.startAt.getTime() < Date.now() - DAY) return;

    const e = event as typeof event & { onlineMeeting?: boolean; meetingOrganizerId?: string | null };
    const organizerId = e.onlineMeeting ? e.meetingOrganizerId ?? null : null;
    const people = new Set(eventPeopleIds(event));
    if (organizerId) people.add(organizerId);

    const desired = new Map<string, { id: string }>();
    for (const userId of people) {
      const connection = await this.connections.findActiveForUser(userId);
      if (connection && (connection.syncCalendar || userId === organizerId)) desired.set(userId, connection);
    }

    for (const copy of copies) {
      if (desired.get(copy.userId)?.id !== copy.connectionId) await this.deleteCopy(copy);
    }

    const origin = await this.firmLink.originForFirm(event.case.firmId);
    for (const [userId, connection] of desired) {
      const copy = copies.find((c) => c.userId === userId && c.connectionId === connection.id);
      if (copy && copy.syncedAt >= event.updatedAt) continue;
      try {
        const token = await this.connections.getValidAccessToken(connection.id);
        const payload = this.payloadFor(event, userId, organizerId, origin);
        await this.writeCopy(token, payload, event.id, userId, connection.id, event.updatedAt, copy);
      } catch (error) {
        this.logger.warn(`Outlook copy of event ${event.id} for user ${userId} failed: ${error}`);
        if (copy) {
          await this.prisma.calendarEventOutlookCopy.update({ where: { id: copy.id }, data: { lastError: String(error).slice(0, 2000) } });
        }
      }
    }
  }

  /** Teams fields are added in plan Task 10; this hook keeps the non-Teams path unchanged. */
  protected payloadFor(event: any, userId: string, _organizerId: string | null, origin: string): GraphEventInput {
    return buildOutlookEvent(event, { caseUrl: `${origin}/cases/${event.caseId}`, transactionId: `${event.id}:${userId}` });
  }

  private async writeCopy(token: string, payload: GraphEventInput, eventId: string, userId: string, connectionId: string, version: Date, copy?: Copy) {
    let graphEventId: string;
    if (copy) {
      try {
        graphEventId = (await this.calendar.updateEvent(token, copy.graphEventId, payload)).id;
      } catch (error) {
        if (!(error instanceof GraphApiError && error.status === 404)) throw error;
        await this.prisma.calendarEventOutlookCopy.delete({ where: { id: copy.id } });
        graphEventId = (await this.calendar.createEvent(token, payload)).id; // user deleted it in Outlook
      }
    } else {
      graphEventId = (await this.calendar.createEvent(token, payload)).id;
    }
    await this.prisma.calendarEventOutlookCopy.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, connectionId, graphEventId, syncedAt: version },
      update: { connectionId, graphEventId, syncedAt: version, lastError: null },
    });
    return graphEventId;
  }

  private async deleteCopy(copy: Copy) {
    try {
      const token = await this.connections.getValidAccessToken(copy.connectionId);
      await this.calendar.deleteEvent(token, copy.graphEventId);
    } catch (error) {
      if (!(error instanceof GraphApiError && error.status === 404)) {
        this.logger.warn(`Could not delete Outlook copy ${copy.graphEventId}: ${error}`);
      }
    }
    await this.prisma.calendarEventOutlookCopy.delete({ where: { id: copy.id } });
  }

  async removeAllForConnection(connectionId: string): Promise<void> {
    const copies = (await this.prisma.calendarEventOutlookCopy.findMany({ where: { connectionId } })) as Copy[];
    for (const copy of copies) await this.deleteCopy(copy);
  }

  @Cron('*/2 * * * *')
  async reconcileAll(): Promise<void> {
    const since = new Date(Date.now() - DAY);
    const connections = await this.prisma.mailboxConnection.findMany({ where: { status: 'ACTIVE', userId: { not: null } } });
    const activeIds = new Set(connections.map((c) => c.id));
    const ids = new Set<string>();

    for (const connection of connections) {
      const userId = connection.userId!;
      const copies = (await this.prisma.calendarEventOutlookCopy.findMany({ where: { userId } })) as Copy[];
      if (!connection.syncCalendar) {
        copies.forEach((c) => ids.add(c.eventId));
        continue;
      }
      const events = await this.prisma.calendarEvent.findMany({
        where: { AND: [eventForUserWhere(userId), { startAt: { gte: since } }] },
        select: { id: true, updatedAt: true },
      });
      const byEvent = new Map(copies.map((c) => [c.eventId, c]));
      for (const event of events) {
        const copy = byEvent.get(event.id);
        if (!copy || copy.syncedAt < event.updatedAt) ids.add(event.id);
        byEvent.delete(event.id);
      }
      // Leftover copies: event deleted, reassigned or out of the window. Skip ones whose event is
      // merely in the past — doSync leaves those alone, so re-queuing them would repeat every 2 minutes.
      if (byEvent.size) {
        const leftovers = await this.prisma.calendarEvent.findMany({
          where: { id: { in: [...byEvent.keys()] } },
          select: { id: true, startAt: true },
        });
        const past = new Set(leftovers.filter((l) => l.startAt < since).map((l) => l.id));
        byEvent.forEach((c) => { if (!past.has(c.eventId)) ids.add(c.eventId); });
      }
    }

    // Copies whose account was disconnected: no token left to call Graph — forget them.
    await this.prisma.calendarEventOutlookCopy.deleteMany({ where: { connectionId: { notIn: [...activeIds] } } });

    for (const id of ids) {
      try {
        await this.syncEvent(id);
      } catch (error) {
        this.logger.warn(`reconcile ${id} failed: ${error}`);
      }
    }
  }
}
