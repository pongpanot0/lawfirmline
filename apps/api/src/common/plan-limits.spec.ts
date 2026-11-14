import { ForbiddenException } from '@nestjs/common';
import { PLAN_LIMIT_CASES, SubscriptionPlan } from '@lawfirm/shared';
import { assertCanAddCases } from './plan-limits';

describe('assertCanAddCases', () => {
  const db = (plan: SubscriptionPlan | null, open: number) =>
    ({
      firm: { findUnique: jest.fn().mockResolvedValue({ subscriptionPlan: plan }) },
      case: { count: jest.fn().mockResolvedValue(open) },
    }) as any;

  it('an exempt Free firm skips case counting', async () => {
    const d = db(SubscriptionPlan.FREE, 999);
    d.firm.findUnique.mockResolvedValue({ subscriptionPlan: SubscriptionPlan.FREE, quotaExempt: true });
    await expect(assertCanAddCases(d, 'f1')).resolves.toBeUndefined();
    expect(d.case.count).not.toHaveBeenCalled();
  });

  it('a Free firm may add its 15th case but not a 16th', async () => {
    await expect(assertCanAddCases(db(SubscriptionPlan.FREE, 14), 'f1')).resolves.toBeUndefined();
    await expect(assertCanAddCases(db(SubscriptionPlan.FREE, 15), 'f1')).rejects.toMatchObject({
      response: { code: PLAN_LIMIT_CASES },
    });
  });

  it('counts every case the firm holds, closed and archived included', async () => {
    const d = db(SubscriptionPlan.FREE, 3);
    await assertCanAddCases(d, 'f1');
    expect(d.case.count).toHaveBeenCalledWith({ where: { firmId: 'f1' } });
  });

  it('a bulk import is checked as a whole', async () => {
    await expect(assertCanAddCases(db(SubscriptionPlan.FREE, 10), 'f1', 6)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assertCanAddCases(db(SubscriptionPlan.FREE, 10), 'f1', 5)).resolves.toBeUndefined();
  });

  it('paid plans and firms without a plan have no case limit', async () => {
    for (const plan of [SubscriptionPlan.TEAM, SubscriptionPlan.SOLO, null]) {
      const d = db(plan, 500);
      await expect(assertCanAddCases(d, 'f1')).resolves.toBeUndefined();
      expect(d.case.count).not.toHaveBeenCalled();
    }
  });

  it('the message names no price or link (the iOS app may show it)', async () => {
    const err = await assertCanAddCases(db(SubscriptionPlan.FREE, 15), 'f1').catch((e) => e);
    expect(err.response.message).not.toMatch(/บาท|฿|http|samnuan\.com|อัปเกรด/);
  });
});
