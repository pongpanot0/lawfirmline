export function routePattern(path: string): string {
  return path
    .split('/')
    .map((part) => (/^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|c[a-z0-9]{20,})$/i.test(part) ? '[id]' : part))
    .join('/');
}

export function shouldShowFeedback(
  visits: number,
  lastAsked: number | null,
  lastDay: string | null,
  now: number,
  today: string,
  dialogOpen: boolean,
): boolean {
  return (
    visits >= 3 &&
    !dialogOpen &&
    lastDay !== today &&
    (lastAsked === null || now - lastAsked >= 90 * 86400000)
  );
}
