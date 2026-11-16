import { isBangkokWorkingDay, usersOff, usersOnLeave } from './working-day';

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

  it('half-day leave counts only during its half, and only when asked at a time', async () => {
    const d = db(false);
    await usersOnLeave(d, ['a'], new Date('2026-09-14T03:00:00Z'), true); // 10:00
    expect(d.leaveRequest.findMany.mock.calls[0][0].where.OR).toEqual([{ period: null }, { period: 'MORNING' }]);
    await usersOnLeave(d, ['a'], new Date('2026-09-14T05:00:00Z'), true); // 12:00
    expect(d.leaveRequest.findMany.mock.calls[1][0].where.OR).toEqual([{ period: null }, { period: 'AFTERNOON' }]);
    await usersOnLeave(d, ['a'], new Date('2026-09-14T03:00:00Z'));
    expect(d.leaveRequest.findMany.mock.calls[2][0].where.OR).toEqual([{ period: null }]);
  });
});
