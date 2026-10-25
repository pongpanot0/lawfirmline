'use client';

/* Hallmark · pre-emit critique: P4 H5 E5 S5 R5 V4
 * audience: legal-office staff · use: find, track, create invoices · tone: utilitarian
 * macrostructure: Index-First · theme: existing Samnuan
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, FileText, Plus, Search, X } from 'lucide-react';
import { InvoicePanel } from '@/components/billing/InvoicePanel';
import { ReceivablesPanel } from '@/components/billing/ReceivablesPanel';
import { hasFirmCapability } from '@lawfirm/shared';
import { api, FirmInvoiceItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';

type InvoiceStatus = 'ALL' | 'DRAFT' | 'SENT' | 'PAID';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'ร่าง',
  SENT: 'ส่งแล้ว',
  PAID: 'ชำระแล้ว',
};

const STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  DRAFT: 'muted',
  SENT: 'default',
  PAID: 'success',
};

export default function InvoicesPage() {
  const { token, user } = useAuth();
  const canManageBilling = hasFirmCapability(user?.firmRole, 'manageInvoices') || user?.role === 'ADMIN';
  const [rows, setRows] = useState<FirmInvoiceItem[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('ALL');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const handleMarkSent = async (invoiceId: string) => {
    if (!token) return;
    setSendingId(invoiceId);
    try {
      await api.markInvoiceSent(token, invoiceId);
      setRetry((value) => value + 1);
    } catch {
      // ข้อความ error แสดงผ่าน action feedback กลางแล้ว
    } finally {
      setSendingId(null);
    }
  };

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError('');
    api
      .getFirmInvoices(token)
      .then((items) => {
        if (active) setRows(items);
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
  }, [token, retry]);

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
    return matchesStatus && searchable.includes(searchTerm);
  });

  const statusFilters: { value: InvoiceStatus; label: string }[] = [
    { value: 'ALL', label: 'ทั้งหมด' },
    { value: 'DRAFT', label: 'ร่าง' },
    { value: 'SENT', label: 'ส่งแล้ว' },
    { value: 'PAID', label: 'ชำระแล้ว' },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-20 sm:px-6">
      <PageHeader
        title="ใบแจ้งหนี้"
        description="20 ใบล่าสุดที่คุณมีสิทธิ์ดู"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            ออกใบแจ้งหนี้
          </Button>
        }
      />

      {canManageBilling && <ReceivablesPanel onChanged={() => setRetry((value) => value + 1)} />}

      <section aria-label="สรุปสถานะใบแจ้งหนี้" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {statusFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={status === filter.value}
            onClick={() => setStatus(filter.value)}
            className={`min-h-16 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              status === filter.value
                ? 'bg-primary/5'
                : 'bg-card hover:bg-muted'
            }`}
          >
            <span className={`block text-sm ${status === filter.value ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{filter.label}</span>
            <span className="mt-1 block text-xl font-semibold tabular-nums">{counts[filter.value]}</span>
          </button>
        ))}
      </section>

      <section aria-label="ค้นหาและกรองใบแจ้งหนี้" className="space-y-3">
        <label htmlFor="invoice-search" className="sr-only">
          ค้นหาใบแจ้งหนี้
        </label>
        <div className="relative">
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
        </div>
      </section>

      {loading ? (
        <div role="status" aria-label="กำลังโหลดใบแจ้งหนี้" className="space-y-px overflow-hidden rounded-xl border bg-border">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-none bg-card" />)}
        </div>
      ) : error ? (
        <LoadFailed message={error} onRetry={() => setRetry((value) => value + 1)} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={rows.length === 0 ? 'ยังไม่มีใบแจ้งหนี้' : 'ไม่พบใบแจ้งหนี้ที่ตรงกัน'}
          description={rows.length === 0 ? 'ใบแจ้งหนี้ที่ออกแล้วจะแสดงที่นี่พร้อมสถานะ' : 'ไม่มีใบที่ตรงกับสถานะหรือคำค้นนี้'}
          action={rows.length > 0 && (search || status !== 'ALL') ? (
            <Button variant="outline" onClick={() => { setSearch(''); setStatus('ALL'); }}>ล้างตัวกรอง</Button>
          ) : rows.length === 0 ? (
            <Button variant="outline" onClick={() => setCreating(true)}><Plus aria-hidden="true" className="h-4 w-4" />ออกใบแจ้งหนี้</Button>
          ) : undefined}
        />
      ) : (
        <section aria-label="รายการใบแจ้งหนี้" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden grid-cols-[minmax(9rem,1.1fr)_minmax(9rem,1fr)_minmax(12rem,1.5fr)_auto] gap-6 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>เลขที่ / สถานะ</span>
            <span>ผู้ว่าจ้าง</span>
            <span>รายการ / ที่มา</span>
            <span className="text-right">ยอดรวม</span>
          </div>
          <ul className="divide-y divide-border">
            {filtered.map((row) => {
              const sourceHref = row.caseId
                ? `/cases/${row.caseId}?tab=billing`
                : row.intakeId
                  ? `/intake/${row.intakeId}?tab=overview`
                  : undefined;
              const sourceLabel = row.caseId ? 'เปิดคดี' : 'เปิดเรื่องรับเข้า';
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 px-4 py-4 lg:grid-cols-[minmax(9rem,1.1fr)_minmax(9rem,1fr)_minmax(12rem,1.5fr)_auto] lg:items-center lg:gap-6 lg:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.invoiceNumber}</p>
                    <Badge variant={STATUS_VARIANTS[row.status] ?? 'muted'} className="mt-1">
                      {STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                    {canManageBilling && row.status === 'DRAFT' && (
                      <button
                        type="button"
                        disabled={sendingId === row.id}
                        onClick={() => void handleMarkSent(row.id)}
                        className="ml-2 mt-1 inline-flex min-h-11 items-center rounded-md border border-input px-2.5 text-xs font-medium hover:bg-muted sm:min-h-8 active:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {sendingId === row.id ? 'กำลังส่ง…' : 'ส่งใบแจ้งหนี้'}
                      </button>
                    )}
                  </div>
                  <p className="col-start-2 row-start-1 whitespace-nowrap text-right font-semibold tabular-nums lg:col-start-4 lg:row-start-1">
                    {formatCurrency(row.totalAmount)}
                  </p>
                  <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1">
                    <span className="mb-1 block text-xs text-muted-foreground lg:hidden">ผู้ว่าจ้าง</span>
                    <p className="truncate text-sm">{row.customerName || row.clientName || 'ไม่ระบุผู้ว่าจ้าง'}</p>
                  </div>
                  <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-3 lg:row-start-1">
                    <span className="mb-1 block text-xs text-muted-foreground lg:hidden">รายการ / ที่มา</span>
                    <p className="truncate text-sm">{row.subject || row.ownRef || 'ใบแจ้งหนี้ก่อนรับงาน'}</p>
                    {sourceHref && (
                      <Link
                        href={sourceHref}
                        className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline active:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {sourceLabel}
                        <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
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
