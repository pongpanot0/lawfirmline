import { parseFlexibleDate, formatIsoDate, todayInBangkok } from './date-parse.util';

describe('parseFlexibleDate', () => {
  // 2026-09-19 07:00 UTC = 14:00 Bangkok
  const now = new Date('2026-09-19T07:00:00Z');

  it('handles relative Thai words', () => {
    expect(parseFlexibleDate('วันนี้', now)).toBe('2026-09-19');
    expect(parseFlexibleDate('พรุ่งนี้', now)).toBe('2026-09-20');
    expect(parseFlexibleDate('สัปดาห์หน้า', now)).toBe('2026-09-26');
  });

  it('handles ISO and slash formats, Buddhist years included', () => {
    expect(parseFlexibleDate('2026-09-15', now)).toBe('2026-09-15');
    expect(parseFlexibleDate('15/9/2569', now)).toBe('2026-09-15');
    expect(parseFlexibleDate('15/9/69', now)).toBe('2026-09-15');
    expect(parseFlexibleDate('15/9', now)).toBe('2026-09-15');
  });

  it('handles Thai month names', () => {
    expect(parseFlexibleDate('15 ก.ย. 2569', now)).toBe('2026-09-15');
    expect(parseFlexibleDate('1 มกราคม 2027', now)).toBe('2027-01-01');
  });

  it('rejects ambiguous or impossible input instead of guessing', () => {
    expect(parseFlexibleDate('15', now)).toBeNull(); // new Date('15') would mean year 2015
    expect(parseFlexibleDate('31/2/2026', now)).toBeNull();
    expect(parseFlexibleDate('ไม่รู้', now)).toBeNull();
    expect(parseFlexibleDate('', now)).toBeNull();
  });

  it('formats an ISO date back to Thai short form', () => {
    expect(formatIsoDate('2026-09-15')).toBe('15 ก.ย. 2026');
    expect(formatIsoDate(undefined)).toBe('');
  });

  it('reports today in Bangkok, not UTC', () => {
    expect(todayInBangkok(new Date('2026-09-19T18:00:00Z'))).toBe('2026-09-20');
  });
});
