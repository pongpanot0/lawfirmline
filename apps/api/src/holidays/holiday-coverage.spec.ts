import { MIN_HOLIDAYS_PER_YEAR, incompleteHolidayYears } from './holiday-coverage';

describe('incompleteHolidayYears', () => {
  const days = (year: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(year, 0, i + 1)) }));

  it('flags years with fewer than 10 holidays and ignores years not asked about', async () => {
    const findMany = jest.fn().mockResolvedValue([...days(2026, 21), ...days(2027, 9)]);
    const result = await incompleteHolidayYears({ publicHoliday: { findMany } } as never, [2026, 2027, 2027]);
    expect([...result]).toEqual([2027]);
    expect(findMany).toHaveBeenCalledWith({
      where: { date: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2027-12-31T00:00:00.000Z') } },
      select: { date: true },
    });
  });

  it('treats a year with no rows as incomplete and skips the query for no years', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    expect([...(await incompleteHolidayYears({ publicHoliday: { findMany } } as never, [2028]))]).toEqual([2028]);
    expect([...(await incompleteHolidayYears({ publicHoliday: { findMany } } as never, []))]).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(MIN_HOLIDAYS_PER_YEAR).toBe(10);
  });
});
