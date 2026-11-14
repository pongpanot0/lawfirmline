import { ForbiddenException } from '@nestjs/common';
import { ADD_ONS, FirmRole, SubscriptionPlan } from '@lawfirm/shared';
import { validate } from 'class-validator';
import { BillingAddOnsController } from './billing-add-ons.controller';
import { SubscriptionService } from './subscription.service';
import { AddOnCheckoutDto } from './dto/saas.dto';
import { PlanQuotaService } from '../common/services/plan-quota.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from './guards/firm-role.guard';

const GB = 1024 ** 3;
describe('billing add-ons and usage', () => {
  const owner = { id: 'u', firmId: 'f', email: 'u@test', firmRole: FirmRole.OWNER, subscriptionPlan: SubscriptionPlan.FREE } as any;
  const teamOwner = { ...owner, subscriptionPlan: SubscriptionPlan.TEAM };
  const create = jest.fn();
  const prisma = {
    firm: { findUnique: jest.fn() },
    planAddOn: { findMany: jest.fn(), aggregate: jest.fn() },
    aiQuotaUse: { aggregate: jest.fn() },
    storedObject: { aggregate: jest.fn() },
  };
  const tenant = { isOwner: (user: typeof owner) => user.firmRole === FirmRole.OWNER };
  const stripe = { client: { checkout: { sessions: { create } } } };
  const service = new SubscriptionService(prisma as any, tenant as any, stripe as any, { getAppUrl: () => 'https://app.test' } as any, new PlanQuotaService(prisma as any));
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.firm.findUnique.mockResolvedValue({ id: 'f', name: 'Firm', stripeCustomerId: 'cus', subscriptionPlan: 'FREE', createdAt: new Date('2026-12-01'), quotaExempt: false });
    create.mockResolvedValue({ url: 'https://checkout.stripe.com/c/test' });
    prisma.aiQuotaUse.aggregate.mockResolvedValue({ _sum: { credits: 19, packCredits: 0 } });
    prisma.planAddOn.aggregate.mockImplementation(({ _sum }) => Promise.resolve({ _sum: _sum.credits ? { credits: 100 } : { storageGb: 10 } }));
    prisma.storedObject.aggregate.mockResolvedValue({ _sum: { bytes: 1024 } });
    prisma.planAddOn.findMany.mockResolvedValue([{ kind: 'AI_100', credits: 100, storageGb: 0, amountThb: 99, createdAt: new Date('2026-11-14'), expiresAt: null }]);
  });

  it.each(['card', 'promptpay'] as const)('Free owners can buy one-time %s credit packs', async (paymentMethod) => {
    await expect(service.createAddOnCheckout(teamOwner, 'AI_100', paymentMethod)).resolves.toEqual({ url: 'https://checkout.stripe.com/c/test' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'payment', client_reference_id: 'f', payment_method_types: [paymentMethod],
      metadata: { firmId: 'f', addOn: 'AI_100' }, success_url: 'https://app.test/account/billing?addon=1',
      line_items: [{ quantity: 1, price_data: { currency: 'thb', unit_amount: 9900, product_data: { name: 'Samnuan AI_100' } } }],
    }));
  });

  it.each(Object.entries(ADD_ONS))('checks out %s at its own price', async (kind, pack) => {
    await service.createAddOnCheckout(teamOwner, kind as keyof typeof ADD_ONS);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'payment', metadata: { firmId: 'f', addOn: kind },
      line_items: [{ quantity: 1, price_data: { currency: 'thb', unit_amount: pack.priceThb * 100, product_data: { name: `Samnuan ${kind}` } } }],
    }));
  });

  it('packs are sold to Team and up only: Free and Solo owners are refused before Stripe', async () => {
    for (const plan of [SubscriptionPlan.FREE, SubscriptionPlan.SOLO, null]) {
      const err = await service.createAddOnCheckout({ ...owner, subscriptionPlan: plan }, 'AI_100').catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.message).toContain('Team');
    }
    expect(stripe.client.checkout.sessions.create).not.toHaveBeenCalled();
    for (const plan of [SubscriptionPlan.TEAM, SubscriptionPlan.FIRM, SubscriptionPlan.PROFESSIONAL]) {
      await expect(service.createAddOnCheckout({ ...owner, subscriptionPlan: plan }, 'STORAGE_10GB')).resolves.toHaveProperty('url');
    }
  });

  it('usage says whether this firm may buy packs', async () => {
    expect((await service.getUsage(owner)).canBuyAddOns).toBe(false);
    expect((await service.getUsage(teamOwner)).canBuyAddOns).toBe(true);
  });

  it('only owners can create an add-on checkout', async () => {
    await expect(service.createAddOnCheckout({ ...teamOwner, firmRole: FirmRole.LAWYER }, 'AI_100')).rejects.toThrow(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('validates add-on kinds and payment methods at the HTTP boundary', async () => {
    for (const fields of [{}, { addOn: '__proto__' }, { addOn: 'AI_100', paymentMethod: 'bitcoin' }]) {
      expect(await validate(Object.assign(new AddOnCheckoutDto(), fields))).not.toHaveLength(0);
    }
    for (const addOn of Object.keys(ADD_ONS)) {
      expect(await validate(Object.assign(new AddOnCheckoutDto(), { addOn, paymentMethod: 'card' }))).toHaveLength(0);
    }
  });

  it('any member may read usage, with exact shared response keys and ISO dates', async () => {
    const member = { ...owner, firmRole: FirmRole.LAWYER };
    const usage = await service.getUsage(member);
    expect(usage).toEqual({
      ai: { unlimited: false, period: 'LIFETIME', planQuota: 20, planUsed: 19, planRemaining: 1, packRemaining: 100, remaining: 101 },
      storage: { unlimited: false, usedBytes: 1024, planGb: 1, addOnGb: 10, limitBytes: 11 * GB },
      canBuyAddOns: false,
      addOns: [{ kind: 'AI_100', credits: 100, storageGb: 0, amountThb: 99, createdAt: '2026-11-14T00:00:00.000Z', expiresAt: null }], prices: [
        { kind: 'AI_100', priceThb: 99, credits: 100, storageGb: 0, days: null },
        { kind: 'AI_500', priceThb: 399, credits: 500, storageGb: 0, days: null },
        { kind: 'AI_1500', priceThb: 990, credits: 1500, storageGb: 0, days: null },
        { kind: 'AI_5000', priceThb: 2490, credits: 5000, storageGb: 0, days: null },
        { kind: 'STORAGE_10GB', priceThb: 99, credits: 0, storageGb: 10, days: 30 },
        { kind: 'STORAGE_50GB', priceThb: 349, credits: 0, storageGb: 50, days: 30 },
        { kind: 'STORAGE_100GB', priceThb: 590, credits: 0, storageGb: 100, days: 30 },
      ],
    });
    expect(prisma.planAddOn.findMany).toHaveBeenCalledWith({ where: { firmId: 'f' }, orderBy: { createdAt: 'desc' } });
  });

  it('protects billing with JWT and checkout with manageSubscription; usage is readable by members', () => {
    expect(Reflect.getMetadata('__guards__', BillingAddOnsController)).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata('__guards__', BillingAddOnsController.prototype.checkout)).toContain(FirmRoleGuard);
    expect(Reflect.getMetadata('requireCapability', BillingAddOnsController.prototype.checkout)).toBe('manageSubscription');
    expect(Reflect.getMetadata('__guards__', BillingAddOnsController.prototype.usage)).toBeUndefined();
    expect(Reflect.getMetadata('allowExternal', BillingAddOnsController.prototype.usage)).toBe(true);
  });
});
