import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationCategory } from '../generated/prisma';
import { AssignmentNotifierService } from './assignment-notifier.service';
import { formatCaseNotificationReference } from './reference-label';
import { eventAssigneesInclude, eventPeopleIds } from '../calendar/event-people';

/**
 * The widest lead time a reminder can use. The scheduler only loads events
 * inside this window — without a bound it read every future event in the
 * database, with all their reminder logs, every ten minutes.
 */
const MAX_REMINDER_LEAD_DAYS = 30;
const MAX_REMINDER_LEAD_MINUTES = MAX_REMINDER_LEAD_DAYS * 24 * 60;

function formatReminderLeadTime(minutesBefore: number): string {
  if (minutesBefore >= 1440 && minutesBefore % 1440 === 0) {
    const days = minutesBefore / 1440;
    return `${days} วัน`;
  }
  if (minutesBefore >= 60 && minutesBefore % 60 === 0) {
    return `${minutesBefore / 60} ชั่วโมง`;
  }
  return `${minutesBefore} นาที`;
}

@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    private prisma: PrismaService,
    private notifier: AssignmentNotifierService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async processReminders() {
    const now = new Date();
    const horizon = new Date(now.getTime() + MAX_REMINDER_LEAD_MINUTES * 60 * 1000);
    const events = await this.prisma.calendarEvent.findMany({
      where: { startAt: { gt: now, lte: horizon } },
      include: { reminderLogs: true, case: true, ...eventAssigneesInclude },
    });

    for (const event of events) {
      for (const minutesBefore of event.reminderMinutes) {
        if (minutesBefore > MAX_REMINDER_LEAD_MINUTES) {
          this.logger.warn(
            `Skipping ${minutesBefore}min reminder on event ${event.id}: beyond the ` +
              `${MAX_REMINDER_LEAD_DAYS}-day scheduling window`,
          );
          continue;
        }
        const reminderTime = new Date(
          event.startAt.getTime() - minutesBefore * 60 * 1000,
        );
        const alreadySent = event.reminderLogs.some(
          (log) => log.minutesBefore === minutesBefore,
        );

        if (now >= reminderTime && !alreadySent) {
          const leadTime = formatReminderLeadTime(minutesBefore);
          const reference = formatCaseNotificationReference(event.case);

          this.logger.log(
            `[REMINDER] ${minutesBefore}min before: "${event.title}" for case ${reference ?? event.case.title}`,
          );

          // Whoever attends: every assignee on the event, or the case's lead
          // lawyer when none is set — not everyone staffed on the case.
          const sent = await this.notifier.notifyAssigned({
            firmId: event.case.firmId,
            userIds: eventPeopleIds(event),
            actorUserId: '',
            category: NotificationCategory.CALENDAR,
            summaryText: `⏰ ${event.title} (${leadTime}ก่อน)\n${reference ?? `คดี: ${event.case.title}`}\nเวลา: ${event.startAt.toLocaleString('th-TH')}`,
            entityPath: `/court-day/${event.id}`,
          });

          await this.prisma.reminderLog.create({
            data: {
              eventId: event.id,
              channel: sent.line ? 'line' : sent.push ? 'push' : 'console',
              minutesBefore,
            },
          });
        }
      }
    }
  }
}
