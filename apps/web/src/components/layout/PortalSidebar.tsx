'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Inbox, Settings, LogOut, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { PortalContact } from '@/lib/portal-api';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';

const NAV_ITEMS = [
  { href: '/portal', label: 'ภาพรวม', icon: LayoutDashboard },
  { href: '/portal/operations', label: 'งานดำเนินการ', icon: Briefcase },
  { href: '/portal/intake', label: 'เรื่องที่ส่ง', icon: Inbox },
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
    <aside className="hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <SamnuanLogo wordmark={false} markClassName="h-[34px] w-[34px] rounded-[9px]" />
        <div>
          <p className="text-[15px] font-bold leading-tight">Samnuan</p>
          <p className="text-[11px] font-medium text-muted-foreground">Client Portal</p>
        </div>
      </div>

      <p className="px-3 pb-1.5 pt-3 text-[11px] font-semibold tracking-wide text-muted-foreground">เมนูหลัก</p>
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium',
                active ? 'bg-primary/10 font-semibold text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent',
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
        className="mt-auto flex items-center gap-2.5 rounded-lg border-t border-sidebar-border px-3 pt-4 text-[13.5px] font-medium text-sidebar-foreground hover:bg-sidebar-accent"
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" />
        ออกจากระบบ
      </button>

      <div className="mt-3 flex items-center gap-2.5 rounded-lg px-2 py-2">
        <Avatar fallback={initials(contact.name)} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight">{contact.name}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{contact.client?.name}</p>
        </div>
      </div>
    </aside>
  );
}
