'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Inbox, Settings, LogOut, Briefcase, FileBarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { PortalContact } from '@/lib/portal-api';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';

export const PORTAL_NAV_ITEMS = [
  { href: '/portal', label: 'ภาพรวม', icon: LayoutDashboard },
  { href: '/portal/operations', label: 'งานดำเนินการ', icon: Briefcase },
  { href: '/portal/intake', label: 'เรื่องที่ส่ง', icon: Inbox },
  { href: '/portal/reports', label: 'รายงานประจำปี', icon: FileBarChart2 },
  { href: '/portal/settings', label: 'ตั้งค่าการแจ้งเตือน', icon: Settings },
] as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function PortalSidebar({ contact, onLogout }: { contact: PortalContact; onLogout: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="samnuan-sidebar sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex print:!hidden">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <SamnuanLogo wordmark={false} markClassName="h-[34px] w-[34px] rounded-[9px]" />
        <div>
          <p className="font-display text-lg font-semibold">Samnuan</p>
          <p className="text-xs text-sidebar-muted">Client Portal</p>
        </div>
      </div>

      <p className="px-3 pb-2 pt-4 text-xs font-medium text-sidebar-muted">เมนูหลัก</p>
      <nav className="flex flex-col gap-0.5">
        {PORTAL_NAV_ITEMS.map((item) => {
          const active = item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'samnuan-navlink flex min-h-11 items-center gap-3 px-3 py-2 text-sm font-medium',
                active ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onLogout}
        className="mt-auto flex min-h-11 items-center gap-3 rounded-lg border-t border-sidebar-border px-3 py-3 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent"
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" />
        ออกจากระบบ
      </button>

      <div className="mt-3 flex items-center gap-2.5 rounded-lg px-2 py-2">
        <Avatar fallback={initials(contact.name)} className="bg-sidebar-accent text-sidebar-foreground" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight">{contact.name}</p>
          <p className="truncate text-xs text-sidebar-muted">{contact.client?.name}</p>
        </div>
      </div>
    </aside>
  );
}
