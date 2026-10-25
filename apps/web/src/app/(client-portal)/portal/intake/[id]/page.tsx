'use client';

import { RequestWorkroom } from '@/components/portal/RequestWorkroom';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { portalApi, type PortalIntakeSubmissionDetail } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalShell } from '@/components/layout/PortalShell';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Skeleton } from '@/components/ui/misc';
import { INTAKE_STATUS_VARIANT } from '@/components/portal/intake-status';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PortalIntakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { contact, token, loading } = usePortalAuth();
  const [item, setItem] = useState<PortalIntakeSubmissionDetail | null>(null);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token || !id) return;
    portalApi
      .getMyIntakeSubmission(token, id)
      .then(setItem)
      .catch(() => setError('ไม่พบเรื่องนี้ หรือคุณไม่มีสิทธิ์เข้าถึง'));
  }, [token, id]);

  const download = async (fetchBlob: () => Promise<Blob>, filename: string) => {
    setDownloadError('');
    try {
      downloadBlob(await fetchBlob(), filename);
    } catch {
      setDownloadError('ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const handleDownloadClient = (attachmentId: string, filename: string) => {
    if (!token || !id) return;
    void download(() => portalApi.downloadIntakeAttachment(token, id, attachmentId), filename);
  };

  const handleDownloadFirm = (documentId: string, filename: string) => {
    if (!token || !id) return;
    void download(() => portalApi.downloadIntakeFirmDocument(token, id, documentId), filename);
  };

  if (loading || !contact) return null;

  if (error) {
    return (
      <PortalShell>
        <BackLink />
        <div className="rounded-xl border bg-card p-6">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Link href="/portal/intake" className={buttonVariants({ variant: 'outline', className: 'mt-3' })}>
            กลับไปเรื่องที่ส่ง
          </Link>
        </div>
      </PortalShell>
    );
  }

  if (!item) {
    return (
      <PortalShell>
        <BackLink />
        <div role="status" aria-label="กำลังโหลด" className="space-y-4">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <BackLink />

      <PageHeader
        title={item.title}
        description={`${item.referenceNumber} · ส่งเมื่อ ${formatDate(item.submittedAt)}${item.clientRequestedDate ? ` · ต้องการตอบกลับภายใน ${formatDate(item.clientRequestedDate)}` : ''}${item.urgencyFlag ? ' · เร่งด่วน' : ''}`}
        actions={
          <>
            <Badge variant={INTAKE_STATUS_VARIANT[item.externalStatus] ?? 'muted'}>{item.externalStatus}</Badge>
            {item.caseId && (
              <Link href={`/portal/cases/${item.caseId}`} className={buttonVariants({ variant: 'outline' })}>
                ไปที่หน้าคดี
              </Link>
            )}
          </>
        }
      />

      {token && <RequestWorkroom id={id} token={token} />}

      {downloadError && <p role="alert" className="mb-3 text-sm text-destructive">{downloadError}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold">เอกสารที่คุณส่ง</h2>
          {item.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">คุณไม่ได้แนบไฟล์ในเรื่องนี้</p>
          ) : (
            <ul className="space-y-2">
              {item.attachments.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.filename}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-sm font-medium text-primary hover:underline"
                    onClick={() => handleDownloadClient(file.id, file.filename)}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    ดาวน์โหลด
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold">เอกสารที่สำนักงานส่งกลับ</h2>
          {item.firmDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีเอกสารที่สำนักงานส่งกลับในเรื่องนี้</p>
          ) : (
            <ul className="space-y-2">
              {item.firmDocuments.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.filename}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      เผยแพร่ {formatDate(file.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-sm font-medium text-primary hover:underline"
                    onClick={() => handleDownloadFirm(file.id, file.filename)}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    ดาวน์โหลด
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <h2 className="mb-2 text-base font-semibold">รายละเอียดที่คุณส่ง</h2>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.detail}</p>
      </Card>
    </PortalShell>
  );
}

function BackLink() {
  return (
    <Link href="/portal/intake" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      เรื่องที่ส่งทั้งหมด
    </Link>
  );
}
