'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Paperclip, Lock, Mail, UserRound, Folder, FileText, Download } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasFirmCapability } from '@lawfirm/shared';
import { api, ApiError, EmailThreadDetail, IntakeDocumentRequestItem, UserItem } from '@/lib/api';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { AssigneeOptions } from '@/components/ui/AssigneeOptions';
import { groupProposals, isPending, parseDocument, submitHelper, casePath } from '@/lib/email-intake';
import { documentCategoryLabel } from '@/lib/stage-labels';
import { ProposalGroup } from '@/components/email-intake/ProposalGroup';
import { AiSummaryCard } from '@/components/email-intake/AiSummaryCard';
import { ClientMatchCard } from '@/components/email-intake/ClientMatchCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { EmailIntakeList } from '@/components/email-intake/EmailIntakeList';
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
  const [activeTab, setActiveTab] = useState<'email' | 'summary' | 'attachments'>('email');
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
      setError('โหลดข้อมูลใหม่ไม่สำเร็จ — กำลังแสดงข้อมูลชุดล่าสุดที่โหลดได้');
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
      setError(e instanceof ApiError ? e.message : 'บันทึกลูกความไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setLinkingClient(false);
    }
  };

  const handleAttachIntake = async (intakeId: string) => {
    if (!token || !window.confirm('รวมอีเมลนี้เข้ากับเรื่องเดิม?')) return;
    setLinking(true);
    setError('');
    try {
      const result = await api.attachThreadToIntake(token, threadId, intakeId);
      const path = casePath(result?.caseId);
      if (path) router.push(path);
      else setError('ไม่พบคดีที่เชื่อมโยง');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'รวมเข้าคดีเดิมไม่สำเร็จ ลองใหม่อีกครั้ง');
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
      setError(e instanceof ApiError ? e.message : 'สร้างคดีก่อนฟ้องไม่สำเร็จ ลองใหม่อีกครั้ง');
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
      setError(e instanceof ApiError ? e.message : 'ดาวน์โหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  };

  const handlePreview = async (doc: { id: string; filename: string; mimeType: string }) => {
    if (!token || !data?.thread.intake) return;
    setError('');
    try {
      const blob = await api.downloadIntakeDocument(token, data.thread.intake.id, doc.id);
      setPreview({ filename: doc.filename, mimeType: doc.mimeType, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'เปิดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง');
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
      setError(e instanceof ApiError ? e.message : 'ยืนยันบางรายการไม่สำเร็จ ลองยืนยันรายการที่เหลืออีกครั้ง');
    } finally {
      setConfirmingAll(false);
      await refresh();
    }
  };

  const handleResolve = async (proposalId: string, action: 'confirm' | 'reject', overrideValue?: string) => {
    if (!token || !data?.thread.intake) return;
    if (action === 'reject' && !window.confirm('ไม่ใช้ค่าที่ AI เสนอนี้?\nค่านี้จะไม่ถูกบันทึกลงคดี')) return;
    setResolvingId(proposalId);
    setError('');
    try {
      await api.resolveFieldProposal(token, data.thread.intake.id, proposalId, { action, overrideValue });
      const refreshed = await api.getEmailThread(token, threadId);
      setData(refreshed);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
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
      setError(e instanceof ApiError ? e.message : 'AI อ่านอีเมลไม่สำเร็จ กด "ให้ AI อ่านใหม่" อีกครั้ง');
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
      setError(e instanceof ApiError ? e.message : 'สร้างคดีก่อนฟ้องไม่สำเร็จ ลองใหม่อีกครั้ง');
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
  const visibleMessages = [...(showOlder ? indexedMessages.slice(1).reverse() : []), ...indexedMessages.slice(0, 1)];
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
      <div className="mb-6"><p className="text-sm text-muted-foreground"><Link href="/email-intake" className="hover:underline">รับเรื่องจากอีเมล</Link> / {thread.subject || '(ไม่มีหัวเรื่อง)'}</p><h1 className="font-display text-3xl font-bold">รับเรื่องจากอีเมล</h1></div>
      <div className="mb-3"><EmailIntakeList /></div>
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
        <span className="inline-flex items-center gap-1"><Mail className="h-4 w-4" aria-hidden />ผู้ส่ง: {thread.fromName ?? thread.fromAddress ?? '—'}</span><span>· {new Date(thread.lastMessageAt).toLocaleString('th-TH')}</span><span className="inline-flex items-center gap-1">· <UserRound className="h-4 w-4" aria-hidden />ลูกความ: {data.clientMatch?.linked?.name ?? 'ยังไม่ผูก'}</span><span className="inline-flex items-center gap-1">· <Folder className="h-4 w-4" aria-hidden />คดี: {existingCase?.ownRef ?? 'ยังไม่มี'}</span><span className="ml-auto text-xs text-muted-foreground">ผูกคดีเดิม / ผูกลูกความ / รวมอีเมล</span>
        <details className="relative"><summary className="no-marker inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded border px-3 py-1" aria-label="จัดการอีเมล">⋯</summary><div className="absolute right-0 z-30 w-80 max-w-[80vw] space-y-2 rounded-lg border bg-card p-3 shadow-lg"><LinkThreadToCaseCard threadId={threadId} linkedCase={thread.case ?? null} onChanged={refresh} />{data.clientMatch && <ClientMatchCard key={data.clientMatch.linked?.id ?? 'unlinked'} match={data.clientMatch} busy={linkingClient} onLink={handleLinkClient} />}{intakeSuggestions.map((item) => <Button key={item.id} variant="outline" size="sm" disabled={linking} onClick={() => handleAttachIntake(item.id)}>รวมอีเมล: {item.title ?? 'เรื่องเดิม'}</Button>)}</div></details>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {(thread.intake || thread.caseId) && <div className="mb-6 rounded-lg border bg-success/10 p-3 text-sm">✓ รับเรื่องแล้ว · <Link className="font-semibold text-primary underline" href={thread.caseId ? `/cases/${thread.caseId}` : `/intake/${thread.intake!.id}`}>เปิดคดี</Link></div>}

            {!thread.intake && !thread.caseId && (
              <div id="accept-intake" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-l-4 border-amber-200 border-l-[var(--color-brass)] bg-[var(--operations-highlight)] p-5 shadow-sm sm:p-7">
                <Badge variant="warning">ขั้นต่อไป</Badge><p className="font-semibold">อีเมลนี้ยังไม่ได้รับเป็นเรื่อง</p><Badge variant="outline">ใช้ AI</Badge>
                <Button size="sm" disabled={linking} onClick={handleCreateIntake} title="กดเพื่อเปิดคดีขั้นก่อนฟ้องจากอีเมลนี้ แล้วให้ AI อ่านอีเมลเพื่อเสนอข้อมูลคดี">
                  {linking ? 'กำลังสร้าง...' : 'รับเป็นคดีก่อนฟ้อง'}
                </Button>
                <p className="basis-full text-xs text-muted-foreground">เมื่อกด ระบบจะเปิดคดีและให้ AI อ่านอีเมลนี้ ค่าที่ AI เสนอต้องยืนยันก่อนบันทึก</p>

              </div>
            )}

      <div className="grid min-w-0 gap-6 lg:items-start lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Source email */}
        <Card className="min-w-0">
          <CardContent className="min-w-0 p-4">
            <div className="flex w-full gap-1 border-b pb-2" role="group" aria-label="เนื้อหาอีเมล">
              {([['email', `อีเมล (${thread.messages.length})`], ['summary', 'AI สรุป'], ['attachments', `ไฟล์แนบ (${attachments.length})`]] as const).map(([tab, label]) => <button key={tab} type="button" aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)} className={`min-h-11 min-w-0 flex-1 rounded-md px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${activeTab === tab ? 'bg-muted font-semibold' : 'hover:bg-muted'}`}>{label}</button>)}
            </div>
            {activeTab === 'summary' ? <div className="mt-3">{data.aiSummary ? <AiSummaryCard summary={data.aiSummary} /> : <p className="text-sm text-muted-foreground">ยังไม่มีสรุปจาก AI</p>}</div> : activeTab === 'attachments' ? <div className="mt-3 space-y-2">{(showAllAttachments ? attachments : attachments.slice(0, 6)).map(({ attachment, messageNumber }) => <button key={attachment.id} type="button" onClick={() => handleDownload(attachment.id, attachment.filename)} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border p-3 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><Paperclip className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">{attachment.filename}</span><span className="shrink-0 text-xs text-muted-foreground">จากฉบับที่ {messageNumber}</span></button>)}{attachments.length > 6 && <button type="button" onClick={() => setShowAllAttachments(!showAllAttachments)} className="min-h-11 text-sm text-primary hover:underline">{showAllAttachments ? 'แสดงน้อยลง' : `แสดงอีก ${attachments.length - 6} ไฟล์`}</button>}</div> : <div className="mt-3 space-y-3">
              {thread.messages.length > 1 && <button type="button" aria-expanded={showOlder} onClick={() => setShowOlder((open) => !open)} className="min-h-11 w-full rounded-lg border text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{showOlder ? 'ย่อข้อความก่อนหน้า' : `ข้อความก่อนหน้า ${thread.messages.length - 1} ฉบับ · แสดงทั้งหมด`}</button>}
              {visibleMessages.map(({ message, index }) => (
                <EmailMessageCard intake key={message.id} message={message} subject={thread.subject} defaultExpanded={index === 0}>
                  {message.attachments.length > 0 && (
                    <div className="mt-5 border-t pt-4"><h3 className="mb-3 flex items-center gap-2 font-semibold"><Paperclip className="h-4 w-4" aria-hidden />ไฟล์แนบ ({message.attachments.length} ไฟล์)</h3><div className="grid gap-2 sm:grid-cols-2">
                      {message.attachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          className="flex min-h-14 min-w-0 items-center gap-2 rounded-lg border bg-muted/40 p-3 text-left text-sm hover:underline"
                          onClick={() => handleDownload(att.id, att.filename)}
                        >
                          <FileText className="h-5 w-5 shrink-0 text-destructive" aria-hidden /><span className="min-w-0 flex-1 break-all">{att.filename}</span><Download className="h-4 w-4 shrink-0" aria-hidden />
                        </button>
                      ))}
                    </div></div>
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

            {activeTab === 'email' && process.env.NODE_ENV !== 'production' && (
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

        <div className="min-w-0 space-y-6 lg:sticky lg:top-0 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <Card><CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1.5">
                <h2 className="font-semibold">ข้อมูลที่ AI เสนอ — ต้องยืนยันก่อนบันทึก</h2>
                {fieldTotal > 0 && <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${(fieldConfirmed / fieldTotal) * 100}%` }} /></div>
                  <span>AI เสนอ · รอยืนยัน {fieldTotal - fieldConfirmed} จาก {fieldTotal} · ยืนยันแล้ว {fieldConfirmed} รายการ</span>
                </div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {confirmable.length > 0 && <Button size="sm" variant="outline" disabled={confirmingAll || !!resolvingId} onClick={() => handleConfirmAll(confirmable.map((p) => p.id))}>{confirmingAll ? 'กำลังยืนยัน…' : `ยืนยันทั้งหมดที่เหลือ (${confirmable.length})`}</Button>}

              </div>
            </div>
            {aiNote && <p role="status" className="mb-2 text-xs text-muted-foreground">{aiNote}</p>}
            <div className="space-y-3">
              {groupProposals(proposals.filter((p) => p.field !== 'document')).sort(([a], [b]) => Number(a === null) - Number(b === null)).map(([label, items], index) => <ProposalGroup key={label ?? ''} title={groupProposals(proposals.filter((p) => p.field !== 'document')).filter(([name]) => name !== null).length > 1 && label ? `เรื่องที่ ${index + 1} · ${label}` : ''} items={items} proposals={proposals} fileNames={fileNames} onResolve={handleResolve} resolvingId={resolvingId} />)}
              {!proposals.some((p) => p.field !== 'document') && <p className="text-sm text-muted-foreground">ไม่พบข้อมูลที่ต้องยืนยัน</p>}
            </div>
            <div className="mt-4 space-y-2 border-t pt-4"><p className="text-xs text-muted-foreground">AI เสนอข้อมูล · ยังไม่บันทึกจนกว่าจะยืนยัน</p>{thread.intake && <Button id="ai-read" size="sm" variant="outline" disabled={aiReading} title="กดเพื่อให้ AI อ่านอีเมลนี้อีกครั้ง ค่าที่ AI เสนอจะรอให้คุณยืนยันก่อนบันทึก" onClick={() => { if (window.confirm('ให้ AI อ่านอีเมลนี้อีกครั้ง?\nข้อเสนอที่ยังไม่ได้ยืนยันจะถูกแทนด้วยผลใหม่')) void handleAiExtract(); }}>{aiReading ? 'AI กำลังอ่าน…' : 'ให้ AI อ่านใหม่'}</Button>}<p className="text-xs text-muted-foreground">ถามยืนยันก่อนอ่านใหม่</p></div>
          </CardContent></Card>
          <details><summary className="disclosure cursor-pointer rounded-lg border bg-card p-3 font-semibold">จัดเอกสารและผู้รับผิดชอบ</summary><Card id="documents" className={documentLocked ? 'bg-muted/50 text-muted-foreground' : ''}><CardContent className="space-y-3 p-4">
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
          <div id="submit-intake" className="z-20 flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 shadow-lg ">
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
          </div></details>
        </div>
      </div>
      {preview && <DocumentPreviewModal filename={preview.filename} mimeType={preview.mimeType} url={preview.url} onClose={() => setPreview(null)} />}
      {thread.caseId && (
        <CaseEmailComposer caseId={thread.caseId} mode={composer} onClose={() => setComposer(null)} onSent={() => void refresh()} />
      )}
    </div>
  );
}
