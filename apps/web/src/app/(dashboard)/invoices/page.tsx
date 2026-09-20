'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { InvoicePanel } from '@/components/billing/InvoicePanel';
import { api, FirmInvoiceItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';

export default function InvoicesPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<FirmInvoiceItem[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!token) return;
    let active = true; setLoading(true); setError('');
    api.getFirmInvoices(token).then((items) => { if (active) setRows(items); })
      .catch(() => { if (active) setError('โหลดใบแจ้งหนี้ไม่สำเร็จ'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, retry]);
  const labels: Record<string, string> = { DRAFT: 'ร่าง', SENT: 'ส่งแล้ว', PAID: 'ชำระแล้ว' };
  const filtered = rows.filter((row) => (status === 'ALL' || row.status === status) && `${row.invoiceNumber} ${row.customerName ?? ''} ${row.ownRef ?? ''} ${row.subject ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="mx-auto w-full max-w-4xl space-y-5 pb-20">
    <header><h1 className="text-2xl font-bold">ใบแจ้งหนี้</h1><p className="mt-1 text-sm text-muted-foreground">20 ใบล่าสุดจากคดี เรื่องรับเข้า และใบที่ออกก่อนรับงาน ตามสิทธิ์ที่คุณดูได้</p></header>
    <div className="flex flex-wrap gap-2">
      <input aria-label="ค้นหาใบแจ้งหนี้" placeholder="บริษัทผู้จ่าย / เลขบิล / เลขคดี" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-input bg-background p-2 text-sm" />
      <select aria-label="สถานะใบแจ้งหนี้" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-input bg-background p-2 text-sm"><option value="ALL">ทุกสถานะ</option>{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    {loading ? <p role="status">กำลังโหลดใบแจ้งหนี้…</p> : error ? <p role="alert">{error} <button className="underline" onClick={() => setRetry((n) => n + 1)}>ลองใหม่</button></p> : <ul className="divide-y rounded-xl border border-border">{filtered.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-3 p-4">
      <div className="min-w-0"><p className="font-medium">{row.invoiceNumber} · {labels[row.status] ?? row.status}</p><p className="text-sm">{row.customerName ?? row.clientName}</p><p className="text-xs text-muted-foreground">{row.subject}</p>{(row.caseId || row.intakeId) && <Link className="mt-1 block text-sm text-primary underline" href={row.caseId ? `/cases/${row.caseId}?tab=billing` : `/intake/${row.intakeId}?tab=overview`}>เปิดเรื่องต้นทาง</Link>}</div><p className="font-semibold">{formatCurrency(row.totalAmount)}</p>
    </li>)}{!filtered.length && <li className="p-4 text-sm text-muted-foreground">ไม่มีรายการที่ตรงกับตัวกรองใน 20 ใบล่าสุด</li>}</ul>}
    <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-medium">ออกหรือจัดการใบแจ้งหนี้ก่อนรับงาน</summary><div className="mt-4"><InvoicePanel target={{}} customers={[]} onChanged={() => setRetry((n) => n + 1)} /></div></details>
  </div>;
}
