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
  Gauge,
  Settings,
  Scale,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  X,
  Shield,
  Tags,
  ClipboardList,
  ListTodo,
  Timer,
  CalendarCheck,
  CalendarOff,
  Mail,
} from 'lucide-react';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher';
import { useState } from 'react';

/**
 * Day-to-day work and the settings that shape the office are different
 * errands, so the menu keeps them apart.
 */
const NAV_GROUPS = [
  { key: 'work', labelKey: 'groupWork' as const },
  { key: 'firm', labelKey: 'groupFirm' as const },
] as const;

const NAV_ITEMS = [
  { href: '/dashboard', labelKey: 'dashboard' as const, icon: LayoutDashboard, ownerOnly: false, group: 'work' },
  { href: '/operations', labelKey: 'operations' as const, icon: Gauge, ownerOnly: true, group: 'firm' },
  { href: '/my-day', labelKey: 'myDay' as const, icon: CalendarCheck, ownerOnly: false, group: 'work' },
  { href: '/todos', labelKey: 'todos' as const, icon: ListTodo, ownerOnly: false, group: 'work' },
  { href: '/intake', labelKey: 'intake' as const, icon: ClipboardList, ownerOnly: false, group: 'work' },
  { href: '/email-intake', labelKey: 'emailIntake' as const, icon: Mail, ownerOnly: false, group: 'work' },
  { href: '/cases', labelKey: 'cases' as const, icon: Briefcase, ownerOnly: false, group: 'work' },
  { href: '/clients', labelKey: 'clients' as const, icon: Users, ownerOnly: false, group: 'work' },
  { href: '/court-schedule', labelKey: 'courtSchedule' as const, icon: CalendarDays, ownerOnly: false, group: 'work' },
  { href: '/documents', labelKey: 'documents' as const, icon: FolderOpen, ownerOnly: false, group: 'work' },
  { href: '/expenses', labelKey: 'expenses' as const, icon: Receipt, ownerOnly: true, group: 'firm' },
  { href: '/reports', labelKey: 'reports' as const, icon: BarChart3, ownerOnly: true, group: 'firm' },
  { href: '/team', labelKey: 'team' as const, icon: UsersRound, ownerOnly: true, group: 'firm' },
  { href: '/admin/reimbursements', labelKey: 'reimbursements' as const, icon: Shield, ownerOnly: true, group: 'firm' },
  { href: '/admin/case-types', labelKey: 'caseTypes' as const, icon: Tags, ownerOnly: true, group: 'firm' },
  { href: '/admin/deadline-rules', labelKey: 'deadlineRules' as const, icon: Timer, ownerOnly: true, group: 'firm' },
  { href: '/admin/holidays', labelKey: 'holidays' as const, icon: CalendarOff, ownerOnly: true, group: 'firm' },
  { href: '/admin/courts', labelKey: 'courts' as const, icon: Scale, ownerOnly: true, group: 'firm' },
  { href: '/settings', labelKey: 'settings' as const, icon: Settings, ownerOnly: false, group: 'firm' },
] as const;

interface LexFlowSidebarProps {
  user: AuthUser;
  onLogout: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function LexFlowSidebar({ user, onLogout, mobileOpen = false, onMobileClose }: LexFlowSidebarProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const d = useDashboardT();
  const [collapsed, setCollapsed] = useState(false);
  const filtered = NAV_ITEMS.filter(
    (item) => !item.ownerOnly || user.firmRole === FirmRole.OWNER,
  );

  return (
    <aside
      className={cn(
        'flex h-dvh flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200',
        'fixed inset-y-0 left-0 z-50 w-72 shrink-0 md:relative md:h-full md:z-auto',
        mobileOpen ? 'translate-x-0' : 'max-md:-translate-x-full',
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
            <p className="truncate text-[10px] text-muted-foreground">{d.nav.tagline}</p>
          </div>
        )}
        <button
          type="button"
          className="ml-auto rounded-lg p-1.5 hover:bg-sidebar-accent md:hidden"
          onClick={onMobileClose}
          aria-label={d.nav.closeMenu}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3 scrollbar-thin">
        {NAV_GROUPS.map((group) => {
          const items = filtered.filter((item) => item.group === group.key);
          if (items.length === 0) return null;
          return (
            <div key={group.key} className="pb-2">
              {/*
                Day-to-day work and the settings that shape the office are
                different errands; running them together makes a lawyer read
                past court types to reach their cases.
              */}
              {!collapsed && (
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {d.nav[group.labelKey]}
                </p>
              )}
              {items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const label = d.nav[item.labelKey];
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground',
                collapsed && 'md:justify-center md:px-2',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn(collapsed && 'md:hidden')}>{label}</span>
            </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        {(!collapsed || mobileOpen) && (
          <div className="mb-2 flex justify-center px-1">
            <LanguageSwitcher />
          </div>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent',
            collapsed && 'md:justify-center md:px-2',
          )}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className={cn(collapsed && 'md:hidden')}>
            {theme === 'dark' ? d.nav.lightMode : d.nav.darkMode}
          </span>
        </button>

        <Separator className="my-2" />

        <div className={cn('flex items-center gap-3 rounded-lg px-2 py-2', collapsed && 'md:justify-center')}>
          <Avatar fallback={`${user.firstName[0]}${user.lastName[0]}`} />
          <div className={cn('min-w-0 flex-1', collapsed && 'md:hidden')}>
            <p className="truncate text-sm font-medium">{user.firstName} {user.lastName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.firmRole === FirmRole.OWNER
                ? d.team.roleOwner
                : user.firmRole === FirmRole.SENIOR_LAWYER
                  ? d.team.roleSeniorLawyer
                  : user.firmRole === FirmRole.LAWYER
                    ? d.team.roleLawyer
                    : d.team.roleAssistant}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className={cn('w-full justify-start text-muted-foreground', collapsed && 'md:hidden')}
          onClick={onLogout}
        >
          {d.nav.signOut}
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
