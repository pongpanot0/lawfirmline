import { ForbiddenException } from '@nestjs/common';
import { CaseStatus, PLAN_CONFIG, PLAN_LIMIT_CASES, SubscriptionPlan } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

type Db = Pick<PrismaService, 'firm' | 'case'>;

/**
 * A plan with maxActiveCases (Free) may hold that many cases that are not closed or archived.
 * Every path that creates a case or reopens one calls this first; closed cases never count.
 *
 * 403, not 402: clients read 402 as "out of AI credits" or "subscription inactive". The message
 * names no price or link, because the iOS app may show it (App Store 3.1.1).
 */
export async function assertCanOpenCases(db: Db, firmId: string, adding = 1): Promise<void> {
  const firm = await db.firm.findUnique({ where: { id: firmId }, select: { subscriptionPlan: true } });
  const limit = firm?.subscriptionPlan ? PLAN_CONFIG[firm.subscriptionPlan as SubscriptionPlan]?.maxActiveCases : null;
  if (limit == null) return;
  const open = await db.case.count({
    where: { firmId, status: { notIn: [CaseStatus.CLOSED, CaseStatus.ARCHIVED] } },
  });
  if (open + adding > limit) {
    throw new ForbiddenException({
      code: PLAN_LIMIT_CASES,
      message: `ถึงจำนวนคดีที่เปิดอยู่สูงสุดของแพ็กเกจแล้ว (${limit} คดี) ปิดคดีที่เสร็จแล้ว หรือติดต่อเจ้าของสำนักงาน`,
    });
  }
}
