'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, FileText, X } from 'lucide-react';
import { TextField, TextareaField } from '@/components/ui/form-fields';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card } from '@/components/ui/card';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { Checkbox } from '@/components/ui/checkbox';
import { Button, buttonVariants } from '@/components/ui/button';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { portalApi } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalShell } from '@/components/layout/PortalShell';

export default function NewIntakePage() {
  const router = useRouter();
  const { contact, token, loading } = usePortalAuth();
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [clientRequestedDate, setClientRequestedDate] = useState('');
  const [urgencyFlag, setUrgencyFlag] = useState(false);
  const [keyDate, setKeyDate] = useState('');
  const [keyDateLabel, setKeyDateLabel] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ referenceNumber: string; caseId: string; caseRef: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  const addFile = (file: File) => setFiles((prev) => [...prev, file]);
  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !title || !detail) return;
    setSubmitting(true);
    setError('');
    try {
      const submitted = await portalApi.submitIntake(
        token,
        {
          title,
          detail,
          clientRequestedDate: clientRequestedDate || undefined,
          urgencyFlag,
          keyDate: keyDate || undefined,
          keyDateLabel: keyDateLabel || undefined,
        },
        files,
      );
      setResult({ referenceNumber: submitted.referenceNumber, caseId: submitted.caseId, caseRef: submitted.caseRef });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งเรื่องไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !contact) return null;

  if (result) {
    return (
      <PortalShell>
        <Card className="mx-auto max-w-md p-9 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-8 w-8 text-success" aria-hidden />
          <h1 role="status" className="mb-1.5 text-xl font-semibold">ส่งคำขอแล้ว — เปิดเป็นคดี {result.caseRef}</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            เลขอ้างอิงของท่านคือ <b className="text-foreground">{result.referenceNumber}</b>
            <br />
            ทีมกฎหมายจะตรวจสอบและติดต่อกลับภายใน 1 วันทำการ
          </p>
          <Link href={`/portal/cases/${result.caseId}`} className={buttonVariants({ className: 'w-full' })}>
            ไปที่หน้าคดี
          </Link>
          <Link href="/portal/intake" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
            ดูรายการเรื่องที่ส่ง
          </Link>
        </Card>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <Link href="/portal/intake" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        เรื่องที่ส่งทั้งหมด
      </Link>

      <PageHeader title="ส่งเรื่องใหม่" description="เล่าเรื่องที่ต้องการปรึกษาโดยย่อ ทีมกฎหมายจะติดต่อกลับภายใน 1 วันทำการ" />

      <Card className="max-w-3xl p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <TextField
            label="หัวข้อ"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ข้อพิพาทค่าจ้างก่อสร้างค้างจ่าย"
            required
          />

          <TextareaField
            label="รายละเอียด"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={6}
            hint="เล่าเหตุการณ์ คู่กรณี และสิ่งที่ต้องการให้ช่วย"
            required
          />

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">วันที่ต้องการให้ดำเนินการ (ถ้ามี)</legend>
            <ThaiDateInput className="max-w-[260px]" value={clientRequestedDate} onChange={setClientRequestedDate} />
            <p className="text-xs text-muted-foreground">เช่น วันครบกำหนดฟ้อง</p>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">วันสำคัญ (ถ้ามี)</legend>
            <ThaiDateInput className="max-w-[260px]" value={keyDate} onChange={setKeyDate} />
            <TextField
              label="ชื่อวันสำคัญ"
              value={keyDateLabel}
              onChange={(e) => setKeyDateLabel(e.target.value)}
              placeholder="เช่น วันครบกำหนดฟ้อง"
              containerClassName="max-w-md pt-2"
            />
            <p className="text-xs text-muted-foreground">ทนายความจะยืนยันวันนี้อีกครั้งก่อนลงปฏิทิน</p>
          </fieldset>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">ไฟล์แนบ (ถ้ามี)</p>
            <DocumentDropZone
              onFile={addFile}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              label="ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์"
              hint="PDF, JPG, PNG, DOC ไฟล์ละไม่เกิน 20 MB"
            />
            {files.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {files.map((file, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card py-1 pl-3 pr-1">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={`เอาไฟล์ ${file.name} ออก`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <Checkbox checked={urgencyFlag} onChange={(e) => setUrgencyFlag(e.target.checked)} />
            เรื่องเร่งด่วน ต้องการให้ติดต่อกลับโดยเร็ว
          </label>

          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap justify-end gap-2.5 border-t pt-4">
            <Link href="/portal/intake" className={buttonVariants({ variant: 'ghost' })}>
              ยกเลิก
            </Link>
            <Button type="submit" disabled={submitting || !title || !detail}>
              {submitting ? 'กำลังส่ง...' : 'ส่งเรื่องถึงสำนักงาน'}
            </Button>
          </div>
        </form>
      </Card>
    </PortalShell>
  );
}
