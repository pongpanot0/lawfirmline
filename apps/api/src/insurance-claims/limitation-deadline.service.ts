import { Injectable } from '@nestjs/common';
import { EventType } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CalendarService } from '../calendar/calendar.service';

const LIMITATION_YEARS = 2;
const REMINDER_MINUTES = [90 * 1440, 30 * 1440, 7 * 1440];

@Injectable()
export class LimitationDeadlineService {
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
  ) {}

  computeDeadline(incidentDate: Date): Date {
    const deadline = new Date(incidentDate);
    deadline.setFullYear(deadline.getFullYear() + LIMITATION_YEARS);
    return deadline;
  }

  async applyIncidentDate(
    caseId: string,
    incidentDate: Date,
    existingEventId?: string | null,
  ): Promise<string> {
    const deadline = this.computeDeadline(incidentDate);

    await this.prisma.case.update({
      where: { id: caseId },
      data: { limitationDeadline: deadline },
    });

    if (existingEventId) {
      const updated = await this.calendarService.update(existingEventId, {
        startAt: deadline.toISOString(),
      });
      await this.prisma.reminderLog.deleteMany({ where: { eventId: existingEventId } });
      return updated.id;
    }

    const created = await this.calendarService.create({
      caseId,
      title: 'อายุความฟ้องคดี (ม.882)',
      startAt: deadline.toISOString(),
      type: EventType.DEADLINE,
      reminderMinutes: REMINDER_MINUTES,
    });
    return created.id;
  }
}
