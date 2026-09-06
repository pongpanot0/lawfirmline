'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseDetail, CaseMessageEntry, PortalApiError } from '@/lib/portal-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function PortalCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<PortalCaseDetail | null>(null);
  const [messages, setMessages] = useState<CaseMessageEntry[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token || !id) return;
    portalApi
      .getCase(token, id)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [token, id]);

  const loadMessages = () => {
    if (!token || !id) return;
    portalApi
      .getCaseMessages(token, id)
      .then(setMessages)
      .catch(console.error);
  };

  useEffect(() => { loadMessages(); }, [token, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendMessage = async () => {
    if (!token || !id || !messageBody.trim()) return;
    setSendingMessage(true);
    setMessageError('');
    try {
      await portalApi.sendCaseMessage(token, id, messageBody.trim());
      setMessageBody('');
      loadMessages();
    } catch (e) {
      setMessageError(e instanceof PortalApiError ? e.message : 'Could not send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleDownload = async (documentId: string, filename: string) => {
    if (!token) return;
    const blob = await portalApi.downloadDocument(token, documentId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !contact || !detail) return null;

  return (
    <div className="min-h-screen w-full bg-background p-6">
      <div className="w-full">
        <Link href="/portal" className="text-sm text-primary hover:underline">
          ← All cases
        </Link>
        <div className="mt-2 mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{detail.title}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.ownRef}
              {detail.courtName ? ` · ${detail.courtName}` : ''}
            </p>
          </div>
          <Badge>{detail.status}</Badge>
        </div>

        <Card className="mb-4">
          <CardContent className="p-5">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Next hearing</h2>
            {detail.nextHearing ? (
              <p className="text-sm">
                {detail.nextHearing.title} — {new Date(detail.nextHearing.startAt).toLocaleString()}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming hearing scheduled.</p>
            )}
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Documents</h2>
            {detail.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents shared yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.documents.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleDownload(d.id, d.filename)}
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent/50"
                  >
                    <span>{d.filename}</span>
                    <Download className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Invoices</h2>
            {detail.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.dueAt ? `Due ${new Date(inv.dueAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">฿{inv.totalAmount.toLocaleString()}</p>
                      <Badge variant={inv.status === 'PAID' ? 'success' : 'warning'}>{inv.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Messages</h2>

            {messageError && <p className="mb-3 text-sm text-destructive">{messageError}</p>}

            <div className="mb-4 max-h-[50vh] space-y-3 overflow-y-auto rounded-lg border border-border bg-background p-3">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.senderType === 'CONTACT'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <p>{m.body}</p>
                  <p
                    className={`mt-1 text-xs ${
                      m.senderType === 'CONTACT' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}
                  >
                    {new Date(m.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="flex gap-2">
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={2}
                className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
                placeholder="Type a message..."
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={sendingMessage || !messageBody.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {sendingMessage ? 'Sending...' : 'Send'}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
