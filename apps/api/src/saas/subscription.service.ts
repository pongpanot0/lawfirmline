import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  AuthUser,
  BillingPeriod,
  PLAN_CONFIG,
  planPriceThb,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionSummary,
  PlanOption,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from './tenant.service';
import { StripeService } from './stripe.service';
import { EmailService } from '../notifications/email.service';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private tenant: TenantService,
    private stripe: StripeService,
    private email: EmailService,
  ) {}

  async getSummary(user: AuthUser): Promise<SubscriptionSummary> {
    await this.tenant.syncTrialExpiry(user.firmId);
    const firm = await this.prisma.firm.findUnique({ where: { id: user.firmId } });
    if (!firm) throw new BadRequestException('Firm not found');

    const memberCount = await this.tenant.getMemberCount(user.firmId);
    const now = new Date();
    let daysRemaining: number | null = null;

    if (firm.subscriptionStatus === SubscriptionStatus.TRIAL) {
      daysRemaining = Math.max(
        0,
        Math.ceil((firm.trialEndAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
    } else if (firm.currentPeriodEnd) {
      daysRemaining = Math.max(
        0,
        Math.ceil((firm.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
    }

    const authUser = await this.tenant.buildAuthUser(user.id, user.firmId);
    return {
      status: firm.subscriptionStatus as SubscriptionStatus,
      plan: firm.subscriptionPlan as SubscriptionPlan | null,
      trialEndAt: firm.trialEndAt.toISOString(),
      currentPeriodEnd: firm.currentPeriodEnd?.toISOString() ?? null,
      daysRemaining,
      maxUsers: firm.maxUsers,
      memberCount,
      canAccessApp: authUser ? this.tenant.canAccessApp(authUser) : false,
    };
  }

  getPlans(user: AuthUser): PlanOption[] {
    return (Object.keys(PLAN_CONFIG) as SubscriptionPlan[]).map((plan) => ({
      ...PLAN_CONFIG[plan],
      isCurrent:
        user.subscriptionStatus === SubscriptionStatus.ACTIVE &&
        user.subscriptionPlan === plan,
    }));
  }

  /**
   * Stripe Checkout in subscription mode: Stripe renews monthly/yearly, emails
   * receipts and hosts the invoices. Prices come from PLAN_CONFIG (price_data),
   * so there is no second price list to keep in sync in the Stripe dashboard.
   */
  async createCheckout(user: AuthUser, plan: SubscriptionPlan, billingPeriod: BillingPeriod = BillingPeriod.MONTHLY) {
    if (!this.tenant.isOwner(user)) throw new ForbiddenException('Only owners can manage billing');
    const firm = await this.prisma.firm.findUnique({ where: { id: user.firmId } });
    if (!firm) throw new BadRequestException('Firm not found');
    if (firm.stripeSubscriptionId && firm.subscriptionStatus !== SubscriptionStatus.CANCELED) {
      throw new BadRequestException('สำนักงานมีแพ็กเกจอยู่แล้ว เปลี่ยนแพ็กเกจหรือบัตรได้ที่ "จัดการการชำระเงิน"');
    }

    const customer = await this.ensureCustomer(firm.id, firm.name, firm.stripeCustomerId, user.email);
    const metadata = { firmId: firm.id, plan, billingPeriod };
    const appUrl = this.email.getAppUrl();
    const session = await this.stripe.client.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: firm.id,
      locale: 'th',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'thb',
          unit_amount: planPriceThb(plan, billingPeriod) * 100,
          recurring: { interval: billingPeriod === BillingPeriod.YEARLY ? 'year' : 'month' },
          product_data: { name: `Samnuan ${PLAN_CONFIG[plan].name}` },
        },
      }],
      metadata,
      subscription_data: { metadata },
      success_url: `${appUrl}/account/billing?success=1`,
      cancel_url: `${appUrl}/account/billing`,
    });
    return { url: session.url };
  }

  /** Stripe Customer Portal: change card, switch plan, cancel, download invoices. */
  async createPortalSession(user: AuthUser) {
    if (!this.tenant.isOwner(user)) throw new ForbiddenException('Only owners can manage billing');
    const firm = await this.prisma.firm.findUnique({ where: { id: user.firmId }, select: { stripeCustomerId: true } });
    if (!firm?.stripeCustomerId) throw new BadRequestException('ยังไม่มีข้อมูลการชำระเงินกับ Stripe');
    const session = await this.stripe.client.billingPortal.sessions.create({
      customer: firm.stripeCustomerId,
      return_url: `${this.email.getAppUrl()}/account/billing`,
    });
    return { url: session.url };
  }

  /** Cancels at period end: the firm keeps writing until the paid period runs out, then the webhook marks it CANCELED. */
  async cancel(user: AuthUser) {
    if (!this.tenant.isOwner(user)) throw new ForbiddenException('Only owners can cancel subscription');
    const firm = await this.prisma.firm.findUnique({ where: { id: user.firmId }, select: { stripeSubscriptionId: true } });
    if (!firm?.stripeSubscriptionId) throw new BadRequestException('สำนักงานนี้ไม่มีแพ็กเกจที่ชำระผ่าน Stripe');
    await this.stripe.client.subscriptions.update(firm.stripeSubscriptionId, { cancel_at_period_end: true });
    await this.prisma.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'SUBSCRIPTION_CANCEL_REQUESTED' } });
    return { success: true };
  }

  async getBillingHistory(user: AuthUser) {
    if (!this.tenant.isOwner(user)) {
      throw new ForbiddenException('Only owners can view billing');
    }
    return this.prisma.billingInvoice.findMany({
      where: { firmId: user.firmId },
      include: { payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Signed Stripe events only. Each event is just a hint about which
   * subscription changed: the state written is re-read from Stripe, so
   * retries and out-of-order delivery converge on the same result.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature) throw new BadRequestException('Missing Stripe signature');
    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeSignatureVerificationError) throw new BadRequestException('Invalid Stripe signature');
      throw err;
    }
    this.logger.log(`Stripe webhook [${event.type}] ${event.id}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription' || !session.subscription) break;
        await this.syncSubscription(typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.syncSubscription(event.data.object.id);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (event.type === 'invoice.paid') await this.recordInvoice(invoice);
        const sub = invoice.parent?.subscription_details?.subscription;
        if (sub) await this.syncSubscription(typeof sub === 'string' ? sub : sub.id);
        break;
      }
    }
    return { received: true };
  }

  private async ensureCustomer(firmId: string, firmName: string, existing: string | null, email: string): Promise<string> {
    if (existing) return existing;
    const customer = await this.stripe.client.customers.create({ name: firmName, email, metadata: { firmId } });
    await this.prisma.firm.update({ where: { id: firmId }, data: { stripeCustomerId: customer.id } });
    return customer.id;
  }

  /** Copies a Stripe subscription's current state onto the firm (status, plan, seats, period end). */
  async syncSubscription(subscriptionId: string) {
    const sub = await this.stripe.client.subscriptions.retrieve(subscriptionId);
    const status = stripeStatus(sub.status);
    if (!status) return; // incomplete: first payment not done yet, nothing to grant
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const firm = await this.prisma.firm.findFirst({
      where: { OR: [{ stripeSubscriptionId: sub.id }, { stripeCustomerId: customerId }] },
    });
    if (!firm) {
      this.logger.warn(`Stripe subscription ${sub.id} matches no firm (customer ${customerId})`);
      return;
    }

    const plan = isPlan(sub.metadata.plan) ? sub.metadata.plan : (firm.subscriptionPlan as SubscriptionPlan | null);
    const billingPeriod = sub.metadata.billingPeriod === BillingPeriod.YEARLY ? BillingPeriod.YEARLY : BillingPeriod.MONTHLY;
    const item = sub.items.data[0];
    const periodStart = item ? new Date(item.current_period_start * 1000) : new Date();
    const periodEnd = item ? new Date(item.current_period_end * 1000) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.firm.update({
        where: { id: firm.id },
        data: {
          subscriptionStatus: status,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: customerId,
          currentPeriodEnd: periodEnd,
          ...(plan ? { subscriptionPlan: plan, maxUsers: PLAN_CONFIG[plan].maxUsers } : {}),
        },
      });
      if (plan) {
        const row = { plan, billingPeriod, status, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd ?? periodStart, canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null };
        await tx.subscription.upsert({
          where: { stripeSubscriptionId: sub.id },
          create: { firmId: firm.id, stripeSubscriptionId: sub.id, ...row },
          update: row,
        });
      }
      if (firm.subscriptionStatus !== status) {
        await tx.auditLog.create({ data: { firmId: firm.id, action: `SUBSCRIPTION_${status}`, metadata: { plan, billingPeriod, stripeSubscriptionId: sub.id } } });
      }
    });
  }

  /** One BillingInvoice row per paid Stripe invoice (the receipt list on the billing page). */
  private async recordInvoice(invoice: Stripe.Invoice) {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId || !invoice.id) return;
    const firm = await this.prisma.firm.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true, subscriptionPlan: true } });
    if (!firm) return;
    const meta = invoice.parent?.subscription_details?.metadata ?? {};
    const plan = isPlan(meta.plan) ? meta.plan : (firm.subscriptionPlan as SubscriptionPlan | null);
    if (!plan) return;
    const line = invoice.lines.data[0]?.period;
    const data = {
      status: 'PAID' as const,
      amount: Math.round(invoice.amount_paid / 100),
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      paidAt: invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date(),
      periodStart: line ? new Date(line.start * 1000) : null,
      periodEnd: line ? new Date(line.end * 1000) : null,
    };
    await this.prisma.billingInvoice.upsert({
      where: { stripeInvoiceId: invoice.id },
      create: {
        firmId: firm.id,
        stripeInvoiceId: invoice.id,
        invoiceNumber: invoice.number ?? invoice.id,
        plan,
        billingPeriod: meta.billingPeriod === BillingPeriod.YEARLY ? BillingPeriod.YEARLY : BillingPeriod.MONTHLY,
        currency: invoice.currency.toUpperCase(),
        ...data,
      },
      update: data,
    });
  }
}

function isPlan(value: unknown): value is SubscriptionPlan {
  return typeof value === 'string' && value in PLAN_CONFIG;
}

/** Stripe → our status. null = leave the firm as it is (checkout not finished). */
export function stripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus | null {
  switch (status) {
    case 'active':
    case 'trialing':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
    case 'unpaid':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
    case 'incomplete_expired':
    case 'paused':
      return SubscriptionStatus.CANCELED;
    default:
      return null;
  }
}
