import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { EmailService } from '../notifications/email.service';
import { PushService } from '../notifications/push.service';
import { addBangkokDays, bangkokDateOnly, bangkokDayKey, bangkokDayStart, formatBangkokDateThai } from '../common/utils/bangkok-time';
import { dailyTaskScope, DailyOperationsService } from './daily-operations.service';
import { buildTeamDigest, previousWorkingDay } from './team-digest';

@Injectable()
export class TeamDigestScheduler {
  private readonly logger = new Logger(TeamDigestScheduler.name);

  constructor(
    private prisma: PrismaService,
    private operations: DailyOperationsService,
    private line: LineMessagingService,
    private email: EmailService,
    private push: PushService,
  ) {}

  @Cron('30 8 * * 1-5', { timeZone: 'Asia/Bangkok' })
  async sendDigests(): Promise<void> {
    const today = bangkokDayStart(new Date());
    const digestDate = bangkokDateOnly(today);
    const recipients = await this.prisma.firmMember.findMany({
      where: {
        role: { in: [FirmRole.OWNER, FirmRole.OFFICE_MANAGER, FirmRole.SENIOR_LAWYER] },
        user: { dailyDigestEnabled: true },
      },
      select: {
        firmId: true,
        firm: { select: { name: true } },
        user: { select: { id: true, email: true, lineUserId: true } },
      },
    });
    if (!recipients.length) return;
    const logs = await this.prisma.dailyDigestLog.findMany({
      where: { digestDate, userId: { in: recipients.map(m => m.user.id) },
        channel: { in: [...new Set(recipients.map(m => m.firmId))].flatMap(firmId =>
          [`team-line:${firmId}`, `team-email:${firmId}`, `team-push:${firmId}`]) } },
      select: { userId: true, channel: true },
    });
    const textSent = new Set(logs.filter(l => l.channel.startsWith('team-line:') || l.channel.startsWith('team-email:')).map(l => `${l.userId}:${l.channel.slice(l.channel.indexOf(':') + 1)}`));
    const pushSent = new Set(logs.filter(l => l.channel.startsWith('team-push:')).map(l => `${l.userId}:${l.channel.slice(l.channel.indexOf(':') + 1)}`));
    for (const firmId of new Set(recipients.map(m => m.firmId))) {
      const members = recipients.filter(m => m.firmId === firmId);
      if (members.every(m => textSent.has(`${m.user.id}:${firmId}`) && pushSent.has(`${m.user.id}:${firmId}`))) continue;
      try {
        const authUser = { id: members[0].user.id, firmId, firmName: members[0].firm.name,
          firmRole: FirmRole.OWNER } as AuthUser;
        const board = await this.operations.board(authUser, bangkokDayKey(today));
        const previous = bangkokDayStart(previousWorkingDay(today));
        const comments = await this.prisma.taskComment.findMany({
          where: {
            kind: 'DAILY_UPDATE', createdAt: { gte: previous, lt: addBangkokDays(previous, 1) },
            authorId: { in: board.members.map(m => m.userId) }, task: dailyTaskScope(firmId),
          },
          select: { authorId: true, body: true, createdAt: true, task: { select: { case: { select: { ownRef: true } } } } },
          orderBy: { createdAt: 'asc' },
        });
        const radar = await this.operations.radar(authUser, bangkokDayKey(today));
        const joins = await this.prisma.firmMember.findMany({
          where: { firmId, userId: { in: board.members.map(m => m.userId) } },
          select: { userId: true, createdAt: true },
        });
        const digest = buildTeamDigest({ today, board, firmName: authUser.firmName,
          updates: comments.map(c => ({ authorId: c.authorId, body: c.body, caseRef: c.task.case?.ownRef ?? null })),
          radar, joins, appUrl: this.email.getAppUrl() });
        for (const { user } of members) {
          const recipientKey = `${user.id}:${firmId}`;
          try {
            if (!textSent.has(recipientKey)) {
              const channel = user.lineUserId ? `team-line:${firmId}` : `team-email:${firmId}`;
              const sent = user.lineUserId
                ? await this.line.sendText(digest.text, [user.lineUserId])
                : await this.email.sendTeamDigestEmail({ to: user.email,
                    dayLabel: formatBangkokDateThai(today), lines: digest.lines });
              if (sent) {
                await this.prisma.dailyDigestLog.create({ data: { userId: user.id, digestDate, channel, itemCount: digest.memberCount } });
                textSent.add(recipientKey);
              }
            }
          } catch (error) {
            this.logger.error(`Team digest text failed for user ${user.id}: ${(error as Error).message}`);
          }
          try {
            if (!pushSent.has(recipientKey)) {
              const sent = await this.push.sendToUsers([user.id], {
                title: `📋 สรุปทีมวันนี้ · ${authUser.firmName}`, body: digest.summary, data: { url: '/(tabs)/team' },
              });
              if (sent) {
                await this.prisma.dailyDigestLog.create({ data: { userId: user.id, digestDate, channel: `team-push:${firmId}`, itemCount: digest.memberCount } });
                pushSent.add(recipientKey);
              }
            }
          } catch (error) {
            this.logger.error(`Team digest push failed for user ${user.id}: ${(error as Error).message}`);
          }
        }
      } catch (error) {
        this.logger.error(`Team digest failed for firm ${firmId}: ${(error as Error).message}`);
      }
    }
  }
}
