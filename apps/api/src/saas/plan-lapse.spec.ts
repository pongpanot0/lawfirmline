import { Test } from '@nestjs/testing';
import { SubscriptionPlan, SubscriptionStatus } from '@lawfirm/shared';
import { TenantService } from './tenant.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TenantService.syncTrialExpiry: falling to the Free plan', () => {
  let service: TenantService;
  const prisma = {
    firm: { update: jest.fn((args) => args), findUnique: jest.fn() },
    firmMember: { count: jest.fn() },
    invitation: { count: jest.fn() },
    auditLog: { create: jest.fn((args) => args) },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const past = new Date(Date.now() - 86_400_000);
  const future = new Date(Date.now() + 86_400_000);
  const firm = (over: Record<string, unknown>) =>
    ({ id: 'f1', subscriptionStatus: SubscriptionStatus.TRIAL, trialEndAt: past, currentPeriodEnd: null, stripeSubscriptionId: null, ...over }) as any;
  const seats = (members: number, invites = 0) => {
    prisma.firmMember.count.mockResolvedValue(members);
    prisma.invitation.count.mockResolvedValue(invites);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [TenantService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(TenantService);
  });

  it('a one-person firm whose trial ended becomes an active Free firm that never lapses', async () => {
    seats(1);
    await expect(service.syncTrialExpiry(firm({}))).resolves.toBe(SubscriptionStatus.ACTIVE);
    expect(prisma.firm.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: expect.objectContaining({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionPlan: SubscriptionPlan.FREE,
        maxUsers: 1,
        currentPeriodEnd: null,
        stripeSubscriptionId: null,
      }),
    });
  });

  it('a firm with two seats (a member plus a pending invite) goes read-only instead', async () => {
    seats(1, 1);
    await expect(service.syncTrialExpiry(firm({}))).resolves.toBe(SubscriptionStatus.EXPIRED);
    expect(prisma.firm.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { subscriptionStatus: SubscriptionStatus.EXPIRED } });
  });

  it('an expired firm that removed members down to one moves to Free on its next request', async () => {
    seats(1);
    await expect(service.syncTrialExpiry(firm({ subscriptionStatus: SubscriptionStatus.EXPIRED }))).resolves.toBe(SubscriptionStatus.ACTIVE);
  });

  it('a canceled Stripe subscription on a one-person firm drops to Free and frees checkout', async () => {
    seats(1);
    await service.syncTrialExpiry(firm({ subscriptionStatus: SubscriptionStatus.CANCELED, stripeSubscriptionId: 'sub_1' }));
    expect(prisma.firm.update.mock.calls[0][0].data.stripeSubscriptionId).toBeNull();
  });

  it('a running trial, a paid period and a Free firm are left alone', async () => {
    for (const f of [
      firm({ trialEndAt: future }),
      firm({ subscriptionStatus: SubscriptionStatus.ACTIVE, currentPeriodEnd: future }),
      firm({ subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlan: SubscriptionPlan.FREE }),
    ]) {
      await expect(service.syncTrialExpiry(f)).resolves.toBe(f.subscriptionStatus);
    }
    expect(prisma.firm.update).not.toHaveBeenCalled();
  });
});
