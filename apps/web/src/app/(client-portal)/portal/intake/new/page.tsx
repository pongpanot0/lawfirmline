'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ChevronDown, FileText, X } from 'lucide-react';
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
  const [result, setResult] = useState<{ referenceNumber: string; id: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  const addFile = (file: File) => setFiles((prev) => [...prev, file]);
  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const cancel = () => {
    if ((title.trim() || detail.trim() || clientRequestedDate || keyDate || keyDateLabel.trim() || urgencyFlag || files.length) && !window.confirm('ทิ้งข้อมูลที่กรอกและกลับไปยังเรื่องที่ส่ง?')) return;
    router.push('/portal/intake');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!title.trim() || !detail.trim()) {
      setError(`ใส่${!title.trim() && !detail.trim() ? 'หัวข้อและรายละเอียด' : !title.trim() ? 'หัวข้อ' : 'รายละเอียด'}ของเรื่องก่อนส่ง`);
      return;
    }
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
      setResult({ referenceNumber: submitted.referenceNumber, id: submitted.id });
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
        <div className="mx-auto max-w-2xl space-y-5">
          <section className="rounded-xl border border-l-4 border-amber-200 border-l-[var(--color-brass)] bg-[var(--operations-highlight)] p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-primary" aria-hidden />
            <h1 role="status" className="font-display text-3xl font-semibold">ส่งเรื่องแล้ว</h1>
            <p className="mt-2 text-muted-foreground">ทนายจะติดต่อกลับภายใน 1 วันทำการ</p>
            <div className="mt-6 rounded-lg border bg-card p-4 text-left"><p className="text-sm text-muted-foreground">เลขอ้างอิง</p><p className="break-all text-xl font-semibold">{result.referenceNumber}</p></div>
          </section>
          <Card className="p-5"><h2 className="font-display text-xl font-semibold">สถานะเรื่องของคุณ</h2><ol className="mt-4 flex justify-between gap-2 border-t pt-5 text-center text-sm"><li>✓ ส่งแล้ว</li><li>สำนักงานตรวจ<br />กำลังรอ</li><li>รับดำเนินการ<br />ยังไม่เริ่ม</li></ol><p className="mt-5 rounded-lg bg-muted p-3 text-sm">สำนักงานจะตรวจเรื่องและแจ้งเมื่อรับดำเนินการ</p></Card>
          <Card className="p-5"><h2 className="font-display text-xl font-semibold">สรุปเรื่องที่ส่ง</h2><p className="mt-4 border-t pt-4">หัวข้อ: {title}</p><p className="mt-3">ไฟล์แนบ: {files.length} ไฟล์</p></Card>
          <Link href={`/portal/intake/${result.id}`} className={buttonVariants({ className: 'w-full' })}>ดูเรื่องที่ส่ง</Link><p className="text-center text-xs text-muted-foreground">กดเพื่อดูสถานะและคุยกับทนายในเรื่องนี้</p>
          <Link href="/portal" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>กลับหน้าภาพรวม</Link><p className="text-center text-xs text-muted-foreground">ไปหน้าสรุปคดีของคุณ</p>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell hideMobileNav>
      <button type="button" onClick={cancel} className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        เรื่องที่ส่งทั้งหมด
      </button>

      <PageHeader title="ส่งเรื่องใหม่" description="เล่าเรื่องที่ต้องการปรึกษาโดยย่อ ทีมกฎหมายจะติดต่อกลับภายใน 1 วันทำการ" />

      <Card className="mb-40 max-w-3xl p-4 sm:p-6 md:mb-0">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <TextField
            label="หัวข้อเรื่อง"
            error={error && !title.trim() ? 'ใส่หัวข้อเรื่องก่อนส่ง' : undefined}
            hint="สรุปสั้น ๆ ให้ทนายเห็นทันทีว่าเรื่องอะไร"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ข้อพิพาทค่าจ้างก่อสร้างค้างจ่าย"
            required
          />

          <TextareaField
            label="รายละเอียด"
            error={error && !detail.trim() ? 'ใส่รายละเอียดก่อนส่ง' : undefined}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={6}
            hint="เล่าเหตุการณ์ คู่กรณี และสิ่งที่ต้องการให้ช่วย"
            required
          />

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

          <details className="group rounded-xl border p-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden"><span>เพิ่มรายละเอียด (ไม่บังคับ)<span className="block text-sm font-normal text-muted-foreground">วันสำคัญ และเรื่องเร่งด่วน</span></span><ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden /></summary><div className="mt-4 space-y-5">          <fieldset className="space-y-1.5">
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

          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <Checkbox checked={urgencyFlag} onChange={(e) => setUrgencyFlag(e.target.checked)} />
            เรื่องเร่งด่วน ต้องการให้ติดต่อกลับโดยเร็ว
          </label>

</div></details>
          <p className="rounded-lg border border-amber-200 bg-[var(--operations-highlight)] p-4 text-sm text-muted-foreground">ข้อมูลและเอกสารทั้งหมดจะถูกเก็บเป็นความลับ</p>

          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <div className="fixed inset-x-0 bottom-0 z-30 space-y-2 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:p-0">
            <Button className="w-full" type="submit" disabled={submitting} title="กดเพื่อส่งเรื่องนี้ให้สำนักงานตรวจ">
              {submitting ? 'กำลังส่ง...' : 'ส่งเรื่องถึงสำนักงาน'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">สำนักงานจะติดต่อกลับภายใน 1 วันทำการ</p>
            <button type="button" onClick={cancel} className="min-h-11 w-full text-sm font-medium text-muted-foreground hover:underline">ยกเลิก</button>
          </div>
        </form>
      </Card>
    </PortalShell>
  );
}
