import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

/** A Buddhist year is 543 ahead; anything this large is BE, not CE. */
const BE_OFFSET = 543;
const BE_THRESHOLD = 2400;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface HolidayInput {
  date: string;
  name: string;
}

/**
 * The national holiday calendar the deadline engine counts around.
 *
 * Rows are global, not per firm — these are the days the courts are closed,
 * which is the same for everyone. Dates are stored as `@db.Date` at UTC
 * midnight so no timezone can shift one onto the neighbouring day.
 */
@Injectable()
export class PublicHolidaysService {
  constructor(private prisma: PrismaService) {}

  /** Accepts either a Gregorian or a Buddhist year. */
  private toGregorian(year: number): number {
    return year >= BE_THRESHOLD ? year - BE_OFFSET : year;
  }

  private yearRange(year: number) {
    const ce = this.toGregorian(year);
    return {
      gte: new Date(`${ce}-01-01T00:00:00.000Z`),
      lt: new Date(`${ce + 1}-01-01T00:00:00.000Z`),
    };
  }

  list(year?: number) {
    return this.prisma.publicHoliday.findMany({
      ...(year ? { where: { date: this.yearRange(year) } } : {}),
      orderBy: { date: 'asc' },
    });
  }

  private toRows(holidays: HolidayInput[]) {
    return holidays.map((holiday) => {
      if (!DATE_ONLY.test(holiday.date) || Number.isNaN(Date.parse(`${holiday.date}T00:00:00Z`))) {
        throw new BadRequestException(`Invalid holiday date: ${holiday.date} (expected YYYY-MM-DD)`);
      }
      return { date: new Date(`${holiday.date}T00:00:00.000Z`), name: holiday.name };
    });
  }

  async importMany(holidays: HolidayInput[]) {
    const result = await this.prisma.publicHoliday.createMany({
      data: this.toRows(holidays),
      skipDuplicates: true,
    });
    return { created: result.count };
  }

  /**
   * Cabinet announcements get revised, so a re-import must be able to remove a
   * date that is no longer a holiday — adding on top would silently keep it.
   */
  async replaceYear(year: number, holidays: HolidayInput[]) {
    // Build the rows first: a bad date must not delete the year and leave nothing.
    const data = this.toRows(holidays);
    await this.prisma.publicHoliday.deleteMany({ where: { date: this.yearRange(year) } });
    const result = await this.prisma.publicHoliday.createMany({ data, skipDuplicates: true });
    return { replaced: result.count };
  }

  async remove(id: string) {
    const result = await this.prisma.publicHoliday.deleteMany({ where: { id } });
    if (result.count === 0) throw new BadRequestException('Holiday not found');
    return { deleted: true };
  }
}
