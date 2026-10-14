import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationCategory } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { LineLinkService } from '../notifications/line-link.service';
import { bangkokDateOnly, isBangkokWeekend } from '../common/utils/bangkok-time';
import { awaitingMessage, DEFAULT_EMAIL_REPLY_HOURS, loadInternalAddresses, loadLatestMessages } from '../email-intake/awaiting-reply';

const HOUR_MS = 60 * 60 * 1000;
const LOOKBACK_MS = 14 * 24 * HOUR_MS;
const MAX_THREADS_PER_RUN = 2000;
const LISTED = 3;

interface Due {
  threadId: string;
  messageId: string;
  line: string;
}

/** Reminds a case's team once per unanswered client email (weekdays 09:00 and 14:00 Bangkok, not on public holidays). */
@Injectable()
export class EmailReplyReminderService {
  private readonly logger = new Logger(EmailReplyReminderService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private notifier: AssignmentNotifierService,
    private lineLink: LineLinkService,
  ) {}

  @Cron('0 9,14 * * 1-5', { timeZone: 'Asia/Bangkok' })
  async run(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      if (isBangkokWeekend(now)) return;
      if (await this.prisma.publicHoliday.findUnique({ where: { date: bangkokDateOnly(now) }, select: { id: true } })) return;
      const firms = await this.prisma.firm.findMany({ select: { id: true, slaConfig: true } });
      for (const firm of firms) {
        await this.remindFirm(firm.id, firm.slaConfig as Record<string, number> | null, now).catch((err) =>
          this.logger.error(`Reply reminders for firm ${firm.id} failed: ${err}`),
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async remindFirm(firmId: string, sla: Record<string, number> | null, now: Date) {
    const thresholdMs = (sla?.emailReplyHours ?? DEFAULT_EMAIL_REPLY_HOURS) * HOUR_MS;
    const threads = await this.prisma.emailThread.findMany({
      where: { firmId, caseId: { not: null }, lastMessageAt: { gte: new Date(now.getTime() - LOOKBACK_MS) } },
      select: { id: true, caseId: true, subject: true, fromName: true, fromAddress: true, replyDismissedAt: true, replyReminderMessageId: true },
      orderBy: { lastMessageAt: 'desc' },
      // ponytail: newest 2000 case threads per firm per run; batch if a firm outgrows it.
      take: MAX_THREADS_PER_RUN,
    });
    if (!threads.length) return;
    const [internal, latest] = await Promise.all([loadInternalAddresses(this.prisma, firmId), loadLatestMessages(this.prisma, threads.map((t) => t.id))]);

    const byCase = new Map<string, Due[]>();
    for (const thread of threads) {
      const message = awaitingMessage(thread, latest.get(thread.id), internal);
      if (!message || thread.replyReminderMessageId === message.id) continue;
      const waitedMs = now.getTime() - message.receivedAt.getTime();
      if (waitedMs < thresholdMs) continue;
      const list = byCase.get(thread.caseId!) ?? [];
      list.push({
        threadId: thread.id,
        messageId: message.id,
        line: `${thread.fromName || thread.fromAddress || message.fromAddress || '-'}: ${thread.subject} (รอ ${Math.floor(waitedMs / HOUR_MS)} ชม.)`,
      });
      byCase.set(thread.caseId!, list);
    }

    for (const [caseId, due] of byCase) {
      // Claim before sending: a second instance or an overlapping run can't remind about the same message twice.
      const items: Due[] = [];
      for (const item of due) {
        const { count } = await this.prisma.emailThread.updateMany({
          where: { id: item.threadId, OR: [{ replyReminderMessageId: null }, { replyReminderMessageId: { not: item.messageId } }] },
          data: { replyReminderMessageId: item.messageId },
        });
        if (count === 1) items.push(item);
      }
      if (!items.length) continue;
      const legalCase = await this.prisma.case.findUnique({ where: { id: caseId }, select: { ownRef: true } });
      const team = await this.lineLink.getCaseTeamUserIds(caseId);
      const lines = items.slice(0, LISTED).map((i) => i.line);
      if (items.length > LISTED) lines.push(`และอีก ${items.length - LISTED} ฉบับ`);
      await this.notifier.notifyAssigned({
        firmId,
        userIds: team,
        actorUserId: '',
        category: NotificationCategory.EMAIL,
        summaryText: [`⏰ อีเมลลูกความรอตอบ · ${legalCase?.ownRef ?? ''}`, ...lines].join('\n'),
        entityPath: `/cases/${caseId}?tab=email`,
        appPath: `/case/${caseId}?section=email`,
      });
    }
  }
}
