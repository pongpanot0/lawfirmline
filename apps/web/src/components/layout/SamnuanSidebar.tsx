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
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  X,
  ListTodo,
  Mail,
  type LucideIcon,
  Sparkles, BookOpen, Workflow } from 'lucide-react';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { cn } from '@/lib/utils';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';
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
  { href: '/dashboard', labelKey: 'dashboard' as const, icon: LayoutDashboard, ownerOnly: false, group: 'work', children: [] as const },
  { href: '/operations', labelKey: 'operations' as const, icon: Gauge, ownerOnly: true, group: 'firm', children: [] as const },
  { href: '/todos', labelKey: 'todos' as const, icon: ListTodo, ownerOnly: false, group: 'work', children: [] as const },
  {
    href: '/cases',
    labelKey: 'cases' as const,
    icon: Briefcase,
    ownerOnly: false,
    group: 'work',
    children: [
      { href: '/email-intake', labelKey: 'emailIntake' as const, icon: Mail, ownerOnly: false },
    ],
  },
  { href: '/clients', labelKey: 'clients' as const, icon: Users, ownerOnly: false, group: 'work', children: [] as const },
  { href: '/court-schedule', labelKey: 'courtSchedule' as const, icon: CalendarDays, ownerOnly: false, group: 'work', children: [] as const },
  { href: '/documents', labelKey: 'documents' as const, icon: FolderOpen, ownerOnly: false, group: 'work', children: [] as const },
  {
    href: '/expenses',
    labelKey: 'expenses' as const,
    icon: Receipt,
    ownerOnly: false,
    group: 'firm',
    children: [
      { href: '/invoices', labelKey: 'invoices' as const, icon: Receipt, ownerOnly: false },
      { href: '/reports', labelKey: 'reports' as const, icon: BarChart3, ownerOnly: true },
    ],
  },
  { href: '/ai-usage', labelKey: 'aiUsage' as const, icon: Sparkles, ownerOnly: true, group: 'firm', children: [] as const },
  { href: '/sops', labelKey: 'sops' as const, icon: BookOpen, ownerOnly: false, group: 'firm', children: [] as const },
  { href: '/playbooks', labelKey: 'playbooks' as const, icon: Workflow, ownerOnly: false, group: 'firm', children: [] as const },
  { href: '/team', labelKey: 'team' as const, icon: UsersRound, ownerOnly: true, group: 'firm', children: [] as const },
  { href: '/settings', labelKey: 'settings' as const, icon: Settings, ownerOnly: false, group: 'firm', children: [] as const },
] as const;

interface SamnuanSidebarProps {
  user: AuthUser;
  onLogout: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function SamnuanSidebar({ user, onLogout, mobileOpen = false, onMobileClose }: SamnuanSidebarProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const d = useDashboardT();
  const [collapsed, setCollapsed] = useState(false);
  const links: NavItem[] = NAV_ITEMS.flatMap(item => [
    { ...item, children: [] },
    ...item.children.map(child => ({ ...child, group: item.group, children: [] })),
  ]);
  const filtered = links.filter(
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
        <SamnuanLogo wordmark={false} markClassName="h-8 w-8" />
        {(!collapsed || mobileOpen) && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-tight text-foreground">Samnuan</p>
            <p className="truncate text-[10px] text-muted-foreground">{d.nav.tagline}</p>
          </div>
        )}
        <button
          type="button"
          className="ml-auto flex size-11 items-center justify-center rounded-lg hover:bg-sidebar-accent md:hidden"
          onClick={onMobileClose}
          aria-label={d.nav.closeMenu}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav aria-label={d.nav.groupWork} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3 scrollbar-thin">
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
              {(!collapsed || mobileOpen) && (
                <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {d.nav[group.labelKey]}
                </p>
              )}
              {items.map((item) => (
                <NavItemRow
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  collapsed={collapsed && !mobileOpen}
                  onNavigate={onMobileClose}
                  labels={d.nav}
                />
              ))}
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
          aria-label={collapsed ? d.nav.openMenu : d.nav.closeMenu}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}

type NavDict = ReturnType<typeof useDashboardT>['nav'];

interface NavChild {
  href: string;
  labelKey: keyof NavDict;
  icon: LucideIcon;
  ownerOnly: boolean;
}

interface NavItem extends NavChild {
  group: string;
  children: readonly NavChild[];
}

function NavItemRow({
  item,
  pathname,
  collapsed,
  onNavigate,
  labels,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  labels: NavDict;
}) {
  const isRouteActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // Office settings pages (/admin/*) are reached from Settings, so they
  // light up that entry rather than none.
  const active =
    isRouteActive(item.href) ||
    (item.href === '/cases' && pathname.startsWith('/intake')) ||
    (item.href === '/settings' && pathname.startsWith('/admin/'));
  const Icon = item.icon;
  const label = labels[item.labelKey];

  const linkClass = (isActive: boolean) =>
    cn(
      'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground',
      collapsed && 'md:justify-center md:px-2',
    );

  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} aria-label={label} title={collapsed ? label : undefined} className={linkClass(active)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className={cn(collapsed && 'md:hidden')}>{label}</span>
    </Link>
  );
}
