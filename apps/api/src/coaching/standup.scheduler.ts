import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.module';
import { bangkokDayKey, isBangkokWeekend } from '../common/utils/bangkok-time';
import { StandupService } from './standup.service';
import { CoachingNotifierService } from './coaching-notifier.service';

@Injectable()
export class StandupScheduler {
  private readonly logger = new Logger(StandupScheduler.name);
  constructor(private prisma: PrismaService, private standup: StandupService, private notifier: CoachingNotifierService) {}

  @Cron('30 8 * * 1-5', { timeZone: 'Asia/Bangkok' })
  async sendPrompts(): Promise<void> {
    const now = new Date();
    if (isBangkokWeekend(now)) return;
    const day = bangkokDayKey(now);
    const date = new Date(`${day}T00:00:00Z`);
    const members = await this.prisma.firmMember.findMany({ where: { role: { in: ['LAWYER', 'SENIOR_LAWYER'] } }, select: { firmId: true, userId: true } });
    const firms = new Map<string, string[]>();
    for (const m of members) firms.set(m.firmId, [...(firms.get(m.firmId) ?? []), m.userId]);
    for (const [firmId, userIds] of firms) {
      try {
        const states = await this.standup.statesFor(firmId, userIds, day);
        const logs = await this.prisma.standupPromptLog.findMany({ where: { userId: { in: userIds }, day: date }, select: { userId: true } });
        const sent = new Set(logs.map((l) => l.userId));
        for (const userId of userIds) {
          if (states.get(userId) !== 'not_yet' || sent.has(userId)) continue;
          try {
            const notification = await this.prisma.$transaction(async (tx) => {
              // Claim and inbox are atomic, so concurrent workers cannot send duplicate prompts.
              await tx.standupPromptLog.create({ data: { userId, day: date } });
              const checkedIn = await tx.dailyStandup.findUnique({ where: { firmId_userId_day: { firmId, userId, day: date } }, select: { id: true } });
              if (checkedIn) return null;
              return this.notifier.record(tx, firmId, userId, 'STANDUP', 'เช็กอินเช้านี้', '/my-day');
            });
            if (notification) await this.notifier.send(notification);
            sent.add(userId);
          } catch (err) {
            if ((err as { code?: string }).code !== 'P2002') this.logger.error(`Standup prompt failed for ${userId}`, err);
          }
        }
      } catch (err) {
        this.logger.error(`Standup prompts failed for firm ${firmId}`, err);
      }
    }
  }
}
