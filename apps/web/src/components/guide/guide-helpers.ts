export function matchGuideRoute(path: string, routes: string[]) {
  const normalized = path.replace(/\/$/, '') || '/';
  if (routes.includes(normalized)) return normalized;
  return routes.find((route) => {
    const parts = route.split('/');
    const actual = normalized.split('/');
    return parts.length === actual.length && parts.every((part, i) => part.startsWith(':') ? !!actual[i] : part === actual[i]);
  });
}
export function expandedForVisit(visit: number, preference: string | null) {
  return preference === 'expanded' ? true : preference === 'collapsed' ? false : visit <= 3;
}
export function remainingText(items: { label: string; done: boolean }[]) {
  const remaining = items.filter((item) => !item.done);
  return remaining.length ? `เหลืออีก ${remaining.length} อย่าง: ${remaining.map((item) => item.label).join(' · ')}` : '';
}
