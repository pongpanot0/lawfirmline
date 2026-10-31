import { dueMilestone, daysToExpiry } from './license-milestones';

const EXPIRES = new Date('2027-01-31T00:00:00.000Z'); // @db.Date value
const at = (day: string) => new Date(`${day}T03:00:00.000Z`); // 10:00 Bangkok
const none = new Set<string>();

describe('dueMilestone', () => {
  it('opens the renewal window 90 days before expiry', () => {
    expect(dueMilestone(EXPIRES, at('2026-11-02'), none)).toBe('OPEN_90');
  });

  it('sends only the latest due milestone after missed days', () => {
    expect(dueMilestone(EXPIRES, at('2027-01-24'), none)).toBe('DUE_7');
  });

  it('moves on to DUE_7 once DUE_30 was sent', () => {
    expect(dueMilestone(EXPIRES, at('2027-01-24'), new Set(['OPEN_90', 'DUE_30']))).toBe('DUE_7');
  });

  it('is null before the window opens', () => {
    expect(dueMilestone(EXPIRES, at('2026-11-01'), none)).toBeNull();
  });

  it('is null when the due milestone was already sent', () => {
    expect(dueMilestone(EXPIRES, at('2027-01-25'), new Set(['DUE_7']))).toBeNull();
  });

  it('sends EXPIRED on the expiry day', () => {
    expect(dueMilestone(EXPIRES, at('2027-01-31'), new Set(['DUE_7']))).toBe('EXPIRED');
  });

  it('sends LATE_45 on day 45 after expiry, then nothing more', () => {
    expect(dueMilestone(EXPIRES, at('2027-03-17'), new Set(['EXPIRED']))).toBe('LATE_45');
    expect(dueMilestone(EXPIRES, at('2027-03-20'), new Set(['LATE_45']))).toBeNull();
  });

  it('stays quiet once the 60-day late-renewal window has closed', () => {
    expect(dueMilestone(EXPIRES, at('2027-04-02'), none)).toBeNull();
  });

  it('counts Bangkok days: 17:30Z on the eve is already the next Bangkok day', () => {
    // 2026-11-01T17:30Z = 2026-11-02 00:30 Bangkok → day -90
    expect(dueMilestone(EXPIRES, new Date('2026-11-01T17:30:00.000Z'), none)).toBe('OPEN_90');
  });
});

describe('daysToExpiry', () => {
  it('is positive before and negative after expiry', () => {
    expect(daysToExpiry(EXPIRES, at('2027-01-21'))).toBe(10);
    expect(daysToExpiry(EXPIRES, at('2027-02-02'))).toBe(-2);
  });
});
