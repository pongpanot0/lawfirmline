'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseMessageEntry } from '@/lib/api';

export default function CaseMessagesPage() {
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
      setError(e instanceof ApiError ? e.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className="text-slate-500">Loading messages...</p>;

  return (
    <div>
      <Link href={`/cases/${id}`} className="text-sm text-brand-600 hover:underline">← Back to case</Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-slate-900">Messages</h1>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-4 max-h-[60vh] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
        {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              m.senderType === 'STAFF' ? 'ml-auto bg-brand-600 text-white' : 'bg-slate-100 text-slate-900'
            }`}
          >
            <p>{m.body}</p>
            <p className={`mt-1 text-xs ${m.senderType === 'STAFF' ? 'text-brand-100' : 'text-slate-400'}`}>
              {new Date(m.createdAt).toLocaleString()}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Type a message..."
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !body.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
