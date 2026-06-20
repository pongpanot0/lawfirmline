import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.module';
import { LineMessagingService } from './line-messaging.service';

@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    private prisma: PrismaService,
    private lineMessaging: LineMessagingService,
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
          const message = `⏰ แจ้งเตือนนัดหมาย (${minutesBefore >= 1440 ? `${Math.round(minutesBefore / 1440)} วัน` : `${minutesBefore} นาที`}ก่อน)\nคดี: ${event.case.caseNumber}\nเรื่อง: ${event.title}\nเวลา: ${event.startAt.toLocaleString('th-TH')}`;

          this.logger.log(`[REMINDER] ${minutesBefore}min before: "${event.title}" for case ${event.case.caseNumber}`);

          const lineSent = await this.lineMessaging.sendText(message);

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
