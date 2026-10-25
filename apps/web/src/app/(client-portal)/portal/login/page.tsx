'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApi, PortalApiError } from '@/lib/portal-api';
import { portalHomeFor, usePortalAuth } from '@/lib/portal-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { PortalAuthCard } from '@/components/portal/PortalAuthCard';

const DEV_LINK_TOKEN_KEY = 'portalDevLinkToken';

export default function PortalLoginPage() {
  const router = useRouter();
  const { setSession } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailError('');
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
    setError('');
    if (!email) {
      setEmailError('กรอกอีเมลก่อนขอลิงก์');
      document.getElementById('portal-email')?.focus();
      return;
    }
    setEmailError('');
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
    <PortalAuthCard title="เข้าสู่ระบบพอร์ทัล" description="ใช้อีเมลและรหัสผ่าน หรือขอลิงก์เข้าสู่ระบบทางอีเมล">
      <form onSubmit={handlePasswordLogin} className="space-y-4">
        <div>
          <label htmlFor="portal-email" className="text-sm font-medium">อีเมล</label>
          <Input
            type="email"
            id="portal-email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
            placeholder="you@company.com"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="mt-1 h-11"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? 'portal-email-error' : undefined}
          />
          {emailError && <p id="portal-email-error" role="alert" className="mt-1.5 text-sm text-destructive">{emailError}</p>}
        </div>
        <div>
          <label htmlFor="portal-password" className="text-sm font-medium">รหัสผ่าน</label>
          <PasswordInput
            id="portal-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="current-password"
            className="mt-1"
          />
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 w-full" disabled={submitting}>
          {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3" aria-hidden>
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">หรือ</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        disabled={sendingLink || submitting}
        onClick={handleMagicLink}
        aria-describedby="portal-link-hint"
      >
        {sendingLink ? 'กำลังส่งลิงก์...' : 'ส่งลิงก์เข้าสู่ระบบทางอีเมล'}
      </Button>
      <p id="portal-link-hint" className="mt-2 text-center text-xs text-muted-foreground">
        ใช้เมื่อเข้าครั้งแรก ยังไม่มีรหัสผ่าน หรือลืมรหัสผ่าน
      </p>
    </PortalAuthCard>
  );
}
