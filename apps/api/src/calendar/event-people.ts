import { Prisma } from '../generated/prisma';

/** Reusable `include` for loading an event's assignees alongside the query. */
export const eventAssigneesInclude = {
  assignees: {
    select: {
      userId: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CalendarEventInclude;

/**
 * The people responsible for an event: the assignee rows if any exist,
 * else the case's lead lawyer, else nobody.
 */
export function eventPeopleIds(e: {
  assignees?: { userId: string }[] | null;
  case?: { leadLawyerId: string | null } | null;
}): string[] {
  if (e.assignees && e.assignees.length > 0) {
    return e.assignees.map((a) => a.userId);
  }
  return e.case?.leadLawyerId ? [e.case.leadLawyerId] : [];
}

/** Filter for events where `userId` is a responsible person (see eventPeopleIds). */
export function eventForUserWhere(userId: string): Prisma.CalendarEventWhereInput {
  return {
    OR: [
      { assignees: { some: { userId } } },
      { assignees: { none: {} }, case: { leadLawyerId: userId } },
    ],
  };
}
