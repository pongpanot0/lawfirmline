'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  CalendarDays,
  FolderOpen,
  Receipt,
  BarChart3,
  UsersRound,
  Settings,
  Bell,
  Scale,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  X,
  Shield,
  Tags,
} from 'lucide-react';
import { Role } from '@lawfirm/shared';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/misc';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
  { href: '/cases', label: 'Cases', icon: Briefcase, roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
  { href: '/clients', label: 'Clients', icon: Users, roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
  { href: '/court-schedule', label: 'Court Schedule', icon: CalendarDays, roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
  { href: '/documents', label: 'Documents', icon: FolderOpen, roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
  { href: '/expenses', label: 'Expenses', icon: Receipt, roles: [Role.ADMIN, Role.LAWYER] },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: [Role.ADMIN, Role.LAWYER] },
  { href: '/team', label: 'Team Management', icon: UsersRound, roles: [Role.ADMIN] },
  { href: '/admin/reimbursements', label: 'Reimbursements', icon: Shield, roles: [Role.ADMIN] },
  { href: '/admin/case-types', label: 'Case Types', icon: Tags, roles: [Role.ADMIN] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
];

interface LexFlowSidebarProps {
  user: { firstName: string; lastName: string; role: Role; email: string };
  onLogout: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function LexFlowSidebar({ user, onLogout, mobileOpen = false, onMobileClose }: LexFlowSidebarProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const filtered = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200',
        'fixed inset-y-0 left-0 z-50 w-72 md:relative md:z-auto md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        collapsed ? 'md:w-[68px]' : 'md:w-60',
      )}
    >
      <div className={cn('flex h-14 items-center gap-2 border-b border-sidebar-border px-4', collapsed && 'md:justify-center md:px-2')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Scale className="h-4 w-4" />
        </div>
        {(!collapsed || mobileOpen) && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-tight text-foreground">LexFlow</p>
            <p className="truncate text-[10px] text-muted-foreground">Legal Case Management</p>
          </div>
        )}
        <button
          type="button"
          className="ml-auto rounded-lg p-1.5 hover:bg-sidebar-accent md:hidden"
          onClick={onMobileClose}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3 scrollbar-thin">
        {filtered.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground',
                collapsed && 'md:justify-center md:px-2',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn(collapsed && 'md:hidden')}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent',
            collapsed && 'md:justify-center md:px-2',
          )}
        >
          <Bell className="h-4 w-4" />
          <span className={cn(collapsed && 'md:hidden')}>Notifications</span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent',
            collapsed && 'md:justify-center md:px-2',
          )}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className={cn(collapsed && 'md:hidden')}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>

        <Separator className="my-2" />

        <div className={cn('flex items-center gap-3 rounded-lg px-2 py-2', collapsed && 'md:justify-center')}>
          <Avatar fallback={`${user.firstName[0]}${user.lastName[0]}`} />
          <div className={cn('min-w-0 flex-1', collapsed && 'md:hidden')}>
            <p className="truncate text-sm font-medium">{user.firstName} {user.lastName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.role}</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className={cn('w-full justify-start text-muted-foreground', collapsed && 'md:hidden')}
          onClick={onLogout}
        >
          Sign out
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="mx-auto mt-1 hidden md:flex"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}
