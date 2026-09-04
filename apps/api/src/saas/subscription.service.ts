import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { OmiseService } from './omise.service';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private tenant: TenantService,
    private omise: OmiseService,
    private config: ConfigService,
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

  private async createPendingInvoice(
    user: AuthUser,
    plan: SubscriptionPlan,
    billingPeriod: BillingPeriod,
  ) {
    const planConfig = PLAN_CONFIG[plan];
    const amount = planPriceThb(plan, billingPeriod);
    const invoiceNumber = `LF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const invoice = await this.prisma.billingInvoice.create({
      data: {
        firmId: user.firmId,
        invoiceNumber,
        plan,
        billingPeriod,
        amount,
        status: 'PENDING',
      },
    });
    return { invoice, planConfig, amount };
  }

  async createCheckout(
    user: AuthUser,
    plan: SubscriptionPlan,
    payment: { omiseToken?: string; omiseSource?: string },
    billingPeriod: BillingPeriod = BillingPeriod.MONTHLY,
  ) {
    if (!this.tenant.isOwner(user)) {
      throw new ForbiddenException('Only owners can manage billing');
    }

    if (!payment.omiseToken && !payment.omiseSource) {
      throw new BadRequestException('Payment token or source required');
    }

    const { invoice, planConfig, amount } = await this.createPendingInvoice(
      user,
      plan,
      billingPeriod,
    );
    const metadata = { firmId: user.firmId, invoiceId: invoice.id, plan, billingPeriod };
    const chargeParams = {
      amount: amount * 100,
      currency: 'thb',
      description: `LexFlow ${planConfig.name} Plan (${billingPeriod === BillingPeriod.YEARLY ? 'Yearly' : 'Monthly'})`,
      metadata,
    };

    const charge = payment.omiseToken
      ? await this.omise.createCharge({ ...chargeParams, card: payment.omiseToken })
      : await this.omise.createChargeWithSource({ ...chargeParams, source: payment.omiseSource! });

    if (!charge.paid) {
      if (payment.omiseSource && charge.id !== 'unknown') {
        await this.prisma.billingInvoice.update({
          where: { id: invoice.id },
          data: { omiseChargeId: charge.id },
        });
        await this.prisma.payment.create({
          data: {
            billingInvoiceId: invoice.id,
            amount,
            status: 'PENDING',
            omiseChargeId: charge.id,
          },
        });

        return { success: false, plan, invoiceId: invoice.id };
      }

      await this.prisma.billingInvoice.update({
        where: { id: invoice.id },
        data: { status: 'FAILED', omiseChargeId: charge.id !== 'unknown' ? charge.id : undefined },
      });
      await this.prisma.payment.create({
        data: {
          billingInvoiceId: invoice.id,
          amount,
          status: 'FAILED',
          omiseChargeId: charge.id,
          failureCode: charge.failure_code,
          failureMessage: charge.failure_message,
        },
      });
      throw new BadRequestException(charge.failure_message ?? 'Payment failed');
    }

    return this.activateSubscription(user.firmId, plan, invoice.id, charge.id, amount);
  }

  async createPromptPayCheckout(
    user: AuthUser,
    plan: SubscriptionPlan,
    billingPeriod: BillingPeriod = BillingPeriod.MONTHLY,
  ) {
    if (!this.tenant.isOwner(user)) {
      throw new ForbiddenException('Only owners can manage billing');
    }

    const { invoice, planConfig, amount } = await this.createPendingInvoice(
      user,
      plan,
      billingPeriod,
    );
    const metadata = { firmId: user.firmId, invoiceId: invoice.id, plan, billingPeriod };

    let result;
    try {
      result = await this.omise.createPromptPayCharge({
        amount: amount * 100,
        currency: 'thb',
        description: `LexFlow ${planConfig.name} Plan (${billingPeriod === BillingPeriod.YEARLY ? 'Yearly' : 'Monthly'}, PromptPay)`,
        metadata,
      });
    } catch (err) {
      this.logger.error('PromptPay checkout failed', err);
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Unable to create PromptPay payment',
      );
    }

    await this.prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: { omiseChargeId: result.chargeId },
    });

    await this.prisma.payment.create({
      data: {
        billingInvoiceId: invoice.id,
        amount,
        status: 'PENDING',
        omiseChargeId: result.chargeId,
      },
    });

    if (result.paid) {
      await this.activateSubscription(user.firmId, plan, invoice.id, result.chargeId, amount);
    }

    return {
      invoiceId: invoice.id,
      chargeId: result.chargeId,
      amount,
      expiresAt: result.expiresAt,
      paid: result.paid,
    };
  }

  async getInvoiceQrImage(user: AuthUser, invoiceId: string) {
    if (!this.tenant.isOwner(user)) {
      throw new ForbiddenException('Only owners can view payment QR');
    }

    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, firmId: user.firmId },
    });
    if (!invoice) throw new BadRequestException('Invoice not found');
    if (invoice.status === 'PAID') throw new BadRequestException('Invoice already paid');

    if (this.omise.isMockMode()) {
      const qrData = encodeURIComponent(`mock-promptpay:${invoice.id}:${invoice.amount}`);
      const mockUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${qrData}`;
      const res = await fetch(mockUrl);
      if (!res.ok) throw new BadRequestException('Unable to load mock QR');
      const data = Buffer.from(await res.arrayBuffer());
      return { data, contentType: 'image/png' };
    }

    if (!invoice.omiseChargeId) {
      throw new BadRequestException('QR code not available for this invoice');
    }

    try {
      return await this.omise.getQrImageFromCharge(invoice.omiseChargeId);
    } catch (err) {
      this.logger.error('Failed to load PromptPay QR', err);
      throw new BadRequestException('Unable to load PromptPay QR code');
    }
  }

  async getInvoicePaymentStatus(user: AuthUser, invoiceId: string) {
    if (!this.tenant.isOwner(user)) {
      throw new ForbiddenException('Only owners can view payment status');
    }

    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, firmId: user.firmId },
    });
    if (!invoice) throw new BadRequestException('Invoice not found');

    if (invoice.status === 'PAID') {
      return { status: 'PAID' as const, plan: invoice.plan };
    }

    if (invoice.omiseChargeId) {
      const charge = await this.omise.getCharge(invoice.omiseChargeId);

      if (this.omise.isMockMode() && invoice.status === 'PENDING') {
        const ageMs = Date.now() - invoice.createdAt.getTime();
        if (ageMs > 3000) {
          await this.activateSubscription(
            user.firmId,
            invoice.plan as SubscriptionPlan,
            invoice.id,
            invoice.omiseChargeId,
            invoice.amount,
          );
          return { status: 'PAID' as const, plan: invoice.plan };
        }
      }

      if (charge.paid || charge.status === 'successful') {
        await this.activateSubscription(
          user.firmId,
          invoice.plan as SubscriptionPlan,
          invoice.id,
          invoice.omiseChargeId,
          invoice.amount,
        );
        return { status: 'PAID' as const, plan: invoice.plan };
      }

      if (charge.status === 'failed') {
        await this.prisma.billingInvoice.update({
          where: { id: invoice.id },
          data: { status: 'FAILED' },
        });
        return { status: 'FAILED' as const, plan: invoice.plan };
      }
    }

    return { status: 'PENDING' as const, plan: invoice.plan };
  }

  async activateSubscription(
    firmId: string,
    plan: SubscriptionPlan,
    invoiceId: string,
    chargeId: string,
    amount: number,
  ) {
    const existing = await this.prisma.billingInvoice.findUnique({ where: { id: invoiceId } });
    if (!existing || existing.status === 'PAID') {
      return { success: true, plan, periodEnd: existing?.periodEnd?.toISOString() ?? null };
    }

    const billingPeriod = (existing.billingPeriod as BillingPeriod) ?? BillingPeriod.MONTHLY;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + (billingPeriod === BillingPeriod.YEARLY ? 12 : 1));
    const planConfig = PLAN_CONFIG[plan];

    await this.prisma.$transaction(async (tx) => {
      await tx.billingInvoice.update({
        where: { id: invoiceId },
        data: {
          status: 'PAID',
          omiseChargeId: chargeId,
          paidAt: now,
          periodStart: now,
          periodEnd,
        },
      });

      await tx.payment.create({
        data: {
          billingInvoiceId: invoiceId,
          amount,
          status: 'PAID',
          omiseChargeId: chargeId,
        },
      });

      await tx.firm.update({
        where: { id: firmId },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionPlan: plan,
          maxUsers: planConfig.maxUsers,
          currentPeriodEnd: periodEnd,
        },
      });

      await tx.subscription.create({
        data: {
          firmId,
          plan,
          billingPeriod,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      await tx.auditLog.create({
        data: {
          firmId,
          action: 'SUBSCRIPTION_ACTIVATED',
          metadata: { plan, billingPeriod, chargeId },
        },
      });
    });

    return { success: true, plan, periodEnd };
  }

  async cancel(user: AuthUser) {
    if (!this.tenant.isOwner(user)) {
      throw new ForbiddenException('Only owners can cancel subscription');
    }

    await this.prisma.firm.update({
      where: { id: user.firmId },
      data: { subscriptionStatus: SubscriptionStatus.CANCELED },
    });

    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: 'SUBSCRIPTION_CANCELED',
      },
    });

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

  async handleWebhook(payload: Record<string, unknown>) {
    const eventKey = payload.key as string | undefined;
    this.logger.log(`Omise webhook [${eventKey ?? 'unknown'}]: ${JSON.stringify(payload)}`);

    const charge = payload.data as Record<string, unknown> | undefined;
    if (!charge?.id) return { received: true };

    const isPaid = charge.paid === true || charge.status === 'successful';

    if (!isPaid) return { received: true };

    const metadata = charge.metadata as Record<string, string> | undefined;
    if (!metadata?.invoiceId || !metadata.firmId || !metadata.plan) {
      return { received: true };
    }

    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: metadata.invoiceId },
    });

    if (invoice && invoice.status !== 'PAID') {
      await this.activateSubscription(
        metadata.firmId,
        metadata.plan as SubscriptionPlan,
        invoice.id,
        charge.id as string,
        invoice.amount,
      );
    }

    return { received: true };
  }
}
