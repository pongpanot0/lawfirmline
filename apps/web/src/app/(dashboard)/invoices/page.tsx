'use client';

/* Hallmark · pre-emit critique: P4 H5 E5 S5 R5 V4
 * audience: legal-office staff · use: find, track, create invoices · tone: utilitarian
 * macrostructure: Index-First · theme: existing Samnuan
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, Search, X } from 'lucide-react';
import { InvoicePanel } from '@/components/billing/InvoicePanel';
import { ReceivablesPanel } from '@/components/billing/ReceivablesPanel';
import { hasFirmCapability } from '@lawfirm/shared';
import { api, FirmInvoiceItem, ReceivablesRow } from '@/lib/api';
import { RecordPaymentForm } from '@/components/billing/RecordPaymentForm';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { WhoActsTabs } from '@/components/process/WhoActsTabs';
import { FilterChips } from '@/components/process/FilterChips';
import { StepTracker } from '@/components/process/StepTracker';
import { isOverdue } from '@/lib/process-overdue';

type InvoiceStatus = 'ALL' | 'DRAFT' | 'SENT' | 'PAID';

export default function InvoicesPage() {
  const { token, user } = useAuth();
  const canManageBilling = hasFirmCapability(user?.firmRole, 'manageInvoices') || user?.role === 'ADMIN';
  const [rows, setRows] = useState<FirmInvoiceItem[]>([]);
  const [receivables, setReceivables] = useState<ReceivablesRow[]>([]);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [status, setStatus] = useState<InvoiceStatus>('DRAFT');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  useEffect(() => { const requested = new URLSearchParams(window.location.search).get('tab'); if (requested === 'DRAFT' || requested === 'SENT' || requested === 'PAID') setStatus(requested); }, []);

  const handleMarkSent = async (invoiceId: string) => {
    if (!token) return;
    setSendingId(invoiceId);
    try {
      await api.markInvoiceSent(token, invoiceId);
      setRetry((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งใบแจ้งหนี้ไม่สำเร็จ');
    } finally {
      setSendingId(null);
    }
  };

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([api.getFirmInvoices(token), canManageBilling ? api.getReceivables(token) : Promise.resolve(null)])
      .then(([items, receivableData]) => {
        if (active) { setRows(items); setReceivables(receivableData?.rows ?? []); }
      })
      .catch(() => {
        if (active) setError('โหลดใบแจ้งหนี้ไม่สำเร็จ');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, retry, canManageBilling]);

  const counts = rows.reduce<Record<InvoiceStatus, number>>(
    (total, row) => {
      if (row.status === 'DRAFT' || row.status === 'SENT' || row.status === 'PAID') {
        total[row.status] += 1;
      }
      return total;
    },
    { ALL: rows.length, DRAFT: 0, SENT: 0, PAID: 0 },
  );
  const searchTerm = search.trim().toLocaleLowerCase();
  const filtered = rows.filter((row) => {
    const matchesStatus = status === 'ALL' || row.status === status;
    const searchable = `${row.invoiceNumber} ${row.customerName ?? ''} ${row.clientName ?? ''} ${row.ownRef ?? ''} ${row.subject ?? ''}`.toLocaleLowerCase();
    return matchesStatus && searchable.includes(searchTerm) && (!overdue || isOverdue(row.dueAt) && row.status === 'SENT');
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-20 sm:px-6">
      <PageHeader
        title="ใบแจ้งหนี้"
        description="ค้นหาใบแจ้งหนี้ 20 ใบล่าสุด หรือออกใบใหม่"
        actions={
          canManageBilling && <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            ออกใบแจ้งหนี้
          </Button>
        }
      />

      {canManageBilling && <details id="receivables"><summary className="cursor-pointer py-3">จัดการยอดลูกหนี้และบันทึกรับชำระ</summary><ReceivablesPanel onChanged={() => setRetry((value) => value + 1)} /></details>}

      <WhoActsTabs value={status} onChange={key => setStatus(key as InvoiceStatus)} tabs={[
        { key: 'DRAFT', label: 'ต้องส่ง', count: counts.DRAFT },
        { key: 'SENT', label: 'รอชำระ', count: counts.SENT },
        { key: 'PAID', label: 'ชำระแล้ว', count: counts.PAID },
      ]} />
      <FilterChips value={overdue ? 'overdue' : 'all'} onChange={key => setOverdue(key === 'overdue')} items={[{ key: 'all', label: 'ทั้งหมด', count: counts[status] }, { key: 'overdue', label: 'เลยกำหนดชำระ', count: rows.filter(row => row.status === status && row.status === 'SENT' && isOverdue(row.dueAt)).length }]} />
      <details><summary className="cursor-pointer py-3">ตัวกรองเพิ่ม</summary>
      <section aria-label="ค้นหาและกรองใบแจ้งหนี้" className="space-y-3 rounded-lg border bg-card p-4">
        <label htmlFor="invoice-search" className="sr-only">
          ค้นหาใบแจ้งหนี้
        </label>
        <div className="flex flex-wrap items-center gap-3"><div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="invoice-search"
            type="search"
            placeholder="ค้นหาเลขที่ใบแจ้งหนี้ ผู้ว่าจ้าง หรือเลขคดี"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-input bg-background pl-10 pr-12 text-sm outline-none placeholder:text-muted-foreground hover:border-ring/50 active:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {search && (
            <button
              type="button"
              aria-label="ล้างคำค้นหา"
              onClick={() => setSearch('')}
              className="absolute right-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div><span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">ลองพิมพ์ชื่อผู้ว่าจ้างหรือเลขคดี</span></div>
      </section></details>

      {loading ? (
        <div role="status" aria-label="กำลังโหลดใบแจ้งหนี้" className="space-y-px overflow-hidden rounded-xl border bg-border">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-none bg-card" />)}
        </div>
      ) : error ? (
        <LoadFailed message={error} onRetry={() => setRetry((value) => value + 1)} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="ไม่มีรายการที่ต้องทำ" />
      ) : (
        <section aria-label="รายการใบแจ้งหนี้" className="space-y-3">
          {filtered.map(row => {
            const sourceHref = row.caseId ? `/cases/${row.caseId}?tab=billing` : row.intakeId ? `/intake/${row.intakeId}?tab=overview` : undefined;
            const current = row.status === 'DRAFT' ? 0 : row.status === 'SENT' ? 1 : 2;
            return <article key={row.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium">{row.invoiceNumber} · {row.customerName || row.clientName || 'ไม่ระบุผู้ว่าจ้าง'}</p><p className="text-sm text-muted-foreground">{row.ownRef || row.subject || 'ใบแจ้งหนี้ก่อนรับงาน'}</p></div><p className="font-semibold tabular-nums">{formatCurrency(row.totalAmount)}</p></div>
              <StepTracker variant="mini" steps={['ร่าง', 'ส่งแล้ว', 'ชำระแล้ว'].map((label, i) => ({ key: label, label, state: i < current ? 'done' : i === current ? 'current' : 'todo' }))} />
              {canManageBilling && row.status === 'DRAFT' ? <Button disabled={sendingId === row.id} onClick={() => void handleMarkSent(row.id)}>{sendingId === row.id ? 'กำลังส่ง…' : 'ส่ง →'}</Button> : canManageBilling && row.status === 'SENT' ? receivables.some(item => item.id === row.id) ? <Button onClick={() => setPaymentId(row.id)}>บันทึกรับชำระ →</Button> : <span className="text-sm text-muted-foreground">ไม่พบยอดค้างสำหรับใบนี้</span> : sourceHref ? <Link href={sourceHref} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline">เปิดดู →</Link> : null}
              {paymentId === row.id && receivables.find(item => item.id === row.id) && <RecordPaymentForm invoiceId={row.id} outstanding={receivables.find(item => item.id === row.id)!.outstanding} onCancel={() => setPaymentId(null)} onRecorded={() => { setPaymentId(null); setRetry(value => value + 1); }} />}
            </article>;
          })}
        </section>
      )}

      {creating && (
        <InvoicePanel
          target={{}}
          customers={[]}
          openImmediately
          formOnly
          onDismiss={() => setCreating(false)}
          onChanged={() => {
            setCreating(false);
            setRetry((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
