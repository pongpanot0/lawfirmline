'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/layout/AppShell';
import { useDashboardT } from '@/components/landing/LocaleProvider';

function DashboardLoading() {
  const d = useDashboardT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{d.common.loadingApp}</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const external = user?.firmRole === 'EXTERNAL';
  const signOut = () => {
    logout();
    window.location.assign('/login');
  };

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    // A freelancer has exactly one page; the API refuses everything else anyway.
    if (!loading && external && pathname !== '/work') router.replace('/work');
  }, [user, loading, router, external, pathname]);

  if (!loading && user && external) {
    if (pathname !== '/work') return <DashboardLoading />;
    return (
      <div className="samnuan-workspace min-h-screen bg-background">
        <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
          <span className="font-semibold">{user.firmName}</span>
          <span className="text-sm text-muted-foreground">· ผู้รับงานภายนอก</span>
          <button type="button" onClick={signOut} className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm hover:bg-accent">
            <LogOut className="h-4 w-4" />ออกจากระบบ
          </button>
        </header>
        <main className="px-4 py-6"><div className="samnuan-page">{children}</div></main>
      </div>
    );
  }

  return (
    <>
      {loading || !user ? (
        <DashboardLoading />
      ) : (
        <AppShell
          user={user}
          onLogout={signOut}
        >
          {children}
        </AppShell>
      )}
    </>
  );
}
