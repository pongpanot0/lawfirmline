import { CaseStage, computeFeePackage, FeeComponent, FeeMilestone, MONEY_MAX, splitMilestones, validateFeePackage } from '@lawfirm/shared';

const milestone = (id: string, percent: number, stage = CaseStage.FILING): FeeMilestone => ({ id, label: id, percent, stage });

describe('fee package shared calculations', () => {
  it('sums fixed and claim percentages with a floor and ceiling', () => {
    const components: FeeComponent[] = [{ type: 'FIXED', amount: 500 }, { type: 'PERCENT_CLAIM', rate: 10, min: 1000, max: 2000 }];
    expect(computeFeePackage(components, { claimAmount: 100 }).total).toBe(1500);
    expect(computeFeePackage(components, { claimAmount: 15000 }).total).toBe(2000);
    expect(computeFeePackage(components, { claimAmount: 30000 }).total).toBe(2500);
  });
  it('uses marginal tier brackets', () => {
    const c: FeeComponent[] = [{ type: 'TIERED_CLAIM', brackets: [{ upTo: 100000, rate: 10 }, { upTo: 200000, rate: 5 }, { upTo: null, rate: 1 }] }];
    expect(computeFeePackage(c, { claimAmount: 250000 }).total).toBe(15500);
    expect(computeFeePackage(c, { claimAmount: 50000 }).total).toBe(5000);
  });
  it('calculates per-unit, recovery floors and hourly=0 with only used inputs', () => {
    const result = computeFeePackage([{ type: 'PER_UNIT', amount: 1000.25, unitKey: 'hearing', unitLabel: 'นัดสืบพยาน' }, { type: 'PERCENT_RECOVERY', rate: 5, min: 100 }, { type: 'HOURLY' }], { units: { hearing: 2 }, recoveryAmount: 10000 });
    expect(result.total).toBe(2500.5);
    expect(result.parts.map(p => p.amount)).toEqual([2000.5, 500, 0]);
    expect(result.requiredInputs).toEqual(['unit:hearing', 'recoveryAmount']);
    expect(computeFeePackage([{ type: 'PERCENT_RECOVERY', rate: 5, min: 100 }], { recoveryAmount: 10 }).total).toBe(100);
    expect(computeFeePackage([{ type: 'FIXED', label: 'ไกล่เกลี่ย', amount: 15000 }, { type: 'HOURLY' }], {}).requiredInputs).toEqual([]);
  });
  it('rounds parts to satang and the last milestone absorbs the remainder', () => {
    expect(computeFeePackage([{ type: 'PERCENT_CLAIM', rate: 3 }], { claimAmount: 100.5 }).total).toBe(3.02);
    expect(splitMilestones(100, [milestone('a', 33.33), milestone('b', 33.33), milestone('c', 33.34)])).toEqual([33.33, 33.33, 33.34]);
    expect(splitMilestones(0.02, [milestone('a', 25), milestone('b', 25), milestone('c', 25), milestone('d', 25)])).toEqual([0.01, 0.01, 0, 0]);
  });
  it.each([
    { components: [], milestones: [] },
    { components: [{ type: 'FIXED', amount: MONEY_MAX + 1 }], milestones: [] },
    { components: [{ type: 'PERCENT_CLAIM', rate: 101 }], milestones: [] },
    { components: [{ type: 'PERCENT_CLAIM', rate: 10, min: 100, max: 50 }], milestones: [] },
    { components: [{ type: 'TIERED_CLAIM', brackets: [{ upTo: 100, rate: 1 }] }], milestones: [] },
    { components: [{ type: 'FIXED', amount: 1 }], milestones: [milestone('a', 99)] },
    { components: [{ type: 'FIXED', amount: 1 }], milestones: [{ ...milestone('a', 100), stage: 'BAD' }] },
    { components: [{ type: 'FIXED', amount: 1 }], milestones: Array.from({ length: 13 }, (_, i) => milestone(String(i), 100 / 13)) },
    { components: [{ type: 'PER_UNIT', amount: 1, unitKey: '__proto__', unitLabel: 'unit' }], milestones: [] },
    { components: [null], milestones: [null] },
  ])('rejects malformed package %#', value => expect(validateFeePackage(value).length).toBeGreaterThan(0));
  it('validates a package and rejects invalid or overflowing inputs', () => {
    expect(validateFeePackage({ components: [{ type: 'FIXED', amount: 1 }], milestones: [milestone('a', 100)] })).toEqual([]);
    expect(() => computeFeePackage([{ type: 'PER_UNIT', amount: MONEY_MAX, unitKey: 'x', unitLabel: 'x' }], { units: { x: 2 } })).toThrow();
    expect(() => computeFeePackage([{ type: 'PERCENT_CLAIM', rate: 1 }], { claimAmount: -1 })).toThrow();
    expect(() => computeFeePackage([{ type: 'FIXED', amount: MONEY_MAX }, { type: 'FIXED', amount: 1 }], {})).toThrow();
  });
});
