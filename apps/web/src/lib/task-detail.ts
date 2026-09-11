/**
 * A task is patched through whichever board owns it: personal tasks live
 * under /todos, case tasks under their case. The drawer serves both.
 */
export function taskUpdatePath(task: { id: string; caseId?: string | null }): string {
  return task.caseId ? `/cases/${task.caseId}/tasks/${task.id}` : `/todos/${task.id}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
