import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.module';
import { LineMessagingService } from './line-messaging.service';
import { LineLinkService } from './line-link.service';

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
    private lineMessaging: LineMessagingService,
    private lineLink: LineLinkService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async processReminders() {
    const now = new Date();
    const events = await this.prisma.calendarEvent.findMany({
      where: { startAt: { gt: now } },
      include: { reminderLogs: true, case: true },
    });

    for (const event of events) {
      for (const minutesBefore of event.reminderMinutes) {
        const reminderTime = new Date(
          event.startAt.getTime() - minutesBefore * 60 * 1000,
        );
        const alreadySent = event.reminderLogs.some(
          (log) => log.minutesBefore === minutesBefore,
        );

        if (now >= reminderTime && !alreadySent) {
          const leadTime = formatReminderLeadTime(minutesBefore);
          const message = `⏰ แจ้งเตือนนัดหมาย (${leadTime}ก่อน)\nคดี: ${event.case.ownRef}\nเรื่อง: ${event.title}\nเวลา: ${event.startAt.toLocaleString('th-TH')}`;

          this.logger.log(
            `[REMINDER] ${minutesBefore}min before: "${event.title}" for case ${event.case.ownRef}`,
          );

          const lineUserIds = await this.lineLink.getLineUserIdsForCase(event.caseId);
          const lineSent = await this.lineMessaging.sendText(message, lineUserIds);

          await this.prisma.reminderLog.create({
            data: {
              eventId: event.id,
              channel: lineSent ? 'line' : 'console',
              minutesBefore,
            },
          });
        }
      }
    }
  }
}
