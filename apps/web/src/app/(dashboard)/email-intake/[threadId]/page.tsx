'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Paperclip, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, EmailThreadDetail, IntakeDocumentRequestItem, UserItem } from '@/lib/api';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { AssigneeOptions } from '@/components/ui/AssigneeOptions';
import { groupProposals, isPending, parseDocument, submitHelper, casePath } from '@/lib/email-intake';
import { documentCategoryLabel } from '@/lib/stage-labels';
import { JourneyStepper } from '@/components/journey/JourneyStepper';
import { NextStepBanner } from '@/components/journey/NextStepBanner';
import { ProposalGroup } from '@/components/email-intake/ProposalGroup';
import { AiSummaryCard } from '@/components/email-intake/AiSummaryCard';
import { ClientMatchCard } from '@/components/email-intake/ClientMatchCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { CaseEmailComposer, type CaseEmailComposerMode } from '@/components/cases/CaseEmailComposer';
import { LinkThreadToCaseCard } from '@/components/email/LinkThreadToCaseCard';
import { EmailMessageCard } from '@/components/email/EmailMessageCard';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageLoading } from '@/components/ui/misc';

const INTAKE_STATUS: Record<string, string> = {
  NO_RESPONSE: 'ไม่ได้รับการตอบกลับ', RECEIVED: 'รับเรื่องแล้ว', ASSESSING: 'กำลังประเมิน', ACCEPTED: 'รับทำ',
  REJECTED: 'ไม่รับ', CONVERTED: 'เปิดคดีแล้ว', CONSULTED: 'ให้คำปรึกษาแล้ว',
};
const NO_LEAVE_FLAGS = new Map();

export default function EmailThreadDetailPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const { token, user } = useAuth();
  const router = useRouter();
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [assessorIds, setAssessorIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ filename: string; mimeType: string; url: string } | null>(null);

  useEffect(() => {
    if (token) api.getLawyers(token).then(setLawyers).catch(() => setLawyers([]));
  }, [token]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const [data, setData] = useState<EmailThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [linking, setLinking] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [aiReading, setAiReading] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [intakeSuggestions, setIntakeSuggestions] = useState<Awaited<ReturnType<typeof api.getThreadIntakeSuggestions>>>([]);
  const [error, setError] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [requests, setRequests] = useState<IntakeDocumentRequestItem[]>([]);
  const [showRejectedDocuments, setShowRejectedDocuments] = useState(false);
  const [composer, setComposer] = useState<CaseEmailComposerMode | null>(null);

  const load = useCallback(async () => {
    if (!token || !threadId) return;
    setLoading(true);
    setLoadError(false);
    try {
      setData(await api.getEmailThread(token, threadId));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [token, threadId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch without the skeleton: keeps unsaved edits, and a failure leaves the current data in place.
  const refresh = useCallback(async () => {
    if (!token || !threadId) return;
    window.dispatchEvent(new Event('email-intake-changed'));
    try {
      setData(await api.getEmailThread(token, threadId));
    } catch {
      setError('รีเฟรชข้อมูลไม่สำเร็จ — แสดงข้อมูลล่าสุดที่โหลดได้');
    }
  }, [token, threadId]);

  useEffect(() => {
    const onThreadChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail === threadId) void refresh();
    };
    window.addEventListener('email-intake-thread-changed', onThreadChanged);
    return () => window.removeEventListener('email-intake-thread-changed', onThreadChanged);
  }, [refresh, threadId]);

  const unaccepted = !!data && !data.thread.intake && !data.thread.caseId;
  // A client who wrote a new e-mail instead of replying: offer the sender's open intakes to join.
  useEffect(() => {
    if (!token || !unaccepted) return setIntakeSuggestions([]);
    api.getThreadIntakeSuggestions(token, threadId).then(setIntakeSuggestions).catch(() => setIntakeSuggestions([]));
  }, [token, threadId, unaccepted]);

  useEffect(() => {
    if (!token || !data?.thread.intake?.id) { setRequests([]); return; }
    api.getIntake(token, data.thread.intake.id).then((intake) => setRequests(intake.documentRequests ?? [])).catch(() => setRequests([]));
  }, [token, data?.thread.intake?.id]);

  const [linkingClient, setLinkingClient] = useState(false);
  const handleLinkClient = async (payload: { clientId: string } | { name: string }) => {
    if (!token) return;
    setLinkingClient(true);
    setError('');
    try {
      await api.linkEmailIntakeClient(token, threadId, payload);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'บันทึกลูกค้าไม่สำเร็จ');
    } finally {
      setLinkingClient(false);
    }
  };

  const handleAttachIntake = async (intakeId: string) => {
    if (!token) return;
    setLinking(true);
    setError('');
    try {
      const result = await api.attachThreadToIntake(token, threadId, intakeId);
      const path = casePath(result?.caseId);
      if (path) router.push(path);
      else setError('ไม่พบคดีที่เชื่อมโยง');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'รวมเข้าคดีเดิมไม่สำเร็จ');
    } finally {
      setLinking(false);
    }
  };

  const handleCreateIntake = async () => {
    if (!token) return;
    setLinking(true);
    setError('');
    try {
      const result = await api.acceptEmailThread(token, threadId);
      window.dispatchEvent(new Event('email-intake-changed'));
      await handleAiExtract();
      const path = casePath(result?.caseId);
      if (path) router.push(path);
      else setError('ไม่พบคดีที่เชื่อมโยง');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'สร้างคดีก่อนฟ้องไม่สำเร็จ');
      return;
    } finally {
      setLinking(false);
    }

  };

  const handleDownload = async (attachmentId: string, filename: string) => {
    if (!token) return;
    setError('');
    try {
      const blob = await api.downloadEmailAttachment(token, attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ดาวน์โหลดไฟล์ไม่สำเร็จ');
    }
  };

  const handlePreview = async (doc: { id: string; filename: string; mimeType: string }) => {
    if (!token || !data?.thread.intake) return;
    setError('');
    try {
      const blob = await api.downloadIntakeDocument(token, data.thread.intake.id, doc.id);
      setPreview({ filename: doc.filename, mimeType: doc.mimeType, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'เปิดไฟล์ไม่สำเร็จ');
    }
  };

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

  // Runs on "รับเป็นเรื่อง" or the button; its values land as proposals that still need "ยืนยันค่านี้".
  async function handleAiExtract() {
    if (!token) return;
    setAiReading(true);
    setError('');
    setAiNote('');
    try {
      const { proposals: added, cached } = await api.aiExtractEmailThread(token, threadId);
      const note = added ? `AI เสนอเพิ่ม ${added} รายการ — ตรวจและยืนยันทีละรายการ` : 'AI ไม่พบข้อมูลเพิ่มเติมในอีเมลนี้';
      setAiNote(cached ? `${note} (อีเมลและไฟล์ไม่เปลี่ยน ใช้ผลอ่านเดิม ไม่เสียเครดิต)` : note);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 402 ? 'เครดิต AI ไม่พอ' : e.message) : 'AI อ่านอีเมลไม่สำเร็จ');
    } finally {
      setAiReading(false);
    }
  };

  const handleAccept = async () => {
    if (!token || !data?.thread.intake) return;
    setAccepting(true);
    setError('');
    try {
      await api.assessIntake(token, data.thread.intake.id, { assessorIds: assessorIds.length ? assessorIds : user ? [user.id] : [] });
      window.dispatchEvent(new Event('email-intake-changed'));
      const caseId = data.thread.caseId ?? data.thread.intake.case?.id;
      const path = casePath(caseId);
      if (path) router.push(path);
      else setError('ไม่พบคดีที่เชื่อมโยง');
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
  if (loading || !data) {
    return <PageLoading variant="detail" title="กำลังโหลดอีเมล" lines={3} />;
  }

  const { thread, proposals, documents, progress } = data;
  const documentProposals = proposals.filter((p) => p.field === 'document');
  const rejectedDocuments = documentProposals.filter((p) => p.status === 'REJECTED');
  const documentLocked = progress.steps.find((step) => step.key === 'DOCUMENTS')?.state === 'locked';
  const canSubmit = ['CONFIRM', 'DOCUMENTS'].every((key) => progress.steps.some((step) => step.key === key && step.state === 'done'));
  const currentStep = progress.steps.find((step) => step.state === 'current');
  const scrollToPending = () => {
    const target = document.querySelector('[data-pending="true"]') ?? document.getElementById(currentStep?.key === 'ACCEPT' ? 'accept-intake' : currentStep?.key === 'AI_READ' ? 'ai-read' : currentStep?.key === 'DOCUMENTS' ? 'documents' : 'submit-intake');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="min-w-0 pb-32">
      <div className="mb-3 flex flex-wrap gap-2 border-b pb-3">
        <Button size="sm" disabled={!unaccepted || linking} onClick={handleCreateIntake}>รับเป็นคดีก่อนฟ้อง</Button>
        <Button size="sm" variant="outline" disabled={!unaccepted || !intakeSuggestions.length} onClick={() => document.getElementById('accept-intake')?.scrollIntoView({ behavior: 'smooth' })}>รวมเข้าคดีเดิม</Button>
        <Button size="sm" variant="outline" onClick={() => document.getElementById('link-case')?.scrollIntoView({ behavior: 'smooth' })}>ผูกกับคดี</Button>
        <Button size="sm" variant="outline" disabled={!thread.caseId || !thread.messages.length} onClick={() => { const message = thread.messages[0]; if (message) setComposer({ kind: 'reply', replyAll: false, threadSubject: thread.subject, message }); }}>ตอบกลับ</Button>
      </div>
      <Link href="/email-intake" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> คิวอีเมล
      </Link>
      <div className="mt-2">
        <PageHeader
          title={thread.subject || '(ไม่มีหัวเรื่อง)'}
          description={`${thread.fromName ?? thread.fromAddress ?? '—'} · ${thread.messages.length} ฉบับ`}
        />
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <JourneyStepper steps={progress.steps} />
      {progress.next && <NextStepBanner next={progress.next} onGo={scrollToPending} />}

      {thread.intake && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
          <span className="text-muted-foreground">คดีก่อนฟ้อง:</span>
          <Link href={thread.caseId ? `/cases/${thread.caseId}` : `/intake/${thread.intake.id}`} className="font-medium text-primary hover:underline">{thread.intake.title ?? 'เปิดเรื่อง'}</Link>
          <Badge variant="outline">{INTAKE_STATUS[thread.intake.status] ?? thread.intake.status}</Badge>
          {thread.intake.case
            ? <><span className="text-muted-foreground">· คดี:</span><Link href={`/cases/${thread.intake.case.id}`} className="font-medium text-primary hover:underline">{thread.intake.case.ownRef} {thread.intake.case.title}</Link></>
            : thread.intake.status !== 'RECEIVED' && <span className="text-xs text-muted-foreground">ยังไม่มีคดีที่เชื่อมโยง</span>}
        </div>
      )}

      <div id="link-case"><LinkThreadToCaseCard threadId={threadId} linkedCase={thread.case ?? null} onChanged={refresh} /></div>

      <div className="grid gap-6 2xl:grid-cols-2">
        {/* Source email */}
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 font-semibold">อีเมลต้นทาง</h2>
            {!thread.intake && !thread.caseId && (
              <div id="accept-intake" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-sm">อีเมลนี้ยังไม่ได้รับเป็นคดีก่อนฟ้อง</p>
                <Button size="sm" disabled={linking} onClick={handleCreateIntake}>
                  {linking ? 'กำลังสร้าง...' : 'รับเป็นคดีก่อนฟ้อง'}
                </Button>
                {intakeSuggestions.length > 0 && (
                  <div className="w-full space-y-1.5 border-t pt-2">
                    <p className="text-xs text-muted-foreground">ผู้ส่งนี้มีเรื่องที่เปิดอยู่ — ถ้าเป็นเรื่องเดียวกัน (ลูกค้าส่งเมลใหม่แทนการตอบกลับ) ให้รวมเข้าคดีเดิม</p>
                    {intakeSuggestions.map((s) => (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 break-words">
                          {s.title ?? 'ไม่มีชื่อเรื่อง'}
                          <span className="text-xs text-muted-foreground"> · {new Date(s.receivedDate).toLocaleDateString('th-TH')}</span>
                        </span>
                        <Button size="sm" variant="outline" disabled={linking} onClick={() => handleAttachIntake(s.id)}>
                          รวมเข้าเรื่องนี้
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              จาก: {thread.fromName ?? '—'} {thread.fromAddress ? `<${thread.fromAddress}>` : ''}
            </p>
            <div className="mt-3 space-y-3">
              {thread.messages.map((message, index) => (
                <EmailMessageCard key={message.id} message={message} subject={thread.subject} defaultExpanded={index === 0}>
                  {message.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.attachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3 text-xs hover:underline sm:min-h-8"
                          onClick={() => handleDownload(att.id, att.filename)}
                        >
                          <Paperclip className="h-3.5 w-3.5" aria-hidden /> {att.filename}
                        </button>
                      ))}
                    </div>
                  )}
                  {thread.caseId && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setComposer({ kind: 'reply', replyAll: false, threadSubject: thread.subject, message })}
                      >
                        ตอบกลับ
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setComposer({ kind: 'reply', replyAll: true, threadSubject: thread.subject, message })}
                      >
                        ตอบทั้งหมด
                      </Button>
                    </div>
                  )}
                </EmailMessageCard>
              ))}
            </div>

            {process.env.NODE_ENV !== 'production' && (
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
              <Button size="sm" variant="outline" className="mt-2" disabled={sendingReply || !replyBody.trim()} onClick={handleMockReply}>
                {sendingReply ? 'กำลังส่ง...' : 'จำลองว่ามีอีเมลตอบกลับ'}
              </Button>
            </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          {data.clientMatch && <ClientMatchCard key={data.clientMatch.linked?.id ?? 'unlinked'} match={data.clientMatch} busy={linkingClient} onLink={handleLinkClient} />}
          <Card><CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">ข้อมูลที่ระบบเตรียมให้</h2>
              {thread.intake && <Button id="ai-read" size="sm" variant="outline" disabled={aiReading} onClick={handleAiExtract}>{aiReading ? 'AI กำลังอ่าน…' : 'อ่านใหม่ (1 เครดิต)'}</Button>}
            </div>
            {aiNote && <p role="status" className="mb-2 text-xs text-muted-foreground">{aiNote}</p>}
            {data.aiSummary && <AiSummaryCard summary={data.aiSummary} />}
            <div className="space-y-3">
              {groupProposals(proposals.filter((p) => p.field !== 'document')).sort(([a], [b]) => Number(a === null) - Number(b === null)).map(([label, items], index) => <ProposalGroup key={label ?? ''} title={label ? `เรื่องที่ ${index + 1} · ${label}` : 'ข้อมูลทั่วไป'} items={items} proposals={proposals} onResolve={handleResolve} resolvingId={resolvingId} />)}
              {!proposals.some((p) => p.field !== 'document') && <p className="text-sm text-muted-foreground">ไม่พบข้อมูลที่ต้องยืนยัน</p>}
            </div>
          </CardContent></Card>
          <Card id="documents" className={documentLocked ? 'bg-muted/50 text-muted-foreground' : ''}><CardContent className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 font-semibold">{documentLocked && <Lock className="h-4 w-4" />}จัดเอกสาร</h2>
            {documentLocked && <p className="text-sm">ปลดล็อกเมื่อยืนยันข้อมูลครบ</p>}
            {documents.map((doc) => {
              const suggestions = documentProposals.filter((p) => parseDocument(p.proposedValue)?.documentId === doc.id && (showRejectedDocuments || p.status !== 'REJECTED'));
              return <div key={doc.id} className="space-y-2 rounded-md border bg-card p-3 text-sm">
                <button type="button" className="break-all text-left font-medium text-primary hover:underline" onClick={() => handlePreview(doc)}>{doc.filename}</button>
                {suggestions.map((proposal) => {
                  const suggestion = parseDocument(proposal.proposedValue)!;
                  const request = requests.find((item) => item.id === suggestion.docRequestId);
                  return <div key={proposal.id} data-pending={!documentLocked && isPending(proposal) ? 'true' : undefined} className="space-y-2">
                    <p className="break-all">→ {suggestion.filename}</p><div className="flex flex-wrap gap-1.5"><Badge variant="muted">{suggestion.docTypeLabel}</Badge><Badge variant="outline">หมวด: {documentCategoryLabel(suggestion.category)}</Badge></div>
                    {suggestion.docRequestId && <p className="text-xs text-muted-foreground">เอกสารที่ขอ: {request?.name ?? suggestion.docRequestId}</p>}
                    {proposal.sourceDetail && <p className="text-xs text-muted-foreground">“{proposal.sourceDetail}”</p>}
                    {proposal.status === 'CONFIRMED' && <Badge variant="success">✓ ยืนยันแล้ว</Badge>}
                    {proposal.status === 'REJECTED' && <Badge variant="muted">ตัดออกแล้ว</Badge>}
                    {isPending(proposal) && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={documentLocked || resolvingId === proposal.id} onClick={() => handleResolve(proposal.id, 'reject')}>ไม่ใช่</Button><Button size="sm" disabled={documentLocked || resolvingId === proposal.id} onClick={() => handleResolve(proposal.id, 'confirm')}>ยืนยัน</Button></div>}
                  </div>;
                })}
              </div>;
            })}
            {documents.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีไฟล์แนบ</p>}
            {rejectedDocuments.length > 0 && <button type="button" disabled={documentLocked} className="text-xs text-primary underline" onClick={() => setShowRejectedDocuments(!showRejectedDocuments)}>{showRejectedDocuments ? 'ซ่อนที่ตัดออก' : `แสดงที่ตัดออก (${rejectedDocuments.length})`}</button>}
          </CardContent></Card>
        </div>
      </div>
      <div id="submit-intake" className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-end gap-3 border-t bg-card p-4 pr-44 shadow-lg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-sm text-muted-foreground">{submitHelper(progress.steps)}</p>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground">ผู้ประเมิน</span>
          <div className="w-64 max-w-full">
            <MultiUserSelect
              users={user && !lawyers.some((l) => l.id === user.id) ? [user as unknown as UserItem, ...lawyers] : lawyers}
              value={assessorIds.length ? assessorIds : user ? [user.id] : []}
              onChange={setAssessorIds}
              placeholder="เลือกผู้ประเมิน (ได้หลายคน)"
              dropUp
            />
          </div>
        </div>
        <Button disabled={accepting || !thread.intake || !canSubmit} onClick={handleAccept}>{accepting ? 'กำลังบันทึก...' : 'ส่งประเมิน'}</Button>
      </div>
      {preview && <DocumentPreviewModal filename={preview.filename} mimeType={preview.mimeType} url={preview.url} onClose={() => setPreview(null)} />}
      {thread.caseId && (
        <CaseEmailComposer caseId={thread.caseId} mode={composer} onClose={() => setComposer(null)} onSent={() => void refresh()} />
      )}
    </div>
  );
}
