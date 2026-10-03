/**
 * The mobile route for a web path, or null when the app has no screen for it.
 * Resolved on the server so a route change ships with the API instead of
 * waiting for an app-store release.
 */
export function toAppRoute(webPath: string): string | null {
  const [path] = webPath.split(/[?#]/);
  const caseId = path.match(/^\/cases\/([0-9a-f-]{36})$/i)?.[1];
  if (caseId) return `/case/${caseId}`;
  const claimId = path.match(/^\/expenses\/claims?\/([0-9a-f-]{36})$/i)?.[1];
  if (claimId) return `/expenses/claim/${claimId}`;
  const eventId = path.match(/^\/court-day\/([0-9a-f-]{36})$/i)?.[1];
  if (eventId) return `/court-day/${eventId}`;
  const routes: Record<string, string> = {
    '/todos': '/(tabs)/tasks',
    '/calendar': '/(tabs)/calendar',
    '/expenses': '/expenses',
    '/expenses/new': '/expenses/new',
    '/expenses/claim': '/expenses/claims',
    '/expenses/claims': '/expenses/claims',
    '/admin/reimbursements': '/expenses/claims',
    '/leaves': '/leaves',
  };
  return routes[path] ?? null;
}

/** The task screen in the mobile app. */
export const taskAppRoute = (taskId: string) => `/task/new?id=${taskId}`;
