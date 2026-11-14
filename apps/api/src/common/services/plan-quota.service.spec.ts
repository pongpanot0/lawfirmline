import { ForbiddenException } from '@nestjs/common';
import { PLAN_CONFIG, PLAN_LIMIT_AI, PLAN_LIMIT_STORAGE, SubscriptionPlan } from '@lawfirm/shared';
import { bangkokMonthStart, PlanQuotaService } from './plan-quota.service';

const GB = 1024 ** 3;
const NEW_FIRM = new Date('2026-12-01T00:00:00Z');
const OLD_FIRM = new Date('2026-01-01T00:00:00Z');

function setup(opts: { plan: SubscriptionPlan | null; aiUsed?: number; storedBytes?: number; firmCreatedAt?: Date }) {
  const prisma = {
    aiQuotaUse: { count: jest.fn().mockResolvedValue(opts.aiUsed ?? 0), create: jest.fn() },
    storedObject: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { bytes: opts.storedBytes ?? 0 } }),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    firm: { findUnique: jest.fn().mockResolvedValue({ subscriptionPlan: opts.plan, createdAt: opts.firmCreatedAt ?? NEW_FIRM }) },
  };
  const user = { id: 'u1', firmId: 'f1', subscriptionPlan: opts.plan, planGrandfathered: false } as any;
  return { prisma, user, service: new PlanQuotaService(prisma as any) };
}

describe('PlanQuotaService — AI', () => {
  it('Free: 20 AI actions ever, counted with no date window', async () => {
    const { service, user, prisma } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 19 });
    await expect(service.aiRemaining(user)).resolves.toBe(1);
    expect(prisma.aiQuotaUse.count).toHaveBeenCalledWith({ where: { firmId: 'f1' } });
  });

  it('Free: the 21st action is refused, and the message names no price or link', async () => {
    const { service, user } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 20 });
    const err = await service.assertAiAvailable(user).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.response.code).toBe(PLAN_LIMIT_AI);
    expect(err.response.message).toContain('20');
    expect(err.response.message).not.toMatch(/บาท|฿|http|อัปเกรด/);
  });

  it.each([
    [SubscriptionPlan.SOLO, 100],
    [SubscriptionPlan.TEAM, 200],
    [SubscriptionPlan.FIRM, 1000],
    [SubscriptionPlan.PROFESSIONAL, 3000],
  ])('%s: %i AI actions per month, counted from the 1st (Bangkok)', async (plan, quota) => {
    expect(PLAN_CONFIG[plan].aiQuota).toBe(quota);
    const ok = setup({ plan, aiUsed: quota - 1 });
    await expect(ok.service.assertAiAvailable(ok.user)).resolves.toBeUndefined();
    expect(ok.prisma.aiQuotaUse.count).toHaveBeenCalledWith({ where: { firmId: 'f1', createdAt: { gte: bangkokMonthStart() } } });
    const full = setup({ plan, aiUsed: quota });
    await expect(full.service.assertAiAvailable(full.user)).rejects.toMatchObject({ response: { code: PLAN_LIMIT_AI } });
  });

  it('grandfathered firms and firms with no plan have no AI limit', async () => {
    const g = setup({ plan: SubscriptionPlan.TEAM, aiUsed: 99999 });
    await expect(g.service.aiRemaining({ ...g.user, planGrandfathered: true })).resolves.toBeNull();
    const none = setup({ plan: null, aiUsed: 99999 });
    await expect(none.service.assertAiAvailable(none.user)).resolves.toBeUndefined();
    expect(none.prisma.aiQuotaUse.count).not.toHaveBeenCalled();
  });

  it('bangkokMonthStart is midnight on the 1st in UTC+7', () => {
    // 1 Dec 00:30 Bangkok = 30 Nov 17:30 UTC — already December in Bangkok
    expect(bangkokMonthStart(new Date('2026-11-30T17:30:00Z')).toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(bangkokMonthStart(new Date('2026-11-30T16:30:00Z')).toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });
});

describe('PlanQuotaService — storage', () => {
  it.each([
    [SubscriptionPlan.FREE, 1],
    [SubscriptionPlan.SOLO, 5],
    [SubscriptionPlan.TEAM, 10],
    [SubscriptionPlan.FIRM, 50],
    [SubscriptionPlan.PROFESSIONAL, 200],
  ])('%s holds %i GB: a file that fits passes, one byte over is refused', async (plan, gb) => {
    const ok = setup({ plan, storedBytes: gb * GB - 10 });
    await expect(ok.service.assertStorageAvailable('f1', 10)).resolves.toBeUndefined();
    const over = setup({ plan, storedBytes: gb * GB - 10 });
    const err = await over.service.assertStorageAvailable('f1', 11).catch((e) => e);
    expect(err.response.code).toBe(PLAN_LIMIT_STORAGE);
    expect(err.response.message).not.toMatch(/บาท|฿|http|อัปเกรด/);
  });

  it('a paid firm created before the gates is not limited; an old Free firm is', async () => {
    const old = setup({ plan: SubscriptionPlan.TEAM, storedBytes: 500 * GB, firmCreatedAt: OLD_FIRM });
    await expect(old.service.assertStorageAvailable('f1', GB)).resolves.toBeUndefined();
    const oldFree = setup({ plan: SubscriptionPlan.FREE, storedBytes: GB, firmCreatedAt: OLD_FIRM });
    await expect(oldFree.service.assertStorageAvailable('f1', 1)).rejects.toMatchObject({ response: { code: PLAN_LIMIT_STORAGE } });
  });

  it('records and forgets stored objects by key', async () => {
    const { service, prisma } = setup({ plan: SubscriptionPlan.FREE });
    await service.recordStored('cases/c1/d1_v1.pdf', 'f1', 1234);
    expect(prisma.storedObject.upsert).toHaveBeenCalledWith({
      where: { key: 'cases/c1/d1_v1.pdf' },
      create: { key: 'cases/c1/d1_v1.pdf', firmId: 'f1', bytes: 1234 },
      update: { bytes: 1234 },
    });
    await service.forgetStored('cases/c1/d1_v1.pdf');
    expect(prisma.storedObject.deleteMany).toHaveBeenCalledWith({ where: { key: 'cases/c1/d1_v1.pdf' } });
  });
});
