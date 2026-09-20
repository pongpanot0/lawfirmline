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
        <Link href="/login" className="mt-4 inline-block text-sm text-primary underline">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={firmName ? `เข้าร่วม ${firmName}` : 'เข้าร่วมสำนักงาน'}
      description="กรอกข้อมูลเพื่อสร้างบัญชีและเข้าร่วมสำนักงานได้เลย"
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            required
            minLength={2}
            autoFocus
            autoComplete="given-name"
            aria-label="ชื่อ"
            placeholder="ชื่อ"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          <Input
            required
            minLength={2}
            autoComplete="family-name"
            aria-label="นามสกุล"
            placeholder="นามสกุล"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>
        <Input
          required
          type="email"
          autoComplete="email"
          aria-label="อีเมล"
          placeholder="อีเมล"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          required
          type="password"
          minLength={6}
          autoComplete="new-password"
          aria-label="รหัสผ่าน"
          placeholder="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={joining} className="w-full">
          {joining ? 'กำลังสมัคร…' : 'สมัครและเข้าร่วมสำนักงาน'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/login" className="text-primary underline">
            มีบัญชีแล้ว? เข้าสู่ระบบ
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
