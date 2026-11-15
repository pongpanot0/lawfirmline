import { estimateCourtFee, monetaryCourtFee } from '@lawfirm/shared';

describe('court fee estimate (ตาราง 1 ท้าย ป.วิ.พ.)', () => {
  it.each([
    [1_000_000, 20_000],      // research example 1
    [20_000_000, 200_000],    // example 2: capped
    [60_000_000, 210_000],    // example 3: cap on first 50 M + 0.1 % of the excess
    [2_500_000, 50_000],
    [1_234.5, 24],            // fractions of a baht dropped
  ])('general claim %d → %d', (claim, fee) => {
    expect(monetaryCourtFee(claim).fee).toBe(fee);
    expect(estimateCourtFee({ kind: 'GENERAL', level: 'TRIAL', claimAmount: claim }).fee).toBe(fee);
  });

  it('uses the arbitration and mortgage rates and caps', () => {
    expect(estimateCourtFee({ kind: 'ARBITRATION_DOMESTIC', level: 'TRIAL', claimAmount: 20_000_000 }).fee).toBe(50_000);
    expect(estimateCourtFee({ kind: 'ARBITRATION_FOREIGN', level: 'TRIAL', claimAmount: 1_000_000 }).fee).toBe(10_000);
    expect(estimateCourtFee({ kind: 'MORTGAGE', level: 'TRIAL', claimAmount: 60_000_000 }).fee).toBe(110_000);
  });

  it('flat, mixed, exempt and bankruptcy cases', () => {
    expect(estimateCourtFee({ kind: 'NON_MONETARY', level: 'TRIAL' }).fee).toBe(200);
    expect(estimateCourtFee({ kind: 'MIXED', level: 'TRIAL', claimAmount: 5_000 }).fee).toBe(200);
    expect(estimateCourtFee({ kind: 'MIXED', level: 'TRIAL', claimAmount: 1_000_000 }).fee).toBe(20_000);
    expect(estimateCourtFee({ kind: 'CONSUMER', level: 'TRIAL', claimAmount: 5_000_000 }).fee).toBe(0);
    expect(estimateCourtFee({ kind: 'LABOUR', level: 'APPEAL', claimAmount: 5_000_000 }).fee).toBe(0);
    expect(estimateCourtFee({ kind: 'BANKRUPTCY', level: 'TRIAL', claimAmount: 9_000_000 }).fee).toBe(500);
  });

  it('caps small claims at 1,000 only in the trial court', () => {
    expect(estimateCourtFee({ kind: 'SMALL_CLAIM', level: 'TRIAL', claimAmount: 300_000 }).fee).toBe(1_000);
    expect(estimateCourtFee({ kind: 'SMALL_CLAIM', level: 'TRIAL', claimAmount: 20_000 }).fee).toBe(400);
    expect(estimateCourtFee({ kind: 'SMALL_CLAIM', level: 'APPEAL', claimAmount: 300_000 }).fee).toBe(6_000);
  });

  it('rounds the administrative-court base to the hundred (ข้อ 34)', () => {
    expect(estimateCourtFee({ kind: 'ADMIN', level: 'TRIAL', claimAmount: 149 }).fee).toBe(2);   // base 100
    expect(estimateCourtFee({ kind: 'ADMIN', level: 'TRIAL', claimAmount: 150 }).fee).toBe(4);   // base 200
    expect(estimateCourtFee({ kind: 'ADMIN', level: 'TRIAL', claimAmount: 40 }).fee).toBe(2);    // floor of 100
  });

  it('notes that appeal fees use the amount still disputed', () => {
    expect(estimateCourtFee({ kind: 'GENERAL', level: 'APPEAL', claimAmount: 1_000_000 }).notes.join(' ')).toContain('ม.150');
  });
});
