import { AgendaItemKind } from '@lawfirm/shared';

/**
 * Whether an agenda item belongs to the viewer.
 *
 * An event (anything but a TASK) is always "mine" — the agenda sends a real
 * primary assignee for events now, but ownership there is informational, not
 * a claim on the item. Only a TASK carries a real single-owner assignment.
 */
export function isMineItem(
  item: { kind: AgendaItemKind; assigneeId?: string | null },
  viewerId: string | undefined,
): boolean {
  if (item.kind !== AgendaItemKind.TASK) return true;
  return !item.assigneeId || item.assigneeId === viewerId;
}
