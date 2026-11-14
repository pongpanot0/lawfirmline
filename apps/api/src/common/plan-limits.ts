import { ForbiddenException } from '@nestjs/common';
import { PLAN_CONFIG, PLAN_LIMIT_CASES, SubscriptionPlan } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

type Db = Pick<PrismaService, 'firm' | 'case'>;

/**
 * A plan with maxCases (Free) may hold that many cases in all — closed and archived count too,
 * so closing a case never frees a slot. Every path that creates a case calls this first;
 * reopening one adds nothing and does not.
 *
 * 403, not 402: clients read 402 as "subscription inactive". The message
 * names no price or link, because the iOS app may show it (App Store 3.1.1).
 */
export async function assertCanAddCases(db: Db, firmId: string, adding = 1): Promise<void> {
  const firm = await db.firm.findUnique({ where: { id: firmId }, select: { subscriptionPlan: true, quotaExempt: true } });
  if (firm?.quotaExempt) return;
  const limit = firm?.subscriptionPlan ? PLAN_CONFIG[firm.subscriptionPlan as SubscriptionPlan]?.maxCases : null;
  if (limit == null) return;
  const total = await db.case.count({ where: { firmId } });
  if (total + adding > limit) {
    throw new ForbiddenException({
      code: PLAN_LIMIT_CASES,
      message: `ถึงจำนวนคดีสูงสุดของแพ็กเกจแล้ว (${limit} คดี รวมคดีที่ปิดแล้ว) ติดต่อเจ้าของสำนักงาน`,
    });
  }
}
