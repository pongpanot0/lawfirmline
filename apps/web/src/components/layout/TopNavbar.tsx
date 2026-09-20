'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Menu, ChevronDown, Briefcase, ClipboardList, ListTodo, CalendarDays, Receipt, Users } from 'lucide-react';
import { AuthUser } from '@lawfirm/shared';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { useDashboardT } from '@/components/landing/LocaleProvider';

interface TopNavbarProps {
  user: AuthUser;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onMenuClick?: () => void;
}

export function TopNavbar({ user, searchQuery, onSearchChange, onMenuClick }: TopNavbarProps) {
  const router = useRouter();
  const d = useDashboardT();
  const canCreateCase = user.firmRole === 'OWNER' || user.role === 'LAWYER' || user.role === 'ADMIN';
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside or Escape closes the create menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = [
    { label: d.topbar.newIntake, href: '/intake/new', icon: ClipboardList, show: true },
    { label: d.topbar.newCase, href: '/cases/new', icon: Briefcase, show: canCreateCase },
    { label: d.topbar.newTask, href: '/todos?new=1', icon: ListTodo, show: true },
    { label: d.topbar.newEvent, href: '/court-schedule', icon: CalendarDays, show: true },
    { label: d.topbar.newExpense, href: '/expenses/new', icon: Receipt, show: true },
    { label: d.topbar.newClient, href: '/clients/new', icon: Users, show: true },
  ].filter((i) => i.show);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur-md sm:gap-4 sm:px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden"
        onClick={onMenuClick}
        aria-label={d.nav.openMenu}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="relative min-w-0 flex-1 md:max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={d.topbar.searchPlaceholder}
          className="h-9 border-transparent bg-muted/50 pl-9 focus-visible:bg-card"
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchQuery) {
              router.push(`/cases?search=${encodeURIComponent(searchQuery)}`);
            }
          }}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Link href="/todos?new=1" onClick={() => setOpen(false)} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" aria-hidden />
          <span>{d.topbar.newTask}</span>
        </Link>
        <div ref={menuRef} className="relative">
          <Button
            size="sm"
            variant="outline"
            aria-label={d.topbar.createMenu}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="hidden lg:inline">{d.topbar.createMenu}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
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
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
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
        <Link href="/settings">
          <Avatar fallback={`${user.firstName[0]}${user.lastName[0]}`} className="cursor-pointer" />
        </Link>
      </div>
    </header>
  );
}
