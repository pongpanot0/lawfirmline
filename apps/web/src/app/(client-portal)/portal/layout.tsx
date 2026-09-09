'use client';

import { PortalAuthProvider } from '@/lib/portal-auth';
import { PortalPasswordGate } from '@/components/portal/PortalPasswordGate';

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalAuthProvider>
      <PortalPasswordGate>{children}</PortalPasswordGate>
    </PortalAuthProvider>
  );
}
