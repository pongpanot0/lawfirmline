import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AuthUser,
  AiBalance,
  StorageUsage,
  PLAN_CONFIG,
  PLAN_LIMIT_AI,
  PLAN_LIMIT_STORAGE,
  planGrandfathered,
  SubscriptionPlan,
} from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';

const GB = 1024 ** 3;

/** First instant of the current calendar month in Bangkok (UTC+7, no DST). */
export function bangkokMonthStart(now = new Date()): Date {
  const bkk = new Date(now.getTime() + 7 * 3600_000);
  return new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), 1) - 7 * 3600_000);
}

/**
 * AI actions and file storage counted against the firm's plan. Messages name no price or
 * link: the iOS app may show them (App Store 3.1.1).
 *
 * shortcut: availability checks precede recording, so concurrent requests can exceed the
 * balance; reserve credits before model calls if a strict concurrency limit is needed.
 */
@Injectable()
export class PlanQuotaService {
  constructor(private prisma: PrismaService) {}

  async aiBalance(user: Pick<AuthUser, 'firmId' | 'subscriptionPlan' | 'planGrandfathered'>): Promise<AiBalance> {
    const cfg = user.subscriptionPlan ? PLAN_CONFIG[user.subscriptionPlan] : null;
    const unlimited = !cfg || !!user.planGrandfathered;
    const period = cfg?.aiQuotaLifetime ? 'LIFETIME' : 'MONTH';
    const [usage, packs, spent] = await Promise.all([
      this.prisma.aiQuotaUse.aggregate({
        where: { firmId: user.firmId, ...(cfg?.aiQuotaLifetime ? {} : { createdAt: { gte: bangkokMonthStart() } }) },
        _sum: { credits: true, packCredits: true },
      }),
      this.prisma.planAddOn.aggregate({ where: { firmId: user.firmId }, _sum: { credits: true } }),
      this.prisma.aiQuotaUse.aggregate({ where: { firmId: user.firmId }, _sum: { packCredits: true } }),
    ]);
    const planUsed = (usage._sum.credits ?? 0) - (usage._sum.packCredits ?? 0);
    const planRemaining = unlimited ? null : Math.max(0, cfg!.aiQuota - planUsed);
    const packRemaining = Math.max(0, (packs._sum.credits ?? 0) - (spent._sum.packCredits ?? 0));
    return { unlimited, period, planQuota: unlimited ? null : cfg!.aiQuota, planUsed, planRemaining, packRemaining, remaining: unlimited ? null : planRemaining! + packRemaining };
  }

  async aiRemaining(user: Pick<AuthUser, 'firmId' | 'subscriptionPlan' | 'planGrandfathered'>): Promise<number | null> {
    return (await this.aiBalance(user)).remaining;
  }

  async assertAiAvailable(user: AuthUser, credits = 1): Promise<void> {
    const balance = await this.aiBalance(user);
    if (balance.unlimited || balance.remaining! >= credits) return;
    throw new ForbiddenException({
      code: PLAN_LIMIT_AI,
      message: `ไฟล์นี้ต้องใช้ ${credits} เครดิต AI แต่เหลือ ${balance.remaining} เครดิต ติดต่อเจ้าของสำนักงาน`,
    });
  }

  async recordAi(user: AuthUser, action: string, credits = 1): Promise<void> {
    const balance = await this.aiBalance(user);
    const packCredits = balance.unlimited ? 0 : Math.max(0, credits - balance.planRemaining!);
    await this.prisma.aiQuotaUse.create({ data: { firmId: user.firmId, userId: user.id, action, credits, packCredits } });
  }

  async storageUsedBytes(firmId: string): Promise<number> {
    const agg = await this.prisma.storedObject.aggregate({ where: { firmId }, _sum: { bytes: true } });
    return agg._sum.bytes ?? 0;
  }

  async storageUsage(firmId: string): Promise<StorageUsage> {
    const firm = await this.prisma.firm.findUnique({ where: { id: firmId }, select: { subscriptionPlan: true, createdAt: true, quotaExempt: true } });
    const plan = firm?.subscriptionPlan as SubscriptionPlan | null | undefined;
    const unlimited = !firm || !plan || firm.quotaExempt || planGrandfathered(plan, firm.createdAt);
    const [usedBytes, blocks] = await Promise.all([
      this.storageUsedBytes(firmId),
      this.prisma.planAddOn.aggregate({ where: { firmId, expiresAt: { gt: new Date() } }, _sum: { storageGb: true } }),
    ]);
    const planGb = plan ? PLAN_CONFIG[plan].storageGb : 0;
    const addOnGb = blocks._sum.storageGb ?? 0;
    return { unlimited, usedBytes, planGb, addOnGb, limitBytes: unlimited ? null : (planGb + addOnGb) * GB };
  }

  async assertStorageAvailable(firmId: string, addingBytes: number): Promise<void> {
    const storage = await this.storageUsage(firmId);
    if (!storage.unlimited && storage.usedBytes + addingBytes > storage.limitBytes!) {
      throw new ForbiddenException({
        code: PLAN_LIMIT_STORAGE,
        message: `พื้นที่เก็บไฟล์เต็มแล้ว (${storage.planGb + storage.addOnGb} GB) ลบไฟล์ที่ไม่ใช้ หรือติดต่อเจ้าของสำนักงาน`,
      });
    }
  }

  async recordStored(key: string, firmId: string, bytes: number): Promise<void> {
    await this.prisma.storedObject.upsert({ where: { key }, create: { key, firmId, bytes }, update: { bytes } });
  }

  async forgetStored(key: string): Promise<void> {
    await this.prisma.storedObject.deleteMany({ where: { key } });
  }
}
