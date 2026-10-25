'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalApi, PortalApiError } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { PortalAuthCard } from '@/components/portal/PortalAuthCard';

export default function PortalSetPasswordPage() {
  const router = useRouter();
  const { contact, token, loading, refreshContact } = usePortalAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<{ field: 'password' | 'confirm'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!contact || !token) {
      router.replace('/portal/login');
      return;
    }
    if (contact.hasPassword) {
      router.replace('/portal');
    }
  }, [loading, contact, token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setFieldError(null);
    if (password.length < 6) {
      setFieldError({ field: 'password', message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
      return;
    }
    if (password !== confirm) {
      setFieldError({ field: 'confirm', message: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' });
      return;
    }
    setSubmitting(true);
    try {
      await portalApi.setPassword(token, password);
      await refreshContact();
      router.replace('/portal');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'ตั้งรหัสผ่านไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !contact || contact.hasPassword) return null;

  const errorFor = (field: 'password' | 'confirm') => (fieldError?.field === field ? fieldError.message : '');

  return (
    <PortalAuthCard title="ตั้งรหัสผ่านสำหรับพอร์ทัล" description="ครั้งต่อไปเข้าด้วยอีเมลและรหัสผ่านได้เลย ไม่ต้องรอลิงก์ทางอีเมล">
      <form onSubmit={handleSubmit} className="space-y-4">
        {(['password', 'confirm'] as const).map((field) => (
          <div key={field}>
            <label htmlFor={`portal-${field}`} className="text-sm font-medium">
              {field === 'password' ? 'รหัสผ่านใหม่' : 'ยืนยันรหัสผ่าน'}
            </label>
            <PasswordInput
              id={`portal-${field}`}
              value={field === 'password' ? password : confirm}
              onChange={(e) => (field === 'password' ? setPassword : setConfirm)(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="mt-1"
              aria-invalid={errorFor(field) ? true : undefined}
              aria-describedby={[field === 'password' && 'portal-password-hint', errorFor(field) && `portal-${field}-error`].filter(Boolean).join(' ') || undefined}
            />
            {field === 'password' && <p id="portal-password-hint" className="mt-1.5 text-xs text-muted-foreground">อย่างน้อย 6 ตัวอักษร</p>}
            {errorFor(field) && <p id={`portal-${field}-error`} role="alert" className="mt-1.5 text-sm text-destructive">{errorFor(field)}</p>}
          </div>
        ))}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 w-full" disabled={submitting}>
          {submitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านและเข้าพอร์ทัล'}
        </Button>
      </form>
    </PortalAuthCard>
  );
}
