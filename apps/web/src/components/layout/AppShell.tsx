'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SamnuanSidebar } from './SamnuanSidebar';
import { TopNavbar } from './TopNavbar';
import { AIAssistantPanel } from '@/components/ai/AIAssistantPanel';
import { AuthUser, FirmRole } from '@lawfirm/shared';

interface AppShellProps {
  user: AuthUser;
  onLogout: () => void;
  children: React.ReactNode;
}

export function AppShell({ user, onLogout, children }: AppShellProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // /cases/:id (and its sub-routes like /cases/:id/documents) carry a case
  // context that the AI panel's "summarize" action can skip re-selecting.
  const caseIdMatch = pathname.match(/^\/cases\/([^/]+)/);
  const activeCaseId = caseIdMatch && caseIdMatch[1] !== 'new' ? caseIdMatch[1] : undefined;

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <SamnuanSidebar
        user={user}
        onLogout={onLogout}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopNavbar
          user={user}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-4 sm:pb-24 md:p-6 md:pb-24 lg:p-8 lg:pb-24 scrollbar-thin">
          {children}
        </main>
      </div>
      <AIAssistantPanel caseId={activeCaseId} />
    </div>
  );
}
