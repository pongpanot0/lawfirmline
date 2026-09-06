'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { portalApi, type PortalIntakeSubmissionEntry } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';

export default function MyIntakeSubmissionsPage() {
  const router = useRouter();
  const { contact, token, loading } = usePortalAuth();
  const [items, setItems] = useState<PortalIntakeSubmissionEntry[]>([]);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token) return;
    portalApi.getMyIntakeSubmissions(token).then(setItems).catch(console.error);
  }, [token]);

  if (loading || !contact) return null;

  return (
    <div className="min-h-screen w-full bg-background p-6">
      <Link href="/portal">← กลับหน้าหลัก</Link>
      <h1 className="my-4 text-xl font-semibold">เรื่องที่ส่ง</h1>
      {items.map((item) => (
        <Card key={item.id} className="mb-3">
          <CardContent className="p-4">
            <p className="font-medium">
              {item.referenceNumber} — {item.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {new Date(item.submittedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} · {item.externalStatus}
              {item.withdrawnByClient ? ' · ไม่ได้ใช้' : ''}
            </p>
          </CardContent>
        </Card>
      ))}
      {items.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีเรื่องที่ส่ง</p>}
    </div>
  );
}
