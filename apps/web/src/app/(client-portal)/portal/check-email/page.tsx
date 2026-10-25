'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PortalAuthCard } from '@/components/portal/PortalAuthCard';
import { buttonVariants } from '@/components/ui/button';

const DEV_LINK_TOKEN_KEY = 'portalDevLinkToken';

export default function PortalCheckEmailPage() {
  const [devToken, setDevToken] = useState<string | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem(DEV_LINK_TOKEN_KEY);
    if (token) {
      setDevToken(token);
      sessionStorage.removeItem(DEV_LINK_TOKEN_KEY);
    }
  }, []);

  return (
    <PortalAuthCard
      title="ตรวจสอบอีเมลของคุณ"
      description="ถ้าอีเมลนี้เปิดใช้พอร์ทัลไว้ เราส่งลิงก์เข้าสู่ระบบให้แล้ว ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน 15 นาที"
    >
      {devToken && (
        <div className="mb-4 rounded-lg border border-dashed border-warning/50 bg-warning/5 p-3">
          <p className="mb-2 text-xs font-semibold text-warning">Dev mode: เปิดลิงก์โดยไม่ต้องรออีเมล</p>
          <Link href={`/portal/verify?token=${devToken}`} className={buttonVariants({ className: 'w-full' })}>
            เข้าพอร์ทัล
          </Link>
        </div>
      )}
      <Link href="/portal/login" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
        ใช้อีเมลอื่น
      </Link>
    </PortalAuthCard>
  );
}
