import { lineActions } from '../notifications/line-actions';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthUser, DeadlineDayBasis } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationCategory, Prisma } from '../generated/prisma';
import { CaseAccessService } from '../common/services/case-access.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { bangkokDayKey, formatBangkokDateTime } from '../common/utils/bangkok-time';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { formatCaseNotificationReference } from '../notifications/reference-label';
import { eventAssigneesInclude, eventPeopleIds } from './event-people';

@Injectable()
export class EventResponsibilityService {
  private readonly logger = new Logger(EventResponsibilityService.name);

  constructor(
    private prisma: PrismaService,
    private access: CaseAccessService,
    private deadlines: DeadlineRulesService,
    private notifier: AssignmentNotifierService,
  ) {}

  private async event(user: AuthUser, id: string, db: Prisma.TransactionClient = this.prisma) {
    const event = await db.calendarEvent.findFirst({ where: { id, case: this.access.getCaseFilterForUser(user) }, include: {
      case: { select: { leadLawyerId: true, status: true, leadLawyer: { select: { firstName: true, lastName: true } } } },
      assignee: { select: { firstName: true, lastName: true } }, responsibility: true,
      reminderLogs: { orderBy: { sentAt: 'desc' }, take: 5 },
      dateSuggestion: { include: { deadlineRule: true } },
    } });
    if (!event) throw new NotFoundException('ไม่พบนัดหมาย / Appointment unavailable');
    return event;
  }

  async get(user: AuthUser, id: string) {
    const e = await this.event(user, id);
    const ownerId = e.assigneeId ?? e.case.leadLawyerId;
    const owner = e.assignee ?? e.case.leadLawyer;
    const valid = e.responsibility?.ownerId === ownerId && e.responsibility.eventUpdatedAt.getTime() === e.updatedAt.getTime();
    const acceptedAt = valid ? e.responsibility?.acceptedAt ?? null : null;
    const completedAt = valid ? e.responsibility?.completedAt ?? null : null;
    return { eventUpdatedAt: e.updatedAt, ownerId, owner: `${owner.firstName} ${owner.lastName}`, acceptedAt, completedAt,
      needsEscalation: !acceptedAt && e.case.status !== 'CLOSED' && e.startAt.getTime() <= Date.now() + 48 * 60 * 60 * 1000,
      canAccept: ownerId === user.id && e.case.status !== 'CLOSED', reminders: e.reminderLogs.map(r => ({ sentAt: r.sentAt, channel: r.channel })),
      source: e.dateSuggestion ? { excerpt: e.dateSuggestion.sourceExcerpt, rule: e.dateSuggestion.deadlineRule?.label ?? null, reviewedAt: e.dateSuggestion.reviewedAt } : null };
  }

  async acknowledge(user: AuthUser, id: string, revision: string, complete = false) {
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "CalendarEvent" WHERE "id" = ${id} FOR UPDATE`;
      const e = await this.event(user, id, db);
      const ownerId = e.assigneeId ?? e.case.leadLawyerId;
      if (ownerId !== user.id) throw new ForbiddenException('เฉพาะผู้รับผิดชอบรับงานได้ / Only the responsible lawyer may acknowledge');
      if (e.case.status === 'CLOSED') throw new BadRequestException('คดีปิดแล้ว / Case is closed');
      if (e.updatedAt.toISOString() !== revision) throw new ConflictException('นัดเปลี่ยนแล้ว กรุณาตรวจใหม่ / Appointment changed; review again');
      const valid = e.responsibility?.ownerId === ownerId && e.responsibility.eventUpdatedAt.getTime() === e.updatedAt.getTime();
      if (complete && (!valid || !e.responsibility?.acceptedAt)) throw new BadRequestException('กรุณารับงานก่อน / Acknowledge first');
      if (complete && e.type === 'COURT_DATE') throw new BadRequestException('บันทึกผลผ่านแฟ้มไปศาล / Record the hearing through its court file');
      if (valid && (complete ? e.responsibility?.completedAt : e.responsibility?.acceptedAt)) return e.responsibility;
      const data = { eventUpdatedAt: e.updatedAt, ownerId, acceptedAt: valid ? e.responsibility?.acceptedAt ?? new Date() : new Date(), completedAt: complete ? new Date() : null };
      const result = await db.eventResponsibility.upsert({ where: { eventId: id }, create: { eventId: id, ...data }, update: data });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: complete ? 'EVENT_WORK_COMPLETED' : 'EVENT_ACKNOWLEDGED', metadata: { eventId: id, revision } } });
      return result;
    });
  }

  async preview(user: AuthUser, id: string, startAt: string, db: Prisma.TransactionClient = this.prisma) {
    const e = await this.event(user, id, db);
    if (e.case.status === 'CLOSED') throw new BadRequestException('คดีปิดแล้ว / Case is closed');
    const next = new Date(startAt);
    const suggestions = await db.documentDateSuggestion.findMany({ where: { triggerEventId: id, status: { not: 'DISMISSED' } }, include: { deadlineRule: true, calendarEvent: true }, orderBy: { id: 'asc' } });
    const holidayRows = await db.publicHoliday.findMany({ select: { date: true } });
    const holidays = new Set(holidayRows.map(h => bangkokDayKey(h.date)));
    const impacts = suggestions.map(s => ({ id: s.id, title: s.label, status: s.status, eventId: s.calendarEventId, oldAt: (s.calendarEvent?.startAt ?? s.suggestedDate).toISOString(), newAt: s.deadlineRule ? `${this.deadlines.computeDueDate(next, s.deadlineRule.offsetDays, s.deadlineRule.dayBasis as DeadlineDayBasis, holidays)}T00:00:00.000Z` : null, revision: s.updatedAt.toISOString(), eventRevision: s.calendarEvent?.updatedAt.toISOString() ?? null, endAt: s.calendarEvent?.endAt?.toISOString() ?? null }));
    if (impacts.some(i => !i.newAt)) throw new BadRequestException('ไม่พบกฎเดิม ต้องตรวจวันที่ที่เกี่ยวข้องก่อน / A linked deadline rule is missing');
    const snapshot = { eventId: id, eventUpdatedAt: e.updatedAt.toISOString(), oldAt: e.startAt.toISOString(), newAt: next.toISOString(), impacts };
    return { ...snapshot, fingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
  }

  async reschedule(user: AuthUser, id: string, dto: { startAt: string; fingerprint: string; reason: string }) {
    if (user.firmRole === 'ASSISTANT') throw new ForbiddenException('ให้ทนายยืนยันกำหนด / A lawyer must confirm dates');
    if (!dto.reason.trim()) throw new BadRequestException('ระบุเหตุผล / Enter a reason');
    const result = await this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "CalendarEvent" WHERE "id" = ${id} FOR UPDATE`;
      const preview = await this.preview(user, id, dto.startAt, db);
      if (preview.fingerprint !== dto.fingerprint) throw new ConflictException('ข้อมูลเปลี่ยนแล้ว กรุณาตรวจผลกระทบอีกครั้ง / Preview is stale');
      const e = await this.event(user, id, db);
      const shift = new Date(dto.startAt).getTime() - e.startAt.getTime();
      await db.calendarEvent.update({ where: { id }, data: { startAt: new Date(dto.startAt), endAt: e.endAt ? new Date(e.endAt.getTime() + shift) : null } });
      for (const impact of preview.impacts) {
        const changed = await db.documentDateSuggestion.updateMany({ where: { id: impact.id, updatedAt: new Date(impact.revision) }, data: { suggestedDate: new Date(impact.newAt!), ...(impact.status === 'CONFIRMED' ? { reviewedById: user.id, reviewedAt: new Date() } : {}) } });
        if (changed.count !== 1) throw new ConflictException('กำหนดเปลี่ยนระหว่างตรวจ / Related deadline changed');
        if (impact.eventId) {
          const updated = await db.calendarEvent.updateMany({ where: { id: impact.eventId, updatedAt: new Date(impact.eventRevision!) }, data: { startAt: new Date(impact.newAt!), endAt: impact.endAt ? new Date(new Date(impact.endAt).getTime() + new Date(impact.newAt!).getTime() - new Date(impact.oldAt).getTime()) : null } });
          if (updated.count !== 1) throw new ConflictException('กำหนดเปลี่ยนระหว่างตรวจ / Related deadline changed');
          await db.reminderLog.deleteMany({ where: { eventId: impact.eventId } });
        }
      }
      await db.reminderLog.deleteMany({ where: { eventId: id } });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'EVENT_RESCHEDULED', metadata: { ...preview, reason: dto.reason.trim(), previousReminders: e.reminderLogs.map(r => ({ sentAt: r.sentAt.toISOString(), channel: r.channel })) } } });
      return { updated: true, impacted: preview.impacts.length, oldAt: e.startAt };
    }, { timeout: 15000 });
    // Already committed: a failed notice must not turn a saved reschedule into a 500 the client retries into a 409.
    await this.notifyRescheduled(user, id, result.oldAt, dto.reason.trim())
      .catch((err) => this.logger.error(`Reschedule notice for event ${id} failed: ${(err as Error).message}`));
    return { updated: result.updated, impacted: result.impacted };
  }

  /** The moved date resets acknowledgement, so whoever attends has to hear about it. */
  private async notifyRescheduled(user: AuthUser, id: string, oldAt: Date, reason: string) {
    const e = await this.prisma.calendarEvent.findUnique({
      where: { id },
      include: { ...eventAssigneesInclude, case: { select: { firmId: true, leadLawyerId: true, title: true, ownRef: true, blackCaseNumber: true, redCaseNumber: true } } },
    });
    if (!e) return;
    await this.notifier.notifyAssigned({
      firmId: e.case.firmId,
      userIds: [...eventPeopleIds(e), e.case.leadLawyerId],
      actorUserId: user.id,
      category: NotificationCategory.CALENDAR,
      summaryText: `📅 เลื่อนนัด: ${e.title}\n${formatCaseNotificationReference(e.case) ?? `คดี: ${e.case.title}`}\n${formatBangkokDateTime(oldAt)} → ${formatBangkokDateTime(e.startAt)}\nเหตุผล: ${reason}\nเปิดดูและกดรับทราบนัดใหม่`,
      entityPath: `/court-day/${id}`,
      // Only the responsible person can acknowledge; others just hear about it.
      lineActions: (userId) => userId === (e.assigneeId ?? e.case.leadLawyerId) ? lineActions.eventAck(id, e.updatedAt) : undefined,
    });
  }
}
