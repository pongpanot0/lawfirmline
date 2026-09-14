import type { CourtDayState } from './court-day';
export const COURT_DRAFT_PREFIX = 'samnuan:court-draft:';
export interface CourtDayLocalDraft {
  version: number;
  savedAt: number;
  state: CourtDayState;
}
/** Reject expired or malformed browser data before it becomes editable state. */
export function parseCourtDayDraft(
  raw: string | null,
  now = Date.now(),
): CourtDayLocalDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const s = value.state;
    if (
      !Number.isInteger(value.version) ||
      value.version < 0 ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt > now ||
      now - value.savedAt > 86400000 ||
      !s
    )
      return null;
    if (
      ![
        'notes',
        'outcome',
        'nextTitle',
        'nextAt',
        'taskTitle',
        'taskDue',
        'amount',
      ].every((key) => typeof s[key] === 'string')
    )
      return null;
    if (
      !['nextHearing', 'followUp', 'expense', 'clientDraft'].every(
        (key) => typeof s[key] === 'boolean',
      )
    )
      return null;
    if (
      !Array.isArray(s.checklist) ||
      !s.checklist.every(
        (x: { id?: unknown; title?: unknown; done?: unknown } | null) =>
          x &&
          typeof x.id === 'string' &&
          typeof x.title === 'string' &&
          typeof x.done === 'boolean',
      )
    )
      return null;
    if (
      !Array.isArray(s.taskIds) ||
      !s.taskIds.every((id: unknown) => typeof id === 'string')
    )
      return null;
    if (
      !Array.isArray(s.documents) ||
      !s.documents.every(
        (x: { id?: unknown; version?: unknown } | null) =>
          x &&
          typeof x.id === 'string' &&
          Number.isInteger(x.version) &&
          Number(x.version) > 0,
      )
    )
      return null;
    if (
      [s.nextAt, s.taskDue].some(
        (date) => date && !Number.isFinite(new Date(date).getTime()),
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function clearCourtDayDrafts() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(COURT_DRAFT_PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* Storage can be disabled; logging out must still succeed. */
  }
}
