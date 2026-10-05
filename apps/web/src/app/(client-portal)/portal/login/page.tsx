'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';
import { portalApi, PortalApiError } from '@/lib/portal-api';
import { portalHomeFor, usePortalAuth } from '@/lib/portal-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

const DEV_LINK_TOKEN_KEY = 'portalDevLinkToken';

export default function PortalLoginPage() {
  const router = useRouter();
  const { setSession } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await portalApi.loginWithPassword(email, password);
      const contact = await setSession(res.accessToken);
      router.replace(portalHomeFor(contact));
    } catch (err) {
      setError(
        err instanceof PortalApiError
          ? err.message === 'Invalid credentials'
            ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
            : err.message
          : 'เกิดข้อผิดพลาด กรุณาลองใหม่',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError('กรุณากรอกอีเมลก่อน');
      return;
    }
    setError('');
    setSendingLink(true);
    try {
      const result = await portalApi.requestLink(email);
      if (typeof window !== 'undefined') {
        if (result.linkToken) {
          sessionStorage.setItem(DEV_LINK_TOKEN_KEY, result.linkToken);
        } else {
          sessionStorage.removeItem(DEV_LINK_TOKEN_KEY);
        }
      }
      router.push('/portal/check-email');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSendingLink(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-4 sm:p-8">
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <SamnuanLogo />
            <span className="text-sm text-muted-foreground">พอร์ทัลลูกความ</span>
          </div>
          <h1 className="mb-2 text-2xl font-semibold">เข้าสู่ระบบพอร์ทัล</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            มีรหัสผ่านแล้วใช้ด้านล่างได้เลย — ยังไม่มีหรือลืมรหัส ให้ขอลิงก์ทางอีเมล
          </p>
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label htmlFor="portal-email" className="mb-2 block text-sm font-medium">อีเมล</label>
              <Input
                type="email"
                id="portal-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label htmlFor="portal-password" className="mb-2 block text-sm font-medium">รหัสผ่าน</label>
              <Input
                type="password"
                id="portal-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร"
                required
                minLength={6}
                autoComplete="current-password"
              />
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">หรือ</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={sendingLink || submitting}
            onClick={handleMagicLink}
          >
            {sendingLink ? 'กำลังส่งลิงก์...' : 'ส่งลิงก์เข้าสู่ระบบทางอีเมล'}
          </Button>
          <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
            ใช้สำหรับเข้าครั้งแรก ตั้งรหัสผ่าน หรือเมื่อลืมรหัส
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
