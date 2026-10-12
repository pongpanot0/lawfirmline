import { EventType } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { bangkokDayKey, courtCloseAt } from './utils/bangkok-time';

export const LIMITATION_EVENT_TITLE = 'ครบอายุความ';
/** 90, 30, 7 and 1 day(s) before. */
export const LIMITATION_REMINDER_MINUTES = [90, 30, 7, 1].map((days) => days * 1440);

export type LimitationDb = Pick<
  PrismaService | Prisma.TransactionClient,
  'case' | 'caseProceeding' | 'calendarEvent' | 'reminderLog'
>;

/**
 * Keeps exactly one "ครบอายุความ" DEADLINE event per case in step with
 * Case.limitationDeadline. Plain function over a Prisma client so cases,
 * intake, insurance claims and proceedings can all call it (inside their
 * transaction when they have one) without new module edges.
 *
 * Case.limitationEventId has no foreign key, so the linked event may have been
 * deleted by hand: a missing event is treated as "no event yet" (re-created
 * when the case needs one, link cleared when it does not) and never throws.
 *
 * @returns the linked event id, or null when the case needs no reminder —
 *   no deadline, or already filed (a proceeding with a filing date, a black number or a judgment).
 */
export async function syncLimitationReminder(db: LimitationDb, caseId: string): Promise<string | null> {
  const legalCase = await db.case.findUnique({
    where: { id: caseId },
    select: { limitationDeadline: true, limitationEventId: true, leadLawyerId: true },
  });
  if (!legalCase) return null;

  const filed = await db.caseProceeding.count({
    where: {
      caseId,
      OR: [{ filedAt: { not: null } }, { blackCaseNumber: { not: null } }, { judgmentAt: { not: null } }],
    },
  });
  const existing = legalCase.limitationEventId
    ? await db.calendarEvent.findUnique({
        where: { id: legalCase.limitationEventId },
        select: { id: true, startAt: true },
      })
    : null;

  if (!legalCase.limitationDeadline || filed > 0) {
    if (existing) await db.calendarEvent.delete({ where: { id: existing.id } });
    if (legalCase.limitationEventId) {
      await db.case.update({ where: { id: caseId }, data: { limitationEventId: null } });
    }
    return null;
  }

  // The last day to file — due when the court counter closes.
  const startAt = courtCloseAt(bangkokDayKey(legalCase.limitationDeadline));
  if (existing) {
    if (existing.startAt.getTime() !== startAt.getTime()) {
      await db.calendarEvent.update({
        where: { id: existing.id },
        data: { startAt, title: LIMITATION_EVENT_TITLE, reminderMinutes: LIMITATION_REMINDER_MINUTES },
      });
      // Reminders already sent for the old date must fire again for the new one.
      await db.reminderLog.deleteMany({ where: { eventId: existing.id } });
    }
    return existing.id;
  }

  const event = await db.calendarEvent.create({
    data: {
      caseId,
      title: LIMITATION_EVENT_TITLE,
      type: EventType.DEADLINE,
      startAt,
      reminderMinutes: LIMITATION_REMINDER_MINUTES,
      assigneeId: legalCase.leadLawyerId,
      assignees: { create: [{ userId: legalCase.leadLawyerId }] },
    },
    select: { id: true },
  });
  await db.case.update({ where: { id: caseId }, data: { limitationEventId: event.id } });
  return event.id;
}
