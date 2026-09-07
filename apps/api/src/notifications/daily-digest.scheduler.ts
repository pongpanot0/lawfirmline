import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgendaItem, AgendaItemKind, AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { AgendaService } from '../agenda/agenda.service';
import { LineMessagingService } from './line-messaging.service';
import { EmailService } from './email.service';
import {
  addBangkokDays,
  bangkokDateOnly,
  bangkokDayStart,
  formatBangkokDateThai,
  formatBangkokTime,
} from '../common/utils/bangkok-time';

type Channel = 'line' | 'email';

const KIND_LABEL: Record<AgendaItemKind, string> = {
  [AgendaItemKind.COURT_DATE]: 'นัดศาล',
  [AgendaItemKind.CLIENT_MEETING]: 'นัดลูกความ',
  [AgendaItemKind.DEADLINE]: 'ครบกำหนด',
  [AgendaItemKind.TASK]: 'งาน',
  [AgendaItemKind.OTHER]: 'นัดหมาย',
};

/**
 * Sends each member a single message the evening before, so tomorrow's work is
 * known without opening the app.
 *
 * This is deliberately separate from `ReminderScheduler`: that one counts down
 * to one event and notifies everyone staffed on the case, whereas this answers
 * "what do *I* have tomorrow" for one person.
 */
@Injectable()
export class DailyDigestScheduler {
  private readonly logger = new Logger(DailyDigestScheduler.name);

  constructor(
    private prisma: PrismaService,
    private agenda: AgendaService,
    private line: LineMessagingService,
    private email: EmailService,
  ) {}

  /** 18:00 Asia/Bangkok — pinned, because the server may run anywhere. */
  @Cron('0 18 * * *', { timeZone: 'Asia/Bangkok' })
  async sendDigests(): Promise<void> {
    const target = addBangkokDays(bangkokDayStart(new Date()), 1);
    const digestDate = bangkokDateOnly(target);

    const members = await this.prisma.firmMember.findMany({
      where: { user: { dailyDigestEnabled: true } },
      select: {
        firmId: true,
        role: true,
        firm: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            email: true,
            lineUserId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    if (members.length === 0) return;

    // Deliberately not filtered by channel: a member who already got the day's
    // digest over LINE must not get it again by email if they unlink.
    const alreadySent = await this.prisma.dailyDigestLog.findMany({
      where: { digestDate, userId: { in: members.map((m) => m.user.id) } },
      select: { userId: true },
    });
    const sentUserIds = new Set(alreadySent.map((log) => log.userId));

    for (const member of members) {
      if (sentUserIds.has(member.user.id)) continue;
      try {
        await this.sendForMember(member, target, digestDate);
      } catch (err) {
        // One member's bad data must not silence the whole firm's digest.
        this.logger.error(
          `Daily digest failed for user ${member.user.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async sendForMember(
    member: {
      firmId: string;
      // Prisma generates its enums as string-literal unions, which are not
      // assignable to the shared TS enum; narrow it once, below.
      role: string;
      firm: { id: string; name: string };
      user: {
        id: string;
        email: string;
        lineUserId: string | null;
        firstName: string;
        lastName: string;
      };
    },
    target: Date,
    digestDate: Date,
  ): Promise<void> {
    const authUser = {
      id: member.user.id,
      firmId: member.firmId,
      firmName: member.firm.name,
      firmRole: member.role as FirmRole,
    } as AuthUser;

    const brief = await this.agenda.getDayBrief(authUser, target);
    // Nothing scheduled is not news; sending "you have 0 items" every night is
    // how a digest gets muted.
    if (brief.items.length === 0) return;

    const lines = this.buildLines(brief.items);
    const warnings = brief.warnings.map((w) => w.message);
    const channel: Channel = member.user.lineUserId ? 'line' : 'email';

    const sent =
      channel === 'line'
        ? await this.line.sendText(this.buildMessage(target, lines, warnings), [
            member.user.lineUserId as string,
          ])
        : await this.email.sendDailyDigestEmail({
            to: member.user.email,
            recipientName: `${member.user.firstName} ${member.user.lastName}`.trim(),
            dayLabel: formatBangkokDateThai(target),
            lines,
            warnings,
            appUrl: `${this.email.getAppUrl()}/my-day`,
          });

    if (!sent) {
      this.logger.warn(`Digest not delivered to user ${member.user.id} over ${channel}`);
      return;
    }

    await this.prisma.dailyDigestLog.create({
      data: {
        userId: member.user.id,
        digestDate,
        channel,
        itemCount: brief.items.length,
      },
    });
  }

  /** One line per item, shared by both channels so they never drift apart. */
  private buildLines(items: AgendaItem[]): string[] {
    const lines: string[] = [];
    for (const item of items) {
      const when = item.allDay ? 'ทั้งวัน' : formatBangkokTime(new Date(item.at));
      const ref = item.caseRef ? ` [${item.caseRef}]` : '';
      const detail: string[] = [];
      if (item.location) detail.push(item.location);
      if (item.departBy) {
        detail.push(`ออกจากสำนักงาน ${formatBangkokTime(new Date(item.departBy))}`);
      }
      lines.push(
        `${when} ${KIND_LABEL[item.kind]} — ${item.title}${ref}` +
          (detail.length ? ` (${detail.join(' · ')})` : ''),
      );
    }
    return lines;
  }

  private buildMessage(day: Date, lines: string[], warnings: string[]): string {
    return [
      `📋 งานพรุ่งนี้ (${formatBangkokDateThai(day)})`,
      '',
      ...lines.map((line) => `• ${line}`),
      ...(warnings.length ? ['', ...warnings.map((w) => `⚠️ ${w}`)] : []),
    ].join('\n');
  }
}
