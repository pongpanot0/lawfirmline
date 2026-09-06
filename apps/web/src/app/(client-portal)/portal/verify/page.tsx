'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { portalApi, PortalApiError } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';
import { Card, CardContent } from '@/components/ui/card';

function PortalVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = usePortalAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('ไม่พบลิงก์เข้าสู่ระบบ กรุณาขอลิงก์ใหม่');
      return;
    }
    portalApi
      .verify(token)
      .then((res) => setSession(res.accessToken))
      .then(() => router.replace('/portal'))
      .catch((err) => {
        setError(err instanceof PortalApiError ? err.message : 'ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว');
      });
  }, [searchParams, setSession, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-0 shadow-card">
        <CardContent className="p-8 text-center">
          {error ? (
            <>
              <p className="mb-4 text-sm text-destructive">{error}</p>
              <Link href="/portal/login" className="text-sm text-primary hover:underline">
                ขอลิงก์ใหม่
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">กำลังเข้าสู่ระบบ...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PortalVerifyPage() {
  return (
    <Suspense>
      <PortalVerifyContent />
    </Suspense>
  );
}
