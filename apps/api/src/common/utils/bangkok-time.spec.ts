import {
  addBangkokDays,
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
