import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CalendarService } from './calendar.service';
import { EventResponsibilityService } from './event-responsibility.service';
import { OutlookCalendarSyncService } from '../outlook-integration/calendar/outlook-calendar-sync.service';

/** Proposals created when Outlook moves a legal date (or a non-responsible person moves anything). */
@Injectable()
export class OutlookChangesService {
  constructor(
    private prisma: PrismaService,
    private calendar: CalendarService,
    private responsibility: EventResponsibilityService,
    private outlookCalendar: OutlookCalendarSyncService,
  ) {}

  async list(user: AuthUser, eventId: string) {
    await this.calendar.findOne(user, eventId); // same access rule as viewing the event
    const [rows, mine] = await Promise.all([
      this.prisma.calendarEventOutlookChange.findMany({ where: { eventId, resolvedAt: null }, orderBy: { detectedAt: 'asc' } }),
      this.prisma.calendarEventOutlookCopy.findFirst({ where: { eventId, userId: user.id }, select: { removedInOutlookAt: true } }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, firstName: true, lastName: true } });
    const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    return {
      changes: rows.map((r) => ({
        id: r.id, userId: r.userId, userName: names.get(r.userId) ?? '',
        proposedStartAt: r.proposedStartAt, proposedEndAt: r.proposedEndAt, detectedAt: r.detectedAt,
      })),
      myCopyRemovedInOutlook: !!mine?.removedInOutlookAt,
    };
  }

  private async openChange(user: AuthUser, eventId: string, changeId: string) {
    const event = await this.calendar.findOne(user, eventId); // edit rule == view rule in CalendarService.update
    const change = await this.prisma.calendarEventOutlookChange.findFirst({ where: { id: changeId, eventId } });
    if (!change) throw new NotFoundException('Change not found');
    if (change.resolvedAt) throw new ConflictException('Change already resolved');
    return { event, change };
  }

  /** Legal dates move only through the reschedule flow (impact preview, reason, reminders, notices); the web gets the fingerprint from reschedule-preview. */
  async apply(user: AuthUser, eventId: string, changeId: string, dto: { fingerprint: string; reason: string }) {
    const { change } = await this.openChange(user, eventId, changeId);
    await this.responsibility.reschedule(user, eventId, { startAt: change.proposedStartAt.toISOString(), fingerprint: dto.fingerprint, reason: dto.reason });
    const now = new Date();
    await this.prisma.calendarEventOutlookChange.update({ where: { id: changeId }, data: { resolvedAt: now, resolvedById: user.id, resolution: 'APPLIED' } });
    await this.prisma.calendarEventOutlookChange.updateMany({
      where: { eventId, resolvedAt: null }, data: { resolvedAt: now, resolvedById: user.id, resolution: 'KEPT' },
    });
    return { ok: true };
  }

  async keep(user: AuthUser, eventId: string, changeId: string) {
    const { event, change } = await this.openChange(user, eventId, changeId);
    await this.prisma.calendarEventOutlookChange.update({
      where: { id: changeId }, data: { resolvedAt: new Date(), resolvedById: user.id, resolution: 'KEPT' },
    });
    // Epoch syncedAt makes doSync rewrite that user's Outlook copy with the system time.
    await this.prisma.calendarEventOutlookCopy.updateMany({ where: { eventId, userId: change.userId }, data: { syncedAt: new Date(0) } });
    await this.prisma.auditLog.create({
      data: { firmId: event.case.firmId, userId: user.id, action: 'CALENDAR_OUTLOOK_CHANGE_KEPT', metadata: { eventId, changeId } },
    });
    this.outlookCalendar.syncEventSoon(eventId);
    return { ok: true };
  }

  async restoreMyCopy(user: AuthUser, eventId: string) {
    await this.calendar.findOne(user, eventId);
    const res = await this.prisma.calendarEventOutlookCopy.updateMany({
      where: { eventId, userId: user.id, removedInOutlookAt: { not: null } }, data: { removedInOutlookAt: null, syncedAt: new Date(0) },
    });
    if (res.count === 0) throw new NotFoundException('No removed Outlook copy');
    this.outlookCalendar.syncEventSoon(eventId);
    return { ok: true };
  }
}
