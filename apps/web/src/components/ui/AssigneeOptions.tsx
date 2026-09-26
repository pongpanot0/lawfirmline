import type { LeaveFlag } from '@/lib/leave-flags';

/**
 * `<option>`s for an assignee `<select>`, with anyone flagged for leave on
 * the picker's date shown inline (`Name — flag.label`).
 */
export function AssigneeOptions({
  users,
  flags,
  nameOf = (u) => `${u.firstName} ${u.lastName}`,
}: {
  users: { id: string; firstName: string; lastName?: string }[];
  flags: Map<string, LeaveFlag>;
  nameOf?: (u: { id: string; firstName: string; lastName?: string }) => string;
}) {
  return (
    <>
      {users.map((u) => {
        const flag = flags.get(u.id);
        const name = nameOf(u);
        return (
          <option key={u.id} value={u.id}>
            {flag ? `${name} — ${flag.label}` : name}
          </option>
        );
      })}
    </>
  );
}
