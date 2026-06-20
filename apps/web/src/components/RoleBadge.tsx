import { Role } from '@lawfirm/shared';

const roleLabels: Record<Role, string> = {
  [Role.ADMIN]: 'Admin / Managing Partner',
  [Role.LAWYER]: 'Lawyer',
  [Role.CLERK]: 'Clerk / Junior',
};

const roleColors: Record<Role, string> = {
  [Role.ADMIN]: 'bg-purple-100 text-purple-800',
  [Role.LAWYER]: 'bg-blue-100 text-blue-800',
  [Role.CLERK]: 'bg-green-100 text-green-800',
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColors[role]}`}
    >
      {roleLabels[role]}
    </span>
  );
}
