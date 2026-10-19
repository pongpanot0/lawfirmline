import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgendaItem, AgendaItemKind, AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { AgendaService } from '../agenda/agenda.service';
import { LineMessagingService } from './line-messaging.service';
import { EmailService } from './email.service';
import { PushService } from './push.service';
import {
  addBangkokDays,
  bangkokDateOnly,
  bangkokDayStart,
  formatBangkokDateThai,
  formatBangkokTime,
} from '../common/utils/bangkok-time';

type TextChannel = 'line' | 'email';
type PushChannel = 'push-evening' | 'push-morning';

/** Where a tapped digest push lands in the mobile app. */
const DIGEST_APP_ROUTE = '/(tabs)/calendar';

const KIND_LABEL: Record<AgendaItemKind, string> = {
  [AgendaItemKind.COURT_DATE]: 'นัดศาล',
  [AgendaItemKind.CLIENT_MEETING]: 'นัดลูกความ',
  [AgendaItemKind.DEADLINE]: 'ครบกำหนด',
  [AgendaItemKind.TASK]: 'งาน',
  [AgendaItemKind.OTHER]: 'นัดหมาย',
};

type DigestMember = {
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
};

/**
 * Sends each member a single message the evening before, so tomorrow's work is
 * known without opening the app, plus a short push at 18:00 (tomorrow) and
 * 08:00 (today) that opens the app's calendar. `dailyDigestEnabled` mutes all of it.
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
    private push: PushService,
  ) {}

  /** 18:00 Asia/Bangkok — pinned, because the server may run anywhere. */
  @Cron('0 18 * * *', { timeZone: 'Asia/Bangkok' })
  async sendDigests(): Promise<void> {
    await this.run(addBangkokDays(bangkokDayStart(new Date()), 1), 'push-evening', true);
  }

  /** 08:00 Asia/Bangkok — push only; the full list went out over LINE/email last night. */
  @Cron('0 8 * * *', { timeZone: 'Asia/Bangkok' })
  async sendMorningPush(): Promise<void> {
    await this.run(bangkokDayStart(new Date()), 'push-morning', false);
  }

  private async run(target: Date, pushChannel: PushChannel, withText: boolean): Promise<void> {
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

    const logs = await this.prisma.dailyDigestLog.findMany({
      where: { digestDate, userId: { in: members.map((m) => m.user.id) } },
      select: { userId: true, channel: true },
    });
    // Text is deliberately not split by channel: a member who already got the
    // day's digest over LINE must not get it again by email if they unlink.
    const textSent = new Set(logs.filter((l) => !l.channel?.startsWith('push')).map((l) => l.userId));
    const pushSent = new Set(logs.filter((l) => l.channel === pushChannel).map((l) => l.userId));

    for (const member of members) {
      const text = withText && !textSent.has(member.user.id);
      const push = !pushSent.has(member.user.id);
      if (!text && !push) continue;
      try {
        await this.sendForMember(member, target, digestDate, text, push ? pushChannel : null);
      } catch (err) {
        // One member's bad data must not silence the whole firm's digest.
        this.logger.error(
          `Daily digest failed for user ${member.user.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async sendForMember(
    member: DigestMember,
    target: Date,
    digestDate: Date,
    text: boolean,
    pushChannel: PushChannel | null,
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
    if (text) {
      await this.sendText(member, target, digestDate, lines, brief.warnings.map((w) => w.message));
    }
    if (pushChannel) await this.sendPush(member.user.id, digestDate, lines, pushChannel);
  }

  private async sendText(
    member: DigestMember,
    target: Date,
    digestDate: Date,
    lines: string[],
    warnings: string[],
  ): Promise<void> {
    const channel: TextChannel = member.user.lineUserId ? 'line' : 'email';

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
    await this.log(member.user.id, digestDate, channel, lines.length);
  }

  /** Just the count and the first item; the tap opens the calendar for the rest. */
  private async sendPush(
    userId: string,
    digestDate: Date,
    lines: string[],
    channel: PushChannel,
  ): Promise<void> {
    const day = channel === 'push-morning' ? 'วันนี้' : 'พรุ่งนี้';
    const more = lines.length > 1 ? ` และอีก ${lines.length - 1} รายการ` : '';
    const sent = await this.push.sendToUsers([userId], {
      title: `📋 ${day}มี ${lines.length} รายการ`,
      body: `${lines[0]}${more}`,
      data: { url: DIGEST_APP_ROUTE },
    });
    // No device or no accepted ticket: leave it unlogged, nothing reached them.
    if (sent) await this.log(userId, digestDate, channel, lines.length);
  }

  private log(userId: string, digestDate: Date, channel: TextChannel | PushChannel, itemCount: number) {
    return this.prisma.dailyDigestLog.create({
      data: { userId, digestDate, channel, itemCount },
    });
  }

  /** One line per item, shared by every channel so they never drift apart. */
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
