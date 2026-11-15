'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Clock, FileText, Mail, Plus, Receipt } from 'lucide-react';
import { hasFirmCapability } from '@lawfirm/shared';
import { api, type FirmInvoiceItem, type ReceivablesRow, type ReceiptItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { NoAccess } from '@/components/ui/NoAccess';
import { FilterChips } from '@/components/process/FilterChips';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { InvoicePanel } from '@/components/billing/InvoicePanel';
import { RecordPaymentForm } from '@/components/billing/RecordPaymentForm';
import { buildBillingDocHtml, invoiceFirmData, buildReceiptDocHtml, openBillingDocWindow } from '@/lib/billing-doc';
import { isOverdue } from '@/lib/process-overdue';

type Tab = 'DRAFT' | 'SENT' | 'RECEIPTS' | 'PAID';
export default function InvoicesPage() {
  const { token, user } = useAuth();
  const allowed = hasFirmCapability(user?.firmRole, 'manageInvoices');
  const [rows, setRows] = useState<FirmInvoiceItem[]>([]);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [payments, setPayments] = useState<Record<string, ReceivablesRow['pendingCheques']>>({});
  const [tab, setTab] = useState<Tab>('DRAFT');
  const initializedTab = useRef(false);
  const [search, setSearch] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [sort, setSort] = useState('due');
  const [creating, setCreating] = useState(false);
  const [payment, setPayment] = useState<FirmInvoiceItem | null>(null);
  const [clear, setClear] = useState<{ invoiceId: string; payment: ReceivablesRow['pendingCheques'][number] } | null>(null);
  const [clearDate, setClearDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [voiding, setVoiding] = useState<ReceiptItem | null>(null);
  const [reason, setReason] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(v => v + 1);
  useEffect(() => {
    if (!token || !allowed) return;
    let active = true;
    setLoading(true); setError('');
    Promise.all([api.getFirmInvoices(token), api.getReceipts(token), api.getReceivables(token)]).then(([invoices, documents, receivables]) => {
      if (active) { setRows(invoices); setReceipts(documents); if (!initializedTab.current) { setTab(invoices.some(r => r.status === 'DRAFT') ? 'DRAFT' : invoices.some(r => r.status === 'SENT' && r.outstanding > 0) ? 'SENT' : documents.some(r => !r.sentAt && !r.voidedAt) ? 'RECEIPTS' : invoices.some(r => r.status === 'PAID') || documents.some(r => r.sentAt || r.voidedAt) ? 'PAID' : 'DRAFT'); initializedTab.current = true; } setPayments(Object.fromEntries(receivables.rows.map(r => [r.id, r.pendingCheques ?? []]))); }
    }).catch(() => { if (active) setError('โหลดข้อมูลใบแจ้งหนี้และใบเสร็จไม่สำเร็จ ลองใหม่อีกครั้ง'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, allowed, revision]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); refresh(); } catch (e) { const message = e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้ง'; setError(message); setDialogError(message); } finally { setBusy(false); }
  };
  const printInvoice = (row: FirmInvoiceItem) => { const win = window.open('', '_blank'); if (!win) { setError('เปิดหน้าพิมพ์ไม่ได้ ให้อนุญาตป๊อปอัปแล้วลองใหม่อีกครั้ง'); return; } void run(async () => { try {
    if (!token) return;
    const data = await api.getInvoicePrintData(token, row.id);
    const lines = data.lineItems;
    if (!openBillingDocWindow(buildBillingDocHtml({ ...(await invoiceFirmData(token)), kind: 'INVOICE', firmName: user?.firmName ?? '', invoiceNumber: data.invoiceNumber, issuedAt: data.issuedAt, dueAt: data.dueAt, matterLabel: data.case ? `${data.case.ownRef} — ${data.case.title}` : data.intake?.title ?? '', billTo: data.billToCustomer ?? null, lines, totalAmount: data.totalAmount, discountAmount: data.discountAmount, discountReason: data.discountReason }), win)) throw new Error('เปิดหน้าพิมพ์ไม่ได้ ให้อนุญาตป๊อปอัปแล้วลองใหม่อีกครั้ง');
  } catch (e) { win.close(); throw e; } }); };
  const printReceipt = (id: string, existingWindow?: Window) => { const win = existingWindow ?? window.open('', '_blank'); if (!win) { setError('เปิดหน้าพิมพ์ไม่ได้ ให้อนุญาตป๊อปอัปแล้วลองใหม่อีกครั้ง'); return; } void run(async () => { try {
    if (!token) return;
    const data = await api.getReceiptPrintData(token, id);
    let logo: string | undefined;
    if (data.firmSnapshot.logoKey) {
      const blob = await api.getBillingLogo(token, data.firmSnapshot.logoKey);
      logo = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('โหลดโลโก้ไม่สำเร็จ ลองใหม่อีกครั้ง')); reader.readAsDataURL(blob); });
    }
    if (!openBillingDocWindow(buildReceiptDocHtml(data, logo, receipts.find(r => r.id === data.replacesReceiptId)?.receiptNumber, (await api.getFirmInvoices(token)).find(r => r.id === data.invoiceId)?.outstanding), win)) throw new Error('เปิดหน้าพิมพ์ไม่ได้ ให้อนุญาตป๊อปอัปแล้วลองใหม่อีกครั้ง');
  } catch (e) { win.close(); throw e; } }); };
  const pendingReceipts = receipts.filter(r => !r.sentAt && !r.voidedAt);
  const tabs: { key: Tab; label: string; count: number; icon: typeof FileText }[] = [
    { key: 'DRAFT', label: 'ต้องส่ง', count: rows.filter(r => r.status === 'DRAFT').length, icon: Mail },
    { key: 'SENT', label: 'รอชำระ', count: rows.filter(r => r.status === 'SENT' && (r.outstanding ?? 0) > 0).length, icon: Clock },
    { key: 'RECEIPTS', label: 'ต้องส่งใบเสร็จ', count: pendingReceipts.length, icon: Receipt },
    { key: 'PAID', label: 'เสร็จแล้ว', count: rows.filter(r => r.status === 'PAID').length + receipts.filter(r => r.sentAt || r.voidedAt).length, icon: CheckCircle },
  ];
  const filtered = rows.filter(r => r.status === tab && (tab !== 'SENT' || (r.outstanding ?? 0) > 0) && `${r.invoiceNumber} ${r.customerName} ${r.clientName} ${r.ownRef} ${r.subject}`.toLowerCase().includes(search.toLowerCase()) && (!overdue || r.status === 'SENT' && isOverdue(r.dueAt))).sort((a, b) => sort === 'amount' ? (b.outstanding ?? b.totalAmount) - (a.outstanding ?? a.totalAmount) : (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const filteredReceipts = pendingReceipts.filter(r => `${r.receiptNumber} ${r.invoiceNumber} ${r.customerName}`.toLowerCase().includes(search.toLowerCase()));
  if (user && !allowed) return <div className="mx-auto max-w-6xl px-4 sm:px-6"><NoAccess /></div>;
  return <div className="mx-auto max-w-6xl space-y-6 px-4 pb-20 sm:px-6">
    <PageHeader title="ใบแจ้งหนี้ / ใบเสร็จ" description="ทำตามลำดับ: ออกใบแจ้งหนี้ → ส่ง → รับชำระ → ส่งใบเสร็จ" actions={<Button title="กดเพื่อสร้างใบแจ้งหนี้" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />ออกใบแจ้งหนี้</Button>} />
    <div role="tablist" aria-label="ขั้นตอนใบแจ้งหนี้" className="grid grid-cols-2 border-b sm:grid-cols-4">{tabs.map(({ key, label, count, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setOverdue(false); }} title={`กดเพื่อดู${label}`} className={`flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm sm:px-4 ${tab === key ? 'border-primary font-bold text-primary' : 'border-transparent text-muted-foreground'}`}><Icon className="h-4 w-4" />{label}<span className="rounded-full bg-muted px-2 text-xs">{count}</span></button>)}</div>
    {tab === 'SENT' && <section className="rounded-lg border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-4"><span className="text-sm text-muted-foreground">ยอดรอชำระรวมในระบบ</span><strong className="text-2xl">{formatCurrency(rows.filter(r => r.status === 'SENT').reduce((sum, r) => sum + (r.outstanding ?? 0), 0))}</strong><span className="text-sm text-destructive">เลยกำหนด {rows.filter(r => r.status === 'SENT' && isOverdue(r.dueAt)).length} ใบ ({formatCurrency(rows.filter(r => r.status === 'SENT' && isOverdue(r.dueAt)).reduce((sum, r) => sum + (r.outstanding ?? 0), 0))})</span></div></section>}
    <div className="space-y-4"><FilterChips value={overdue ? 'overdue' : 'all'} onChange={key => setOverdue(key === 'overdue')} items={[{ key: 'all', label: 'ทั้งหมด', count: tab === 'RECEIPTS' ? pendingReceipts.length : rows.filter(r => r.status === tab).length }, ...(tab === 'SENT' ? [{ key: 'overdue', label: 'เลยกำหนดชำระ', count: rows.filter(r => r.status === 'SENT' && isOverdue(r.dueAt)).length }] : [])]} /><div className="flex flex-wrap gap-2"><label className="block min-w-64 flex-1 text-sm"><span className="sr-only">ค้นหาใบแจ้งหนี้หรือใบเสร็จ</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเลขที่ ผู้ว่าจ้าง หรือเลขคดี" className="min-h-11 w-full rounded-lg border bg-background px-4" /><span className="mt-1 block text-xs text-muted-foreground">ใช้ค้นหาเลขเอกสารหรือผู้ว่าจ้าง</span></label><label className="text-sm"><span className="sr-only">เรียงตาม</span><select title="ใช้เรียงรายการ" value={sort} onChange={e => setSort(e.target.value)} className="min-h-11 rounded-lg border bg-background px-4"><option value="due">เรียงตาม: วันครบกำหนด</option><option value="amount">เรียงตาม: ยอดค้าง</option></select><span className="mt-1 block text-xs text-muted-foreground">ใช้เปลี่ยนลำดับรายการ</span></label></div></div>
    {error && <LoadFailed message={error} onRetry={refresh} />}
    {!loading && (tab === 'RECEIPTS' || tab === 'PAID') && <div className="space-y-3">{(tab === 'RECEIPTS' ? filteredReceipts : receipts.filter(r => (r.sentAt || r.voidedAt) && `${r.receiptNumber} ${r.invoiceNumber} ${r.customerName}`.toLowerCase().includes(search.toLowerCase()))).map(r => <article key={r.id} className="rounded-lg border bg-card p-5"><div className="grid gap-4 lg:grid-cols-[1fr_1.3fr_240px]"><div className="space-y-3 lg:border-r lg:pr-4"><div className="flex flex-wrap justify-between gap-1"><strong>{r.receiptNumber}</strong><span className="text-xs text-muted-foreground">ออกเมื่อ {new Date(r.issuedAt).toLocaleDateString('th-TH')}</span></div><p>{r.customerName || 'ไม่ระบุผู้ว่าจ้าง'} {rows.find(x => x.id === r.invoiceId)?.clientType && <span className="whitespace-nowrap rounded border px-2 py-1 text-xs">{rows.find(x => x.id === r.invoiceId)?.clientType === 'COMPANY' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}</span>} · {r.invoiceNumber}</p>{r.voidedAt && <p className="text-destructive">ยกเลิกแล้ว</p>}{r.replacesReceiptId && <p>ออกแทน {receipts.find(x => x.id === r.replacesReceiptId)?.receiptNumber || 'ใบเสร็จเดิม'}</p>}</div><div className="space-y-3"><p>รับเงิน {formatCurrency(r.amount + r.whtAmount)} · หัก ณ ที่จ่าย {formatCurrency(r.whtAmount)}</p><p><strong>ยอดรับสุทธิ {formatCurrency(r.amount)}</strong></p>{r.isTaxInvoice && <span className="inline-block whitespace-nowrap rounded border px-2 py-1 text-xs">ใบกำกับภาษี</span>}</div><div className="flex flex-wrap content-start gap-2 lg:border-l lg:pl-4">{!r.sentAt && !r.voidedAt && <Button disabled={busy} title="กดเพื่อบันทึกว่าส่งใบเสร็จแล้ว" onClick={() => token && void run(() => api.markReceiptSent(token, r.id))}>ส่งใบเสร็จ</Button>}{r.voidedAt && <div><Button disabled={busy || receipts.some(x => x.replacesReceiptId === r.id && !x.voidedAt)} title="กดเพื่อออกเลขใหม่" onClick={() => token && void run(() => api.reissueReceipt(token, r.id))}>ออกใบเสร็จใหม่แทน</Button><p className="mt-1 text-xs text-muted-foreground">ออกเลขใหม่ให้รายการรับเงินเดิม</p></div>}<Button variant="outline" title="กดเพื่อพิมพ์ใบเสร็จ" onClick={() => void printReceipt(r.id)}>พิมพ์ใบเสร็จ</Button>{!r.voidedAt && <Button variant="outline" className="border-destructive text-destructive" title="กดเพื่อระบุเหตุผลยกเลิก" onClick={() => { setDialogError(''); setReason(''); setVoiding(r); }}>ยกเลิกใบเสร็จ</Button>}</div></div></article>)}</div>}
    {loading ? <Skeleton className="h-24 w-full" /> : tab === 'RECEIPTS' ? !filteredReceipts.length && <EmptyState icon={Receipt} title="ไม่มีใบเสร็จที่ต้องส่ง" /> : filtered.length ? <div className="space-y-3">{filtered.map(row => { const pending = payments[row.id] ?? []; const href = row.caseId ? `/cases/${row.caseId}?tab=billing` : row.intakeId ? `/intake/${row.intakeId}?tab=overview` : null; const paid = Math.max(0, row.totalAmount - (row.outstanding ?? row.totalAmount)); const date = (v?: string | null) => v ? new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : 'ไม่ระบุ'; return <article key={row.id} className="rounded-lg border bg-card p-4 sm:p-5"><div className="grid gap-4 lg:grid-cols-[1fr_1.3fr_240px]">
      <div className="space-y-3 lg:border-r lg:pr-4"><div className="flex flex-wrap justify-between gap-1"><strong>{row.invoiceNumber}</strong><span className="text-xs text-muted-foreground">ออกเมื่อ {date(row.issuedAt)}</span></div><div><strong>{row.customerName || row.clientName || 'ไม่ระบุผู้ว่าจ้าง'}</strong>{row.clientType && <span className="ml-2 whitespace-nowrap rounded border px-2 py-1 text-xs">{row.clientType === 'COMPANY' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}</span>}</div><div className="rounded-md border bg-muted/30 p-4"><strong>{row.ownRef || 'เรื่อง'}</strong><p className="text-sm text-muted-foreground">{row.subject || 'ไม่ระบุคดี'}</p></div></div>
      <div className="space-y-3"><div className="flex justify-between gap-2"><div><p className="text-sm text-muted-foreground">ยอดค้างชำระ</p><strong className="text-3xl">{formatCurrency(row.outstanding ?? row.totalAmount)}</strong><span className="text-xs text-muted-foreground"> / ทั้งหมด</span><p className="text-sm text-muted-foreground">{formatCurrency(row.totalAmount)}</p></div><div className="text-right"><span className={`inline-block whitespace-nowrap rounded border px-2 py-1 text-sm ${isOverdue(row.dueAt) ? 'border-red-300 text-red-700' : 'border-amber-300 text-amber-800'}`}>{!row.dueAt ? 'ไม่ระบุกำหนด' : isOverdue(row.dueAt) ? 'เลยกำหนดชำระ' : 'รอครบกำหนด'}</span><p className="text-xs text-muted-foreground">{date(row.dueAt)}</p></div></div><div><p className="text-xs">ชำระแล้ว {formatCurrency(paid)}</p><div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${row.totalAmount > 0 ? Math.min(100, paid / row.totalAmount * 100) : 0}%` }} /></div></div>{pending.map(p => <div key={p.id} className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900">เช็ครอเคลียร์ {formatCurrency(p.amount)}</div>)}<div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs">{['ร่าง', 'ส่งแล้ว', 'รับชำระ', 'ใบเสร็จ'].map((step, index) => { const current = row.status === 'DRAFT' ? 0 : row.status === 'SENT' ? 2 : 3; return <span key={step} className="whitespace-nowrap">{index > 0 && <span className="mr-2 text-muted-foreground">→</span>}<span className={index === current ? 'rounded bg-amber-100 px-2 py-1 font-semibold text-amber-900' : 'text-muted-foreground'}>{index < current ? '✓ ' : '○ '}{step}</span></span>; })}</div></div>
      <div className="space-y-2 lg:border-l lg:pl-4">{row.status === 'DRAFT' && <><Button className="min-h-11 w-full" disabled={busy} title="กดเพื่อบันทึกว่าส่งแล้ว" onClick={() => token && void run(() => api.markInvoiceSent(token, row.id))}>ส่ง</Button><p className="text-xs text-muted-foreground">กดเพื่อบันทึกสถานะส่งแล้ว</p></>}{row.status === 'SENT' && <>{pending.length ? <Button className="min-h-11 w-full" title="กดเพื่อระบุวันที่เช็คผ่าน" onClick={() => { setDialogError(''); setClear({ invoiceId: row.id, payment: pending[0] }); setClearDate(new Date().toLocaleDateString('en-CA')); }}>ยืนยันเช็คผ่าน</Button> : <Button className="min-h-11 w-full" title="กดเพื่อบันทึกเงินที่ได้รับ" onClick={() => setPayment(row)}>บันทึกรับชำระ</Button>}<p className="text-xs text-muted-foreground">{pending.length ? 'กดยืนยันเมื่อเงินเข้าบัญชี' : 'ลงรับเงินโอนหรือเช็คธนาคาร'}</p></>}<div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" title="กดเพื่อพิมพ์ใบแจ้งหนี้" onClick={() => void printInvoice(row)}>พิมพ์</Button>{href && <Link title="กดเพื่อเปิดคดี" href={href} className="inline-flex min-h-11 items-center whitespace-nowrap rounded-md border px-4 text-sm focus-visible:ring-2 focus-visible:ring-ring">เปิดคดี</Link>}</div></div></div></article>; })}</div> : tab === 'PAID' && receipts.some(r => r.sentAt || r.voidedAt) ? null : <EmptyState icon={FileText} title="ไม่มีรายการที่ต้องทำ" />}
    {creating && <InvoicePanel target={{}} customers={[]} openImmediately formOnly onDismiss={() => setCreating(false)} onChanged={() => { setCreating(false); refresh(); }} />}
    {payment && <RecordPaymentForm allowPrint invoiceId={payment.id} invoiceNumber={payment.invoiceNumber} customerName={payment.customerName || payment.clientName} clientType={payment.clientType} outstanding={payment.outstanding ?? payment.totalAmount} onCancel={() => setPayment(null)} onRecorded={(receiptId, printWindow) => { setPayment(null); refresh(); if (printWindow && receiptId) void printReceipt(receiptId, printWindow); else printWindow?.close(); }} />}
    {clear && <SideDrawer open title="ยืนยันเช็คผ่าน" onClose={() => setClear(null)}><div className="space-y-6"><p>ระบุวันที่เงินเข้า ไม่ก่อนวันที่รับเช็ค</p><ThaiDateInput label="วันที่เช็คผ่าน" value={clearDate} onChange={setClearDate} />{dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}<Button className="min-h-11" title="กดเพื่อยืนยันวันที่เช็คผ่าน" disabled={busy} onClick={() => { if (!clearDate || clearDate < clear.payment.receivedAt.slice(0, 10) || clearDate > new Date().toLocaleDateString('en-CA')) { setDialogError('เลือกวันที่เช็คผ่านตั้งแต่วันที่รับเช็คถึงวันนี้'); return; } if (token) void run(async () => { await api.clearInvoiceCheque(token, clear.invoiceId, clear.payment.id, clearDate); setClear(null); }); }}>ยืนยันเช็คผ่าน</Button></div></SideDrawer>}
    {voiding && <SideDrawer open title="ยกเลิกใบเสร็จ" onClose={() => setVoiding(null)}><div className="space-y-4">{dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}<p>ยืนยันยกเลิก {voiding.receiptNumber} โดยรายการรับเงินยังคงอยู่</p><label className="block">เหตุผลที่ยกเลิก<textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded-md border p-3" /><span className="block text-xs text-muted-foreground">ระบุเหตุผลไม่เกิน 500 ตัวอักษร</span></label><Button variant="destructive" className="min-h-11" title="กดเพื่อยืนยันยกเลิกใบเสร็จ" disabled={busy || !reason.trim()} onClick={() => { if (token) void run(async () => { await api.voidReceipt(token, voiding.id, reason.trim()); setVoiding(null); }); }}>ยืนยันยกเลิกใบเสร็จ</Button></div></SideDrawer>}
  </div>;
}
