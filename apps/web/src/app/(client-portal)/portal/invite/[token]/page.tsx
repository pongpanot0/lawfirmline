'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { portalApi, PortalApiError, PortalInvitePreview } from '@/lib/portal-api';
import { portalHomeFor, usePortalAuth } from '@/lib/portal-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-0 shadow-card">
        <CardContent className="flex flex-col items-center gap-1 p-9 text-center">
          <div className="mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-6 w-6" />
          </div>

          {error && !invite ? (
            <>
              <h1 className="text-[19px] font-bold">คำเชิญนี้ไม่ถูกต้อง</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
            </>
          ) : invite ? (
            <>
              <h1 className="text-[19px] font-bold">คุณได้รับเชิญเข้าใช้พอร์ทัลลูกความ</h1>
              <p className="mb-4 text-sm text-muted-foreground">สำนักงาน Samnuan เปิดใช้งานพอร์ทัลสำหรับติดตามคดีให้กับ</p>

              <div className="mb-5 w-full rounded-lg border border-dashed border-border bg-accent/50 p-4 text-left">
                <p className="mb-1 text-[12px] font-bold tracking-wide text-muted-foreground">บริษัท / ลูกความ</p>
                <p className="mb-2.5 text-[14.5px] font-bold">{invite.clientName}</p>
                <p className="mb-1 text-[12px] font-bold tracking-wide text-muted-foreground">ผู้ติดต่อ</p>
                <p className="text-[14.5px] font-bold">
                  {invite.contactName}
                  {invite.contactEmail ? ` · ${invite.contactEmail}` : ''}
                </p>
              </div>

              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                กดยืนยันเพื่อเปิดใช้งานพอร์ทัล จากนั้นตั้งรหัสผ่านของคุณเอง
                ครั้งถัดไปเข้าด้วยอีเมลและรหัสผ่านได้เลย (หรือขอลิงก์ทางอีเมลเมื่อลืมรหัส)
              </p>

              {error && <p className="mb-4 w-full rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">{error}</p>}

              <Button className="w-full" disabled={accepting} onClick={handleAccept}>
                {accepting ? 'กำลังยืนยัน...' : 'ยืนยันและเข้าใช้งานพอร์ทัล'}
              </Button>

              <p className="mt-4 text-[11.5px] text-muted-foreground">
                คำเชิญนี้ออกให้เฉพาะ {invite.contactEmail} และหมดอายุ {formatDate(invite.expiresAt)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
