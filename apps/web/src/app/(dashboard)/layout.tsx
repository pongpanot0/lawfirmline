'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/layout/AppShell';
import { TrialBanner } from '@/components/saas/TrialBanner';
import { SubscriptionGate } from '@/components/saas/SubscriptionGate';
import { LocaleProvider } from '@/components/landing/LocaleProvider';
import { useDashboardT } from '@/components/landing/LocaleProvider';

function DashboardLoading() {
  const d = useDashboardT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{d.common.loadingLexFlow}</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  return (
    <LocaleProvider>
      {loading || !user ? (
        <DashboardLoading />
      ) : (
        <AppShell
          user={user}
          onLogout={() => {
            logout();
            router.push('/login');
          }}
        >
          <TrialBanner />
          <SubscriptionGate>{children}</SubscriptionGate>
        </AppShell>
      )}
    </LocaleProvider>
  );
}
