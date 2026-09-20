'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { downloadPettyCashCsv } from '@/lib/petty-cash-csv';
import { ArrowLeft, Printer, Send, Download } from 'lucide-react';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ExpenseItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { formatCurrency, formatDate } from '@/lib/utils';

/**
 * Printable reimbursement slip: lawyer reviews selected drafts here, then
 * sends them to the owner (which flips DRAFT → PENDING and notifies owners).
 */
function ExpenseClaimContent() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ids = useMemo(
    () =>
      (searchParams.get('ids') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    [searchParams],
  );

  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const authToken = token ?? getStoredToken();
    if (!authToken || ids.length === 0) {
      setLoading(false);
      return;
    }
    api
      .getExpenses(authToken)
      .then((all) => {
        const selected = all.filter((e) => ids.includes(e.id));
        setItems(selected);
        if (selected.length !== new Set(ids).size) { setItems([]); setError('บางรายการไม่พบหรือไม่มีสิทธิ์เข้าถึง กรุณากลับไปเลือกรายการใหม่'); return; }
        if (selected.length === 0) {
          setError(d.expenses.claimEmpty);
        }
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : d.expenses.loadFailed);
      })
      .finally(() => setLoading(false));
  }, [token, ids, d.expenses.claimEmpty, d.expenses.loadFailed]);

  const total = items.reduce((sum, e) => sum + e.amount, 0);
  const lawyerName = [...new Set(items.map(e => `${e.user.firstName} ${e.user.lastName}`))].join(', ') || '—';
  const today = formatDate(new Date().toISOString());

  const handleSend = async () => {
    const authToken = token ?? getStoredToken();
    if (!authToken || !items.length || submitting || items.some(e => e.status !== 'DRAFT')) return;
    setSubmitting(true);
    setError('');
    try {
      await api.submitExpenses(
        authToken,
        items.map((e) => e.id),
      );
      router.push('/expenses?sent=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : d.expenses.submitDraftFailed);
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoading title={d.common.loading} lines={3} />;

  if (ids.length === 0) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{d.expenses.claimNoSelection}</p>
        <Link href="/expenses" className="mt-3 inline-block text-sm text-primary hover:underline">
          {d.expenses.back}
        </Link>
      </div>
    );
  }

  return (
    <div id="expense-claim-print" className="mx-auto max-w-3xl p-4 md:p-6"><style>{`@media print { body * { visibility: hidden; } #expense-claim-print, #expense-claim-print * { visibility: visible; } #expense-claim-print { position: absolute; inset: 0; width: 100%; max-width: none; overflow: visible; } main { overflow: visible !important; } }`}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/expenses" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          {d.expenses.back}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={exporting || !items.length} onClick={async () => {
            const authToken = token ?? getStoredToken(); if (!authToken) return;
            setExporting(true); setError('');
            try { await downloadPettyCashCsv({ firmName: user?.firmName ?? '', requesterName: lawyerName, expenses: items, fetchReceipt: id => api.downloadExpenseReceipt(authToken, id) }); }
            catch (e) { setError(e instanceof Error ? e.message : 'ดาวน์โหลดไม่สำเร็จ'); }
            finally { setExporting(false); }
          }}><Download className="h-4 w-4" />{exporting ? 'กำลังรวมเอกสาร…' : 'ดาวน์โหลดใบเบิกพร้อมไฟล์แนบ'}</Button>
          <Button type="button" variant="outline" disabled={!items.length} onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            พิมพ์ / บันทึก PDF เฉพาะใบเบิก
          </Button>
          {items.length > 0 && items.every(e => e.status === 'DRAFT') && <Button type="button" disabled={submitting || exporting} onClick={handleSend}>
            <Send className="h-4 w-4" />
            {submitting ? d.expenses.submitting : d.expenses.reviewedSendToOwner}
          </Button>}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive print:hidden">
          {error}
        </div>
      )}

      <p className="mb-4 text-sm text-muted-foreground print:hidden">ดาวน์โหลด ZIP ข้างในมีไฟล์ CSV (เปิดใน Excel ได้ คอลัมน์ไฟล์ใบเสร็จชี้ไปที่ไฟล์แนบ) ไฟล์แนบต้นฉบับอยู่ในโฟลเดอร์ใบเสร็จ และใบเบิก.html สำหรับพิมพ์/บันทึก PDF การดาวน์โหลดไม่เปลี่ยนสถานะหรือส่งอนุมัติ</p>

      <Card className="print:border-black print:shadow-none">
        <CardContent className="space-y-5 p-6 md:p-8">
          <div className="border-b border-border pb-4 text-center">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">
              {user?.firmName ?? 'สำนักงาน'}
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight">{d.expenses.claimTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {d.expenses.claimDate}: {today}
            </p>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">{d.expenses.claimRequester}: </span>
              <span className="font-medium">{lawyerName}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{d.expenses.claimItemCount}: </span>
              <span className="font-medium">{items.length}</span>
            </p>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-2 font-semibold">#</th>
                <th className="py-2 pr-2 font-semibold">{d.expenses.descriptionField}</th>
                <th className="py-2 pr-2 font-semibold">{d.expenses.caseField}</th>
                <th className="py-2 pr-2 font-semibold">{d.expenses.category}</th>
                <th className="py-2 text-right font-semibold">{d.expenses.amount}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e, index) => (
                <tr key={e.id} className="border-b border-border/70 align-top">
                  <td className="py-2.5 pr-2 text-muted-foreground">{index + 1}</td>
                  <td className="py-2.5 pr-2">
                    <p className="font-medium">{e.description}</p><p className="text-xs text-muted-foreground">{e.user.firstName} {e.user.lastName} · {({ DRAFT: d.expenses.statusDraft, PENDING: d.expenses.statusPending, APPROVED: d.expenses.statusApproved, PAID: d.expenses.statusPaid, REJECTED: d.expenses.statusRejected })[e.status]}</p>
                    {e.expensePurpose && (
                      <p className="text-xs text-muted-foreground">{e.expensePurpose}</p>
                    )}
                    {e.receiptFilename && (
                      <p className="text-xs text-muted-foreground">
                        {d.expenses.receipt}: {e.receiptFilename}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 pr-2 text-muted-foreground">
                    {e.case?.ownRef ?? d.expenses.general}
                  </td>
                  <td className="py-2.5 pr-2 text-muted-foreground">{e.category ?? '—'}</td>
                  <td className="py-2.5 text-right font-medium">{formatCurrency(e.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="pt-3 text-right font-semibold">
                  {d.expenses.claimTotal}
                </td>
                <td className="pt-3 text-right text-base font-extrabold">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-10 grid gap-10 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-8 text-muted-foreground">{d.expenses.claimRequesterSign}</p>
              <div className="border-t border-border pt-2">
                <p className="font-medium">{lawyerName}</p>
                <p className="text-xs text-muted-foreground">{d.expenses.claimSignDate}</p>
              </div>
            </div>
            <div>
              <p className="mb-8 text-muted-foreground">{d.expenses.claimOwnerSign}</p>
              <div className="border-t border-border pt-2">
                <p className="font-medium text-muted-foreground">________________</p>
                <p className="text-xs text-muted-foreground">{d.expenses.claimSignDate}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ExpenseClaimPage() {
  return (
    <Suspense fallback={<PageLoading title="…" lines={3} />}>
      <ExpenseClaimContent />
    </Suspense>
  );
}
