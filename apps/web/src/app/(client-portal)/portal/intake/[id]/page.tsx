'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, FileText, Paperclip } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { portalApi, type PortalIntakeSubmissionDetail } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalShell } from '@/components/layout/PortalShell';
import { formatDate } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'muted' | 'destructive'> = {
  สำนักงานรับเรื่องแล้ว: 'muted',
  รอตกลงขอบเขต: 'warning',
  รับดำเนินการ: 'success',
  ไม่รับดำเนินการ: 'destructive',
  ให้คำปรึกษาเรียบร้อยแล้ว: 'muted',
  ส่งแล้ว: 'muted',
};

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

  const handleDownloadClient = async (attachmentId: string, filename: string) => {
    if (!token || !id) return;
    const blob = await portalApi.downloadIntakeAttachment(token, id, attachmentId);
    downloadBlob(blob, filename);
  };

  const handleDownloadFirm = async (documentId: string, filename: string) => {
    if (!token || !id) return;
    const blob = await portalApi.downloadIntakeFirmDocument(token, id, documentId);
    downloadBlob(blob, filename);
  };

  if (loading || !contact) return null;

  if (error) {
    return (
      <PortalShell>
        <p className="text-sm text-destructive">{error}</p>
        <Link href="/portal/intake" className={buttonVariants({ variant: 'outline', className: 'mt-4' })}>
          กลับไปเรื่องที่ส่ง
        </Link>
      </PortalShell>
    );
  }

  if (!item) {
    return (
      <PortalShell>
        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <Link
        href="/portal/intake"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        เรื่องที่ส่งทั้งหมด
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[12px] font-bold tracking-wide text-primary">{item.referenceNumber}</p>
          <h1 className="mb-1 text-2xl font-extrabold tracking-tight">{item.title}</h1>
          <p className="text-[13.5px] text-muted-foreground">
            ส่งเมื่อ {formatDate(item.submittedAt)}
            {item.clientRequestedDate ? ` · ต้องการตอบกลับภายใน ${formatDate(item.clientRequestedDate)}` : ''}
            {item.urgencyFlag ? ' · เร่งด่วน' : ''}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[item.externalStatus] ?? 'muted'} className="h-fit px-3.5 py-1.5 text-[13px]">
          {item.externalStatus}
        </Badge>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            เอกสารที่คุณส่ง
          </h2>
          {item.attachments.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">ไม่มีไฟล์แนบจากฝั่งคุณ</p>
          ) : (
            <ul className="space-y-2">
              {item.attachments.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{file.filename}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary"
                    onClick={() => handleDownloadClient(file.id, file.filename)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    ดาวน์โหลด
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
            <FileText className="h-4 w-4 text-muted-foreground" />
            เอกสารที่สำนักงานส่งกลับ
          </h2>
          {item.firmDocuments.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              ยังไม่มีเอกสารที่สำนักงานเผยแพร่ให้คุณในเรื่องนี้
            </p>
          ) : (
            <ul className="space-y-2">
              {item.firmDocuments.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{file.filename}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      เผยแพร่ {formatDate(file.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary"
                    onClick={() => handleDownloadFirm(file.id, file.filename)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    ดาวน์โหลด
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <h2 className="mb-2 text-[14px] font-bold">รายละเอียดที่ส่งมา</h2>
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground/90">{item.detail}</p>
      </Card>
    </PortalShell>
  );
}
