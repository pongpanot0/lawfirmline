/** A due date becomes overdue after its local calendar day ends. */
export function isOverdue(dueAt: string | null | undefined, now = new Date()): boolean {
  if (!dueAt) return false;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return false;
  return new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() <
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
