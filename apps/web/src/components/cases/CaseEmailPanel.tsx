'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FilePlus2, FolderOpen, Mail, Paperclip, RefreshCw, Unlink } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  api,
  ApiError,
  type CaseEmailThreadDetail,
  type CaseEmailThreadItem,
  type CaseFolderLinkItem,
  type EmailAttachmentItem,
  type OutlookFolderRow,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { EmailHtmlFrame } from '@/components/email/EmailHtmlFrame';
import { MATCH_REASON_LABELS } from '@/lib/case-email';
import { formatDateTime } from '@/lib/utils';

type Notice = { type: 'success' | 'error'; text: string } | null;

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

export function CaseEmailPanel({ caseId }: { caseId: string }) {
  const { token } = useAuth();
  const [threads, setThreads] = useState<CaseEmailThreadItem[] | null>(null);
  const [links, setLinks] = useState<CaseFolderLinkItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseEmailThreadDetail | null>(null);
  const [folders, setFolders] = useState<OutlookFolderRow[] | null>(null);
  const [pickedFolderId, setPickedFolderId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [threadsFailed, setThreadsFailed] = useState(false);
  const [linksFailed, setLinksFailed] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailTick, setDetailTick] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    const [threadsResult, linksResult] = await Promise.allSettled([
      api.getCaseEmailThreads(token, caseId),
      api.getCaseFolderLinks(token, caseId),
    ]);
    // Keep the last good data on a failed refresh; flag the failure instead of faking an empty list.
    if (threadsResult.status === 'fulfilled') setThreads(threadsResult.value);
    else setThreads((prev) => prev ?? []);
    setThreadsFailed(threadsResult.status === 'rejected');
    if (linksResult.status === 'fulfilled') setLinks(linksResult.value);
    setLinksFailed(linksResult.status === 'rejected');
  }, [token, caseId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setDetail(null);
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
      return {
        type: 'success',
        text: result.alreadySaved
          ? `"${result.document.filename}" อยู่ในเอกสารคดีแล้ว`
          : `บันทึก "${result.document.filename}" เข้าเอกสารคดีแล้ว`,
      };
    });

  if (threads === null) return <PageLoading title="กำลังโหลดอีเมลของคดี" lines={3} />;

  const retryLoad = () => {
    setNotice(null);
    load();
  };

  return (
    <div className="space-y-4">
      {notice && (
        <p
          role="status"
          className={`rounded-lg p-3 text-sm ${notice.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-destructive/10 text-destructive'}`}
        >
          {notice.text}
        </p>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <FolderOpen className="h-4 w-4" /> folder Outlook ที่ผูกกับคดี
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy !== null || links.length === 0} onClick={syncNow}>
                <RefreshCw className="h-4 w-4" /> {busy === 'sync' ? 'กำลังซิงก์…' : 'ซิงก์ตอนนี้'}
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
            <p className="text-sm text-muted-foreground">
              ยังไม่ได้ผูก folder — อีเมลที่ผูกทีละฉบับจากคิวอีเมลจะแสดงด้านล่าง
            </p>
          )}
          {links.map((link) => (
            <div key={link.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{link.displayPath}</p>
                <p className="text-xs text-muted-foreground">
                  {link.connection.mailboxAddress}
                  {link.lastSyncedAt ? ` · ซิงก์ล่าสุด ${formatDateTime(link.lastSyncedAt)}` : ' · กำลังดึงอีเมลครั้งแรก'}
                </p>
                {link.lastError && <p className="mt-0.5 text-xs text-destructive">{link.lastError}</p>}
              </div>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => unlinkFolder(link)}>
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
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
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

      {threadsFailed ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
          โหลดอีเมลไม่สำเร็จ
          <Button size="sm" variant="outline" onClick={retryLoad}>
            ลองใหม่
          </Button>
        </div>
      ) : threads.length === 0 ? (
        <InlineEmptyState
          icon={Mail}
          title="ยังไม่มีอีเมลในคดีนี้"
          description="ผูก folder Outlook ของคดี หรือผูกอีเมลทีละฉบับจากหน้าคิวอีเมล"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <ul className="space-y-2" aria-label="อีเมลในคดี">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => selectThread(thread.id)}
                  aria-current={selectedId === thread.id ? 'true' : undefined}
                  className={`w-full rounded-lg border p-3 text-left ${selectedId === thread.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                >
                  <p className="truncate text-sm font-medium">{thread.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {thread.fromName ?? thread.fromAddress ?? '—'} · {formatDateTime(thread.lastMessageAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {thread.messageCount} ข้อความ
                    {thread.attachmentCount > 0 && ` · ไฟล์แนบ ${thread.attachmentCount}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0">
            {!selectedId && <p className="text-sm text-muted-foreground">เลือกอีเมลทางซ้ายเพื่ออ่าน</p>}
            {selectedId && !detail && detailFailed && (
              <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                เปิดอีเมลไม่สำเร็จ
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
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{detail.subject}</h3>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => unlinkThread(detail.id)}>
                      <Unlink className="h-4 w-4" /> นำออกจากคดี
                    </Button>
                  </div>
                  {detail.messages.map((message) => (
                    <article key={message.id} className="space-y-2 rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">
                        <p>
                          <span className="font-medium text-foreground">{message.fromName ?? message.fromAddress ?? '—'}</span>
                          {message.fromName && message.fromAddress ? ` <${message.fromAddress}>` : ''} ·{' '}
                          {message.direction === 'OUTBOUND' ? 'ส่งออก' : 'ได้รับ'} · {formatDateTime(message.receivedAt)}
                        </p>
                        {message.toAddresses.length > 0 && <p>ถึง: {message.toAddresses.join(', ')}</p>}
                        {message.ccAddresses.length > 0 && <p>สำเนา: {message.ccAddresses.join(', ')}</p>}
                      </div>
                      {message.bodyHtml ? (
                        <EmailHtmlFrame html={message.bodyHtml} title={`เนื้อหาอีเมล: ${detail.subject} — ${message.fromName ?? message.fromAddress ?? 'ไม่ทราบผู้ส่ง'} ${formatDateTime(message.receivedAt)}`} />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{message.bodyText ?? ''}</p>
                      )}
                      {message.attachments.length > 0 && (
                        <ul className="space-y-1" aria-label="ไฟล์แนบ">
                          {message.attachments.map((attachment) => (
                            <li key={attachment.id} className="flex flex-wrap items-center gap-2 text-sm">
                              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="min-w-0 truncate">{attachment.filename}</span>
                              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => download(attachment)}>
                                <Download className="h-4 w-4" /> ดาวน์โหลด
                              </Button>
                              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => saveToDocuments(attachment)}>
                                <FilePlus2 className="h-4 w-4" /> บันทึกไฟล์แนบเข้าเอกสารคดี
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                  <p className="text-xs text-muted-foreground">รูปภาพจากภายนอกในอีเมลถูกบล็อกเพื่อความปลอดภัย</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
