import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationCategory, ReviewRoundStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { addBangkokDays, bangkokDayStart } from '../common/utils/bangkok-time';

@Injectable()
export class DocumentReviewScheduler {
  private readonly logger = new Logger(DocumentReviewScheduler.name);

  constructor(private prisma: PrismaService, private notifier: AssignmentNotifierService) {}

  @Cron('30 8 * * *', { timeZone: 'Asia/Bangkok' })
  async run() {
    const sent = await this.remindDueTomorrow().catch((err) => {
      this.logger.error('review due reminder failed', err);
      return 0;
    });
    if (sent) this.logger.log(`Reminded ${sent} review round(s) due tomorrow`);
  }

  /** Rounds still waiting whose due date is tomorrow (Bangkok); each round is claimed once. */
  async remindDueTomorrow(now = new Date()): Promise<number> {
    const tomorrow = addBangkokDays(bangkokDayStart(now), 1);
    const rounds = await this.prisma.reviewRound.findMany({
      where: { status: ReviewRoundStatus.WAITING_REVIEW, dueReminderSentAt: null, dueAt: { gte: tomorrow, lt: addBangkokDays(tomorrow, 1) } },
      include: { decisions: { select: { reviewerId: true } }, documentVersion: { include: { document: { select: { filename: true, caseId: true, case: { select: { firmId: true } } } } } } },
    });
    let sent = 0;
    for (const round of rounds) {
      const claimed = await this.prisma.reviewRound.updateMany({ where: { id: round.id, dueReminderSentAt: null }, data: { dueReminderSentAt: now } });
      if (!claimed.count) continue;
      const decided = new Set(round.decisions.map((d) => d.reviewerId));
      const pending = round.reviewerIds.filter((id) => !decided.has(id));
      const doc = round.documentVersion.document;
      if (!pending.length || !doc.case) continue;
      await this.notifier.notifyAssigned({
        firmId: doc.case.firmId,
        userIds: pending,
        actorUserId: '',
        category: NotificationCategory.TASK,
        summaryText: `⏰ ครบกำหนดตรวจเอกสารพรุ่งนี้: ${doc.filename}`,
        entityPath: doc.caseId ? `/cases/${doc.caseId}` : '/dashboard',
      });
      sent++;
    }
    return sent;
  }
}
