import { bangkokDayToIso } from './case-create.ts';

/**
 * The API acts on the *presence* of `limitationDeadline` (re-syncs the reminder, resetting sent reminders)
 * and of `clients` (rebuilds every row), so the overview sends them only when the user changed them.
 */
export function limitationPatch(formDay: string, storedDay: string): { limitationDeadline?: string | null } {
  if (formDay === storedDay) return {};
  return { limitationDeadline: formDay ? bangkokDayToIso(formDay) : null };
}

export function dedupeClientIds(ids: string[], primaryClientId: string): string[] {
  return [...new Set(ids.filter((id) => id && id !== primaryClientId))];
}

export function additionalClientsPatch(
  pickedIds: string[],
  current: Array<{ clientId: string; note?: string | null }>,
  primaryClientId: string,
): { clients?: Array<{ clientId: string; note?: string }> } {
  const ids = dedupeClientIds(pickedIds, primaryClientId);
  const same = ids.length === current.length && ids.every((id) => current.some((row) => row.clientId === id));
  if (same) return {};
  return {
    clients: ids.map((clientId) => {
      const note = current.find((row) => row.clientId === clientId)?.note;
      return note ? { clientId, note } : { clientId };
    }),
  };
}
