'use client';

import { Role } from '@lawfirm/shared';

const LABELS: Record<Role, string> = {
  [Role.ADMIN]: 'Admin',
  [Role.LAWYER]: 'Lawyer',
};

const COLORS: Record<Role, string> = {
  [Role.ADMIN]: 'bg-purple-100 text-purple-800',
  [Role.LAWYER]: 'bg-blue-100 text-blue-800',
};

export function RoleBadge({ role }: { role: Role | string }) {
  const r = role as Role;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[r] ?? 'bg-slate-100 text-slate-700'}`}>
      {LABELS[r] ?? role}
    </span>
  );
}
