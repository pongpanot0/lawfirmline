import { settledAmount } from './settlement';
describe('settled amount', () => {
  it('counts cleared cash plus WHT and ignores pending cheques', () => {
    expect(settledAmount([
      { amount: 97000, whtAmount: 3000, clearedAt: new Date('2026-11-01') },
      { amount: 5000, whtAmount: 150, clearedAt: null },
    ])).toBe(100000);
  });
});
