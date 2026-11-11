'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, FilePlus2, FolderOpen, Mail, MailPlus, Paperclip, Plus, RefreshCw, Sparkles, Unlink } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  api,
  ApiError,
  type CaseEmailThreadDetail,
  type CaseEmailThreadItem,
  type CaseFolderLinkItem,
  type EmailAttachmentItem,
  type OutlookFolderRow,
  type LinkCandidate,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { UndoToast, type UndoAction } from '@/components/ui/UndoToast';
import { Card, CardContent } from '@/components/ui/card';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Badge } from '@/components/ui/badge';
import { EmailMessageCard } from '@/components/email/EmailMessageCard';
import { LinkEmailDialog } from './LinkEmailDialog';
import { CaseEmailComposer, type CaseEmailComposerMode } from './CaseEmailComposer';
import { CaseUnknownAddresses } from './CaseUnknownAddresses';
import { EmailMentionTasks } from './EmailMentionTasks';
import { MATCH_REASON_LABELS } from '@/lib/case-email';
import { formatDateTime } from '@/lib/utils';
import { awaitingReplyLabel } from '@/lib/email-awaiting';

type Notice = { type: 'success' | 'error'; text: string; action?: { label: string; onClick: () => void } } | null;

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

export function CaseEmailPanel({
  caseId,
  caseRef,
  initialThreadId,
  onOpenSuggestions,
}: {
  caseId: string;
  caseRef: string;
  initialThreadId?: string | null;
  /** Switches the case to the tab that lists date suggestions. */
  onOpenSuggestions?: () => void;
}) {
  const { token } = useAuth();
  const [suggested, setSuggested] = useState<LinkCandidate[]>([]);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [threads, setThreads] = useState<CaseEmailThreadItem[] | null>(null);
  const [links, setLinks] = useState<CaseFolderLinkItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialThreadId ?? null);
  const [showAllThreads, setShowAllThreads] = useState(false);
  const [detail, setDetail] = useState<CaseEmailThreadDetail | null>(null);
  const [folders, setFolders] = useState<OutlookFolderRow[] | null>(null);
  const [pickedFolderId, setPickedFolderId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [threadsFailed, setThreadsFailed] = useState(false);
  const [linksFailed, setLinksFailed] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailTick, setDetailTick] = useState(0);
  const [composer, setComposer] = useState<CaseEmailComposerMode | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const [threadsResult, linksResult, candidatesResult] = await Promise.allSettled([
      api.getCaseEmailThreads(token, caseId),
      api.getCaseFolderLinks(token, caseId),
      api.getCaseEmailLinkCandidates(token, caseId),
    ]);
    // Keep the last good data on a failed refresh; flag the failure instead of faking an empty list.
    if (threadsResult.status === 'fulfilled') setThreads(threadsResult.value);
    else setThreads((prev) => prev ?? []);
    setThreadsFailed(threadsResult.status === 'rejected');
    if (linksResult.status === 'fulfilled') setLinks(linksResult.value);
    if (candidatesResult.status === 'fulfilled') setSuggested(candidatesResult.value.suggested);
    setLinksFailed(linksResult.status === 'rejected');
  }, [token, caseId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setDetail((d) => (d && d.id === selectedId ? d : null));
    setDetailFailed(false);
    if (!token || !selectedId) return;
    let active = true;
    api
      .getCaseEmailThread(token, caseId, selectedId)
      .then((d) => active && setDetail(d))
      .catch(() => active && setDetailFailed(true));
    return () => {
      active = false;
    };
  }, [token, caseId, selectedId, detailTick]);

  const selectThread = (threadId: string) => {
    setNotice(null);
    setSelectedId(threadId);
  };

  const run = async (key: string, action: (t: string) => Promise<Notice>) => {
    if (!token) return;
    setBusy(key);
    setNotice(null);
    try {
      setNotice(await action(token));
    } catch (e) {
      setNotice({ type: 'error', text: errorText(e, 'ทำรายการไม่สำเร็จ') });
    } finally {
      setBusy(null);
    }
  };

  const syncNow = () =>
    run('sync', async (t) => {
      const result = await api.syncCaseEmail(t, caseId);
      await load();
      return result.errors.length
        ? { type: 'error', text: `ซิงก์ได้ ${result.messagesSynced} ฉบับ แต่มีปัญหา: ${result.errors.join(' · ')}` }
        : { type: 'success', text: `ซิงก์แล้ว — อีเมลใหม่ ${result.messagesSynced} ฉบับ` };
    });

  const openPicker = () =>
    run('folders', async (t) => {
      const rows = (await api.getOutlookFolders(t)).filter((row) => !row.link);
      const suggestsThisCase = (row: OutlookFolderRow) => row.suggestions.some((s) => s.caseId === caseId);
      setFolders([...rows.filter(suggestsThisCase), ...rows.filter((row) => !suggestsThisCase(row))]);
      setPickedFolderId('');
      return null;
    });

  const linkPicked = () =>
    run('link', async (t) => {
      await api.linkOutlookFolders(t, [{ folderId: pickedFolderId, caseId }]);
      setFolders(null);
      setPickedFolderId('');
      await load();
      return { type: 'success', text: 'ผูก folder แล้ว — ระบบกำลังดึงอีเมลย้อนหลัง กด "ซิงก์ตอนนี้" อีกครั้งในไม่กี่นาที' };
    });

  const unlinkFolder = (link: CaseFolderLinkItem) => {
    if (!window.confirm(`ยกเลิกการผูก "${link.displayPath}"? อีเมลที่ดึงเข้าคดีแล้วจะยังอยู่ในคดี`)) return;
    run(`unlink-${link.id}`, async (t) => {
      await api.unlinkOutlookFolder(t, link.id);
      await load();
      return { type: 'success', text: 'ยกเลิกการผูก folder แล้ว' };
    });
  };

  const refreshThreads = async () => {
    if (!token) return;
    try {
      setThreads(await api.getCaseEmailThreads(token, caseId));
    } catch {
      /* รีเฟรชเงียบ ๆ — รายการเดิมยังใช้ได้ */
    }
  };

  const dismissReply = (threadId: string) =>
    run(`dismiss-${threadId}`, async (t) => {
      await api.dismissEmailReply(t, caseId, threadId);
      await refreshThreads();
      setUndoId(threadId);
      return { type: 'success', text: 'ทำเครื่องหมายว่าไม่ต้องตอบแล้ว' };
    });

  const undoDismiss = (threadId: string) =>
    run(`undo-${threadId}`, async (t) => {
      await api.undoDismissEmailReply(t, caseId, threadId);
      await refreshThreads();
      setUndoId(null);
      return { type: 'success', text: 'ยกเลิกแล้ว — อีเมลนี้กลับมาอยู่ในรายการรอตอบ' };
    });

  const suggestDates = (message: CaseEmailThreadDetail['messages'][number]) => {
    if (!window.confirm('ให้ AI อ่านอีเมลนี้เพื่อหาวันนัด / กำหนดยื่น?')) return;
    run(`ai-dates-${message.id}`, async (t) => {
      const result = await api.suggestDatesFromEmailMessage(t, caseId, message.id);
      if (result.created === 0) return { type: 'success', text: 'AI ไม่พบวันนัดหรือกำหนดยื่นในอีเมลนี้' };
      return {
        type: 'success',
        text: `พบ ${result.created} วัน — `,
        action: onOpenSuggestions ? { label: 'ไปยืนยันที่ รายการวันที่แนะนำ', onClick: onOpenSuggestions } : undefined,
      };
    });
  };

  const unlinkThread = (threadId: string) => {
    if (!window.confirm('นำอีเมลนี้ออกจากคดี? อีเมลจะกลับไปอยู่ในคิวอีเมล')) return;
    run(`thread-${threadId}`, async (t) => {
      await api.unlinkThreadFromCase(t, threadId);
      setSelectedId(null);
      await load();
      return { type: 'success', text: 'นำอีเมลออกจากคดีแล้ว' };
    });
  };

  const download = (attachment: EmailAttachmentItem) =>
    run(`dl-${attachment.id}`, async (t) => {
      const blob = await api.downloadEmailAttachment(t, attachment.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return null;
    });

  const saveToDocuments = (attachment: EmailAttachmentItem) =>
    run(`save-${attachment.id}`, async (t) => {
      const result = await api.saveEmailAttachmentToCase(t, caseId, attachment.id);
      setDetailTick((n) => n + 1);
      return {
        type: 'success',
        text: result.alreadySaved
          ? `"${result.document.filename}" อยู่ในเอกสารคดีแล้ว`
          : `บันทึก "${result.document.filename}" เข้าเอกสารคดีแล้ว`,
      };
    });

  // One at a time on purpose: each save copies the file; a failure stops and reports how far it got.
  const saveAllToDocuments = (attachments: EmailAttachmentItem[]) =>
    run('save-all', async (t) => {
      let saved = 0;
      try {
        for (const attachment of attachments) {
          await api.saveEmailAttachmentToCase(t, caseId, attachment.id);
          saved += 1;
        }
      } catch (e) {
        return { type: 'error', text: `บันทึกได้ ${saved} จาก ${attachments.length} ไฟล์ — ${errorText(e, 'ไฟล์ถัดไปบันทึกไม่สำเร็จ')}` };
      } finally {
        setDetailTick((n) => n + 1);
      }
      return { type: 'success', text: `บันทึกไฟล์แนบ ${saved} ไฟล์เข้าเอกสารคดีแล้ว` };
    });

  const awaiting = !!threads?.find((x) => x.id === selectedId)?.awaitingReplySince;
  const lastInbound = detail?.messages.filter((m) => m.direction === 'INBOUND').at(-1);

  if (threads === null) return <PageLoading title="กำลังโหลดอีเมลของคดี" lines={3} />;

  const retryLoad = () => {
    setNotice(null);
    load();
  };

  return (
    <div className="space-y-5">
      {linkDialogOpen && token && <LinkEmailDialog token={token} caseId={caseId} caseRef={caseRef} threads={threads} onClose={() => setLinkDialogOpen(false)} onLinked={load} />}
      <UndoToast action={undo} onDismiss={() => setUndo(null)} />
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-bold">อีเมลของคดีนี้ ({threads.length} เรื่อง)</h3><p className="mt-[.3rem] text-[.82rem] leading-[1.45] text-muted-foreground">อีเมลที่ผูกไว้ ทุกคนในทีมเปิดอ่านได้ และไฟล์แนบเข้าแท็บเอกสารให้อัตโนมัติ</p></div><div className="text-right"><button type="button" disabled={busy !== null} onClick={() => setLinkDialogOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-[.4rem] rounded-lg bg-[#142e43] px-4 text-[.95rem] font-semibold text-[#fffdfa]"><MailPlus aria-hidden="true" className="h-[1.1em] w-[1.1em]" />ผูกอีเมลเข้าคดี</button><p className="mt-[.3rem] text-[.82rem] leading-[1.45] text-muted-foreground">เลือกอีเมลจากกล่องจดหมาย ผูกได้หลายฉบับพร้อมกัน</p></div></div>
      {suggested.length > 0 && <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[#c9d6e3] bg-[#f3f7fb] px-5 py-4"><div className="flex items-start gap-3"><Sparkles aria-hidden="true" className="mt-0.5 h-[1.1em] w-[1.1em] shrink-0 text-[#2b5a8a]" /><div className="min-w-0"><b>มีอีเมลใหม่ {suggested.length} ฉบับที่น่าจะเกี่ยวกับคดีนี้</b><p className="mt-[.3rem] break-words text-[.82rem] leading-[1.45] text-muted-foreground">{suggested.map((row) => `“${row.subject}”`).join(' และ ')}</p></div></div><div className="flex gap-2"><button type="button" disabled={busy !== null} onClick={() => { void run('link-suggested', async t => { const linked: string[] = []; const failed: string[] = []; for (const row of suggested) { try { await api.linkThreadToCase(t, row.threadId, caseId); linked.push(row.threadId); } catch { failed.push(row.subject); } } await load(); if (linked.length) setUndo({ message: `ผูก ${linked.length} อีเมลแล้ว`, undo: async () => { while (linked.length) { await api.unlinkThreadFromCase(t, linked[0]); linked.shift(); } await load(); } }); return failed.length ? { type: 'error', text: `ผูกไม่สำเร็จ: ${failed.join(' · ')}` } : null; }); }} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#142e43] px-4 text-[.95rem] font-semibold text-[#fffdfa] disabled:opacity-60">ผูกทั้ง {suggested.length} ฉบับ</button><button type="button" disabled={busy !== null} onClick={() => setLinkDialogOpen(true)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#c9ccc6] bg-white px-4 text-[.95rem] font-semibold text-[#142e43]">ดูก่อน</button></div></section>}
      {notice && (
        <p
          role="status"
          className={`rounded-lg p-3 text-sm ${notice.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}
        >
          {notice.text}
          {undoId && notice.type === 'success' && notice.text.startsWith('ทำเครื่องหมาย') && (
            <button type="button" className="ml-2 underline" disabled={busy !== null} onClick={() => undoDismiss(undoId)}>
              เลิกทำ
            </button>
          )}
          {notice.action && (
            <button type="button" className="ml-2 underline" onClick={notice.action.onClick}>
              {notice.action.label}
            </button>
          )}
        </p>
      )}


      {threadsFailed && threads.length > 0 && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          รีเฟรชอีเมลไม่สำเร็จ — แสดงข้อมูลล่าสุดที่โหลดได้
          <Button size="sm" variant="outline" onClick={retryLoad}>
            ลองใหม่
          </Button>
        </p>
      )}
      {threadsFailed && threads.length === 0 ? (
        <LoadFailed message="โหลดอีเมลไม่สำเร็จ" onRetry={retryLoad} />
      ) : threads.length === 0 ? (
        <section className="rounded-xl border border-[#e2e0d8] bg-card p-5"><p className="font-semibold">ยังไม่มีอีเมลในคดีนี้</p><p className="mt-[.3rem] text-[.82rem] leading-[1.45] text-muted-foreground">กด “ผูกอีเมลเข้าคดี” เพื่อเลือกอีเมลที่เกี่ยวกับคดีนี้ ระบบเลือกฉบับที่น่าจะเกี่ยวไว้ให้แล้ว</p></section>
      ) : (
        <>
        <section className="overflow-hidden rounded-xl border border-[#e2e0d8] bg-card shadow-[0_4px_16px_rgba(20,46,67,.06)]">
          <ul className="divide-y divide-[#e2e0d8]" aria-label="อีเมลในคดี">
            {(showAllThreads ? threads : threads.slice(0, 6)).map((thread) => <li key={thread.id} className={`flex flex-wrap items-center gap-4 px-5 py-4 ${selectedId === thread.id ? 'bg-[#f3f7fb]' : ''}`}>
              <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${thread.awaitingReplySince ? 'bg-[#e6eef7] text-[#2b5a8a]' : 'bg-[#eeebe3]'}`}><Mail className="h-[1.1em] w-[1.1em]" /></span>
              <div className="min-w-0 flex-1"><b className="break-words">{thread.subject}</b><div className="text-[.8rem] text-muted-foreground">{[thread.fromName ?? thread.fromAddress, `${thread.messageCount} ข้อความ`, `ล่าสุด ${formatDateTime(thread.lastMessageAt)}`].filter(Boolean).join(' · ')}</div></div>
              {thread.attachmentCount > 0 && <span className="inline-flex items-center gap-[.4rem] rounded-full bg-[#eeebe3] px-[.9rem] py-[.45rem] text-[.85rem]"><Paperclip aria-hidden="true" className="h-[1.1em] w-[1.1em]" />{thread.attachmentCount} ไฟล์</span>}
              {thread.awaitingReplySince && <span className="rounded-full bg-[#e6eef7] px-3 py-1 text-xs font-semibold text-[#2b5a8a]">ยังไม่ได้ตอบ</span>}
              <button type="button" onClick={() => selectThread(thread.id)} aria-current={selectedId === thread.id ? 'true' : undefined} className="inline-flex min-h-11 items-center rounded-lg px-4 text-[.95rem] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{selectedId === thread.id ? 'เปิดอยู่' : 'เปิด'}</button>
            </li>)}
          </ul>
          {threads.length > 6 && <button type="button" onClick={() => setShowAllThreads((v) => !v)} className="flex w-full items-center gap-1 border-t border-[#e2e0d8] px-5 py-3 text-sm font-semibold underline">{showAllThreads ? 'แสดงเฉพาะล่าสุด' : <>ดูอีเมลทั้งหมด ({threads.length}) <ArrowRight aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></>}</button>}
        </section>
          <div className="min-w-0">
            
            {selectedId && detailFailed && (
              <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                {detail ? 'รีเฟรชอีเมลไม่สำเร็จ — แสดงข้อมูลล่าสุด' : 'เปิดอีเมลไม่สำเร็จ'}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDetailFailed(false);
                    setDetailTick((n) => n + 1);
                  }}
                >
                  ลองใหม่
                </Button>
              </p>
            )}
            {selectedId && !detail && !detailFailed && <PageLoading title="กำลังเปิดอีเมล" lines={3} />}
            {detail && (
              <Card>
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="min-w-0 font-semibold">{detail.subject}</h3>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => unlinkThread(detail.id)}>
                      <Unlink aria-hidden="true" className="h-4 w-4" /> นำออกจากคดี
                    </Button>
                  </div>
                  {awaiting && lastInbound && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
                      <span>อีเมลนี้ยังไม่ได้ตอบ</span>
                      <span className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => setComposer({ kind: 'reply', replyAll: false, threadSubject: detail.subject, message: lastInbound })}
                        >
                          ตอบกลับ
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => dismissReply(detail.id)}>
                          ไม่ต้องตอบ
                        </Button>
                      </span>
                    </div>
                  )}
                  <CaseUnknownAddresses key={detail.id} caseId={caseId} threadId={detail.id} />
                  {detail.messages.map((message, index) => (
                    <EmailMessageCard
                      key={message.id}
                      message={message}
                      subject={detail.subject}
                      defaultExpanded={index === detail.messages.length - 1}
                    >
                      {message.mentionTasks && message.mentionTasks.length > 0 && (
                        <EmailMentionTasks
                          key={message.mentionTasks.map((s) => s.taskId ?? s.assigneeId).join()}
                          caseId={caseId}
                          messageId={message.id}
                          suggestions={message.mentionTasks}
                          onCreated={() => setDetailTick((n) => n + 1)}
                        />
                      )}
                      {message.attachments.length > 0 && (
                        <ul className="space-y-1" aria-label="ไฟล์แนบ">
                          {message.attachments.map((attachment) => (
                            <li key={attachment.id} className="flex flex-wrap items-center gap-2 text-sm">
                              <Paperclip aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="min-w-0 truncate">{attachment.filename}</span>
                              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => download(attachment)}>
                                <Download aria-hidden="true" className="h-4 w-4" /> ดาวน์โหลด
                              </Button>
                              {attachment.savedDocumentId ? (
                                <span className="inline-flex items-center gap-1 text-xs text-success">
                                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> อยู่ในเอกสารคดีแล้ว
                                </span>
                              ) : (
                                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => saveToDocuments(attachment)}>
                                  <FilePlus2 aria-hidden="true" className="h-4 w-4" /> บันทึกเข้าเอกสารคดี
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {(() => {
                        const unsaved = message.attachments.filter((a) => !a.savedDocumentId);
                        return unsaved.length > 1 ? (
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => saveAllToDocuments(unsaved)}>
                            <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                            {busy === 'save-all' ? 'กำลังบันทึก…' : `บันทึกไฟล์แนบทั้งหมดเข้าเอกสารคดี (${unsaved.length})`}
                          </Button>
                        ) : null;
                      })()}
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setComposer({ kind: 'reply', replyAll: false, threadSubject: detail.subject, message })}
                        >
                          ตอบกลับ
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setComposer({ kind: 'reply', replyAll: true, threadSubject: detail.subject, message })}
                        >
                          ตอบทั้งหมด
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => suggestDates(message)}>
                          {busy === `ai-dates-${message.id}` ? 'AI กำลังอ่าน…' : 'ให้ AI หาวันนัด / กำหนดยื่น'}
                        </Button>
                      </div>
                    </EmailMessageCard>
                  ))}
                  <p className="text-xs text-muted-foreground">รูปภาพจากภายนอกในอีเมลถูกบล็อกเพื่อความปลอดภัย</p>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
      <details className="rounded-xl border border-[#e2e0d8] bg-card">
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-5 py-3 font-semibold">เครื่องมือเพิ่มเติม <span className="text-[.8rem] font-normal text-muted-foreground">· ผูก folder Outlook · ซิงก์อีเมล · เขียนอีเมลใหม่</span></summary>
        <div className="border-t border-[#e2e0d8] p-5">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <FolderOpen aria-hidden="true" className="h-4 w-4 text-muted-foreground" /> folder Outlook ที่ผูกกับคดี
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy !== null} onClick={() => setLinkDialogOpen(true)}><Plus aria-hidden="true" className="h-4 w-4" />ผูกอีเมลเข้าคดี</Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setComposer({ kind: 'new' })}>
                เขียนอีเมล
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null || links.length === 0} onClick={syncNow}>
                <RefreshCw aria-hidden="true" className="h-4 w-4" /> {busy === 'sync' ? 'กำลังซิงก์…' : 'ซิงก์ตอนนี้'}
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={openPicker}>
                ผูก folder Outlook
              </Button>
            </div>
          </div>

          {linksFailed && (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              โหลดรายการ folder ไม่สำเร็จ
              <Button size="sm" variant="outline" onClick={retryLoad}>
                ลองใหม่
              </Button>
            </p>
          )}
          {!linksFailed && links.length === 0 && (
            <p className="text-sm text-muted-foreground">ยังไม่ได้ผูก folder</p>
          )}
          {links.map((link) => (
            <div key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{link.displayPath}</p>
                <p className="text-xs text-muted-foreground">
                  {link.connection.mailboxAddress}
                  {link.lastSyncedAt ? ` · ซิงก์ล่าสุด ${formatDateTime(link.lastSyncedAt)}` : ' · กำลังดึงอีเมลครั้งแรก'}
                </p>
                {link.lastError && <p className="mt-0.5 text-xs text-destructive">{link.lastError}</p>}
              </div>
              <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive" disabled={busy !== null} onClick={() => unlinkFolder(link)}>
                ยกเลิกการผูก
              </Button>
            </div>
          ))}

          {folders && (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <label htmlFor="case-email-folder" className="text-sm font-medium">
                เลือก folder ในกล่องอีเมลของคุณ
              </label>
              <select
                id="case-email-folder"
                value={pickedFolderId}
                onChange={(e) => setPickedFolderId(e.target.value)}
                className="min-h-10 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">— เลือก folder —</option>
                {folders.map((row) => {
                  const hit = row.suggestions.find((s) => s.caseId === caseId);
                  return (
                    <option key={row.folderId} value={row.folderId}>
                      {row.displayPath}
                      {hit ? ` (แนะนำ: ${MATCH_REASON_LABELS[hit.reason]})` : ''}
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-muted-foreground">
                อีเมลใน folder นี้ทั้งหมด (รวมย้อนหลัง) จะเข้าคดี และทุกคนที่มีสิทธิ์ในคดีจะเห็น
              </p>
              <div className="flex gap-2">
                <Button size="sm" disabled={!pickedFolderId || busy !== null} onClick={linkPicked}>
                  {busy === 'link' ? 'กำลังผูก…' : 'ผูก folder นี้กับคดี'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setFolders(null)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      </details>
      <CaseEmailComposer
        caseId={caseId}
        mode={composer}
        onClose={() => setComposer(null)}
        onSent={(result) => {
          void load();
          if (result.threadId) setSelectedId(result.threadId);
          setDetailTick((n) => n + 1);
        }}
      />
    </div>
  );
}
