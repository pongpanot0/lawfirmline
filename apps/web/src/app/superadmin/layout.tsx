'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';

/** The program owner's console — its own shell, outside every firm's workspace. */
export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
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
        <p className="text-destructive">หน้านี้สำหรับ Superadmin (ผู้พัฒนาโปรแกรม) เท่านั้น</p>
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
          onClick={() => {
            logout();
            window.location.assign('/login');
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
