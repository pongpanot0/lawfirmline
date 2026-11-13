'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { signedOutUrl } from '@/lib/firm-slug';
import { NoAccess } from '@/components/ui/NoAccess';

/** The program owner's console — its own shell, outside every firm's workspace. */
export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const signingOut = useRef(false);

  // Apex has no session of its own: login hands off to the firm subdomain, so
  // without ?next= the operator lands on /dashboard instead of back here.
  useEffect(() => {
    if (!loading && !user && !signingOut.current) {
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user.isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md"><NoAccess who="ทีมผู้ดูแลระบบ Samnuan" contact={null} /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
        <span className="font-semibold">Samnuan Superadmin</span>
        <span className="text-sm text-muted-foreground">{user.email}</span>
        <button
          type="button"
          onClick={async () => {
            signingOut.current = true;
            await logout();
            window.location.assign(signedOutUrl(window.location.host, window.location.protocol));
          }}
          className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm hover:bg-accent"
        >
          <LogOut className="h-4 w-4" />ออกจากระบบ
        </button>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
