export interface WorkbenchTaskLike {
  id: string;
  status: string;
  dueDate?: string | null;
}

export interface WorkbenchRequiredDocumentLike {
  category: string;
  present: boolean;
}

export interface WorkbenchEventLike {
  id: string;
  startAt: string;
}

export interface CasePriorityInput<
  TTask extends WorkbenchTaskLike,
  TDocument extends WorkbenchRequiredDocumentLike,
  TEvent extends WorkbenchEventLike,
> {
  tasks: readonly TTask[];
  requiredDocuments: readonly TDocument[];
  upcomingEvents: readonly TEvent[];
  limitationDeadline: string | null | undefined;
}

export interface CasePrioritySummary<
  TTask extends WorkbenchTaskLike,
  TEvent extends WorkbenchEventLike,
> {
  completedTaskCount: number;
  pendingTaskCount: number;
  nextPendingTask: TTask | null;
  presentRequiredDocumentCount: number;
  requiredDocumentCount: number;
  missingRequiredDocumentCount: number;
  nextEvent: TEvent | null;
  limitationDays: number | null;
}

export function buildCasePrioritySummary<
  TTask extends WorkbenchTaskLike,
  TDocument extends WorkbenchRequiredDocumentLike,
  TEvent extends WorkbenchEventLike,
>(
  input: CasePriorityInput<TTask, TDocument, TEvent>,
  now = new Date(),
): CasePrioritySummary<TTask, TEvent> {
  const pendingTasks = input.tasks.filter((task) => task.status !== 'DONE');
  const completedTaskCount = input.tasks.length - pendingTasks.length;
  const presentRequiredDocumentCount = input.requiredDocuments.filter((item) => item.present).length;
  const limitationTime = input.limitationDeadline
    ? new Date(input.limitationDeadline).getTime()
    : Number.NaN;
  const limitationDays = Number.isFinite(limitationTime)
    ? Math.max(0, Math.ceil((limitationTime - now.getTime()) / 86400000))
    : null;

  return {
    completedTaskCount,
    pendingTaskCount: pendingTasks.length,
    nextPendingTask: pendingTasks[0] ?? null,
    presentRequiredDocumentCount,
    requiredDocumentCount: input.requiredDocuments.length,
    missingRequiredDocumentCount: input.requiredDocuments.length - presentRequiredDocumentCount,
    nextEvent: input.upcomingEvents[0] ?? null,
    limitationDays,
  };
}
