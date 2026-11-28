import { estimateCourtFee, estimateEnforcementFee } from './court-fees';

const fee = (kind: Parameters<typeof estimateCourtFee>[0]['kind'], claimAmount?: number, level: 'TRIAL' | 'APPEAL' | 'SUPREME' = 'TRIAL') =>
  estimateCourtFee({ kind, level, claimAmount }).fee;

describe('estimateCourtFee', () => {
  it('general civil: 2% of the first 50M capped at 200,000, plus 0.1% of the excess', () => {
    expect(fee('GENERAL', 1_000_000)).toBe(20_000);
    expect(fee('GENERAL', 20_000_000)).toBe(200_000);
    expect(fee('GENERAL', 60_000_000)).toBe(210_000);
  });
  it('small claim trial is capped at 1,000 but appeal is not', () => {
    expect(fee('SMALL_CLAIM', 80_000)).toBe(1_000);
    expect(fee('SMALL_CLAIM', 80_000, 'APPEAL')).toBe(1_600);
  });
  it('admin court rounds the base to the nearest hundred', () => {
    expect(fee('ADMIN', 149)).toBe(2);
    expect(fee('ADMIN', 150)).toBe(4);
  });
  it('mixed claims never go below 200', () => expect(fee('MIXED', 5_000)).toBe(200));
  it('missing claim is flagged, not silently zero', () =>
    expect(estimateCourtFee({ kind: 'GENERAL', level: 'TRIAL' }).notes[0]).toContain('ยังไม่ได้ระบุทุนทรัพย์'));
});

describe('estimateEnforcementFee', () => {
  it('uses the 2568 rates per event', () => {
    expect(estimateEnforcementFee({ event: 'SALE', amount: 1_000_000 }).fee).toBe(20_000);
    expect(estimateEnforcementFee({ event: 'PAYOUT', amount: 1_000_000 }).fee).toBe(10_000);
    expect(estimateEnforcementFee({ event: 'BID', amount: 1_234_567 }).fee).toBe(12_345);
    expect(estimateEnforcementFee({ event: 'NO_SALE', amount: 1_000_000 }).fee).toBe(0);
  });
  it('treats a negative or missing amount as zero', () => {
    expect(estimateEnforcementFee({ event: 'SALE', amount: -5 }).fee).toBe(0);
    expect(estimateEnforcementFee({ event: 'SALE' }).fee).toBe(0);
  });
});
