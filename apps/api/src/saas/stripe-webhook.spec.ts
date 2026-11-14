import Stripe from 'stripe';
import { BadRequestException } from '@nestjs/common';
import { ADD_ONS, BillingPeriod, planPriceThb, SubscriptionPlan, SubscriptionStatus } from '@lawfirm/shared';
import { StripeService } from './stripe.service';
import { stripeStatus, SubscriptionService } from './subscription.service';

const SECRET = 'whsec_test_secret';
const config = { get: (k: string) => ({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET })[k] } as any;

function signed(event: object) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { body: Buffer.from(payload), header };
}

describe('Stripe webhook', () => {
  const stripe = new StripeService(config);
  const subscription = {
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    canceled_at: null,
    metadata: { firmId: 'firm-1', plan: 'FIRM', billingPeriod: 'YEARLY' },
    items: { data: [{ current_period_start: 1_700_000_000, current_period_end: 1_731_536_000 }] },
  };
  const retrieve = jest.spyOn(stripe.client.subscriptions, 'retrieve');
  const planAddOn = { create: jest.fn(), findUnique: jest.fn() };
  const tx = {
    planAddOn,
    firm: { update: jest.fn() },
    subscription: { upsert: jest.fn() },
    auditLog: { create: jest.fn() },
    billingInvoice: { create: jest.fn() },
  };
  const prisma = {
    planAddOn,
    firm: { findFirst: jest.fn(), findUnique: jest.fn() },
    billingInvoice: { upsert: jest.fn(), findUnique: jest.fn() },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  };
  const service = new SubscriptionService(prisma as any, {} as any, stripe, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    retrieve.mockResolvedValue(subscription as any);
    prisma.firm.findFirst.mockResolvedValue({ id: 'firm-1', subscriptionStatus: 'TRIAL', subscriptionPlan: null });
  });
  afterAll(() => retrieve.mockRestore());

  it('rejects an unsigned or forged body', async () => {
    await expect(service.handleWebhook(Buffer.from('{}'), undefined)).rejects.toThrow(BadRequestException);
    const { body } = signed({ id: 'evt', type: 'invoice.paid' });
    await expect(service.handleWebhook(body, 't=1,v1=forged')).rejects.toThrow('Invalid Stripe signature');
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('checkout completion activates the firm from the subscription Stripe returns', async () => {
    const { body, header } = signed({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', subscription: 'sub_1' } },
    });
    await expect(service.handleWebhook(body, header)).resolves.toEqual({ received: true });
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(tx.firm.update).toHaveBeenCalledWith({
      where: { id: 'firm-1' },
      data: expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: 'FIRM',
        stripeSubscriptionId: 'sub_1',
        stripeCustomerId: 'cus_1',
        currentPeriodEnd: new Date(1_731_536_000 * 1000),
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'SUBSCRIPTION_ACTIVE' }) }));
  });

  it('a deleted subscription marks the firm CANCELED (read-only)', async () => {
    retrieve.mockResolvedValue({ ...subscription, status: 'canceled' } as any);
    const { body, header } = signed({ id: 'evt_2', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
    await service.handleWebhook(body, header);
    expect(tx.firm.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ subscriptionStatus: SubscriptionStatus.CANCELED }) }));
  });

  it('invoice.paid records the receipt with the hosted invoice link', async () => {
    prisma.firm.findUnique.mockResolvedValue({ id: 'firm-1', subscriptionPlan: 'FIRM' });
    const { body, header } = signed({
      id: 'evt_3',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_1', number: 'SAM-0001', customer: 'cus_1', currency: 'thb', amount_paid: 2999000,
          hosted_invoice_url: 'https://invoice.stripe.com/i/x',
          status_transitions: { paid_at: 1_700_000_000 },
          lines: { data: [{ period: { start: 1_700_000_000, end: 1_731_536_000 } }] },
          parent: { subscription_details: { subscription: 'sub_1', metadata: { plan: 'FIRM', billingPeriod: 'YEARLY' } } },
        },
      },
    });
    await service.handleWebhook(body, header);
    expect(prisma.billingInvoice.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { stripeInvoiceId: 'in_1' },
      create: expect.objectContaining({ invoiceNumber: 'SAM-0001', amount: 29990, currency: 'THB', billingPeriod: 'YEARLY', hostedInvoiceUrl: 'https://invoice.stripe.com/i/x' }),
    }));
    expect(retrieve).toHaveBeenCalledWith('sub_1');
  });

  it('an unpaid first checkout (incomplete) grants nothing', async () => {
    retrieve.mockResolvedValue({ ...subscription, status: 'incomplete' } as any);
    const { body, header } = signed({ id: 'evt_4', type: 'customer.subscription.created', data: { object: { id: 'sub_1' } } });
    await service.handleWebhook(body, header);
    expect(tx.firm.update).not.toHaveBeenCalled();
  });

  describe('PromptPay (one-time payment)', () => {
    const FIRM_MONTHLY = planPriceThb(SubscriptionPlan.FIRM, BillingPeriod.MONTHLY) * 100;
    const paid = (over: Record<string, unknown> = {}) => signed({
      id: 'evt_pp',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_pp_1', mode: 'payment', payment_status: 'paid', client_reference_id: 'firm-1', amount_total: FIRM_MONTHLY, metadata: { firmId: 'firm-1', plan: 'FIRM', billingPeriod: 'MONTHLY' }, ...over } },
    });

    beforeEach(() => {
      prisma.billingInvoice.findUnique.mockResolvedValue(null);
      prisma.firm.findUnique.mockResolvedValue({ id: 'firm-1', subscriptionStatus: 'EXPIRED', currentPeriodEnd: null });
    });

    it('activates the firm for one period and records the payment', async () => {
      const { body, header } = paid();
      await service.handleWebhook(body, header);
      expect(tx.billingInvoice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stripeInvoiceId: 'cs_pp_1', amount: FIRM_MONTHLY / 100, plan: 'FIRM', status: 'PAID' }) });
      const data = tx.firm.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlan: 'FIRM', trialReminderSentDays: null, stripeSubscriptionId: null });
      const days = (data.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(27);
      expect(days).toBeLessThan(32);
      expect(retrieve).not.toHaveBeenCalled();
    });

    it('renewing early extends from the current period end', async () => {
      const end = new Date(Date.now() + 10 * 86_400_000);
      prisma.firm.findUnique.mockResolvedValue({ id: 'firm-1', subscriptionStatus: 'ACTIVE', currentPeriodEnd: end });
      const { body, header } = paid();
      await service.handleWebhook(body, header);
      const newEnd: Date = tx.firm.update.mock.calls[0][0].data.currentPeriodEnd;
      expect(newEnd.getTime()).toBeGreaterThan(end.getTime() + 27 * 86_400_000);
    });

    it('a retried event for the same session changes nothing', async () => {
      prisma.billingInvoice.findUnique.mockResolvedValue({ id: 'inv-existing' });
      const { body, header } = paid();
      await service.handleWebhook(body, header);
      expect(tx.firm.update).not.toHaveBeenCalled();
    });

    it('a session not yet paid (QR not scanned) grants nothing', async () => {
      const { body, header } = paid({ payment_status: 'unpaid' });
      await service.handleWebhook(body, header);
      expect(tx.firm.update).not.toHaveBeenCalled();
    });

    it('an amount that does not match the plan price grants nothing', async () => {
      const { body, header } = paid({ amount_total: 100 });
      await service.handleWebhook(body, header);
      expect(tx.firm.update).not.toHaveBeenCalled();
    });

    it('async_payment_succeeded activates too', async () => {
      const payload = { id: 'evt_pp2', type: 'checkout.session.async_payment_succeeded', data: { object: { id: 'cs_pp_2', mode: 'payment', payment_status: 'paid', client_reference_id: 'firm-1', amount_total: FIRM_MONTHLY, metadata: { plan: 'FIRM', billingPeriod: 'MONTHLY' } } } };
      const { body, header } = signed(payload);
      await service.handleWebhook(body, header);
      expect(tx.firm.update).toHaveBeenCalled();
    });
  });

  describe('add-on purchases', () => {
    const paid = (over: Record<string, unknown> = {}, type = 'checkout.session.completed') => signed({
      id: 'evt_addon', type, created: 1800000000,
      data: { object: { id: 'cs_addon', mode: 'payment', payment_status: 'paid', currency: 'thb', client_reference_id: 'firm-1', amount_total: 9900, metadata: { firmId: 'firm-1', addOn: 'AI_100' }, ...over } },
    });
    beforeEach(() => {
      planAddOn.findUnique.mockResolvedValue(null);
      planAddOn.create.mockResolvedValue({ id: 'addon' });
      prisma.firm.findUnique.mockResolvedValue({ id: 'firm-1' });
    });

    it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])('%s creates a credit pack and audit exactly once across repeat delivery', async (type) => {
      const { body, header } = paid({}, type);
      await service.handleWebhook(body, header);
      planAddOn.findUnique.mockResolvedValue({ id: 'addon' });
      await service.handleWebhook(body, header);
      expect(planAddOn.create).toHaveBeenCalledTimes(1);
      expect(planAddOn.create).toHaveBeenCalledWith({ data: {
        firmId: 'firm-1', kind: 'AI_100', amountThb: 99, stripeSessionId: 'cs_addon', credits: 100, storageGb: 0, expiresAt: null, createdAt: new Date(1800000000000),
      } });
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledWith({ data: { firmId: 'firm-1', action: 'ADDON_PURCHASED', metadata: { kind: 'AI_100', amountThb: 99, stripeSessionId: 'cs_addon' } } });
      expect(tx.firm.update).not.toHaveBeenCalled();
      expect(tx.billingInvoice.create).not.toHaveBeenCalled();
    });

    it.each([{ amount_total: 100 }, { currency: 'usd' }, { payment_status: 'unpaid' }, { metadata: { addOn: 'UNKNOWN' } }])('ignores invalid or unpaid add-on %j', async (over) => {
      const { body, header } = paid(over);
      await service.handleWebhook(body, header);
      expect(planAddOn.create).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('storage purchases each expire 30 days from their own payment, even when delivered late', async () => {
      const { body, header } = paid({ amount_total: 34900, metadata: { addOn: 'STORAGE_50GB' } });
      await service.handleWebhook(body, header);
      expect(planAddOn.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        kind: 'STORAGE_50GB', amountThb: 349, credits: 0, storageGb: 50, expiresAt: new Date(1800000000000 + 30 * 86400000),
      }) });
      expect(prisma.firm.findUnique).toHaveBeenCalledWith({ where: { id: 'firm-1' }, select: { id: true } });
    });

    it.each(Object.entries(ADD_ONS))('grants %s using its stored pack values', async (kind, pack) => {
      const { body, header } = paid({ amount_total: pack.priceThb * 100, metadata: { addOn: kind } });
      await service.handleWebhook(body, header);
      expect(planAddOn.create).toHaveBeenCalledWith({ data: {
        firmId: 'firm-1', kind, amountThb: pack.priceThb, stripeSessionId: 'cs_addon',
        credits: pack.credits, storageGb: pack.storageGb, createdAt: new Date(1800000000000),
        expiresAt: pack.days === null ? null : new Date(1800000000000 + pack.days * 86400000),
      } });
      expect(planAddOn.create).toHaveBeenCalledTimes(1);
    });

    it.each(Object.entries(ADD_ONS))('refuses an amount mismatch for %s', async (kind, pack) => {
      const { body, header } = paid({ amount_total: pack.priceThb * 100 - 1, metadata: { addOn: kind } });
      await service.handleWebhook(body, header);
      expect(planAddOn.create).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('concurrent duplicate unique-key errors are acknowledged without a second grant', async () => {
      const { Prisma } = await import('../generated/prisma');
      planAddOn.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6' }));
      const { body, header } = paid();
      await expect(service.handleWebhook(body, header)).resolves.toEqual({ received: true });
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('database failures propagate for Stripe to retry', async () => {
      planAddOn.create.mockRejectedValueOnce(new Error('database unavailable'));
      const { body, header } = paid();
      await expect(service.handleWebhook(body, header)).rejects.toThrow('database unavailable');
    });
  });

  it.each([
    ['active', SubscriptionStatus.ACTIVE],
    ['past_due', SubscriptionStatus.PAST_DUE],
    ['unpaid', SubscriptionStatus.PAST_DUE],
    ['canceled', SubscriptionStatus.CANCELED],
    ['incomplete', null],
  ])('stripe %s → %s', (s, expected) => {
    expect(stripeStatus(s as Stripe.Subscription.Status)).toBe(expected);
  });
});
