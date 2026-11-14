import { ForbiddenException } from '@nestjs/common';
import { PLAN_CONFIG, PLAN_LIMIT_AI, PLAN_LIMIT_STORAGE, SubscriptionPlan } from '@lawfirm/shared';
import { bangkokMonthStart, PlanQuotaService } from './plan-quota.service';

const GB = 1024 ** 3;
const NEW_FIRM = new Date('2026-12-01T00:00:00Z');
const OLD_FIRM = new Date('2026-01-01T00:00:00Z');

function setup(opts: { plan: SubscriptionPlan | null; aiUsed?: number; storedBytes?: number; firmCreatedAt?: Date; packCredits?: number; packUsed?: number; addOnGb?: number; quotaExempt?: boolean }) {
  const prisma = {
    aiQuotaUse: { aggregate: jest.fn().mockResolvedValue({ _sum: { credits: opts.aiUsed ?? 0, packCredits: opts.packUsed ?? 0 } }), create: jest.fn() },
    planAddOn: { aggregate: jest.fn().mockResolvedValue({ _sum: { credits: opts.packCredits ?? 0, storageGb: opts.addOnGb ?? 0 } }) },
    storedObject: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { bytes: opts.storedBytes ?? 0 } }),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    firm: { findUnique: jest.fn().mockResolvedValue({ subscriptionPlan: opts.plan, createdAt: opts.firmCreatedAt ?? NEW_FIRM, quotaExempt: opts.quotaExempt ?? false }) },
  };
  const user = { id: 'u1', firmId: 'f1', subscriptionPlan: opts.plan, planGrandfathered: false } as any;
  return { prisma, user, service: new PlanQuotaService(prisma as any) };
}

describe('PlanQuotaService — AI', () => {
  it('Free: 20 AI actions ever, counted with no date window', async () => {
    const { service, user, prisma } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 19 });
    await expect(service.aiRemaining(user)).resolves.toBe(1);
    expect(prisma.aiQuotaUse.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'f1' } }));
  });

  it('Free: the 21st action is refused, and the message names no price or link', async () => {
    const { service, user } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 20 });
    const err = await service.assertAiAvailable(user).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.response.code).toBe(PLAN_LIMIT_AI);
    expect(err.response.message).toContain('1 เครดิต');
    expect(err.response.message).toContain('0 เครดิต');
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
    expect(ok.prisma.aiQuotaUse.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'f1', createdAt: { gte: bangkokMonthStart() } } }));
    const full = setup({ plan, aiUsed: quota });
    await expect(full.service.assertAiAvailable(full.user)).rejects.toMatchObject({ response: { code: PLAN_LIMIT_AI } });
  });

  it('grandfathered firms and firms with no plan have no AI limit', async () => {
    const g = setup({ plan: SubscriptionPlan.TEAM, aiUsed: 99999 });
    await expect(g.service.aiRemaining({ ...g.user, planGrandfathered: true })).resolves.toBeNull();
    const none = setup({ plan: null, aiUsed: 99999 });
    await expect(none.service.assertAiAvailable(none.user)).resolves.toBeUndefined();
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


describe('purchased credits and storage blocks', () => {
  it('counts plan credits separately from packs, and packs across all time without expiry', async () => {
    const { service, user, prisma } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 25, packCredits: 100, packUsed: 5 });
    expect(await service.aiBalance(user)).toEqual({ unlimited: false, period: 'LIFETIME', planQuota: 20, planUsed: 20, planRemaining: 0, packRemaining: 95, remaining: 95 });
    expect(prisma.planAddOn.aggregate).toHaveBeenCalledWith({ where: { firmId: 'f1' }, _sum: { credits: true } });
  });

  it('sums stored credits across mixed AI kinds without interpreting their names', async () => {
    const { service, user, prisma } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 20 });
    const packs = [
      { kind: 'AI_100', credits: 100 },
      { kind: 'AI_500', credits: 450 },
      { kind: 'AI_1500', credits: 1500 },
      { kind: 'AI_5000', credits: 5000 },
      { kind: 'STORAGE_100GB', credits: 0 },
    ];
    prisma.planAddOn.aggregate.mockImplementation(async ({ where }: any) => ({ _sum: {
      credits: packs.filter((pack) => !where.kind || pack.kind === where.kind).reduce((sum, pack) => sum + pack.credits, 0),
    } }));
    expect(await service.aiBalance(user)).toMatchObject({ packRemaining: 7050, remaining: 7050 });
    expect(prisma.planAddOn.aggregate).toHaveBeenCalledWith({ where: { firmId: 'f1' }, _sum: { credits: true } });
  });

  it('spends the remaining plan allowance before purchased credits', async () => {
    const { service, user, prisma } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 19, packCredits: 100 });
    await service.recordAi(user, 'scan', 3);
    expect(prisma.aiQuotaUse.create).toHaveBeenCalledWith({ data: { firmId: 'f1', userId: 'u1', action: 'scan', credits: 3, packCredits: 2 } });
  });

  it('paid balance resets plan usage monthly but never resets purchased usage', async () => {
    const { service, user, prisma } = setup({ plan: SubscriptionPlan.TEAM, aiUsed: 20, packCredits: 100, packUsed: 5 });
    expect(await service.aiBalance(user)).toMatchObject({ period: 'MONTH', planUsed: 15, planRemaining: 185, packRemaining: 95, remaining: 280 });
    expect(prisma.aiQuotaUse.aggregate).toHaveBeenCalledWith({ where: { firmId: 'f1' }, _sum: { packCredits: true } });
  });

  it('a new Bangkok month resets only the plan, keeping earlier pack consumption', async () => {
    const { service, user, prisma } = setup({ plan: SubscriptionPlan.TEAM, packCredits: 100 });
    prisma.aiQuotaUse.aggregate.mockImplementation(async ({ where }: any) => ({ _sum: where.createdAt ? { credits: 0, packCredits: 0 } : { packCredits: 12 } }));
    expect(await service.aiBalance(user)).toMatchObject({ planUsed: 0, planRemaining: 200, packRemaining: 88, remaining: 288 });
  });

  it('records within-plan usage without consuming a pack', async () => {
    const { service, user, prisma } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 10, packCredits: 100 });
    await service.recordAi(user, 'normal');
    expect(prisma.aiQuotaUse.create).toHaveBeenCalledWith({ data: { firmId: 'f1', userId: 'u1', action: 'normal', credits: 1, packCredits: 0 } });
  });

  it('unlimited firms retain purchased credits and record no pack consumption', async () => {
    const { service, user, prisma } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 99, packCredits: 100 });
    const exempt = { ...user, planGrandfathered: true };
    expect(await service.aiBalance(exempt)).toMatchObject({ unlimited: true, remaining: null, packRemaining: 100 });
    await service.recordAi(exempt, 'scan', 15);
    expect(prisma.aiQuotaUse.create).toHaveBeenCalledWith({ data: { firmId: 'f1', userId: 'u1', action: 'scan', credits: 15, packCredits: 0 } });
  });

  it('storage blocks stack independently and disappear exactly at their own expiry', async () => {
    const { service, prisma } = setup({ plan: SubscriptionPlan.FREE });
    const blocks = [
      { kind: 'STORAGE_50GB', storageGb: 50, expiresAt: new Date('2026-12-02T00:00:00Z') },
      { kind: 'STORAGE_100GB', storageGb: 100, expiresAt: new Date('2026-12-05T00:00:00Z') },
    ];
    prisma.planAddOn.aggregate.mockImplementation(async ({ where }: any) => ({ _sum: { storageGb: blocks.filter((block) => (!where.kind || block.kind === where.kind) && block.expiresAt > where.expiresAt.gt).reduce((sum, block) => sum + block.storageGb, 0) } }));
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-12-01T00:00:00Z'));
      expect(await service.storageUsage('f1')).toMatchObject({ addOnGb: 150, limitBytes: 151 * GB });
      jest.setSystemTime(new Date('2026-12-02T00:00:00Z'));
      expect(await service.storageUsage('f1')).toMatchObject({ addOnGb: 100, limitBytes: 101 * GB });
      jest.setSystemTime(new Date('2026-12-05T00:00:00Z'));
      expect(await service.storageUsage('f1')).toMatchObject({ addOnGb: 0, limitBytes: GB });
    } finally { jest.useRealTimers(); }
  });

  it('refuses a whole scan when only part of its credits fit', async () => {
    const { service, user } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 19, packCredits: 1 });
    await expect(service.assertAiAvailable(user, 3)).rejects.toMatchObject({ response: { code: PLAN_LIMIT_AI, message: expect.stringContaining('3 เครดิต AI แต่เหลือ 2 เครดิต') } });
  });

  it('only active storage blocks contribute and their GB sum', async () => {
    const { service, prisma } = setup({ plan: SubscriptionPlan.FREE, storedBytes: 21 * GB, addOnGb: 20 });
    await expect(service.assertStorageAvailable('f1', 0)).resolves.toBeUndefined();
    await expect(service.assertStorageAvailable('f1', 1)).rejects.toMatchObject({ response: { code: PLAN_LIMIT_STORAGE } });
    expect(prisma.planAddOn.aggregate).toHaveBeenCalledWith({ where: { firmId: 'f1', expiresAt: { gt: expect.any(Date) } }, _sum: { storageGb: true } });
  });

  it('exempt Free firms have unlimited AI and storage', async () => {
    const { service, user } = setup({ plan: SubscriptionPlan.FREE, aiUsed: 999, storedBytes: 999 * GB, quotaExempt: true });
    await expect(service.aiBalance({ ...user, planGrandfathered: true })).resolves.toMatchObject({ unlimited: true, remaining: null });
    await expect(service.assertStorageAvailable('f1', GB)).resolves.toBeUndefined();
  });
});
