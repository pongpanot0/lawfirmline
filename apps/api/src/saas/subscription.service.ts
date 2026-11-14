import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  AuthUser,
  ADD_ONS,
  AddOnKind,
  AddOnCheckoutResponse,
  BillingUsage,
  hasFirmCapability,
  BillingPeriod,
  PLAN_CONFIG,
  SELLABLE_PLANS,
  planPriceThb,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionSummary,
  PlanOption, canBuyAddOns } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PlanQuotaService } from '../common/services/plan-quota.service';
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
    private quota: PlanQuotaService,
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
    const autoRenew = !!firm.stripeSubscriptionId && firm.subscriptionStatus !== SubscriptionStatus.CANCELED;
    const stripeSub = autoRenew
      ? await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId: firm.stripeSubscriptionId! }, select: { billingPeriod: true } })
      : null;
    return {
      status: firm.subscriptionStatus as SubscriptionStatus,
      plan: firm.subscriptionPlan as SubscriptionPlan | null,
      trialEndAt: firm.trialEndAt.toISOString(),
      currentPeriodEnd: firm.currentPeriodEnd?.toISOString() ?? null,
      daysRemaining,
      maxUsers: firm.maxUsers,
      memberCount,
      canAccessApp: authUser ? this.tenant.canAccessApp(authUser) : false,
      autoRenew,
      billingPeriod: (stripeSub?.billingPeriod as BillingPeriod | undefined) ?? null,
    };
  }

  getPlans(user: AuthUser): PlanOption[] {
    // A firm still on Solo sees it as its current plan, but nobody can buy it.
    const current = user.subscriptionPlan as SubscriptionPlan | null;
    const plans = current && !SELLABLE_PLANS.includes(current) ? [current, ...SELLABLE_PLANS] : SELLABLE_PLANS;
    return plans.map((plan) => ({
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
   *
   * PromptPay can't back a Stripe subscription, so it is a one-time payment
   * for one period (no auto-renew); the firm expires when that period ends.
   */
  async createCheckout(
    user: AuthUser,
    plan: SubscriptionPlan,
    billingPeriod: BillingPeriod = BillingPeriod.MONTHLY,
    paymentMethod: CheckoutPaymentMethod = 'card',
  ) {
    if (!this.tenant.isOwner(user)) throw new ForbiddenException('Only owners can manage billing');
    if (!SELLABLE_PLANS.includes(plan)) throw new BadRequestException('แพ็กเกจนี้ไม่เปิดขายแล้ว');
    const firm = await this.prisma.firm.findUnique({ where: { id: user.firmId } });
    if (!firm) throw new BadRequestException('Firm not found');
    if (firm.stripeSubscriptionId && firm.subscriptionStatus !== SubscriptionStatus.CANCELED) {
      throw new BadRequestException('สำนักงานมีแพ็กเกจที่ต่ออายุอัตโนมัติอยู่แล้ว กด "เปลี่ยนเป็นแพ็กเกจนี้" ที่แพ็กเกจที่ต้องการแทน');
    }

    const customer = await this.ensureCustomer(firm.id, firm.name, firm.stripeCustomerId, user.email);
    const metadata = { firmId: firm.id, plan, billingPeriod };
    const appUrl = this.email.getAppUrl();
    const product = { name: `Samnuan ${PLAN_CONFIG[plan].name}` };
    const unitAmount = planPriceThb(plan, billingPeriod) * 100;
    const common = {
      customer,
      client_reference_id: firm.id,
      locale: 'th' as const,
      metadata,
      success_url: `${appUrl}/account/billing?success=1`,
      cancel_url: `${appUrl}/account/billing`,
    };
    const session = paymentMethod === 'promptpay'
      ? await this.stripe.client.checkout.sessions.create({
        ...common,
        mode: 'payment',
        payment_method_types: ['promptpay'],
        line_items: [{ quantity: 1, price_data: { currency: 'thb', unit_amount: unitAmount, product_data: product } }],
        payment_intent_data: { metadata },
      })
      : await this.stripe.client.checkout.sessions.create({
        ...common,
        mode: 'subscription',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'thb',
            unit_amount: unitAmount,
            recurring: { interval: billingPeriod === BillingPeriod.YEARLY ? 'year' : 'month' },
            product_data: product,
          },
        }],
        subscription_data: { metadata },
      });
    return { url: session.url };
  }

  async getUsage(user: AuthUser): Promise<BillingUsage> {
    const [ai, storage, addOns] = await Promise.all([
      this.quota.aiBalance(user),
      this.quota.storageUsage(user.firmId),
      this.prisma.planAddOn.findMany({ where: { firmId: user.firmId }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      ai, storage,
      canBuyAddOns: canBuyAddOns(user.subscriptionPlan),
      addOns: addOns.map((row) => ({
        kind: row.kind as AddOnKind, credits: row.credits, storageGb: row.storageGb, amountThb: row.amountThb,
        createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null,
      })),
      prices: Object.entries(ADD_ONS).map(([kind, pack]) => ({ kind: kind as AddOnKind, ...pack })),
    };
  }

  async createAddOnCheckout(user: AuthUser, addOn: AddOnKind, paymentMethod: CheckoutPaymentMethod = 'card'): Promise<AddOnCheckoutResponse> {
    if (!this.tenant.isOwner(user) || !hasFirmCapability(user.firmRole, 'manageSubscription')) throw new ForbiddenException('Only owners can manage billing');
    if (!Object.prototype.hasOwnProperty.call(ADD_ONS, addOn)) throw new BadRequestException('Unknown add-on');
    if (!canBuyAddOns(user.subscriptionPlan)) throw new ForbiddenException('ซื้อแพ็กเพิ่มได้ตั้งแต่แพ็กเกจ Team ขึ้นไป อัปเกรดแพ็กเกจก่อนแล้วลองอีกครั้ง');
    const firm = await this.prisma.firm.findUnique({ where: { id: user.firmId } });
    if (!firm) throw new BadRequestException('Firm not found');
    const customer = await this.ensureCustomer(firm.id, firm.name, firm.stripeCustomerId, user.email);
    const metadata = { firmId: firm.id, addOn };
    const session = await this.stripe.client.checkout.sessions.create({
      mode: 'payment', customer, client_reference_id: firm.id, locale: 'th',
      payment_method_types: [paymentMethod], metadata, payment_intent_data: { metadata },
      success_url: `${this.email.getAppUrl()}/account/billing?addon=1`,
      cancel_url: `${this.email.getAppUrl()}/account/billing`,
      line_items: [{ quantity: 1, price_data: { currency: 'thb', unit_amount: ADD_ONS[addOn].priceThb * 100, product_data: { name: `Samnuan ${addOn}` } } }],
    });
    if (!session.url) throw new BadRequestException('Checkout URL unavailable');
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

  /**
   * Moves a card (auto-renew) subscription to another plan or billing period.
   * Stripe charges the prorated difference to the card on file right away
   * (a downgrade becomes credit on the next invoice). If the charge fails,
   * nothing changes. The firm is then re-synced from Stripe, same as a webhook.
   */
  async changePlan(user: AuthUser, plan: SubscriptionPlan, billingPeriod: BillingPeriod) {
    if (!this.tenant.isOwner(user)) throw new ForbiddenException('Only owners can manage billing');
    if (!SELLABLE_PLANS.includes(plan)) throw new BadRequestException('แพ็กเกจนี้ไม่เปิดขายแล้ว');
    const firm = await this.prisma.firm.findUnique({ where: { id: user.firmId } });
    if (!firm?.stripeSubscriptionId || firm.subscriptionStatus === SubscriptionStatus.CANCELED) {
      throw new BadRequestException('สำนักงานนี้ไม่มีแพ็กเกจที่ต่ออายุอัตโนมัติ เลือกแพ็กเกจแล้วชำระเงินใหม่แทน');
    }
    const members = await this.tenant.getMemberCount(firm.id);
    if (members > PLAN_CONFIG[plan].maxUsers) {
      throw new BadRequestException(`สำนักงานมีสมาชิก ${members} คน แต่แพ็กเกจนี้รับได้ ${PLAN_CONFIG[plan].maxUsers} คน นำสมาชิกออกก่อนเปลี่ยนแพ็กเกจ`);
    }

    const sub = await this.stripe.client.subscriptions.retrieve(firm.stripeSubscriptionId);
    const item = sub.items.data[0];
    if (!item) throw new BadRequestException('ไม่พบรายการแพ็กเกจใน Stripe');
    const currentPeriod = sub.metadata.billingPeriod === BillingPeriod.YEARLY ? BillingPeriod.YEARLY : BillingPeriod.MONTHLY;
    if (sub.metadata.plan === plan && currentPeriod === billingPeriod) {
      throw new BadRequestException('สำนักงานใช้แพ็กเกจนี้อยู่แล้ว');
    }

    const product = await this.stripe.client.products.create({ name: `Samnuan ${PLAN_CONFIG[plan].name}` });
    try {
      await this.stripe.client.subscriptions.update(sub.id, {
        items: [{
          id: item.id,
          price_data: {
            currency: 'thb',
            product: product.id,
            unit_amount: planPriceThb(plan, billingPeriod) * 100,
            recurring: { interval: billingPeriod === BillingPeriod.YEARLY ? 'year' : 'month' },
          },
        }],
        metadata: { firmId: firm.id, plan, billingPeriod },
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
      });
    } catch (err) {
      // 402 = declined or the bank wants 3-D Secure; error_if_incomplete means the update was not applied.
      if (err instanceof Stripe.errors.StripeError && err.statusCode === 402) {
        throw new BadRequestException(`ตัดบัตรไม่สำเร็จ แพ็กเกจยังเป็นแบบเดิม (${err.message}) เปลี่ยนบัตรได้ที่ "จัดการการชำระเงิน"`);
      }
      throw err;
    }
    await this.prisma.auditLog.create({
      data: { firmId: firm.id, userId: user.id, action: 'SUBSCRIPTION_PLAN_CHANGED', metadata: { from: sub.metadata.plan ?? null, to: plan, billingPeriod } },
    });
    await this.syncSubscription(sub.id);
    return this.getSummary(user);
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
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.mode === 'payment') {
          if (session.payment_status === 'paid') {
            if (session.metadata?.addOn) await this.activateAddOn(session, new Date(event.created * 1000));
            else await this.activatePrepaid(session);
          }
          break;
        }
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

  private async activateAddOn(session: Stripe.Checkout.Session, paidAt: Date): Promise<void> {
    const firmId = session.client_reference_id;
    const kind = session.metadata?.addOn;
    if (!firmId || !kind || !Object.prototype.hasOwnProperty.call(ADD_ONS, kind)) return;
    const addOn = ADD_ONS[kind as AddOnKind];
    if (session.amount_total !== addOn.priceThb * 100 || session.currency !== 'thb') {
      this.logger.error(`Add-on session ${session.id} amount/currency does not match ${kind}`);
      return;
    }
    if (await this.prisma.planAddOn.findUnique({ where: { stripeSessionId: session.id }, select: { id: true } })) return;
    if (!await this.prisma.firm.findUnique({ where: { id: firmId }, select: { id: true } })) return;
    const createdAt = paidAt;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.planAddOn.create({ data: {
          firmId, kind, amountThb: addOn.priceThb, stripeSessionId: session.id, createdAt,
          credits: addOn.credits,
          storageGb: addOn.storageGb,
          expiresAt: addOn.days === null ? null : new Date(createdAt.getTime() + addOn.days * 86_400_000),
        } });
        await tx.auditLog.create({ data: { firmId, action: 'ADDON_PURCHASED', metadata: { kind, stripeSessionId: session.id, amountThb: addOn.priceThb } } });
      });
    } catch (err) {
      // The unique session key also handles simultaneous deliveries of the same payment.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }

  /**
   * One-time (PromptPay) payment for one period. Paying again before the period
   * ends extends from the current end, so an early renewal loses no days.
   * Keyed by the Checkout Session id, so a retried webhook changes nothing.
   */
  async activatePrepaid(session: Stripe.Checkout.Session) {
    const firmId = session.client_reference_id;
    const plan = session.metadata?.plan;
    if (!firmId || !isPlan(plan)) return;
    const billingPeriod = session.metadata?.billingPeriod === BillingPeriod.YEARLY ? BillingPeriod.YEARLY : BillingPeriod.MONTHLY;
    if (session.amount_total !== planPriceThb(plan, billingPeriod) * 100) {
      this.logger.error(`Prepaid session ${session.id} amount ${session.amount_total} does not match ${plan}/${billingPeriod}`);
      return;
    }
    if (await this.prisma.billingInvoice.findUnique({ where: { stripeInvoiceId: session.id }, select: { id: true } })) return;
    const firm = await this.prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm) return;

    const now = new Date();
    const stillPaid = firm.subscriptionStatus === SubscriptionStatus.ACTIVE && firm.currentPeriodEnd && firm.currentPeriodEnd > now;
    const periodStart = stillPaid ? firm.currentPeriodEnd! : now;
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + (billingPeriod === BillingPeriod.YEARLY ? 12 : 1));

    await this.prisma.$transaction(async (tx) => {
      await tx.billingInvoice.create({
        data: {
          firmId,
          stripeInvoiceId: session.id,
          invoiceNumber: session.id,
          plan,
          billingPeriod,
          amount: Math.round(session.amount_total! / 100),
          currency: 'THB',
          status: 'PAID',
          paidAt: now,
          periodStart,
          periodEnd,
        },
      });
      await tx.firm.update({
        where: { id: firmId },
        // New prepaid period: reminders start over, and any old (canceled) card
        // subscription stops counting, so expiry and reminders apply to this period.
        data: { subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlan: plan, maxUsers: PLAN_CONFIG[plan].maxUsers, currentPeriodEnd: periodEnd, trialReminderSentDays: null, stripeSubscriptionId: null },
      });
      await tx.auditLog.create({ data: { firmId, action: 'SUBSCRIPTION_PREPAID', metadata: { plan, billingPeriod, stripeSessionId: session.id } } });
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

export type CheckoutPaymentMethod = 'card' | 'promptpay';

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
