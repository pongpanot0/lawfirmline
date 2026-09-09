'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseMessageEntry } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';

export default function CaseMessagesPage() {
  const d = useDashboardT();
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [messages, setMessages] = useState<CaseMessageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!token || !id) return;
    api
      .getCaseMessages(token, id)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!token || !id || !body.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.sendCaseMessage(token, id, body.trim());
      setBody('');
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
      handleSend();
    }
  };

  if (loading) return <PageLoading title={d.common.loading} lines={3} />;

  return (
    <div>
      <Link href={`/cases/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" />
        {d.messages.backToCase.replace('← ', '')}
      </Link>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground">{d.messages.title}</h1>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Card className="mb-4">
        <CardContent className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <InlineEmptyState title={d.messages.noMessages} description="ข้อความที่ส่งในคดีนี้จะอยู่รวมกันตรงนี้เพื่อย้อนดูบริบทได้ง่าย" />
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.senderType === 'STAFF' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted text-foreground'
              }`}
            >
              <p>{m.body}</p>
              <p className={`mt-1 text-xs ${m.senderType === 'STAFF' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {formatDateTime(m.createdAt)}
              </p>
            </div>
          ))}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-soft transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={d.messages.placeholder}
        />
        <Button type="button" onClick={handleSend} disabled={sending || !body.trim()}>
          {sending ? d.messages.sending : d.messages.send}
        </Button>
      </div>
    </div>
  );
}
