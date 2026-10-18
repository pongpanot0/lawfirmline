import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FirmRole, SubscriptionStatus } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { EmailService } from '../notifications/email.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Reminder points, in days before trial end. Smallest first. */
const REMIND_AT = [0, 1, 7];
/** Don't email firms whose trial ended long ago (first deploy would spam old test firms). */
const EXPIRED_GRACE_MS = 2 * DAY_MS;

/** Which reminder is due for this many days left, or null when none is yet. */
export function dueReminder(daysLeft: number): number | null {
  return REMIND_AT.find((d) => daysLeft <= d) ?? null;
}

/**
 * Emails firm owners 7 days, 1 day and on the day their trial, or a prepaid
 * (PromptPay, no auto-renew) period, ends. The app can't mention payment
 * (App Store anti-steering), so email is the only nudge. Card subscriptions
 * renew on their own and are skipped; so is a firm with no end date.
 */
@Injectable()
export class TrialReminderService {
  private readonly logger = new Logger(TrialReminderService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Bangkok' })
  async run(now = new Date()) {
    const window = { lte: new Date(now.getTime() + REMIND_AT[REMIND_AT.length - 1] * DAY_MS), gte: new Date(now.getTime() - EXPIRED_GRACE_MS) };
    const firms = await this.prisma.firm.findMany({
      where: {
        stripeSubscriptionId: null,
        OR: [
          { subscriptionStatus: { in: [SubscriptionStatus.TRIAL, SubscriptionStatus.EXPIRED] }, currentPeriodEnd: null, trialEndAt: window },
          { subscriptionStatus: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED] }, currentPeriodEnd: window },
        ],
      },
      select: { id: true, name: true, trialEndAt: true, currentPeriodEnd: true, trialReminderSentDays: true },
    });
    const billingUrl = `${this.email.getAppUrl()}/account/billing`;

    for (const firm of firms) {
      const prepaid = firm.currentPeriodEnd !== null;
      const endAt = firm.currentPeriodEnd ?? firm.trialEndAt;
      const daysLeft = Math.max(0, Math.ceil((endAt.getTime() - now.getTime()) / DAY_MS));
      const due = dueReminder(daysLeft);
      if (due === null || (firm.trialReminderSentDays !== null && firm.trialReminderSentDays <= due)) continue;
      // Claim first so a second instance (or a retry) never sends the same reminder twice.
      const claimed = await this.prisma.firm.updateMany({
        where: { id: firm.id, OR: [{ trialReminderSentDays: null }, { trialReminderSentDays: { gt: due } }] },
        data: { trialReminderSentDays: due },
      });
      if (!claimed.count) continue;

      const owners = await this.prisma.firmMember.findMany({
        where: { firmId: firm.id, role: FirmRole.OWNER },
        select: { user: { select: { email: true } } },
      });
      for (const owner of owners) {
        await this.email
          .sendTrialReminderEmail({ to: owner.user.email, firmName: firm.name, daysLeft, billingUrl, prepaid })
          .catch((err) => this.logger.error(`Trial reminder for firm ${firm.id} failed: ${err}`));
      }
    }
  }
}
