import Link from 'next/link';
import { Role } from '@lawfirm/shared';
import { RoleBadge } from './RoleBadge';

interface SidebarProps {
  user: { firstName: string; lastName: string; role: Role };
  onLogout: () => void;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
  { href: '/cases', label: 'Cases', roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
  { href: '/cases/board', label: 'Workflow Board', roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
  { href: '/calendar', label: 'Calendar', roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
  { href: '/expenses', label: 'Expenses / เบิก', roles: [Role.ADMIN, Role.LAWYER] },
  { href: '/knowledge', label: 'Knowledge Base', roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
  { href: '/admin/reimbursements', label: 'Reimbursements', roles: [Role.ADMIN] },
  { href: '/admin/users', label: 'Users', roles: [Role.ADMIN] },
  { href: '/admin/case-types', label: 'Case Types', roles: [Role.ADMIN] },
];

export function Sidebar({ user, onLogout }: SidebarProps) {
  const filtered = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-6">
        <h1 className="text-lg font-bold text-brand-700">LawFirm</h1>
        <p className="mt-1 text-xs text-slate-500">Management System</p>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {filtered.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="mb-2">
          <p className="text-sm font-medium">
            {user.firstName} {user.lastName}
          </p>
          <div className="mt-1">
            <RoleBadge role={user.role} />
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
