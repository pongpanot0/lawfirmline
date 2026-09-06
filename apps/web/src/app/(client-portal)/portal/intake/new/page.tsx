'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, FileText, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
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
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  const addFile = (file: File) => setFiles((prev) => [...prev, file]);
  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await portalApi.submitIntake(
        token,
        { title, detail, clientRequestedDate: clientRequestedDate || undefined, urgencyFlag },
        files,
      );
      setReferenceNumber(result.referenceNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งเรื่องไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !contact) return null;

  if (referenceNumber) {
    return (
      <PortalShell>
        <Card className="mx-auto max-w-md p-9 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="mb-1.5 text-[19px] font-bold">ส่งเรื่องสำเร็จ</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            เลขอ้างอิงของท่านคือ <b className="text-foreground">{referenceNumber}</b>
            <br />
            ทีมกฎหมายจะตรวจสอบและติดต่อกลับภายใน 1 วันทำการ
          </p>
          <Link href="/portal/intake" className={buttonVariants({ className: 'w-full' })}>
            ดูรายการเรื่องที่ส่ง
          </Link>
        </Card>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <Link href="/portal/intake" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
        <ArrowLeft className="h-3.5 w-3.5" />
        เรื่องที่ส่งทั้งหมด
      </Link>

      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">ส่งเรื่องใหม่</h1>
      <p className="mb-6 text-[13.5px] text-muted-foreground">
        อธิบายเรื่องที่ต้องการปรึกษาโดยย่อ ทีมกฎหมายจะติดต่อกลับภายใน 1 วันทำการ
      </p>

      <Card className="p-6">
        <div className="mb-4">
          <label className="mb-1.5 block text-[12.5px] font-semibold">หัวข้อ</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ข้อพิพาทค่าจ้างก่อสร้างค้างจ่าย"
            required
          />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-[12.5px] font-semibold">รายละเอียด</label>
          <Textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={6}
            placeholder="อธิบายเหตุการณ์ คู่กรณี และสิ่งที่ต้องการให้ช่วยดำเนินการ"
            required
          />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-[12.5px] font-semibold">วันที่ต้องการดำเนินการ (ถ้ามี)</label>
          <Input
            type="date"
            className="max-w-[220px]"
            value={clientRequestedDate}
            onChange={(e) => setClientRequestedDate(e.target.value)}
          />
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            ระบุเฉพาะกรณีมีกำหนดเวลาที่ต้องดำเนินการ เช่น วันครบกำหนดฟ้อง
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-[12.5px] font-semibold">ไฟล์แนบ (ถ้ามี)</label>
          <DocumentDropZone
            onFile={addFile}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            label="ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์"
            hint="PDF, JPG, PNG, DOC — ไฟล์ละไม่เกิน 20 MB"
          />
          {files.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5">
                  <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label="ลบไฟล์"
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="mb-1 flex items-center gap-2.5 text-[13px] font-medium">
          <Checkbox checked={urgencyFlag} onChange={(e) => setUrgencyFlag(e.target.checked)} />
          เรื่องเร่งด่วน — ต้องการให้ทีมกฎหมายติดต่อกลับโดยเร็ว
        </label>

        {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">{error}</p>}

        <div className="mt-5 flex justify-end gap-2.5">
          <Link href="/portal/intake" className={buttonVariants({ variant: 'outline' })}>
            ยกเลิก
          </Link>
          <Button onClick={handleSubmit} disabled={submitting || !title || !detail}>
            {submitting ? 'กำลังส่ง...' : 'ส่งเรื่อง'}
          </Button>
        </div>
      </Card>
    </PortalShell>
  );
}
