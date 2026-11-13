export function routePattern(path: string): string {
  return path.split('/').map((part) => (
    /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|c[a-z0-9]{20,})$/i.test(part) ? '[id]' : part
  )).join('/');
}

export function patternFromSegments(segments: readonly string[], path: string): string {
  const parts = path.split('/').filter(Boolean);
  const route = segments.filter((segment) => !segment.startsWith('(') && segment !== 'index');
  return routePattern(`/${parts.map((part, index) => (
    route[index]?.startsWith('[') ? '[id]' : part
  )).join('/')}`);
}

export function shouldShowFeedback(
  visits: number,
  lastAsked: number | null,
  lastDay: string | null,
  now: number,
  today: string,
  dialogOpen: boolean,
): boolean {
  return visits >= 3 && !dialogOpen && lastDay !== today &&
    (lastAsked === null || now - lastAsked >= 90 * 86400000);
}

export function isFeedbackEligible(segments: readonly string[], path: string): boolean {
  const blocked = ['new', 'edit', 'compose', 'scan', 'document-template', 'app-feedback'];
  return !segments.some((segment) => segment === '(auth)' || blocked.includes(segment)) &&
    !path.split('/').some((part) => blocked.includes(part));
}
