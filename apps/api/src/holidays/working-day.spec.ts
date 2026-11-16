import { isBangkokWorkingDay, usersOff } from './working-day';

const db = (holiday: boolean, onLeave: string[] = []) => ({
  publicHoliday: { findUnique: jest.fn().mockResolvedValue(holiday ? { id: 'h' } : null) },
  leaveRequest: { findMany: jest.fn().mockResolvedValue(onLeave.map((userId) => ({ userId }))) },
}) as any;

describe('working day', () => {
  it('is false on weekends and public holidays', async () => {
    expect(await isBangkokWorkingDay(db(false), new Date('2026-09-12T04:00:00Z'))).toBe(false); // Sat
    expect(await isBangkokWorkingDay(db(true), new Date('2026-09-14T04:00:00Z'))).toBe(false); // Mon holiday
    expect(await isBangkokWorkingDay(db(false), new Date('2026-09-14T04:00:00Z'))).toBe(true);
  });

  it('usersOff: everyone off hours or on a holiday, otherwise only those on leave', async () => {
    expect([...(await usersOff(db(false), ['a', 'b'], new Date('2026-09-14T11:00:00Z')))]).toEqual(['a', 'b']); // Mon 18:00
    expect([...(await usersOff(db(true), ['a', 'b'], new Date('2026-09-14T04:00:00Z')))]).toEqual(['a', 'b']); // holiday
    expect([...(await usersOff(db(false, ['b']), ['a', 'b'], new Date('2026-09-14T04:00:00Z')))]).toEqual(['b']);
  });
});
