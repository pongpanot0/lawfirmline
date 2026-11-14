import Stripe from 'stripe';
import { BadRequestException } from '@nestjs/common';
import { BillingPeriod, FirmRole, planPriceThb, SubscriptionPlan, SubscriptionStatus } from '@lawfirm/shared';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';

const config = { get: (k: string) => ({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' })[k] } as any;

describe('SubscriptionService.changePlan', () => {
  const stripe = new StripeService(config);
  const owner = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;
  const sub = {
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    canceled_at: null,
    metadata: { firmId: 'firm-1', plan: SubscriptionPlan.TEAM, billingPeriod: BillingPeriod.MONTHLY },
    items: { data: [{ id: 'si_1', current_period_start: 1_700_000_000, current_period_end: 1_702_000_000 }] },
  };
  const retrieve = jest.spyOn(stripe.client.subscriptions, 'retrieve');
  const update = jest.spyOn(stripe.client.subscriptions, 'update');
  const createProduct = jest.spyOn(stripe.client.products, 'create');
  const tx = { firm: { update: jest.fn() }, subscription: { upsert: jest.fn() }, auditLog: { create: jest.fn() } };
  const prisma = {
    firm: {
      findUnique: jest.fn(),
      findFirst: jest.fn(async () => ({ id: 'firm-1', subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlan: SubscriptionPlan.TEAM })),
    },
    subscription: { findUnique: jest.fn(async () => ({ billingPeriod: BillingPeriod.MONTHLY })) },
    auditLog: { create: jest.fn() },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  };
  const tenant = {
    isOwner: () => true,
    getMemberCount: jest.fn(async () => 2),
    syncTrialExpiry: jest.fn(),
    buildAuthUser: jest.fn(async () => null),
    canAccessApp: () => true,
  };
  const service = new SubscriptionService(prisma as any, tenant as any, stripe, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.firm.findUnique.mockResolvedValue({
      id: 'firm-1', stripeSubscriptionId: 'sub_1', subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionPlan: SubscriptionPlan.TEAM, trialEndAt: new Date(), currentPeriodEnd: new Date(), maxUsers: 3,
    });
    tenant.getMemberCount.mockResolvedValue(2);
    retrieve.mockResolvedValue(sub as any);
    update.mockResolvedValue(sub as any);
    createProduct.mockResolvedValue({ id: 'prod_new' } as any);
  });
  afterAll(() => jest.restoreAllMocks());

  it('swaps the subscription item to the new plan price and charges the prorated difference now', async () => {
    await service.changePlan(owner, SubscriptionPlan.FIRM, BillingPeriod.YEARLY);
    expect(update).toHaveBeenCalledWith('sub_1', {
      items: [{
        id: 'si_1',
        price_data: {
          currency: 'thb',
          product: 'prod_new',
          unit_amount: planPriceThb(SubscriptionPlan.FIRM, BillingPeriod.YEARLY) * 100,
          recurring: { interval: 'year' },
        },
      }],
      metadata: { firmId: 'firm-1', plan: SubscriptionPlan.FIRM, billingPeriod: BillingPeriod.YEARLY },
      proration_behavior: 'always_invoice',
      payment_behavior: 'error_if_incomplete',
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'SUBSCRIPTION_PLAN_CHANGED' }),
    }));
    expect(retrieve).toHaveBeenCalledTimes(2); // once to read, once to re-sync the firm
  });

  it('refuses a plan with fewer seats than current members, before touching Stripe', async () => {
    tenant.getMemberCount.mockResolvedValue(15);
    await expect(service.changePlan(owner, SubscriptionPlan.FIRM, BillingPeriod.MONTHLY)).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses the plan and period the firm already has', async () => {
    await expect(service.changePlan(owner, SubscriptionPlan.TEAM, BillingPeriod.MONTHLY)).rejects.toThrow('ใช้แพ็กเกจนี้อยู่แล้ว');
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses firms without an auto-renew card subscription (trial or PromptPay)', async () => {
    prisma.firm.findUnique.mockResolvedValue({ id: 'firm-1', stripeSubscriptionId: null, subscriptionStatus: SubscriptionStatus.ACTIVE });
    await expect(service.changePlan(owner, SubscriptionPlan.FIRM, BillingPeriod.MONTHLY)).rejects.toThrow(BadRequestException);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('a declined card is a 400 with the plan unchanged, not a 500', async () => {
    update.mockRejectedValue(Stripe.errors.StripeError.generate({ type: 'card_error', message: 'Your card was declined.', statusCode: 402 } as any));
    await expect(service.changePlan(owner, SubscriptionPlan.FIRM, BillingPeriod.MONTHLY)).rejects.toThrow('ตัดบัตรไม่สำเร็จ');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(tx.firm.update).not.toHaveBeenCalled();
  });
});
