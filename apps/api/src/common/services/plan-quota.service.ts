import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AuthUser,
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
 * ponytail: check-then-record is not atomic — parallel requests at the edge can pass the
 * limit by a few. Fine for a quota; use a counter row with SELECT ... FOR UPDATE if it ever matters.
 */
@Injectable()
export class PlanQuotaService {
  constructor(private prisma: PrismaService) {}

  /** AI actions left, or null when the plan sets no limit for this firm. */
  async aiRemaining(user: Pick<AuthUser, 'firmId' | 'subscriptionPlan' | 'planGrandfathered'>): Promise<number | null> {
    if (!user.subscriptionPlan || user.planGrandfathered) return null;
    const cfg = PLAN_CONFIG[user.subscriptionPlan];
    const used = await this.prisma.aiQuotaUse.count({
      where: { firmId: user.firmId, ...(cfg.aiQuotaLifetime ? {} : { createdAt: { gte: bangkokMonthStart() } }) },
    });
    return Math.max(0, cfg.aiQuota - used);
  }

  async assertAiAvailable(user: AuthUser): Promise<void> {
    if ((await this.aiRemaining(user)) !== 0) return;
    const cfg = PLAN_CONFIG[user.subscriptionPlan!];
    throw new ForbiddenException({
      code: PLAN_LIMIT_AI,
      message: cfg.aiQuotaLifetime
        ? `ใช้ AI ครบ ${cfg.aiQuota} ครั้งที่แพ็กเกจให้แล้ว ติดต่อเจ้าของสำนักงาน`
        : `ใช้ AI ครบ ${cfg.aiQuota} ครั้งของเดือนนี้แล้ว ใช้ได้อีกครั้งต้นเดือนหน้า หรือติดต่อเจ้าของสำนักงาน`,
    });
  }

  async recordAi(user: AuthUser, action: string): Promise<void> {
    await this.prisma.aiQuotaUse.create({ data: { firmId: user.firmId, userId: user.id, action } });
  }

  async storageUsedBytes(firmId: string): Promise<number> {
    const agg = await this.prisma.storedObject.aggregate({ where: { firmId }, _sum: { bytes: true } });
    return agg._sum.bytes ?? 0;
  }

  async assertStorageAvailable(firmId: string, addingBytes: number): Promise<void> {
    const firm = await this.prisma.firm.findUnique({ where: { id: firmId }, select: { subscriptionPlan: true, createdAt: true } });
    const plan = firm?.subscriptionPlan as SubscriptionPlan | null | undefined;
    if (!firm || !plan || planGrandfathered(plan, firm.createdAt)) return;
    const limit = PLAN_CONFIG[plan].storageGb * GB;
    if ((await this.storageUsedBytes(firmId)) + addingBytes > limit) {
      throw new ForbiddenException({
        code: PLAN_LIMIT_STORAGE,
        message: `พื้นที่เก็บไฟล์ของแพ็กเกจเต็มแล้ว (${PLAN_CONFIG[plan].storageGb} GB) ลบไฟล์ที่ไม่ใช้ หรือติดต่อเจ้าของสำนักงาน`,
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
