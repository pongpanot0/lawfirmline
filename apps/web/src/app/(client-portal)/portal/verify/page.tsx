'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { portalApi, PortalApiError } from '@/lib/portal-api';
import { portalHomeFor, usePortalAuth } from '@/lib/portal-auth';
import { PortalAuthCard } from '@/components/portal/PortalAuthCard';
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

  if (error) {
    return (
      <PortalAuthCard title="ลิงก์นี้ใช้ไม่ได้แล้ว" description={<p role="alert">{error}</p>}>
        <Link href="/portal/login" className={buttonVariants({ className: 'w-full' })}>
          ขอลิงก์ใหม่
        </Link>
      </PortalAuthCard>
    );
  }

  return (
    <PortalAuthCard title="กำลังเข้าสู่ระบบ">
      <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        กำลังตรวจสอบลิงก์ของคุณ
      </p>
    </PortalAuthCard>
  );
}

export default function PortalVerifyPage() {
  return (
    <Suspense>
      <PortalVerifyContent />
    </Suspense>
  );
}
