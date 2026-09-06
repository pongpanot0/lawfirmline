'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Scale } from 'lucide-react';
import { portalApi, PortalApiError } from '@/lib/portal-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await portalApi.requestLink(email);
      router.push('/portal/check-email');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-0 shadow-card">
        <CardContent className="p-8">
          <div className="mb-8 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">LexFlow — พอร์ทัลลูกความ</span>
          </div>
          <h2 className="mb-1 text-xl font-semibold">ตรวจสอบคดีของคุณออนไลน์</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            กรอกอีเมลที่ทนายความบันทึกไว้ ระบบจะส่งลิงก์เข้าสู่ระบบให้ — ไม่ต้องใช้รหัสผ่าน
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">อีเมล</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="mt-1"
                required
              />
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'กำลังส่งลิงก์...' : 'ส่งลิงก์เข้าสู่ระบบ'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
