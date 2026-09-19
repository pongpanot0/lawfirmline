'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip, Download, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseMessageEntry, caseMessageAttachmentUrl } from '@/lib/api';
import { withFirmSlugHeaders } from '@/lib/firm-slug';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/task-detail';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';

const TIME = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Bangkok',
});
const DAY = new Intl.DateTimeFormat('th-TH', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});

/**
 * สายการติดต่อกับลูกความแบบ log — เรียงตามเวลา คั่นด้วยวัน
 * เอกสารที่ลูกความส่งเข้ามาขึ้นในสายเดียวกัน ไม่ต้องไปหาอีกที่
 */
export function CaseMessagesPanel({ caseId }: { caseId: string }) {
  const d = useDashboardT();
  const id = caseId;
  const { token } = useAuth();
  const [messages, setMessages] = useState<CaseMessageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!token || !id) return;
    api
      .getCaseMessages(token, id)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!token || !id || (!body.trim() && !file)) return;
    setSending(true);
    setError('');
    try {
      await api.sendCaseMessage(token, id, body.trim(), file ?? undefined);
      setBody('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : d.messages.sendFailed);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const download = async (message: CaseMessageEntry) => {
    if (!token) return;
    setDownloadingId(message.id);
    try {
      const res = await fetch(caseMessageAttachmentUrl(id, message.id), {
        headers: withFirmSlugHeaders({ Authorization: `Bearer ${token}` }),
      });
      if (!res.ok) throw new ApiError(res.status, res.statusText);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = message.filename ?? 'attachment';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('ดาวน์โหลดไฟล์ไม่สำเร็จ');
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) return <PageLoading title={d.common.loading} lines={3} />;

  let lastDay = '';

  return (
    <div className="rounded-xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold text-foreground">{d.messages.title}</h2>
        <p className="text-sm text-muted-foreground">
          คุยกับลูกความผ่าน portal — ข้อความและเอกสารที่ส่งเข้ามาอยู่รวมกันที่นี่
        </p>
      </div>

      <div className="max-h-[50vh] space-y-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <InlineEmptyState
            title={d.messages.noMessages}
            description="ข้อความและไฟล์ที่ส่งหากันในคดีนี้จะเรียงไว้ตรงนี้ตามเวลา"
          />
        )}
        {messages.map((m) => {
          const day = DAY.format(new Date(m.createdAt));
          const newDay = day !== lastDay;
          lastDay = day;
          const fromStaff = m.senderType === 'STAFF';
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{day}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className="flex gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                <span
                  className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                    fromStaff ? 'bg-primary' : 'bg-amber-500'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {fromStaff ? 'ทีมงาน' : 'ลูกความ'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {TIME.format(new Date(m.createdAt))}
                    </span>
                  </div>
                  {m.body && (
                    <p className="whitespace-pre-wrap text-sm text-foreground">{m.body}</p>
                  )}
                  {m.filename && (
                    <button
                      type="button"
                      onClick={() => download(m)}
                      disabled={downloadingId === m.id}
                      className="mt-1 inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{m.filename}</span>
                      {m.size != null && (
                        <span className="shrink-0 text-muted-foreground">{formatBytes(m.size)}</span>
                      )}
                      <Download className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-5 pb-2 text-sm text-destructive">{error}</p>}

      <div className="border-t p-4">
        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button
              type="button"
              aria-label="เอาไฟล์ออก"
              onClick={() => {
                setFile(null);
                if (fileInput.current) fileInput.current.value = '';
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-soft transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={d.messages.placeholder}
          />
          <div className="flex flex-col gap-2">
            <input
              ref={fileInput}
              type="file"
              aria-label="แนบไฟล์"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={sending || (!body.trim() && !file)}
            >
              {sending ? d.messages.sending : d.messages.send}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
