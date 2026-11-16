import { LeavePeriod, LeaveStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { bangkokDateOnly, bangkokHour, isBangkokOfficeHours, isBangkokWeekend } from '../common/utils/bangkok-time';

/** Half-day leave splits at noon: morning leave is off before 12:00, afternoon leave from 12:00. */
export const LEAVE_SPLIT_HOUR = 12;

type Db = Pick<PrismaService, 'publicHoliday' | 'leaveRequest'>;

/** False on Sat/Sun and on any date in the public-holiday table (Bangkok day). */
export async function isBangkokWorkingDay(db: Db, date: Date): Promise<boolean> {
  if (isBangkokWeekend(date)) return false;
  const holiday = await db.publicHoliday.findUnique({ where: { date: bangkokDateOnly(date) }, select: { id: true } });
  return !holiday;
}

/**
 * Which of `userIds` have approved leave covering the Bangkok day of `date`.
 * Whole-day leave only, unless `atTime`: then half-day leave counts during its half.
 */
export async function usersOnLeave(db: Db, userIds: string[], date: Date, atTime = false): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const today = bangkokDateOnly(date);
  const half = bangkokHour(date) < LEAVE_SPLIT_HOUR ? LeavePeriod.MORNING : LeavePeriod.AFTERNOON;
  const rows = await db.leaveRequest.findMany({
    where: {
      userId: { in: userIds }, status: LeaveStatus.APPROVED, startDate: { lte: today }, endDate: { gte: today },
      OR: [{ period: null }, ...(atTime ? [{ period: half }] : [])],
    },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

/**
 * Recipients who must not be pushed or messaged right now: everyone outside
 * Mon–Fri 09:00–17:00 or on a public holiday, otherwise those on approved leave today.
 */
export async function usersOff(db: Db, userIds: string[], now: Date): Promise<Set<string>> {
  if (!isBangkokOfficeHours(now) || !(await isBangkokWorkingDay(db, now))) return new Set(userIds);
  return usersOnLeave(db, userIds, now, true);
}
