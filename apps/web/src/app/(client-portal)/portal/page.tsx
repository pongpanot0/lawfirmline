'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseSummary } from '@/lib/portal-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function PortalDashboardPage() {
  const { contact, token, loading, logout } = usePortalAuth();
  const router = useRouter();
  const [cases, setCases] = useState<PortalCaseSummary[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);

  useEffect(() => {
    if (!loading && !contact) {
      router.replace('/portal/login');
    }
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token) return;
    portalApi
      .getCases(token)
      .then(setCases)
      .finally(() => setLoadingCases(false));
  }, [token]);

  if (loading || !contact) return null;

  return (
    <div className="min-h-screen w-full bg-background p-6">
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome, {contact.name}</h1>
            <p className="text-sm text-muted-foreground">{contact.client?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/portal/intake/new" className="rounded bg-blue-600 px-4 py-2 text-white">
              ส่งเรื่องใหม่
            </Link>
            <Link href="/portal/intake" className="rounded border px-4 py-2">
              เรื่องที่ส่ง
            </Link>
            <Link href="/portal/settings" className="rounded border px-4 py-2">
              ตั้งค่าการแจ้งเตือน
            </Link>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>

        {loadingCases ? (
          <p className="text-muted-foreground">Loading your cases...</p>
        ) : cases.length === 0 ? (
          <p className="text-muted-foreground">No cases to show yet.</p>
        ) : (
          <div className="space-y-3">
            {cases.map((c) => (
              <Card
                key={c.id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => router.push(`/portal/cases/${c.id}`)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.ownRef}
                      {c.courtName ? ` · ${c.courtName}` : ''}
                    </p>
                  </div>
                  <Badge>{c.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
