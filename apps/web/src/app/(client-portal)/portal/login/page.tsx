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
        <CardContent className="p-9">
          <div className="mb-7 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="h-4 w-4" />
            </div>
            <span className="text-base font-extrabold">LexFlow — พอร์ทัลลูกความ</span>
          </div>
          <h1 className="mb-1.5 text-[19px] font-bold">ตรวจสอบคดีของคุณออนไลน์</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            กรอกอีเมลที่ทนายความบันทึกไว้ให้กับบริษัทของท่าน ระบบจะส่งลิงก์เข้าสู่ระบบให้ —
            ไม่ต้องตั้งรหัสผ่าน
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12.5px] font-semibold">อีเมล</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                ใช้อีเมลเดียวกับที่ทนายความของท่านบันทึกไว้ในระบบ
              </p>
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'กำลังส่งลิงก์...' : 'ส่งลิงก์เข้าสู่ระบบ'}
            </Button>
          </form>
          <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
            ยังไม่เคยได้รับคำเชิญ?{' '}
            <span className="font-semibold text-primary">ติดต่อทนายความของท่าน</span> เพื่อขอเปิดใช้งานพอร์ทัล
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
