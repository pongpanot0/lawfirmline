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
    const skipped = new Set<string>(); // copy lives on an EXPIRED/ERROR connection: leave it alone until it recovers
    for (const userId of people) {
      const connection = await this.pickConnection(userId, organizerId, copies.find((c) => c.userId === userId));
      if (connection === 'skip') skipped.add(userId);
      else if (connection) desired.set(userId, connection);
    }

    for (const copy of copies) {
      if (skipped.has(copy.userId)) continue;
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
        try {
          await this.prisma.calendarEventOutlookCopy.updateMany({ where: { eventId: event.id, userId }, data: { lastError: String(error).slice(0, 2000) } });
        } catch (e) {
          this.logger.warn(`Could not record lastError for event ${event.id}/${userId}: ${e}`);
        }
      }
    }
  }

  /** Deterministic choice: keep the connection the user's existing copy lives on, else the oldest eligible one. */
  private async pickConnection(userId: string, organizerId: string | null, existing?: Copy) {
    const rows = await this.prisma.mailboxConnection.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (existing && !rows.some((c) => c.id === existing.connectionId)) {
      const current = await this.prisma.mailboxConnection.findUnique({ where: { id: existing.connectionId }, select: { status: true } });
      if (current && current.status !== 'REVOKED') return 'skip';
    }
    const eligible = rows.filter((c) => c.syncCalendar || userId === organizerId);
    return eligible.find((c) => c.id === existing?.connectionId) ?? eligible[0] ?? null;
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
        graphEventId = (await this.calendar.createEvent(token, payload)).id; // user deleted it in Outlook; upsert below overwrites the row
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

  /** Removes the Outlook event and the row. On a retryable failure the row is kept (with lastError) so a later run retries. */
  private async deleteCopy(copy: Copy) {
    // A revoked/removed connection can never produce a token again — nothing left to retry.
    const connection = await this.prisma.mailboxConnection.findUnique({ where: { id: copy.connectionId }, select: { status: true } });
    if (connection && connection.status !== 'REVOKED') {
      try {
        const token = await this.connections.getValidAccessToken(copy.connectionId);
        await this.calendar.deleteEvent(token, copy.graphEventId);
      } catch (error) {
        if (!(error instanceof GraphApiError && error.status === 404)) {
          this.logger.warn(`Could not delete Outlook copy ${copy.graphEventId}: ${error}`);
          try {
            await this.prisma.calendarEventOutlookCopy.updateMany({ where: { id: copy.id }, data: { lastError: String(error).slice(0, 2000) } });
          } catch (e) {
            this.logger.warn(`Could not record lastError for copy ${copy.id}: ${e}`);
          }
          return;
        }
      }
    }
    await this.prisma.calendarEventOutlookCopy.deleteMany({ where: { id: copy.id } });
  }

  async removeAllForConnection(connectionId: string): Promise<void> {
    const copies = (await this.prisma.calendarEventOutlookCopy.findMany({ where: { connectionId } })) as Copy[];
    for (const copy of copies) await this.deleteCopy(copy);
  }

  private running = false;

  @Cron('*/2 * * * *')
  async reconcileAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcile();
    } finally {
      this.running = false;
    }
  }

  private async reconcile(): Promise<void> {
    const since = new Date(Date.now() - DAY);
    const connections = await this.prisma.mailboxConnection.findMany({ where: { status: 'ACTIVE', userId: { not: null } } });
    const ids = new Set<string>();
    // Copies whose event may be deleted, reassigned or merely past — sorted out after one lookup.
    const leftovers = new Set<string>();

    for (const connection of connections) {
      const userId = connection.userId!;
      const copies = (await this.prisma.calendarEventOutlookCopy.findMany({ where: { userId } })) as Copy[];
      if (!connection.syncCalendar) {
        copies.forEach((c) => leftovers.add(c.eventId));
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
      byEvent.forEach((c) => leftovers.add(c.eventId));
    }

    // Skip events that merely slipped into the past: doSync leaves them alone, so re-queuing repeats every 2 minutes.
    if (leftovers.size) {
      const found = await this.prisma.calendarEvent.findMany({
        where: { id: { in: [...leftovers] } },
        select: { id: true, startAt: true },
      });
      const past = new Set(found.filter((f) => f.startAt < since).map((f) => f.id));
      leftovers.forEach((id) => { if (!past.has(id)) ids.add(id); });
    }

    // Copies of revoked/removed connections: no token left to call Graph — forget them. (EXPIRED may recover.)
    const live = await this.prisma.mailboxConnection.findMany({ where: { status: { not: 'REVOKED' } }, select: { id: true } });
    await this.prisma.calendarEventOutlookCopy.deleteMany({ where: { connectionId: { notIn: live.map((c) => c.id) } } });

    for (const id of ids) {
      try {
        await this.syncEvent(id);
      } catch (error) {
        this.logger.warn(`reconcile ${id} failed: ${error}`);
      }
    }
  }
}
