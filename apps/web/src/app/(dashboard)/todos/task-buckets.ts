type Task = { status: string; assignee?: { id: string } | null; createdById?: string; handedOffById?: string | null; reviewerId?: string | null };
export function taskBucket(task: Task, userId: string | undefined): 'todo' | 'waiting' | 'done' | null {
  if (!userId) return null;
  const mine = task.assignee?.id === userId;
  const handedOff = task.handedOffById === userId;
  const created = task.createdById === userId;
  if (task.status === 'DONE') return mine || handedOff || created ? 'done' : null;
  // Work waiting for my review is my move, even on a task I created.
  if (task.status === 'PENDING_REVIEW' && task.reviewerId === userId && !handedOff) return 'todo';
  if ((task.status === 'PENDING_REVIEW' && handedOff) || (created && !!task.assignee && !mine)) return 'waiting';
  return mine ? 'todo' : null;
}
