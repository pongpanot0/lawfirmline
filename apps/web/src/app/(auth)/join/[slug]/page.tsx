'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * หน้า join แบรนด์ของสำนักงาน เช่น /join/thesiambarristers
 * พนักงานที่ได้รับ "รหัสคำเชิญ" (invite token) จากเจ้าของสำนักงาน
 * กรอกที่นี่ แล้วไปกรอกชื่อ/รหัสผ่านต่อใน flow /invite เดิม
 */
export default function JoinFirmPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [firmName, setFirmName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!params.slug) return;
    api
      .getPublicFirm(params.slug)
      .then((firm) => setFirmName(firm.name))
      .catch(() => setNotFound(true));
  }, [params.slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.trim();
    if (!token || checking) return;
    setChecking(true);
    setError('');
    try {
      await api.getInvitation(token); // ตรวจก่อนพาไป จะได้ error ชัดตรงนี้
      router.push(`/invite/${encodeURIComponent(token)}`);
    } catch {
      setError('รหัสคำเชิญไม่ถูกต้องหรือหมดอายุ — ติดต่อเจ้าของสำนักงานเพื่อขอคำเชิญใหม่');
      setChecking(false);
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
      description="สำหรับพนักงานที่ได้รับรหัสคำเชิญจากเจ้าของสำนักงาน"
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="join-code" className="text-sm font-medium">
            รหัสคำเชิญ (Invite code)
          </label>
          <Input
            id="join-code"
            required
            autoFocus
            placeholder="วางรหัสจากอีเมล/ข้อความคำเชิญ"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={checking || !code.trim()} className="w-full">
          {checking ? 'กำลังตรวจสอบ…' : 'ดำเนินการต่อ'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          ได้รับคำเชิญเป็นลิงก์? กดลิงก์นั้นได้เลย ไม่ต้องกรอกที่นี่ ·{' '}
          <Link href="/login" className="text-primary underline">
            มีบัญชีแล้ว? เข้าสู่ระบบ
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
