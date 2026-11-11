'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { PORTAL_NAV_ITEMS } from './PortalSidebar';
import { cn } from '@/lib/utils';

export function PortalShell({ children, hideMobileNav = false }: { children: ReactNode; hideMobileNav?: boolean }) {
  const { contact, logout } = usePortalAuth();
  const router = useRouter();
  const pathname = usePathname();
  if (!contact) return null;
  const active = (href: string) => href === '/portal' ? pathname === href : pathname.startsWith(href) || (href === '/portal/operations' && pathname.startsWith('/portal/cases/'));
  const initials = contact.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
  return <div className="samnuan-paper samnuan-workspace min-h-screen bg-background text-foreground">
    <header className="border-b bg-card print:hidden">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-8 px-4 sm:px-6">
        <Link href="/portal" className="shrink-0 font-display text-lg font-semibold text-primary">Samnuan · พอร์ทัลลูกความ</Link>
        <nav aria-label="เมนูพอร์ทัล" className="hidden flex-1 items-center gap-1 md:flex">
          {PORTAL_NAV_ITEMS.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className={cn('flex min-h-16 items-center gap-2 border-b-2 px-3 text-sm', active(href) ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground')}><Icon className="h-5 w-5" aria-hidden />{label}</Link>)}
        </nav>
        <button type="button" onClick={() => { logout(); router.replace('/portal/login'); }} title="ออกจากระบบ" className="ml-auto flex min-h-11 items-center gap-2 text-left"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">{initials}</span><span className="hidden text-sm md:block">{contact.name}<span className="block text-xs text-muted-foreground">ออกจากระบบ</span></span></button>
      </div>
    </header>
    <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 md:px-8 md:py-10 print:p-0">{children}</main>
    <nav aria-label="เมนูพอร์ทัล" className={cn("fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden print:hidden", hideMobileNav && "hidden")}>
      {PORTAL_NAV_ITEMS.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className={cn('flex min-h-16 flex-col items-center justify-center gap-1 border-t-2 px-1 text-xs', active(href) ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground')}><Icon className="h-6 w-6" aria-hidden />{label}</Link>)}
    </nav>
  </div>;
}
