// Allocate from the complete roster, never from the filtered event list.
const PALETTE = ['#2563eb', '#d97706', '#059669', '#9333ea', '#e11d48', '#0891b2', '#65a30d', '#c026d3', '#ea580c', '#4f46e5', '#0d9488', '#a16207'];
export function calendarPersonColors(ids: string[]): Map<string, string> {
  return new Map([...new Set(ids)].sort().map((id, index) => [id, PALETTE[index] ?? `hsl(${(index * 137.508) % 360} 65% 45%)`]));
}
export function eventPersonId(event: { assigneeId?: string | null; case?: { leadLawyer?: { id: string } | null } | null }): string | null {
  return event.assigneeId ?? event.case?.leadLawyer?.id ?? null;
}
/** Every person on the event — its assignee rows, or the case's lead lawyer. */
export function eventPeopleIds(event: {
  assignees?: { userId: string }[];
  assigneeId?: string | null;
  case?: { leadLawyer?: { id: string } | null } | null;
}): string[] {
  if (event.assignees?.length) return event.assignees.map((a) => a.userId);
  if (event.assigneeId) return [event.assigneeId];
  return event.case?.leadLawyer ? [event.case.leadLawyer.id] : [];
}
