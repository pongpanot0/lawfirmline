'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalSidebar, PORTAL_NAV_ITEMS } from './PortalSidebar';
import { cn } from '@/lib/utils';

export function PortalShell({ children }: { children: ReactNode }) {
  const { contact, logout } = usePortalAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (!contact) return null;

  const handleLogout = () => {
    logout();
    router.replace('/portal/login');
  };

  return (
    <div className="samnuan-paper samnuan-workspace flex min-h-screen w-full bg-background text-foreground">
      <PortalSidebar contact={contact} onLogout={handleLogout} />
      <div className="min-w-0 flex-1">
        <header className="border-b bg-card px-4 pt-4 md:hidden print:hidden">
          <div className="flex items-center justify-between">
            <Link href="/portal" className="font-display text-base font-semibold text-primary">Samnuan · พอร์ทัลลูกค้า</Link>
            <button type="button" onClick={handleLogout} className="min-h-11 shrink-0 px-2 text-xs text-muted-foreground">ออกจากระบบ</button>
          </div>
          <nav aria-label="เมนูพอร์ทัล" className="mt-3 flex flex-wrap gap-1 pb-2">
            {PORTAL_NAV_ITEMS.map((item) => {
              const active = item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href} href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 shrink-0 items-center rounded-md px-3 py-2 text-sm font-medium',
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="px-4 py-6 sm:px-6 md:px-8 md:py-8 print:p-0"><div className="samnuan-page">{children}</div></main>
      </div>
    </div>
  );
}
