'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Paperclip, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, EmailThreadDetail, IntakeFieldProposalItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageLoading } from '@/components/ui/misc';

const FIELD_LABELS: Record<string, string> = {
  title: 'ชื่อเรื่อง',
  clientName: 'ชื่อลูกค้า',
  contactName: 'ผู้ติดต่อ',
  opposingParty: 'คู่กรณี',
  description: 'สรุปคำขอของลูกค้า',
  estimatedDamage: 'จำนวนเงิน (บาท)',
  requestedResponseDate: 'วันที่ลูกค้าขอให้ตอบ (ไม่ใช่กำหนดตามกฎหมาย)',
};

const SOURCE_LABELS: Record<string, string> = {
  EMAIL_BODY: 'พบในเนื้อหาอีเมล',
  ATTACHMENT: 'พบในไฟล์แนบ',
  EXISTING_CLIENT: 'ระบบจับคู่จากข้อมูลลูกค้าเดิม',
  MANUAL: 'กรอกเอง',
};

function formatValue(field: string, value: string | null) {
  if (value == null || value === '') return '(ยังไม่พบข้อมูล)';
  if (field === 'estimatedDamage') {
    const n = Number(value);
    return Number.isNaN(n) ? value : `${n.toLocaleString('th-TH')} บาท`;
  }
  if (field === 'requestedResponseDate') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return value;
}

function ProposalRow({
  proposal,
  onResolve,
  resolving,
}: {
  proposal: IntakeFieldProposalItem;
  onResolve: (proposalId: string, action: 'confirm' | 'reject', overrideValue?: string) => void;
  resolving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(proposal.proposedValue ?? '');

  const isPending = proposal.status === 'REQUIRES_CONFIRMATION' || proposal.status === 'SUGGESTED';
  const isConfirmed = proposal.status === 'CONFIRMED';
  const isRejected = proposal.status === 'REJECTED';

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{FIELD_LABELS[proposal.field] ?? proposal.field}</p>
          {proposal.previousValue != null && (
            <p className="text-xs text-muted-foreground line-through">
              เดิม: {formatValue(proposal.field, proposal.previousValue)}
            </p>
          )}
          {editing ? (
            <textarea
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              rows={proposal.field === 'description' ? 4 : 1}
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
            />
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap text-sm font-medium">{formatValue(proposal.field, proposal.proposedValue)}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {SOURCE_LABELS[proposal.sourceType] ?? proposal.sourceType}
            {proposal.sourceDetail ? ` — ${proposal.sourceDetail}` : ''}
          </p>
        </div>
        <div className="shrink-0">
          {isConfirmed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> ยืนยันแล้ว
            </span>
          )}
          {isRejected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              <XCircle className="h-3.5 w-3.5" /> ไม่ใช้ข้อมูลนี้
            </span>
          )}
          {isPending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> ต้องยืนยัน
            </span>
          )}
        </div>
      </div>
      {isPending && (
        <div className="mt-2 flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                disabled={resolving}
                onClick={() => {
                  onResolve(proposal.id, 'confirm', draftValue);
                  setEditing(false);
                }}
              >
                ยืนยันค่าที่แก้ไข
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                ยกเลิก
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" disabled={resolving} onClick={() => onResolve(proposal.id, 'confirm')}>
                ยืนยันค่านี้
              </Button>
              <Button size="sm" variant="outline" disabled={resolving} onClick={() => setEditing(true)}>
                แก้ไขก่อนยืนยัน
              </Button>
              <Button size="sm" variant="outline" disabled={resolving} onClick={() => onResolve(proposal.id, 'reject')}>
                ไม่ใช้ข้อมูลนี้
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmailThreadDetailPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const { token } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<EmailThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [linking, setLinking] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const load = useCallback(async () => {
    if (!token || !threadId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const detail = await api.getEmailThread(token, threadId);
      setData(detail);
      if (!detail.thread.intake) {
        // The queue already shows items with data prepared — materialize the
        // intake + field proposals as soon as the lawyer opens it, rather
        // than asking for an extra manual "link" step.
        setLinking(true);
        await api.acceptEmailThread(token, threadId);
        const refreshed = await api.getEmailThread(token, threadId);
        setData(refreshed);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLinking(false);
      setLoading(false);
    }
  }, [token, threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (proposalId: string, action: 'confirm' | 'reject', overrideValue?: string) => {
    if (!token || !data?.thread.intake) return;
    setResolvingId(proposalId);
    setError('');
    try {
      await api.resolveFieldProposal(token, data.thread.intake.id, proposalId, { action, overrideValue });
      const refreshed = await api.getEmailThread(token, threadId);
      setData(refreshed);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setResolvingId(null);
    }
  };

  const outstandingCount = useMemo(
    () => (data?.proposals ?? []).filter((p) => p.status === 'REQUIRES_CONFIRMATION' || p.status === 'SUGGESTED').length,
    [data],
  );

  const handleAccept = async () => {
    if (!token || !data?.thread.intake) return;
    setAccepting(true);
    setError('');
    try {
      await api.assessIntake(token, data.thread.intake.id, {});
      router.push(`/intake/${data.thread.intake.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ยืนยันไม่สำเร็จ');
    } finally {
      setAccepting(false);
    }
  };

  const handleMockReply = async () => {
    if (!token || !replyBody.trim()) return;
    setSendingReply(true);
    setError('');
    try {
      await api.mockReplyEmailThread(token, threadId, { bodyText: replyBody.trim() });
      setReplyBody('');
      const refreshed = await api.getEmailThread(token, threadId);
      setData(refreshed);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'จำลองอีเมลตอบกลับไม่สำเร็จ');
    } finally {
      setSendingReply(false);
    }
  };

  if (loadError) {
    return <LoadFailed onRetry={load} />;
  }
  if (loading || linking || !data) {
    return <PageLoading title={linking ? 'กำลังเตรียมข้อมูลรับเรื่อง' : 'กำลังโหลดอีเมล'} lines={3} />;
  }

  const { thread, proposals } = data;

  return (
    <div>
      <Link href="/email-intake" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> กลับไปที่คิวอีเมล
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold tracking-tight">{thread.subject}</h1>

      {error && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Source email */}
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 font-semibold">อีเมลต้นทาง</h2>
            <p className="text-sm text-muted-foreground">
              จาก: {thread.fromName ?? '—'} {thread.fromAddress ? `<${thread.fromAddress}>` : ''}
            </p>
            <div className="mt-3 space-y-3">
              {thread.messages.map((message) => (
                <div key={message.id} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    {message.direction === 'INBOUND' ? 'ได้รับ' : 'ส่งออก'} ·{' '}
                    {new Date(message.receivedAt).toLocaleString('th-TH')}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{message.bodyText}</p>
                  {message.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.attachments.map((att) => (
                        <span key={att.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                          <Paperclip className="h-3 w-3" /> {att.filename}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-dashed p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                จำลองอีเมลตอบกลับ (สำหรับทดสอบ — ยังไม่เชื่อมกล่องเมลจริง)
              </p>
              <textarea
                className="w-full rounded border px-2 py-1 text-sm"
                rows={2}
                placeholder="เช่น ชำระเงินไปแล้วบางส่วน คงเหลือ 400,000 บาท"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
              />
              <Button size="sm" className="mt-2" disabled={sendingReply || !replyBody.trim()} onClick={handleMockReply}>
                {sendingReply ? 'กำลังส่ง...' : 'จำลองว่ามีอีเมลตอบกลับ'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Proposed fields */}
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 font-semibold">ข้อมูลที่ระบบเตรียมให้</h2>
            <div className="space-y-2">
              {proposals.map((proposal) => (
                <ProposalRow
                  key={proposal.id}
                  proposal={proposal}
                  onResolve={handleResolve}
                  resolving={resolvingId === proposal.id}
                />
              ))}
              {proposals.length === 0 && <p className="text-sm text-muted-foreground">ไม่พบข้อมูลที่ต้องยืนยัน</p>}
            </div>

            <div className="mt-4 border-t pt-4">
              {outstandingCount > 0 && (
                <p className="mb-2 text-xs text-amber-700">ยังมี {outstandingCount} รายการที่ต้องยืนยันก่อนรับเข้าพิจารณา</p>
              )}
              <Button className="w-full" disabled={accepting || outstandingCount > 0} onClick={handleAccept}>
                {accepting ? 'กำลังบันทึก...' : 'ยืนยันข้อมูลและรับเข้าพิจารณา'}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                การรับเข้าพิจารณายังไม่ใช่การตัดสินใจฟ้องคดี เป็นเพียงการรับเรื่องเข้าสู่ขั้นตอนประเมิน
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
