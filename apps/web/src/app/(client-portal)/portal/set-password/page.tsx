'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { portalApi, PortalApiError } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export default function PortalSetPasswordPage() {
  const router = useRouter();
  const { contact, token, loading, refreshContact } = usePortalAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
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
    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (password !== confirm) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-0 shadow-card">
        <CardContent className="p-9">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="mb-1.5 text-[19px] font-bold">ตั้งรหัสผ่านสำหรับพอร์ทัล</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            ครั้งถัดไปเข้าด้วยอีเมลและรหัสผ่านได้เลย ไม่ต้องรอลิงก์จากอีเมลทุกครั้ง
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold">รหัสผ่านใหม่</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold">ยืนยันรหัสผ่าน</label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านและเข้าพอร์ทัล'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
