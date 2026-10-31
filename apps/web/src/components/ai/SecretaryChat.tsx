'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2 } from 'lucide-react';
import type { SecretaryCard } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * เลขา AI — ถามข้ามทุกคดีที่ผู้ใช้เห็นได้ (คดี เอกสาร นัด งานค้าง)
 * อ่านอย่างเดียว: ตอบจากข้อมูลในระบบ ไม่สร้าง/แก้อะไร
 */

type Msg = { role: 'user' | 'assistant'; content: string; cards?: SecretaryCard[] };

/** Server accepts up to 20; the last 10 are what it actually uses. */
const HISTORY_SENT = 10;

const SUGGESTIONS = ['สัปดาห์นี้ผมมีนัดศาลที่ไหนบ้าง', 'คดีไหนงานค้างนานที่สุด'];

function cardHref(card: SecretaryCard): string {
  switch (card.type) {
    case 'case':
      return `/cases/${card.id}`;
    case 'intake':
      return `/intake/${card.id}`;
    case 'document':
      return card.caseId ? `/cases/${card.caseId}?tab=documents` : '/documents';
    case 'event':
      return `/cases/${card.caseId}`;
  }
}

function cardLabel(card: SecretaryCard): string {
  switch (card.type) {
    case 'case':
      return card.ownRef ? `${card.ownRef} · ${card.title}` : card.title;
    case 'intake':
      return `รับเรื่อง · ${card.title}`;
    case 'document':
      return card.filename;
    case 'event':
      return `${new Date(card.startAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · ${card.title}`;
  }
}

export function SecretaryChat() {
  const { token } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy || !token) return;
    const next = [...messages, { role: 'user' as const, content: q }];
    setMessages(next);
    setInput('');
    setError(null);
    setBusy(true);
    try {
      const res = await api.secretaryChat(
        token,
        next.slice(-HISTORY_SENT).map(({ role, content }) => ({ role, content })),
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply, cards: res.cards }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เลขาตอบไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              ถามเลขาได้ทุกคดีที่คุณเข้าถึง เช่น ภาพรวมคดี หาเอกสาร หรือดูนัด — เลขาตอบจากข้อมูลในระบบเท่านั้น
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="min-h-11 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
              {m.content}
            </div>
          ) : (
            <div key={i} className="mr-auto max-w-[95%] space-y-2 rounded-2xl rounded-bl-sm border border-border bg-muted/40 px-3.5 py-2.5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
              {!!m.cards?.length && (
                <div className="flex flex-col gap-1.5 pt-0.5">
                  {m.cards.map((c) => (
                    <Link
                      key={`${c.type}:${c.id}`}
                      href={cardHref(c)}
                      className="inline-flex min-h-11 items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-1 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
                    >
                      <span className="truncate">{cardLabel(c)}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        {busy && (
          <div role="status" className="mr-auto flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3.5 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> เลขากำลังหาข้อมูล…
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 border-t border-border px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="ถามเลขา"
          placeholder="เช่น คดีบริษัท ก. ถึงไหนแล้ว"
          maxLength={4000}
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          ส่ง
        </button>
      </form>
    </div>
  );
}
