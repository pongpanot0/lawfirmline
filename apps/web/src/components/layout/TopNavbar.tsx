'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, Plus, Menu, ChevronDown, Briefcase, ListTodo, CalendarDays, Receipt, Users, HelpCircle, Settings, Moon, Sun, LogOut, type LucideIcon } from 'lucide-react';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { restartTour } from '@/components/onboarding/use-product-tour';
import { hasTour } from '@/components/onboarding/PageTour';
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher';
import { useTheme } from '@/lib/theme';

interface TopNavbarProps {
  user: AuthUser;
  onLogout: () => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onMenuClick?: () => void;
}

export function TopNavbar({ user, onLogout, searchQuery, onSearchChange, onMenuClick }: TopNavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const casePath = pathname.match(/^\/cases\/[^/]+$/);
  const taskHref = casePath && pathname !== '/cases/new' ? `${pathname}?tab=tasks&newTask=1` : '/todos?new=1';
  const d = useDashboardT();
  const canCreateCase = user.firmRole === 'OWNER' || user.role === 'LAWYER' || user.role === 'ADMIN';
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, open, () => setOpen(false));

  const items = [
    { label: d.topbar.newCase, href: '/cases/new', icon: Briefcase, show: canCreateCase },
    { label: d.topbar.newTask, href: taskHref, icon: ListTodo, show: true },
    { label: d.topbar.newEvent, href: '/court-schedule', icon: CalendarDays, show: true },
    { label: d.topbar.newExpense, href: '/expenses/new', icon: Receipt, show: true },
    { label: d.topbar.newClient, href: '/clients/new', icon: Users, show: true },
  ].filter((i) => i.show);

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 sm:h-16 sm:flex-nowrap sm:gap-4 sm:px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden"
        onClick={onMenuClick}
        aria-label={d.nav.openMenu}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="relative order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto md:max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={d.topbar.searchPlaceholder}
          aria-label={d.topbar.searchPlaceholder}
          className="bg-background pl-9 focus-visible:bg-card"
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchQuery) {
              router.push(`/cases?search=${encodeURIComponent(searchQuery)}`);
            }
          }}
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {/* One outlined split button: quick "new task" plus the other create actions.
            Outlined so the page's own primary stays the only filled button on screen. */}
        <div ref={menuRef} className="relative flex">
          <Link href={taskHref} onClick={() => setOpen(false)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-l-lg border border-r-0 border-input bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus className="h-4 w-4" aria-hidden />
            <span>{d.topbar.newTask}</span>
          </Link>
          <button
            type="button"
            aria-label={d.topbar.createMenu}
            title={d.topbar.createMenu}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-lg border border-input bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-border bg-card p-1 shadow-lg"
            >
              {items.map((item) => (
                <button
                  key={item.href}
                  role="menuitem"
                  type="button"
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {hasTour(pathname) && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="ดูคำแนะนำการใช้งานอีกครั้ง"
            title="ดูคำแนะนำการใช้งานอีกครั้ง"
            onClick={restartTour}
          >
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
          </Button>
        )}
        <AccountMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}

/** Click outside or Escape closes a top-bar menu. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
}

/** Who is signed in, and the per-person choices: settings, language, theme, sign out. */
function AccountMenu({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const d = useDashboardT();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const role = {
    [FirmRole.OWNER]: d.team.roleOwner,
    [FirmRole.SENIOR_LAWYER]: d.team.roleSeniorLawyer,
    [FirmRole.OFFICE_MANAGER]: d.team.roleOfficeManager,
    [FirmRole.LAWYER]: d.team.roleLawyer,
    [FirmRole.ASSISTANT]: d.team.roleAssistant,
    [FirmRole.EXTERNAL]: d.team.roleExternal,
  }[user.firmRole as FirmRole] ?? d.team.roleAssistant;
  const row = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const Item = ({ icon: Icon, children, ...props }: { icon: LucideIcon; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" role="menuitem" className={row} {...props}>
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      {children}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-tour="settings-link"
        aria-label={d.nav.accountMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar fallback={`${user.firstName[0]}${user.lastName[0]}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-64 rounded-xl border border-border bg-card p-1 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{user.firstName} {user.lastName}</p>
            <p className="truncate text-xs text-muted-foreground">{role}</p>
          </div>
          <div className="my-1 border-t border-border" />
          <Link href="/settings" role="menuitem" className={row} onClick={() => setOpen(false)}>
            <Settings className="h-4 w-4 text-muted-foreground" aria-hidden />
            {d.nav.settings}
          </Link>
          <Item icon={theme === 'dark' ? Sun : Moon} onClick={toggleTheme}>
            {theme === 'dark' ? d.nav.lightMode : d.nav.darkMode}
          </Item>
          <div className="flex min-h-11 items-center justify-between gap-3 px-3">
            <span className="text-sm">{d.nav.language}</span>
            <LanguageSwitcher />
          </div>
          <div className="my-1 border-t border-border" />
          <Item icon={LogOut} onClick={() => { setOpen(false); onLogout(); }}>
            {d.nav.signOut}
          </Item>
        </div>
      )}
    </div>
  );
}
