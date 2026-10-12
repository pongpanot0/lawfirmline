import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';

/** A complete Thai government year has 19 or more holidays; fewer than this means the year was not fully entered. */
export const MIN_HOLIDAYS_PER_YEAR = 19;

type HolidayClient = Pick<PrismaService | Prisma.TransactionClient, 'publicHoliday'>;

/**
 * Of `years` (Gregorian), the ones whose holiday list looks unfilled — a
 * deadline computed into such a year may land on a day the court is closed.
 * PublicHoliday.date is a DATE column, so its UTC year is the Bangkok year.
 */
export async function incompleteHolidayYears(client: HolidayClient, years: number[]): Promise<Set<number>> {
  const wanted = [...new Set(years)].sort((a, b) => a - b);
  if (wanted.length === 0) return new Set();
  const rows = await client.publicHoliday.findMany({
    where: {
      date: {
        gte: new Date(Date.UTC(wanted[0], 0, 1)),
        lte: new Date(Date.UTC(wanted[wanted.length - 1], 11, 31)),
      },
    },
    select: { date: true },
  });
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.date.getUTCFullYear(), (counts.get(row.date.getUTCFullYear()) ?? 0) + 1);
  return new Set(wanted.filter((year) => (counts.get(year) ?? 0) < MIN_HOLIDAYS_PER_YEAR));
}
