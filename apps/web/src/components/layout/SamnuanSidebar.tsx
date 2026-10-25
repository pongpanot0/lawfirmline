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
  PanelLeftClose,
  PanelLeftOpen,
  X,
  ListTodo,
  Mail,
  Search,
  CalendarOff,
  GitFork,
  type LucideIcon,
  Sparkles, BookOpen, Flag } from 'lucide-react';
import { AuthUser, hasFirmCapability, type FirmCapability } from '@lawfirm/shared';
import { cn } from '@/lib/utils';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';
import { useDashboardT } from '@/components/landing/LocaleProvider';
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
  { href: '/operations', labelKey: 'operations' as const, icon: Gauge, group: 'work', children: [] as const },
  { href: '/dashboard', labelKey: 'dashboard' as const, icon: LayoutDashboard, group: 'work', children: [] as const },
  { href: '/todos', labelKey: 'todos' as const, icon: ListTodo, group: 'work', children: [] as const },
  {
    href: '/cases',
    labelKey: 'cases' as const,
    icon: Briefcase,
    group: 'work',
    children: [
      { href: '/email-intake', labelKey: 'emailIntake' as const, icon: Mail },
      { href: '/email-search', labelKey: 'emailSearch' as const, icon: Search },
    ],
  },
  { href: '/clients', labelKey: 'clients' as const, icon: Users, group: 'work', children: [] as const },
  { href: '/workflows', labelKey: 'workflows' as const, icon: GitFork, group: 'work', children: [] as const },

  { href: '/court-schedule', labelKey: 'courtSchedule' as const, icon: CalendarDays, group: 'work', children: [] as const },
  { href: '/leaves', labelKey: 'leaves' as const, icon: CalendarOff, group: 'work', children: [] as const },
  { href: '/documents', labelKey: 'documents' as const, icon: FolderOpen, group: 'work', children: [] as const },
  { href: '/getting-started', labelKey: 'gettingStarted' as const, icon: Flag, capability: 'manageFirmContent' as const, group: 'firm', children: [] as const },
  {
    href: '/expenses',
    labelKey: 'expenses' as const,
    icon: Receipt,
    group: 'firm',
    children: [
      { href: '/invoices', labelKey: 'invoices' as const, icon: Receipt },
      { href: '/reports', labelKey: 'reports' as const, icon: BarChart3, capability: 'viewFirmReports' as const },
    ],
  },
  { href: '/ai-usage', labelKey: 'aiUsage' as const, icon: Sparkles, capability: 'viewFirmReports' as const, group: 'firm', children: [] as const },
  { href: '/sops', labelKey: 'sops' as const, icon: BookOpen, group: 'firm', children: [] as const },
  { href: '/team', labelKey: 'team' as const, icon: UsersRound, capability: 'inviteMembers' as const, group: 'firm', children: [] as const },
  { href: '/settings', labelKey: 'settings' as const, icon: Settings, group: 'firm', children: [] as const },
] as const;

interface SamnuanSidebarProps {
  user: AuthUser;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function SamnuanSidebar({ user, mobileOpen = false, onMobileClose }: SamnuanSidebarProps) {
  const pathname = usePathname();
  const d = useDashboardT();
  const [collapsed, setCollapsed] = useState(false);
  const links: NavItem[] = NAV_ITEMS.flatMap(item => [
    { ...item, children: [] },
    ...item.children.map(child => ({ ...child, group: item.group, children: [], isChild: true })),
  ]);
  const filtered = links.filter(
    (item) => (!item.capability || hasFirmCapability(user.firmRole, item.capability))
      && !(item.href === '/dashboard' && hasFirmCapability(user.firmRole, 'runOperations')),
  );

  return (
    <aside
      className={cn(
        'samnuan-sidebar flex h-dvh flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200',
        'fixed inset-y-0 left-0 z-50 w-72 shrink-0 md:relative md:h-full md:z-auto',
        mobileOpen ? 'translate-x-0' : 'max-md:-translate-x-full',
        collapsed ? 'md:w-[68px]' : 'md:w-60',
      )}
    >
      <div className={cn('flex h-16 items-center gap-3 border-b border-sidebar-border px-4', collapsed && 'md:justify-center md:px-2')}>
        <SamnuanLogo wordmark={false} markClassName="h-8 w-8" />
        {(!collapsed || mobileOpen) && (
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold text-sidebar-foreground">Samnuan</p>
            <p className="truncate text-xs text-sidebar-muted">{d.nav.tagline}</p>
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
                <p className="px-3 pb-1.5 pt-3 text-xs font-medium text-sidebar-muted">
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

      {/* Account, language, theme and sign-out live in the top bar's account menu,
          so the rail holds navigation only and every item fits without scrolling. */}
      <div className="hidden border-t border-sidebar-border p-2 md:block">
        <button
          type="button"
          className={cn(
            'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-foreground focus-visible:ring-inset',
            collapsed && 'justify-center px-2',
          )}
          aria-label={collapsed ? d.nav.expandMenu : d.nav.collapseMenu}
          title={collapsed ? d.nav.expandMenu : undefined}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
          {!collapsed && <span>{d.nav.collapseMenu}</span>}
        </button>
      </div>
    </aside>
  );
}

type NavDict = ReturnType<typeof useDashboardT>['nav'];

interface NavChild {
  href: string;
  labelKey: keyof NavDict;
  icon: LucideIcon;
  capability?: FirmCapability;
}

interface NavItem extends NavChild {
  group: string;
  children: readonly NavChild[];
  /** A sub-page of the item above it (e-mail intake under cases): drawn indented so it reads as part of that item. */
  isChild?: boolean;
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
      'samnuan-navlink flex min-h-11 items-center gap-3 px-3 py-2 text-sm md:min-h-9 md:py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-foreground focus-visible:ring-inset',
      isActive
        ? 'bg-sidebar-accent text-sidebar-foreground'
        : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
      item.isChild && !collapsed && 'pl-10 font-normal',
      collapsed && 'md:justify-center md:px-2',
    );

  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} aria-label={label} title={collapsed ? label : undefined} className={linkClass(active)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className={cn(collapsed && 'md:hidden')}>{label}</span>
    </Link>
  );
}
