'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalSidebar } from './PortalSidebar';

export function PortalShell({ children }: { children: ReactNode }) {
  const { contact, logout } = usePortalAuth();
  const router = useRouter();

  if (!contact) return null;

  const handleLogout = () => {
    logout();
    router.replace('/portal/login');
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <PortalSidebar contact={contact} onLogout={handleLogout} />
      <main className="min-w-0 flex-1 px-6 py-7 md:px-10">{children}</main>
    </div>
  );
}
