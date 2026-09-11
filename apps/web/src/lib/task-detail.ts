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

/**
 * The attachment download endpoint needs the bearer token, so a plain
 * `<a href>` won't authenticate. Fetch the file as a blob (same pattern as
 * the case documents tab) and trigger the save via a hidden object-URL link.
 */
export async function downloadTaskAttachment(
  token: string,
  taskId: string,
  attachmentId: string,
  filename: string,
): Promise<void> {
  // Dynamic imports here (instead of top-level) keep this module loadable by
  // the plain `node --test` runner used for task-detail.test.ts, which
  // resolves relative specifiers strictly and has no bundler to fall back on.
  const { taskAttachmentDownloadUrl, ApiError } = await import('./api');
  const { withFirmSlugHeaders } = await import('./firm-slug');
  const res = await fetch(taskAttachmentDownloadUrl(taskId, attachmentId), {
    headers: withFirmSlugHeaders({ Authorization: `Bearer ${token}` }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
