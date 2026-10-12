import { COURT_FEE_NON_MONEY, courtFee, interestDays, simpleInterest } from '@lawfirm/shared';

describe('courtFee (ตาราง 1 ท้าย ป.วิ.พ.)', () => {
  it.each([
    [0, 0],
    [1, 0.02],
    [49_999_999, 200_000],
    [50_000_000, 200_000],
    [50_000_001, 200_000.01], // 0.1% of 1 baht = 0.1 satang → rounds up to 1 satang
    [100_000_000, 250_000],
    [200_000_000, 350_000],
  ])('%d baht → %d baht', (amount, fee) => {
    expect(courtFee(amount)).toBe(fee);
  });

  it('caps at 200,000 from 10,000,000 baht', () => {
    expect(courtFee(9_999_999)).toBe(199_999.98);
    expect(courtFee(10_000_000)).toBe(200_000);
  });

  it('a claim without a money value pays 200 baht', () => {
    expect(courtFee(null)).toBe(COURT_FEE_NON_MONEY);
    expect(COURT_FEE_NON_MONEY).toBe(200);
  });

  it('handles satang amounts', () => {
    expect(courtFee(1_234.56)).toBe(24.7); // 24.6912 → 24.70
  });
});

describe('simpleInterest', () => {
  it('principal × rate × days / 365', () => {
    expect(simpleInterest(100_000, 5, 365)).toBe(5_000);
    expect(simpleInterest(100_000, 5, 30)).toBe(410.96);
    expect(simpleInterest(100_000, 7.5, 0)).toBe(0);
  });

  it('counts calendar days between two Bangkok days, never negative', () => {
    expect(interestDays('2026-01-01', '2027-01-01')).toBe(365);
    expect(interestDays('2028-02-28', '2028-03-01')).toBe(2);
    expect(interestDays('2027-01-02', '2027-01-01')).toBe(0);
  });
});
