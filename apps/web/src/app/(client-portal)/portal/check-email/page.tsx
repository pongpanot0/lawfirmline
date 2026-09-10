'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-0 shadow-card">
        <CardContent className="flex flex-col items-center gap-1 p-9 text-center">
          <div className="mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-[19px] font-bold">ตรวจสอบอีเมลของคุณ</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            หากอีเมลนี้ลงทะเบียนสำหรับเข้าใช้พอร์ทัลไว้แล้ว เราได้ส่งลิงก์เข้าสู่ระบบให้แล้ว
            ลิงก์จะหมดอายุใน 15 นาทีและใช้ได้เพียงครั้งเดียว
          </p>
          {devToken && (
            <div className="mb-4 w-full rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-left">
              <p className="mb-2 text-[11.5px] font-semibold text-amber-800 dark:text-amber-200">
                Dev mode — เปิดลิงก์โดยไม่ต้องรออีเมล
              </p>
              <Link
                href={`/portal/verify?token=${devToken}`}
                className={buttonVariants({ className: 'w-full' })}
              >
                เข้าพอร์ทัลเลย
              </Link>
            </div>
          )}
          <Link href="/portal/login" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
            ใช้อีเมลอื่น
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
