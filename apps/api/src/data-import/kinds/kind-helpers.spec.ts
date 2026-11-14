import { cellText, draftFor, importAmount, importDate, ownValue, signature } from '../kind-helpers';
import { importUser, row } from './import-kind.fixtures';

describe('import boundary helpers', () => {
  it('preserves invalid date text for a row problem instead of throwing while constructing display cells', () => {
    const invalid = new Date('invalid');
    const input = row({ วันที่: invalid });
    const draft = draftFor(input, importUser);
    expect(draft.cells.วันที่).toBe('Invalid Date');
    expect(importDate(draft, input, 'วันที่', true)).toBeUndefined();
    expect(draft.problems.join(' ')).toContain('วันที่ไม่ถูกต้อง Invalid Date');
    expect(cellText(new Date('2026-01-01'))).toBe('2026-01-01');
    expect(cellText(undefined)).toBe('');
  });
  it('does not resolve inherited properties as enum values', () => {
    expect(ownValue({ สูง: 'HIGH' }, 'constructor')).toBeUndefined();
    expect(ownValue({ สูง: 'HIGH' }, 'toString')).toBeUndefined();
    expect(ownValue({ สูง: 'HIGH' }, 'สูง')).toBe('HIGH');
  });
  it('rejects overflowing finite input before a money value reaches persistence', () => {
    const input = row({ เงิน: 1e307 }); const draft = draftFor(input, importUser);
    expect(importAmount(draft, input, 'เงิน')).toBeUndefined();
    expect(draft.problems.join(' ')).toContain('จำนวนเงินไม่ถูกต้อง');
  });
  it('keeps tuple signatures unambiguous when data contains separators', () => {
    expect(signature('a;b', 'c')).not.toBe(signature('a', 'b;c'));
    expect(signature(' ＡＣＭＥ ', null)).toBe(signature('acme', undefined));
  });
});
