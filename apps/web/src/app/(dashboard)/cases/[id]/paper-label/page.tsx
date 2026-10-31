'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, type CaseDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button, buttonVariants } from '@/components/ui/button';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageLoading } from '@/components/ui/misc';
import './paper-label.css';

export default function PaperLabelPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<{ legalCase: CaseDetail; qr: string } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setData(null);
    setError('');
    void api.getCase(token, id).then(async (legalCase) => {
      if (!legalCase.folderId) throw new Error('คดีนี้ยังไม่มีรหัสแฟ้ม');
      const QRCode = await import('qrcode');
      const qr = await QRCode.toDataURL(`${window.location.origin}/f/${legalCase.folderId}`, {
        width: 512, margin: 4, errorCorrectionLevel: 'M',
      });
      if (!cancelled) setData({ legalCase, qr });
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'สร้างฉลากไม่สำเร็จ');
    });
    return () => { cancelled = true; };
  }, [token, id, revision]);

  if (error) return <LoadFailed message={error} onRetry={() => setRevision((value) => value + 1)} />;
  if (!data) return <PageLoading title="กำลังสร้างฉลาก" lines={1} />;
  const { legalCase, qr } = data;
  const label = (
    <div className="mx-auto w-full max-w-sm break-words rounded-lg border border-black bg-white p-6 text-center text-black">
      {/* A data URL keeps printing independent of image optimization or another request. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} width={256} height={256} alt={`QR เบิกคืนสำนวน ${legalCase.folderId}`} className="mx-auto h-auto w-64 max-w-full" />
      <p className="text-xl font-semibold">{legalCase.folderId}</p>
      <p className="mt-2 font-semibold">เลขที่คดี {legalCase.ownRef}</p>
      {legalCase.blackCaseNumber && <p className="text-sm">คดีดำ {legalCase.blackCaseNumber}</p>}
      {legalCase.redCaseNumber && <p className="text-sm">คดีแดง {legalCase.redCaseNumber}</p>}
      <p className="mt-2 line-clamp-2 text-sm">{legalCase.title}</p>
    </div>
  );
  return (
    <div>
      <PageHeader title="ฉลากสำนวนกระดาษ" description="ติดหน้าปกแฟ้ม แล้วสแกนเพื่อเบิกคืน"
        actions={<>
          <Link href={`/cases/${id}`} className={buttonVariants({ variant: 'outline' })}>กลับหน้าคดี</Link>
          <Button onClick={() => window.print()}>พิมพ์ฉลาก</Button>
        </>} />
      {label}
      {createPortal(<div id="paper-file-print">{label}</div>, document.body)}
    </div>
  );
}
