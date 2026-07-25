import { PortalAuthProvider } from '@/lib/portal-auth';

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalAuthProvider>{children}</PortalAuthProvider>;
}
