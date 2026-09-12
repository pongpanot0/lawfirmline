'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, Download, FileText } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseDetail, CaseMessageEntry, PortalApiError } from '@/lib/portal-api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Button, buttonVariants } from '@/components/ui/button';
import { PortalShell } from '@/components/layout/PortalShell';
import { StageTrack } from '@/components/portal/StageTrack';
import { formatDate, formatDateTime } from '@/lib/utils';
import { getCaseStatusDisplay } from '@/lib/case-status';
import { useDashboardT } from '@/components/landing/LocaleProvider';

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
  const [messages, setMessages] = useState<CaseMessageEntry[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token || !id) return;
    portalApi
      .getCase(token, id)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [token, id]);

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
    const blob = await portalApi.downloadDocument(token, documentId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !contact || !detail) return null;

  const status = getCaseStatusDisplay(detail.status, d.caseStatus);

  return (
    <PortalShell>
      <Link href="/portal/operations" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
        <ArrowLeft className="h-3.5 w-3.5" />
        งานดำเนินการ
      </Link>

      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-extrabold tracking-tight">{detail.title}</h1>
          <p className="text-[13.5px] text-muted-foreground">
            เลขที่อ้างอิง {detail.ownRef}
            {detail.courtName ? ` · ${detail.courtName}` : ''} · เปิดคดีเมื่อ {formatDate(detail.openedAt)}
          </p>
        </div>
        <Badge variant={status.variant} className="h-fit px-3.5 py-1.5 text-[13px]">
          {status.label}
        </Badge>
      </div>

      <StageTrack status={detail.status} className="mb-6" />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_336px]">
        <div className="flex flex-col gap-5">
          <Card className="flex items-center gap-3.5 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <CalendarClock className="h-5 w-5" />
            </div>
            {detail.nextHearing ? (
              <div>
                <p className="text-[13.5px] font-bold">{detail.nextHearing.title}</p>
                <p className="text-[12.5px] text-muted-foreground">{formatDateTime(detail.nextHearing.startAt)}</p>
              </div>
            ) : (
              <p className="text-[13.5px] text-muted-foreground">ยังไม่มีนัดศาล</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-[15.5px] font-bold">เอกสาร</h2>
            {detail.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีเอกสารที่แชร์</p>
            ) : (
              <div className="flex flex-col">
                {detail.documents.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleDownload(d.id, d.filename)}
                    className="flex items-center gap-2.5 border-b border-border py-2.5 text-left last:border-0 hover:bg-accent/50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                      <FileText className="h-4 w-4" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{d.filename}</span>
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-[15.5px] font-bold">ใบแจ้งหนี้</h2>
            {detail.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีใบแจ้งหนี้</p>
            ) : (
              <div className="flex flex-col">
                {detail.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between border-b border-border py-3 last:border-0">
                    <div>
                      <p className="text-[13.5px] font-bold">{inv.invoiceNumber}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {inv.dueAt ? `กำหนดชำระ ${formatDate(inv.dueAt)}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="mb-1 text-[14.5px] font-bold">฿{inv.totalAmount.toLocaleString()}</p>
                      <Badge variant={inv.status === 'PAID' ? 'success' : 'warning'}>
                        {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15.5px] font-bold">ข้อความ</h2>
            </div>

            {messageError && <p className="mb-3 text-sm text-destructive">{messageError}</p>}

            <div className="mb-4 flex max-h-[420px] flex-col gap-2.5 overflow-y-auto rounded-lg border border-border bg-background p-3">
              {messages.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีข้อความ</p>}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    m.senderType === 'CONTACT'
                      ? 'ml-auto rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted text-foreground'
                  }`}
                >
                  <p>{m.body}</p>
                  <p className={`mt-1 text-[10.5px] ${m.senderType === 'CONTACT' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {formatDateTime(m.createdAt)}
                  </p>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-end gap-2.5">
              <Textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={1}
                className="min-h-[44px] flex-1"
                placeholder="พิมพ์ข้อความ..."
              />
              <Button disabled={sendingMessage || !messageBody.trim()} onClick={handleSendMessage}>
                {sendingMessage ? 'กำลังส่ง...' : 'ส่ง'}
              </Button>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="p-[18px]">
            <h2 className="mb-3 text-[14px] font-bold">สรุปคดี</h2>
            <div className="flex flex-col gap-3 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">สถานะ</span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              {detail.courtName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ศาล</span>
                  <span className="font-semibold">{detail.courtName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">เปิดคดีเมื่อ</span>
                <span className="font-semibold">{formatDate(detail.openedAt)}</span>
              </div>
            </div>
          </Card>

          <Card className="border-none bg-gradient-to-br from-primary to-[hsl(224,70%,38%)] p-5 text-primary-foreground">
            <h2 className="mb-1.5 text-[14px] font-bold">ต้องการความช่วยเหลือเพิ่มเติม?</h2>
            <p className="mb-3.5 text-[12.5px] leading-relaxed text-primary-foreground/85">
              ส่งเรื่องใหม่เกี่ยวกับคดีนี้ หรือสอบถามผ่านข้อความด้านซ้ายได้ตลอดเวลา
            </p>
            <Link href="/portal/intake/new" className={buttonVariants({ className: 'w-full bg-white text-primary hover:bg-white/90' })}>
              ส่งเรื่องใหม่
            </Link>
          </Card>
        </div>
      </div>
    </PortalShell>
  );
}
