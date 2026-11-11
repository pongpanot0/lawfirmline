type Task = { status: string; assignee?: { id: string } | null; createdById?: string; handedOffById?: string | null };
export function taskBucket(task: Task, userId: string | undefined): 'todo' | 'waiting' | 'done' | null {
  if (!userId) return null;
  const mine = task.assignee?.id === userId;
  const handedOff = task.handedOffById === userId;
  const created = task.createdById === userId;
  if (task.status === 'DONE') return mine || handedOff || created ? 'done' : null;
  if ((task.status === 'PENDING_REVIEW' && handedOff) || (created && !!task.assignee && !mine)) return 'waiting';
  return mine ? 'todo' : null;
}
