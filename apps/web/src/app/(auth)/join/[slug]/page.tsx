'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { redirectToFirmApp } from '@/lib/firm-slug';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/auth/PasswordInput';

/**
 * หน้า join แบรนด์ของสำนักงาน เช่น /join/thesiambarristers
 * สมัครเองได้จากลิงก์เลย ไม่ต้องมีรหัสคำเชิญ — เข้าเป็นบทบาทเริ่มต้น (ผู้ช่วย)
 * แล้วเจ้าของสำนักงานปรับบทบาทให้ทีหลังที่หน้า Team
 */
export default function JoinFirmPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { applySession } = useAuth();
  const [firmName, setFirmName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!params.slug) return;
    api
      .getPublicFirm(params.slug)
      .then((firm) => setFirmName(firm.name))
      .catch(() => setNotFound(true));
  }, [params.slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joining) return;
    setJoining(true);
    setError('');
    try {
      const res = await api.joinFirm(params.slug, {
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      });
      if (redirectToFirmApp(res.user, res)) return;
      applySession(res.accessToken, res.refreshToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สมัครไม่สำเร็จ กรุณาลองใหม่');
      setJoining(false);
    }
  };

  if (notFound) {
    return (
      <AuthShell title="ไม่พบสำนักงาน" description="ลิงก์อาจไม่ถูกต้อง">
        <p className="text-sm text-muted-foreground">
          ไม่พบสำนักงาน &ldquo;{params.slug}&rdquo; ในระบบ
        </p>
        <Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={firmName ? `เข้าร่วม ${firmName}` : 'เข้าร่วมสำนักงาน'}
      description="สร้างบัญชีเพื่อเข้าร่วมสำนักงาน"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="join-first-name" className="text-sm font-medium">ชื่อ</label>
            <Input id="join-first-name" required minLength={2} autoFocus autoComplete="given-name" className="mt-1 h-11" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="join-last-name" className="text-sm font-medium">นามสกุล</label>
            <Input id="join-last-name" required minLength={2} autoComplete="family-name" className="mt-1 h-11" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="join-email" className="text-sm font-medium">อีเมล</label>
          <Input id="join-email" required type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} className="mt-1 h-11" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label htmlFor="join-password" className="text-sm font-medium">รหัสผ่าน</label>
          <PasswordInput id="join-password" required minLength={6} autoComplete="new-password" aria-describedby="join-password-hint" className="mt-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <p id="join-password-hint" className="mt-1.5 text-xs text-muted-foreground">อย่างน้อย 6 ตัวอักษร</p>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={joining} className="h-11 w-full">
          {joining ? 'กำลังสมัคร…' : 'สมัครและเข้าร่วมสำนักงาน'}
        </Button>
      </form>
      <p className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">
        มีบัญชีแล้ว? <Link href="/login" className="font-medium text-primary hover:underline">เข้าสู่ระบบ</Link>
      </p>
    </AuthShell>
  );
}
