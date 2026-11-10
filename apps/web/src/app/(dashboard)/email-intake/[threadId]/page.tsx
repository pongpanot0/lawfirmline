'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Paperclip, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasFirmCapability } from '@lawfirm/shared';
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
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [confirmingAll, setConfirmingAll] = useState(false);
  // Same rule as the API: owners, or the person who took the matter in while they still lead it.
  const mayHandOver = (legalCase: { leadLawyerId?: string }) => hasFirmCapability(user?.firmRole, 'reassignCaseLead')
    || (!!user && legalCase.leadLawyerId === user.id && data?.thread.intake?.receivedById === user.id);
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
  const [showOlder, setShowOlder] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showAllAttachments, setShowAllAttachments] = useState(false);
  const [showAllDocuments, setShowAllDocuments] = useState(false);
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

  // Values only: document requests and conflicting values still need a person to look at each.
  const handleConfirmAll = async (ids: string[]) => {
    if (!token || !data?.thread.intake || !ids.length) return;
    if (!window.confirm(`ยืนยันข้อมูลที่เหลือทั้งหมด ${ids.length} รายการตามที่ AI เสนอ?`)) return;
    setConfirmingAll(true);
    setError('');
    try {
      for (const id of ids) await api.resolveFieldProposal(token, data.thread.intake.id, id, { action: 'confirm' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ยืนยันบางรายการไม่สำเร็จ');
    } finally {
      setConfirmingAll(false);
      await refresh();
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
      setAiNote(cached ? `${note} (อีเมลและไฟล์ไม่เปลี่ยน ใช้ผลอ่านเดิม)` : note);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'AI อ่านอีเมลไม่สำเร็จ');
    } finally {
      setAiReading(false);
    }
  };

  const handleAccept = async () => {
    if (!token || !data?.thread.intake) return;
    setAccepting(true);
    setError('');
    try {
      // No assessment step: the first person picked owns the case, everyone picked is its team
      // (the intake's team syncs onto its case).
      const team = teamIds.length ? teamIds : user ? [user.id] : [];
      // Accepted before every intake opened its case at "ก่อนฟ้อง": open it now with the chosen lead —
      // accepting again is idempotent and only adds the missing case, so the matter appears in เรื่องและคดี.
      const existingCase = data.thread.case ?? data.thread.intake.case ?? null;
      const caseId = existingCase?.id ?? data.thread.caseId ?? (await api.acceptEmailThread(token, threadId, { leadLawyerId: team[0] })).caseId;
      // Handing an existing case to someone else: owners, or whoever took the matter in while they lead it
      // (a lawyer opening it for a senior or the owner). Anyone else only adds people to the team.
      if (existingCase && mayHandOver(existingCase) && team[0] && team[0] !== existingCase.leadLawyerId) await api.updateCase(token, caseId, { leadLawyerId: team[0] });
      if (team.length) await api.updateIntake(token, data.thread.intake.id, { assignedUserIds: team });
      window.dispatchEvent(new Event('email-intake-changed'));
      const path = casePath(caseId);
      if (path) router.push(path);
      else setError('ไม่พบคดีที่เชื่อมโยง');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'สร้างคดีก่อนฟ้องไม่สำเร็จ');
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
  const attachments = thread.messages.flatMap((message, index) => message.attachments.map((attachment) => ({ attachment, messageNumber: thread.messages.length - index })));
  const participants = new Set(thread.messages.flatMap((message) => [message.fromAddress, ...(message.toAddresses ?? []), ...(message.ccAddresses ?? [])]).filter((address): address is string => !!address).map((address) => address.toLowerCase())).size;
  const indexedMessages = thread.messages.map((message, index) => ({ message, index }));
  const visibleMessages = [...(showOlder ? indexedMessages.slice(1) : indexedMessages.slice(1, 4)).reverse(), ...indexedMessages.slice(0, 1)];
  const documentProposals = proposals.filter((p) => p.field === 'document');
  const fieldProposals = proposals.filter((p) => p.field !== 'document' && p.status !== 'REJECTED');
  const fieldTotal = fieldProposals.length;
  const fieldConfirmed = fieldProposals.filter((p) => p.status === 'CONFIRMED').length;
  const confirmable = fieldProposals.filter((p) => isPending(p) && p.status !== 'CONFLICT' && p.field !== 'docRequest');
  const fileNames = new Map(documents.map((d) => [d.id, d.filename]));
  const existingCase = thread.case ?? thread.intake?.case ?? null;
  const leadLocked = !!existingCase && !mayHandOver(existingCase);
  const rejectedDocuments = documentProposals.filter((p) => p.status === 'REJECTED');
  const documentLocked = progress.steps.find((step) => step.key === 'DOCUMENTS')?.state === 'locked';
  const canSubmit = ['CONFIRM', 'DOCUMENTS'].every((key) => progress.steps.some((step) => step.key === key && step.state === 'done'));
  const currentStep = progress.steps.find((step) => step.state === 'current');
  const scrollToPending = () => {
    const target = document.querySelector('[data-pending="true"]') ?? document.getElementById(currentStep?.key === 'ACCEPT' ? 'accept-intake' : currentStep?.key === 'AI_READ' ? 'ai-read' : currentStep?.key === 'DOCUMENTS' ? 'documents' : 'submit-intake');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="min-w-0 pb-8">
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
          title={<span className="line-clamp-2 break-words font-display not-italic">{thread.subject || '(ไม่มีหัวเรื่อง)'}</span>}
          description={`จาก ${thread.fromName ?? thread.fromAddress ?? '—'}${thread.fromName && thread.fromAddress ? ` <${thread.fromAddress}>` : ''} · ${thread.messages.length} ฉบับ · ${attachments.length} ไฟล์แนบ · ผู้ร่วมสนทนา ${participants} คน`}
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

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Source email */}
        <Card className="min-w-0">
          <CardContent className="min-w-0 p-4">
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
            {attachments.length > 0 && <div className="flex flex-wrap gap-2 border-b pb-2" aria-label="เนื้อหาอีเมล">
              <button type="button" aria-pressed={!showAttachments} onClick={() => setShowAttachments(false)} className={`min-h-11 rounded-md px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring ${!showAttachments ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>ข้อความ ({thread.messages.length})</button>
              <button type="button" aria-pressed={showAttachments} onClick={() => setShowAttachments(true)} className={`min-h-11 rounded-md px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring ${showAttachments ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>ไฟล์แนบทั้งหมด ({attachments.length})</button>
            </div>}
            {showAttachments ? <div className="mt-3 space-y-2">{(showAllAttachments ? attachments : attachments.slice(0, 6)).map(({ attachment, messageNumber }) => <button key={attachment.id} type="button" onClick={() => handleDownload(attachment.id, attachment.filename)} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border p-3 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><Paperclip className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">{attachment.filename}</span><span className="shrink-0 text-xs text-muted-foreground">จากฉบับที่ {messageNumber}</span></button>)}{attachments.length > 6 && <button type="button" onClick={() => setShowAllAttachments(!showAllAttachments)} className="min-h-11 text-sm text-primary hover:underline">{showAllAttachments ? 'แสดงน้อยลง' : `แสดงอีก ${attachments.length - 6} ไฟล์`}</button>}</div> : <div className="mt-3 space-y-3">
              {thread.messages.length > 4 && <button type="button" aria-expanded={showOlder} onClick={() => setShowOlder((open) => !open)} className="min-h-11 w-full rounded-lg border text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{showOlder ? 'ย่อข้อความก่อนหน้า' : `ข้อความก่อนหน้า ${thread.messages.length - 4} ฉบับ · แสดงทั้งหมด`}</button>}
              {visibleMessages.map(({ message, index }) => (
                <EmailMessageCard key={message.id} message={message} subject={thread.subject} defaultExpanded={index === 0}>
                  {message.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.attachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          className="inline-flex min-h-[44px] max-w-full items-center gap-1 break-all rounded-full border px-3 text-left text-xs hover:underline sm:min-h-8"
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
            </div>}

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
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1.5">
                <h2 className="font-semibold">ข้อมูลที่ระบบเตรียมให้</h2>
                {fieldTotal > 0 && <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${(fieldConfirmed / fieldTotal) * 100}%` }} /></div>
                  <span>ยืนยันแล้ว {fieldConfirmed} จาก {fieldTotal} รายการ</span>
                </div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {confirmable.length > 0 && <Button size="sm" variant="outline" disabled={confirmingAll || !!resolvingId} onClick={() => handleConfirmAll(confirmable.map((p) => p.id))}>{confirmingAll ? 'กำลังยืนยัน…' : `ยืนยันทั้งหมดที่เหลือ (${confirmable.length})`}</Button>}
                {thread.intake && <Button id="ai-read" size="sm" variant="outline" disabled={aiReading} onClick={handleAiExtract}>{aiReading ? 'AI กำลังอ่าน…' : 'อ่านใหม่'}</Button>}
              </div>
            </div>
            {aiNote && <p role="status" className="mb-2 text-xs text-muted-foreground">{aiNote}</p>}
            {data.aiSummary && <AiSummaryCard summary={data.aiSummary} />}
            <div className="space-y-3">
              {groupProposals(proposals.filter((p) => p.field !== 'document')).sort(([a], [b]) => Number(a === null) - Number(b === null)).map(([label, items], index) => <ProposalGroup key={label ?? ''} title={label ? `เรื่องที่ ${index + 1} · ${label}` : 'ข้อมูลทั่วไป'} items={items} proposals={proposals} fileNames={fileNames} onResolve={handleResolve} resolvingId={resolvingId} />)}
              {!proposals.some((p) => p.field !== 'document') && <p className="text-sm text-muted-foreground">ไม่พบข้อมูลที่ต้องยืนยัน</p>}
            </div>
          </CardContent></Card>
          <Card id="documents" className={documentLocked ? 'bg-muted/50 text-muted-foreground' : ''}><CardContent className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 font-semibold">{documentLocked && <Lock className="h-4 w-4" />}จัดเอกสาร</h2>
            {documentLocked && <p className="text-sm">ปลดล็อกเมื่อยืนยันข้อมูลครบ</p>}
            {(showAllDocuments ? documents : documents.slice(0, 6)).map((doc) => {
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
            {documents.length > 6 && <button type="button" onClick={() => setShowAllDocuments(!showAllDocuments)} className="min-h-11 text-sm text-primary hover:underline">{showAllDocuments ? 'แสดงน้อยลง' : `แสดงอีก ${documents.length - 6} ไฟล์`}</button>}
            {documents.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีไฟล์แนบ</p>}
            {rejectedDocuments.length > 0 && <button type="button" disabled={documentLocked} className="text-xs text-primary underline" onClick={() => setShowRejectedDocuments(!showRejectedDocuments)}>{showRejectedDocuments ? 'ซ่อนที่ตัดออก' : `แสดงที่ตัดออก (${rejectedDocuments.length})`}</button>}
          </CardContent></Card>
          {/* The action lives in the side column: it never covers the e-mail being read. */}
          <div id="submit-intake" className="z-20 flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 shadow-lg xl:sticky xl:bottom-4">
            <p className="text-sm text-muted-foreground">{submitHelper(progress.steps)}</p>
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-muted-foreground">ผู้รับผิดชอบคดี</span>
              <div className="w-full">
                <MultiUserSelect
                  users={user && !lawyers.some((l) => l.id === user.id) ? [user as unknown as UserItem, ...lawyers] : lawyers}
                  value={teamIds.length ? teamIds : user ? [user.id] : []}
                  onChange={setTeamIds}
                  placeholder={leadLocked ? 'เพิ่มคนเข้าทีมคดี (เลือกได้หลายคน)' : 'คนแรกเป็นเจ้าของคดี (เลือกได้หลายคน)'}
                  dropUp
                />
              </div>
            </div>
            <Button className="w-full" disabled={accepting || !thread.intake || !canSubmit} onClick={handleAccept}>{accepting ? 'กำลังสร้างคดี...' : 'สร้างคดีก่อนฟ้อง'}</Button>
          </div>
        </div>
      </div>
      {preview && <DocumentPreviewModal filename={preview.filename} mimeType={preview.mimeType} url={preview.url} onClose={() => setPreview(null)} />}
      {thread.caseId && (
        <CaseEmailComposer caseId={thread.caseId} mode={composer} onClose={() => setComposer(null)} onSent={() => void refresh()} />
      )}
    </div>
  );
}
