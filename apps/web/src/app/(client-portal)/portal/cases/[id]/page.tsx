'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, Download, FileText, Plus } from 'lucide-react';
import { DocumentCategory } from '@lawfirm/shared';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseDetail, CaseMessageEntry, PortalApiError } from '@/lib/portal-api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { SelectField, TextField, TextareaField } from '@/components/ui/form-fields';
import { PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { Button, buttonVariants } from '@/components/ui/button';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { PortalShell } from '@/components/layout/PortalShell';
import { StageTrack } from '@/components/portal/StageTrack';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { getCaseStatusDisplay } from '@/lib/case-status';
import { documentCategoryLabel } from '@/lib/stage-labels';
import { useDashboardT } from '@/components/landing/LocaleProvider';

// เฉพาะหมวดที่ลูกความเลือกได้ — คำฟ้อง/คำสั่งศาล/เอกสารภายในเป็นของสำนักงานเท่านั้น
const CLIENT_DOCUMENT_CATEGORIES = [
  DocumentCategory.EVIDENCE,
  DocumentCategory.CONTRACT,
  DocumentCategory.CORRESPONDENCE,
  DocumentCategory.IDENTITY,
  DocumentCategory.MEDICAL,
  DocumentCategory.FINANCIAL,
  DocumentCategory.OTHER,
] as const;

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'ร่าง',
  SENT: 'ส่งแล้ว',
  PAID: 'ชำระแล้ว',
};

export default function PortalCaseDetailPage() {
  const d = useDashboardT();
  const { id } = useParams<{ id: string }>();
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<PortalCaseDetail | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [messages, setMessages] = useState<CaseMessageEntry[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocType, setUploadDocType] = useState<string>('OTHER');
  const [uploadNote, setUploadNote] = useState('');
  const [uploadKeyDate, setUploadKeyDate] = useState('');
  const [uploadKeyDateLabel, setUploadKeyDateLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  const loadDetail = () => {
    if (!token || !id) return;
    portalApi
      .getCase(token, id)
      .then((row) => { setDetail(row); setDetailFailed(false); })
      .catch(() => setDetailFailed(true));
  };

  useEffect(() => { loadDetail(); }, [token, id]);

  const loadMessages = () => {
    if (!token || !id) return;
    portalApi
      .getCaseMessages(token, id)
      .then(setMessages)
      .catch(console.error);
  };

  useEffect(() => { loadMessages(); }, [token, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendMessage = async () => {
    if (!token || !id || !messageBody.trim()) return;
    setSendingMessage(true);
    setMessageError('');
    try {
      await portalApi.sendCaseMessage(token, id, messageBody.trim());
      setMessageBody('');
      loadMessages();
    } catch (e) {
      setMessageError(e instanceof PortalApiError ? e.message : 'ส่งข้อความไม่สำเร็จ');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleDownload = async (documentId: string, filename: string) => {
    if (!token) return;
    setDownloadError('');
    try {
      const blob = await portalApi.downloadDocument(token, documentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError('ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const handleDownloadClientUpload = async (documentId: string, filename: string) => {
    if (!token || !id) return;
    setUploadError('');
    try {
      const blob = await portalApi.downloadClientUpload(token, id, documentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setUploadError('ดาวน์โหลดไม่สำเร็จ');
    }
  };

  const handleUploadDocument = async () => {
    if (!token || !id || !uploadFile) return;
    setUploading(true);
    setUploadError('');
    try {
      await portalApi.uploadPortalCaseDocument(
        token,
        id,
        {
          docType: uploadDocType || undefined,
          note: uploadNote || undefined,
          keyDate: uploadKeyDate || undefined,
          keyDateLabel: uploadKeyDateLabel || undefined,
        },
        uploadFile,
      );
      setUploadFile(null);
      setUploadDocType('OTHER');
      setUploadNote('');
      setUploadKeyDate('');
      setUploadKeyDateLabel('');
      loadDetail();
    } catch (e) {
      setUploadError(e instanceof PortalApiError ? e.message : 'อัปโหลดเอกสารไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  if (loading || !contact) return null;

  if (!detail) {
    return (
      <PortalShell>
        <BackLink />
        {detailFailed ? (
          <LoadFailed message="เปิดคดีนี้ไม่สำเร็จ" onRetry={() => { setDetailFailed(false); loadDetail(); }} />
        ) : (
          <PageLoading title="กำลังโหลดคดี" lines={2} />
        )}
      </PortalShell>
    );
  }

  const status = getCaseStatusDisplay(detail.status, d.caseStatus);
  const fileRow = 'flex min-h-11 w-full items-center gap-3 border-b border-border py-2.5 text-left last:border-0 hover:text-primary';

  return (
    <PortalShell>
      <BackLink />

      <PageHeader
        title={detail.title}
        description={`เลขที่อ้างอิง ${detail.ownRef}${detail.courtName ? ` · ${detail.courtName}` : ''} · เปิดคดีเมื่อ ${formatDate(detail.openedAt)}`}
        actions={
          <>
            <Badge variant={status.variant}>{status.label}</Badge>
            {detail.portalRequest && (
              <Link href={`/portal/intake/${detail.portalRequest.id}`} className={buttonVariants({ variant: 'ghost' })}>
                คำขอ {detail.portalRequest.referenceNumber}
              </Link>
            )}
            <Link href="/portal/intake/new" className={buttonVariants({ variant: 'outline' })}>
              <Plus className="h-4 w-4" aria-hidden />
              ส่งเรื่องใหม่
            </Link>
          </>
        }
      />

      <StageTrack stage={detail.stage} status={detail.status} className="mb-6" />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex items-start gap-3 p-4">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {detail.nextHearing ? (
              <div>
                <p className="text-sm text-muted-foreground">นัดศาลถัดไป</p>
                <p className="font-semibold">{detail.nextHearing.title}</p>
                <p className="text-sm text-muted-foreground">{formatDateTime(detail.nextHearing.startAt)}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ยังไม่มีนัดศาล</p>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="mb-2 text-base font-semibold">เอกสารจากสำนักงาน</h2>
            {downloadError && <p role="alert" className="mb-2 text-sm text-destructive">{downloadError}</p>}
            {detail.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีเอกสารที่สำนักงานแชร์ให้คุณ</p>
            ) : (
              <div className="flex flex-col">
                {detail.documents.map((doc) => (
                  <button key={doc.id} type="button" onClick={() => handleDownload(doc.id, doc.filename)} className={fileRow}>
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.filename}</span>
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="sr-only">ดาวน์โหลด</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="mb-2 text-base font-semibold">เอกสารที่คุณส่ง</h2>

            {detail.clientUploads.length === 0 ? (
              <p className="mb-4 text-sm text-muted-foreground">ยังไม่มีเอกสารที่คุณส่ง</p>
            ) : (
              <div className="mb-4 flex flex-col">
                {detail.clientUploads.map((u) => (
                  <button key={u.id} type="button" onClick={() => handleDownloadClientUpload(u.id, u.filename)} className={fileRow}>
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.filename}</span>
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="sr-only">ดาวน์โหลด</span>
                  </button>
                ))}
              </div>
            )}

            <form
              className="space-y-3 rounded-lg border border-border p-3 sm:p-4"
              onSubmit={(e) => { e.preventDefault(); handleUploadDocument(); }}
            >
              <h3 className="text-sm font-semibold">ส่งเอกสารเพิ่มเติม</h3>
              <div>
                <DocumentDropZone
                  onFile={setUploadFile}
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  label="ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์"
                  hint="PDF, JPG, PNG, DOC ไม่เกิน 20 MB"
                />
                {uploadFile && (
                  <p className="mt-1.5 truncate text-sm text-muted-foreground">{uploadFile.name}</p>
                )}
              </div>
              <SelectField label="ประเภทเอกสาร" value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)}>
                {CLIENT_DOCUMENT_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {documentCategoryLabel(value, 'th')}
                  </option>
                ))}
              </SelectField>
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">วันสำคัญ (ถ้ามี)</legend>
                  <ThaiDateInput value={uploadKeyDate} onChange={setUploadKeyDate} />
                </fieldset>
                <TextField
                  label="ชื่อวันสำคัญ (ถ้ามี)"
                  value={uploadKeyDateLabel}
                  onChange={(e) => setUploadKeyDateLabel(e.target.value)}
                  placeholder="เช่น วันครบกำหนด"
                />
              </div>
              <TextareaField label="หมายเหตุ (ถ้ามี)" value={uploadNote} onChange={(e) => setUploadNote(e.target.value)} rows={2} />
              {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
              <Button type="submit" disabled={!uploadFile || uploading}>
                {uploading ? 'กำลังส่ง...' : 'ส่งเอกสาร'}
              </Button>
            </form>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="mb-2 text-base font-semibold">ใบแจ้งหนี้</h2>
            {detail.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีใบแจ้งหนี้</p>
            ) : (
              <div className="flex flex-col">
                {detail.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{inv.invoiceNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {inv.dueAt ? `กำหนดชำระ ${formatDate(inv.dueAt)}` : 'ไม่ระบุกำหนดชำระ'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="mb-1 font-semibold tabular-nums">{formatCurrency(inv.totalAmount)}</p>
                      <Badge variant={inv.status === 'PAID' ? 'success' : 'warning'}>
                        {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="min-w-0 p-4 sm:p-5 lg:sticky lg:top-6">
          <h2 className="mb-2 text-base font-semibold">ข้อความถึงทนายความ</h2>

          <div className="mb-3 flex max-h-[420px] flex-col gap-2.5 overflow-y-auto rounded-lg border border-border bg-background p-3">
            {messages.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีข้อความ ถามความคืบหน้าหรือส่งข้อมูลเพิ่มได้ที่นี่</p>}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.senderType === 'CONTACT'
                    ? 'ml-auto rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm bg-muted text-foreground'
                }`}
              >
                <p>{m.body}</p>
                <p className={`mt-1 text-xs ${m.senderType === 'CONTACT' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {formatDateTime(m.createdAt)}
                </p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            className="space-y-2"
            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          >
            <label htmlFor="portal-message" className="sr-only">ข้อความ</label>
            <Textarea
              id="portal-message"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={2}
              className="min-h-[44px]"
              placeholder="พิมพ์ข้อความ"
              aria-invalid={messageError ? true : undefined}
              aria-describedby={messageError ? 'portal-message-error' : undefined}
            />
            {messageError && <p id="portal-message-error" role="alert" className="text-sm text-destructive">{messageError}</p>}
            <Button type="submit" className="w-full" disabled={sendingMessage || !messageBody.trim()}>
              {sendingMessage ? 'กำลังส่ง...' : 'ส่งข้อความ'}
            </Button>
          </form>
        </Card>
      </div>
    </PortalShell>
  );
}

function BackLink() {
  return (
    <Link href="/portal/operations" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      คดีของฉัน
    </Link>
  );
}
