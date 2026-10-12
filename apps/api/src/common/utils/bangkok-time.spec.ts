import {
  addBangkokDays,
  addBangkokMonths,
  courtCloseAt,
  bangkokDayKey,
  bangkokDayStart,
  formatBangkokDateTime,
  isBangkokWeekend,
} from './bangkok-time';

describe('bangkok-time', () => {
  describe('bangkokDayKey', () => {
    it('uses the Bangkok calendar day, not the UTC one', () => {
      // 2026-09-07T18:30Z is already 2026-09-08 01:30 in Bangkok.
      expect(bangkokDayKey(new Date('2026-09-07T18:30:00Z'))).toBe('2026-09-08');
    });

    it('keeps the same day when Bangkok has not rolled over yet', () => {
      expect(bangkokDayKey(new Date('2026-09-07T16:59:59Z'))).toBe('2026-09-07');
    });
  });

  describe('bangkokDayStart', () => {
    it('returns 17:00Z of the previous UTC day (00:00 Bangkok)', () => {
      const start = bangkokDayStart(new Date('2026-09-07T09:00:00Z'));
      expect(start.toISOString()).toBe('2026-09-06T17:00:00.000Z');
    });

    it('is stable for an instant that is already midnight in Bangkok', () => {
      const start = bangkokDayStart(new Date('2026-09-06T17:00:00Z'));
      expect(start.toISOString()).toBe('2026-09-06T17:00:00.000Z');
    });
  });

  describe('addBangkokDays', () => {
    it('advances whole Bangkok days', () => {
      const start = bangkokDayStart(new Date('2026-09-07T09:00:00Z'));
      expect(bangkokDayKey(addBangkokDays(start, 1))).toBe('2026-09-08');
      expect(bangkokDayKey(addBangkokDays(start, -1))).toBe('2026-09-06');
    });
  });

  describe('isBangkokWeekend', () => {
    it('treats Saturday and Sunday in Bangkok as weekend', () => {
      expect(isBangkokWeekend(new Date('2026-09-05T03:00:00Z'))).toBe(true); // Sat
      expect(isBangkokWeekend(new Date('2026-09-06T03:00:00Z'))).toBe(true); // Sun
      expect(isBangkokWeekend(new Date('2026-09-07T03:00:00Z'))).toBe(false); // Mon
    });

    it('classifies by the Bangkok day, so a Sunday evening UTC is Monday', () => {
      // 2026-09-06T18:00Z === Mon 2026-09-07 01:00 Bangkok.
      expect(isBangkokWeekend(new Date('2026-09-06T18:00:00Z'))).toBe(false);
    });
  });

  describe('formatBangkokDateTime', () => {
    it('formats in Bangkok local time regardless of server timezone', () => {
      expect(formatBangkokDateTime(new Date('2026-09-07T02:30:00Z'))).toBe('07/09/2026 09:30');
    });
  });
});

describe('formatBangkokDateThai', () => {
  it('renders the Bangkok day with a Thai weekday, month and Buddhist year', () => {
    const { formatBangkokDateThai } = require('./bangkok-time');
    // 2026-09-07T18:30Z is Tue 8 Sep 2026 in Bangkok → 2569 BE.
    expect(formatBangkokDateThai(new Date('2026-09-07T18:30:00Z'))).toBe('อ. 8 ก.ย. 2569');
  });
});

describe('addBangkokMonths', () => {
  const at = (day: string) => new Date(`${day}T03:00:00Z`);

  it('keeps the day of month', () => {
    expect(bangkokDayKey(addBangkokMonths(at('2026-10-11'), 1))).toBe('2026-11-11');
    expect(bangkokDayKey(addBangkokMonths(at('2027-02-15'), 1))).toBe('2027-03-15');
  });

  it('falls back to the last day of a shorter month (ม.193/5)', () => {
    expect(bangkokDayKey(addBangkokMonths(at('2027-01-31'), 1))).toBe('2027-02-28');
    expect(bangkokDayKey(addBangkokMonths(at('2028-01-31'), 1))).toBe('2028-02-29');
    expect(bangkokDayKey(addBangkokMonths(at('2027-03-31'), -1))).toBe('2027-02-28');
  });

  it('ends a month period on the day before the next start (ม.193/3 + 193/5)', () => {
    const cases: Array<[string, number, string]> = [
      ['2026-10-11', 1, '2026-11-11'],
      ['2027-04-30', 1, '2027-05-31'],
      ['2027-02-28', 1, '2027-03-31'],
      ['2028-02-28', 1, '2028-03-28'],
      ['2027-01-31', 1, '2027-02-28'],
      ['2028-01-31', 1, '2028-02-29'],
      ['2027-01-30', 1, '2027-02-28'],
      ['2026-12-31', 1, '2027-01-31'],
      ['2027-02-15', 1, '2027-03-15'],
      ['2026-10-11', 120, '2036-10-11'],
    ];
    for (const [from, n, expected] of cases) {
      expect([from, n, bangkokDayKey(addBangkokMonths(at(from), n))]).toEqual([from, n, expected]);
    }
    // 18:00Z on 11 Oct is already 12 Oct in Bangkok.
    expect(bangkokDayKey(addBangkokMonths(new Date('2026-10-11T18:00:00Z'), 1))).toBe('2026-11-12');
  });

  it('returns 00:00 Bangkok of the target day', () => {
    expect(addBangkokMonths(at('2026-10-11'), 1).toISOString()).toBe('2026-11-10T17:00:00.000Z');
  });
});

describe('courtCloseAt', () => {
  it('is 16:30 Bangkok on the given day', () => {
    expect(courtCloseAt('2026-11-11').toISOString()).toBe('2026-11-11T09:30:00.000Z');
  });
});
