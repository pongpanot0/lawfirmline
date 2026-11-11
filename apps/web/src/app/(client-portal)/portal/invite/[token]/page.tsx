'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { portalApi, PortalApiError, PortalInvitePreview } from '@/lib/portal-api';
import { portalHomeFor, usePortalAuth } from '@/lib/portal-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { PortalAuthCard } from '@/components/portal/PortalAuthCard';
import { formatDate } from '@/lib/utils';

export default function PortalInviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { setSession } = usePortalAuth();
  const [invite, setInvite] = useState<PortalInvitePreview | null>(null);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    portalApi
      .getInvite(token)
      .then(setInvite)
      .catch((err) => setError(err instanceof PortalApiError ? err.message : 'โหลดคำเชิญไม่สำเร็จ ลองเปิดลิงก์อีกครั้ง'));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError('');
    try {
      const res = await portalApi.acceptInvite(token);
      const contact = await setSession(res.accessToken);
      router.replace(portalHomeFor(contact));
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'ยืนยันคำเชิญไม่สำเร็จ ลองใหม่อีกครั้ง');
      setAccepting(false);
    }
  };

  if (error && !invite) {
    return (
      <PortalAuthCard title="คำเชิญนี้ใช้ไม่ได้" description={<p role="alert">{error}</p>}>
        <p className="mb-3 text-sm text-muted-foreground">ถ้าเคยเปิดใช้พอร์ทัลแล้ว เข้าสู่ระบบหรือขอลิงก์ทางอีเมลได้เลย ถ้ายังไม่เคย ติดต่อสำนักงานเพื่อขอคำเชิญใหม่</p>
        <Link href="/portal/login" className={buttonVariants({ className: 'w-full' })}>
          เข้าสู่ระบบหรือขอลิงก์ทางอีเมล
        </Link>
      </PortalAuthCard>
    );
  }

  if (!invite) {
    return (
      <PortalAuthCard title="คำเชิญเข้าพอร์ทัลลูกความ">
        <p role="status" className="mt-2 text-sm text-muted-foreground">กำลังโหลดคำเชิญ...</p>
      </PortalAuthCard>
    );
  }

  return (
    <PortalAuthCard title="คำเชิญเข้าพอร์ทัลลูกความ" description="สำนักงานกฎหมายของคุณเปิดพอร์ทัลให้ติดตามคดี เอกสาร และข้อความได้ที่นี่">
      <dl className="mb-5 space-y-3 rounded-lg border border-border p-4">
        <div>
          <dt className="text-sm text-muted-foreground">บริษัท / ลูกความ</dt>
          <dd className="font-semibold">{invite.clientName}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">ผู้ติดต่อ</dt>
          <dd className="break-words font-semibold">
            {invite.contactName}
            {invite.contactEmail ? ` · ${invite.contactEmail}` : ''}
          </dd>
        </div>
      </dl>

      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        ยืนยันแล้วตั้งรหัสผ่านของคุณเอง ครั้งต่อไปเข้าด้วยอีเมลและรหัสผ่านได้เลย
      </p>

      {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <Button className="h-11 w-full" disabled={accepting} onClick={handleAccept}>
        {accepting ? 'กำลังยืนยัน...' : 'ยืนยันและเข้าใช้พอร์ทัล'}
      </Button>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        คำเชิญนี้สำหรับ {invite.contactEmail} เท่านั้น หมดอายุ {formatDate(invite.expiresAt)}
      </p>
    </PortalAuthCard>
  );
}
