'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseDetail } from '@/lib/portal-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function PortalCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [detail, setDetail] = useState<PortalCaseDetail | null>(null);

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
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl">
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
      </div>
    </div>
  );
}
