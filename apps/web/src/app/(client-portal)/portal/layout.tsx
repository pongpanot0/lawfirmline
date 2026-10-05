'use client';

import { PortalAuthProvider } from '@/lib/portal-auth';
import { PortalPasswordGate } from '@/components/portal/PortalPasswordGate';

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalAuthProvider>
      <div className="samnuan-paper samnuan-workspace text-foreground"><PortalPasswordGate>{children}</PortalPasswordGate></div>
    </PortalAuthProvider>
  );
}
