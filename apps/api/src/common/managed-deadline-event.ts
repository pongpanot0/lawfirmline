import { EventType } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { bangkokDayKey, courtCloseAt } from './utils/bangkok-time';

/** Call under the owning case's write lock and save the returned link in the same transaction. */
export async function syncManagedDeadlineEvent(
  db: Prisma.TransactionClient,
  caseId: string,
  eventId: string | null,
  dueAt: Date | null,
  title: string,
  description: string | null = null,
): Promise<string | null> {
  const existing = eventId
    ? await db.calendarEvent.findFirst({
        where: { id: eventId, caseId },
        select: { id: true, startAt: true, title: true, description: true, assigneeId: true, type: true },
      })
    : null;

  if (!dueAt) {
    if (existing) await db.calendarEvent.deleteMany({ where: { id: existing.id, caseId } });
    return null;
  }

  const startAt = courtCloseAt(bangkokDayKey(dueAt));
  // Like limitation reminders, inherit the case's current lead so a handoff reroutes ownership.
  const data = { startAt, title, description, assigneeId: null, type: EventType.DEADLINE };
  if (existing) {
    const moved = existing.startAt.getTime() !== startAt.getTime();
    const reassigned = existing.assigneeId !== data.assigneeId;
    if (moved || reassigned || existing.title !== title || existing.description !== description || existing.type !== data.type) {
      const { count } = await db.calendarEvent.updateMany({ where: { id: existing.id, caseId }, data });
      // An event deleted while we were syncing it must be recreated below.
      if (count) {
        if (moved || reassigned) await db.reminderLog.deleteMany({ where: { eventId: existing.id } });
        return existing.id;
      }
    } else {
      return existing.id;
    }
  }

  const event = await db.calendarEvent.create({ data: { caseId, ...data }, select: { id: true } });
  return event.id;
}
