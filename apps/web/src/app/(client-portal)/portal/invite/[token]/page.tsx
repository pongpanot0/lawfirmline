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
      .catch((err) => setError(err instanceof PortalApiError ? err.message : 'ไม่สามารถโหลดคำเชิญได้'));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError('');
    try {
      const res = await portalApi.acceptInvite(token);
      const contact = await setSession(res.accessToken);
      router.replace(portalHomeFor(contact));
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'ไม่สามารถยืนยันคำเชิญได้');
      setAccepting(false);
    }
  };

  if (error && !invite) {
    return (
      <PortalAuthCard title="คำเชิญนี้ใช้ไม่ได้" description={<p role="alert">{error}</p>}>
        <Link href="/portal/login" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
          ไปหน้าเข้าสู่ระบบ
        </Link>
      </PortalAuthCard>
    );
  }

  if (!invite) {
    return (
      <PortalAuthCard title="คำเชิญเข้าพอร์ทัลลูกค้า">
        <p role="status" className="mt-2 text-sm text-muted-foreground">กำลังโหลดคำเชิญ...</p>
      </PortalAuthCard>
    );
  }

  return (
    <PortalAuthCard title="คำเชิญเข้าพอร์ทัลลูกค้า" description="สำนักงานกฎหมายของคุณเปิดพอร์ทัลให้ติดตามคดี เอกสาร และข้อความได้ที่นี่">
      <dl className="mb-5 space-y-3 rounded-lg border border-border p-4">
        <div>
          <dt className="text-sm text-muted-foreground">บริษัท / ลูกค้า</dt>
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
