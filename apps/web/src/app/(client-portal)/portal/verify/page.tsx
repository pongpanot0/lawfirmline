'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertTriangle } from 'lucide-react';
import { portalApi, PortalApiError } from '@/lib/portal-api';
import { portalHomeFor, usePortalAuth } from '@/lib/portal-auth';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

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
      .then((contact) => router.replace(portalHomeFor(contact)))
      .catch((err) => {
        setError(err instanceof PortalApiError ? err.message : 'ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว');
      });
  }, [searchParams, setSession, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-0 shadow-card">
        <CardContent className="flex flex-col items-center gap-1 p-9 text-center">
          {error ? (
            <>
              <div className="mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-warning/15 text-warning">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h1 className="text-[19px] font-bold">ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว</h1>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{error}</p>
              <Link href="/portal/login" className={buttonVariants({ variant: 'default', className: 'w-full' })}>
                ขอลิงก์ใหม่
              </Link>
            </>
          ) : (
            <>
              <div className="mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary/10 text-primary">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <h1 className="text-[19px] font-bold">กำลังเข้าสู่ระบบ...</h1>
              <p className="text-sm text-muted-foreground">กรุณารอสักครู่ ระบบกำลังตรวจสอบลิงก์ของท่าน</p>
            </>
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
