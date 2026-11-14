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
  const room = await caseRoom(db, firmId);
  if (room && adding > room.left) {
    const limit = room.limit;
    throw new ForbiddenException({
      code: PLAN_LIMIT_CASES,
      message: `ถึงจำนวนคดีสูงสุดของแพ็กเกจแล้ว (${limit} คดี รวมคดีที่ปิดแล้ว) ติดต่อเจ้าของสำนักงาน`,
    });
  }
}

/** The plan's case cap and how many more cases fit (closed ones count); null when there is no cap or the firm is quota-exempt. */
export async function caseRoom(db: Db, firmId: string): Promise<{ limit: number; left: number } | null> {
  const firm = await db.firm.findUnique({ where: { id: firmId }, select: { subscriptionPlan: true, quotaExempt: true } });
  if (firm?.quotaExempt) return null;
  const limit = firm?.subscriptionPlan ? PLAN_CONFIG[firm.subscriptionPlan as SubscriptionPlan]?.maxCases : null;
  if (limit == null) return null;
  const total = await db.case.count({ where: { firmId } });
  return { limit, left: Math.max(0, limit - total) };
}
