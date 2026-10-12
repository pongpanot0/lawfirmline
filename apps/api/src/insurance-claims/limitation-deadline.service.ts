import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { syncLimitationReminder } from '../common/limitation-reminder';

const LIMITATION_YEARS = 2;

/** Insurance claims: อายุความ 2 ปีนับแต่วันวินาศภัย (ป.พ.พ. ม.882); the reminder itself is the shared one. */
@Injectable()
export class LimitationDeadlineService {
  constructor(private prisma: PrismaService) {}

  computeDeadline(incidentDate: Date): Date {
    const deadline = new Date(incidentDate);
    deadline.setFullYear(deadline.getFullYear() + LIMITATION_YEARS);
    return deadline;
  }

  /** @returns the case's "ครบอายุความ" event id, or null once the case is filed. */
  async applyIncidentDate(caseId: string, incidentDate: Date, _existingEventId?: string | null): Promise<string | null> {
    await this.prisma.case.update({
      where: { id: caseId },
      data: { limitationDeadline: this.computeDeadline(incidentDate) },
    });
    return syncLimitationReminder(this.prisma, caseId);
  }
}
