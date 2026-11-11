'use client';

import { useEffect, useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  ExpenseStatus,
  hasFirmCapability,
  MONEY_HINT,
  MONEY_MAX,
  MONEY_MIN,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { api, TimeEntryItem, ExpenseItem, CustomerShareItem, InvoiceItem } from '@/lib/api';
import { InvoicePanel } from '@/components/billing/InvoicePanel';
import { TimeEntryForm } from '@/components/billing/TimeEntryForm';
import { formatCurrency } from '@/lib/utils';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/form-fields';
import { Plus, Check, Receipt, CircleSlash, Pencil, Trash2, Timer, RotateCcw } from 'lucide-react';
import { DocsRowMenu } from '@/components/case-page/DocsRowMenu';
import v2 from '@/components/case-page/v2.module.css';

const WRITE_OFF_MIN_REASON = 5;

// ตรงกับ unbilledTimeWhere / unbilledExpenseWhere ฝั่ง API — ตัดทิ้งได้เฉพาะงานที่ยังเรียกเก็บได้จริง
// ตรงกับกติกา API: แก้/ลบได้เมื่อยังไม่เข้าใบแจ้งหนี้และไม่ถูกตัดทิ้ง (เจ้าของรายการหรือผู้มี manageInvoices)
const canEditTime = (e: TimeEntryItem, userId: string | undefined, manager: boolean) =>
  !e.invoiceId && !e.writtenOffAt && (manager || e.user.id === userId);
const canWriteOffTime = (e: TimeEntryItem) => e.billable !== false && !e.invoiceId && !e.writtenOffAt;
const canWriteOffExpense = (e: ExpenseItem) =>
  e.billable !== false &&
  !e.invoiceId &&
  !e.writtenOffAt &&
  (e.status === ExpenseStatus.APPROVED || e.status === ExpenseStatus.PAID);

/** ปุ่มตัดทิ้ง → กรอกเหตุผล (อย่างน้อย 5 ตัวอักษร) → ยืนยัน */
function WriteOffAction({ label, onConfirm }: { label: string; onConfirm: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(true);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const trimmed = reason.trim();

  if (!open) {
    return (
      <button
        type="button"
        aria-label={`ตัดทิ้ง: ${label}`}
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent sm:min-h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ตัดทิ้ง (write-off)
      </button>
    );
  }
  const submit = async () => {
    if (trimmed.length < WRITE_OFF_MIN_REASON || saving) return;
    setSaving(true);
    setError('');
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ตัดทิ้งไม่สำเร็จ กรุณาลองใหม่');
      setSaving(false);
    }
  };
  return (
    <div className="mt-2 w-full space-y-2 rounded-lg bg-muted/40 p-2">
      <input
        aria-label={`เหตุผลที่ตัดทิ้ง: ${label}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={`เหตุผล (อย่างน้อย ${WRITE_OFF_MIN_REASON} ตัวอักษร)`}
        maxLength={500}
        className="h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={trimmed.length < WRITE_OFF_MIN_REASON || saving} onClick={() => void submit()}>
          {saving ? 'กำลังตัดทิ้ง…' : 'ยืนยันตัดทิ้ง'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { setOpen(false); setReason(''); setError(''); }}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}

function WrittenOffNote({
  by,
  reason,
  onUndo,
}: {
  by?: { firstName: string; lastName: string } | null;
  reason?: string | null;
  onUndo?: () => void;
}) {
  return (
    <div className="mt-1 flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>ตัดโดย {by ? `${by.firstName} ${by.lastName}` : '-'}: {reason}</span>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="min-h-11 rounded-lg border px-2.5 py-1 font-medium hover:bg-accent sm:min-h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ยกเลิก
        </button>
      )}
    </div>
  );
}

export function CaseBillingPanel({ caseId }: { caseId: string }) {
  const d = useDashboardT();
  const id = caseId;
  const { token, user } = useAuth();
  const [timeEntries, setTimeEntries] = useState<TimeEntryItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [caseRevenue, setCaseRevenue] = useState(0);
  const [caseProfit, setCaseProfit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    description: '',
    category: EXPENSE_CATEGORIES[0] as string,
    expensePurpose: '',
  });

  const canWriteOff = hasFirmCapability(user?.firmRole, 'manageInvoices');
  const [writeOffError, setWriteOffError] = useState('');
  const [showTimeForm, setShowTimeForm] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [timeError, setTimeError] = useState('');

  // ลูกค้า (ผู้ว่าจ้าง) ของคดี — คนที่ใบแจ้งหนี้จะไปถึง ไม่ใช่ลูกความ
  const [customers, setCustomers] = useState<CustomerShareItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [agreedFee, setAgreedFee] = useState<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [writeOffTarget, setWriteOffTarget] = useState<string | null>(null);
  const canApprove = hasFirmCapability(user?.firmRole, 'approveExpenses');

  const load = () => {
    if (!token || !id) return;
    Promise.all([
      api.getTimeEntries(token, id),
      api.getCaseExpenses(token, id),
      api.getExpenseSummary(token, id).catch(() => ({ totalSpent: 0, revenue: 0, profit: 0 })),
      api.getCase(token, id).catch(() => null),
      api.getInvoices(token, id).catch(() => [] as InvoiceItem[]),
    ])
      .then(([entries, exps, summary, detail, invs]) => {
        setCustomers(detail?.customers ?? []);
        setInvoices(invs);
        setAgreedFee(detail?.estimatedFee ?? null);
        setTimeEntries(entries);
        setExpenses(exps);
        setTotalSpent(summary.totalSpent);
        setCaseRevenue(summary.revenue ?? 0);
        setCaseProfit(summary.profit ?? 0);
      })
      .then(() => setLoadError(false))
      .catch((err) => { console.error(err); setLoadError(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token, id]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id || savingExpense) return;
    setSavingExpense(true);
    setExpenseError('');
    try {
      await api.createExpense(token, id, {
        amount: parseFloat(expenseForm.amount),
        description: expenseForm.description,
        category: expenseForm.category,
        expensePurpose: expenseForm.expensePurpose || undefined,
        status: ExpenseStatus.DRAFT,
      });
      setExpenseForm({ amount: '', description: '', category: EXPENSE_CATEGORIES[0], expensePurpose: '' });
      setShowExpenseForm(false);
      load();
    } catch (err) {
      setExpenseError(err instanceof Error ? err.message : 'บันทึกค่าใช้จ่ายไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSavingExpense(false);
    }
  };

  // ค่าใช้จ่ายที่สำนักงานออกเอง จะไม่โผล่ในรายการที่รอเก็บเงิน
  const handleSetBillable = async (expenseId: string, billable: boolean) => {
    if (!token) return;
    setExpenses((rows) => rows.map((row) => (row.id === expenseId ? { ...row, billable } : row)));
    try {
      await api.setExpenseBillable(token, expenseId, billable);
      load();
    } catch {
      // ย้อนกลับเมื่อบันทึกไม่ผ่าน ไม่งั้นหน้าจอจะโกหกว่าตั้งไว้แล้ว
      setExpenses((rows) =>
        rows.map((row) => (row.id === expenseId ? { ...row, billable: !billable } : row)),
      );
    }
  };

  const handleDeleteTime = async (entryId: string) => {
    if (!token || !window.confirm('ลบบันทึกเวลานี้?')) return;
    setTimeError('');
    try {
      await api.deleteTimeEntry(token, id, entryId);
      load();
    } catch (err) {
      setTimeError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const handleUndoWriteOff = async (undo: () => Promise<unknown>) => {
    setWriteOffError('');
    try {
      await undo();
      load();
    } catch (err) {
      setWriteOffError(err instanceof Error ? err.message : 'ยกเลิกการตัดทิ้งไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  if (loading) return <PageLoading title={d.caseBilling.loading} lines={3} />;
  if (loadError) return <LoadFailed onRetry={load} />;

  const totalHours = timeEntries.reduce((sum, e) => sum + e.hours, 0);
  const totalBilled = timeEntries.reduce((sum, e) => (e.writtenOffAt ? sum : sum + e.hours * e.rate), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  const issued = invoices.filter((inv) => inv.status !== 'DRAFT' && inv.status !== 'VOID' && inv.status !== 'CANCELLED');
  const issuedTotal = issued.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const paidTotal = issued.filter((inv) => inv.status === 'PAID').reduce((sum, inv) => sum + inv.totalAmount, 0);
  const outstanding = issuedTotal - paidTotal;
  const card = 'rounded-xl border border-[#e2e0d8] bg-card';
  const hint = 'mt-[.3rem] text-[.82rem] leading-[1.45] text-muted-foreground';
  const label = 'text-[.8rem] text-muted-foreground';
  const shortDate = (value: string) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
  const invoicePill = (inv: InvoiceItem) => { const amount = formatCurrency(inv.totalAmount); return inv.status === 'PAID' ? <span className="rounded-full bg-[#e6f3ec] px-3 py-1 font-semibold text-[#227052]">ชำระแล้ว {amount}</span> : inv.status === 'DRAFT' ? <span className="rounded-full bg-[#eeebe3] px-3 py-1 font-semibold">ร่าง {amount}</span> : <span className="rounded-full bg-[#fbf3e0] px-3 py-1 font-semibold text-[#6b4f0b]">รอชำระ {amount}</span>; };
  const expenseState = (e: ExpenseItem) => e.writtenOffAt ? <span className="text-muted-foreground">ตัดทิ้ง</span> : e.status === ExpenseStatus.PAID ? <span className="text-[#227052]">จ่ายแล้ว</span> : e.status === ExpenseStatus.APPROVED ? <span className="text-[#227052]">อนุมัติแล้ว</span> : e.status === ExpenseStatus.REJECTED ? <span className="text-[#a83232]">ไม่อนุมัติ</span> : e.status === ExpenseStatus.PENDING ? <span className="text-[#6b4f0b]">รออนุมัติ</span> : <span className="text-muted-foreground">ร่าง</span>;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <div className={`${card} p-5`}><div className={label}>ค่าวิชาชีพที่ตกลง</div><div className="text-2xl font-bold">{agreedFee != null ? formatCurrency(agreedFee) : <span className="text-base font-semibold text-muted-foreground">ยังไม่ได้ระบุ</span>}</div></div>
        <div className={`${card} p-5`}><div className={label}>ออกใบแจ้งหนี้แล้ว</div><div className="text-2xl font-bold">{formatCurrency(issuedTotal)}</div></div>
        <div className={`${card} p-5`}><div className={label}>รับเงินแล้ว</div><div className="text-2xl font-bold text-[#227052]">{formatCurrency(paidTotal)}</div></div>
        <div className={`${card} p-5 ${outstanding > 0 ? 'border-2 border-[#e9b9b9]' : ''}`}><div className={label}>ค้างรับจากลูกความ</div><div className={`text-2xl font-bold ${outstanding > 0 ? 'text-[#a83232]' : ''}`}>{formatCurrency(outstanding)}</div></div>
      </div>
      {writeOffError && <p role="alert" className="text-sm text-destructive">{writeOffError}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${v2.card} shadow-[0_4px_16px_rgba(20,46,67,.06)]`}><div className="flex items-center justify-between border-b border-[#e2e0d8] px-5 py-3"><h3 className="text-lg font-bold">ค่าใช้จ่ายของคดี</h3><button type="button" aria-expanded={showExpenseForm} onClick={() => setShowExpenseForm(!showExpenseForm)} className={`${v2.btn} ${v2.outline} min-h-0 py-2`}><Plus aria-hidden="true" className="h-[1.1em] w-[1.1em]" />บันทึกค่าใช้จ่าย</button></div>
        {showExpenseForm && <div className="p-4">          <form onSubmit={handleCreateExpense} className="mb-4 space-y-3 rounded-lg border border-border bg-muted/40 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="expense-amount" className="block text-sm font-medium">
                  {d.caseBilling.amount}<span aria-hidden="true" className="ml-1 text-destructive">*</span>
                </label>
                <MoneyInput
                  id="expense-amount"
                  required
                  min={MONEY_MIN}
                  max={MONEY_MAX}
                  title={MONEY_HINT}
                  value={expenseForm.amount}
                  onValueChange={(next) => setExpenseForm({ ...expenseForm, amount: next })}
                  className="min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-right text-sm tabular-nums"
                />
                <p className="text-xs text-muted-foreground">{MONEY_HINT}</p>
              </div>
              <SelectField
                label="หมวดค่าใช้จ่าย"
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </SelectField>
            </div>
            <TextField
              label={d.caseBilling.descriptionField}
              required
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            />
            <TextField
              label={d.caseBilling.purpose}
              value={expenseForm.expensePurpose}
              onChange={(e) => setExpenseForm({ ...expenseForm, expensePurpose: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{d.caseBilling.draftHint}</p>
            {expenseError && <p role="alert" className="text-sm text-destructive">{expenseError}</p>}
            <Button type="submit" disabled={savingExpense}>
              {savingExpense ? d.caseBilling.savingDraft : d.caseBilling.saveDraft}
            </Button>
          </form></div>}
        {expenses.length ? <ul className="divide-y divide-[#e2e0d8] text-sm">{expenses.map((e) => <li key={e.id} className="px-5 py-3.5"><div className="flex items-center justify-between gap-3"><div><b>{e.description}</b><div className={v2.label}>{e.user.firstName} · {shortDate(e.date)} · {e.billable === false ? 'ไม่เรียกเก็บจากลูกความ' : 'เรียกเก็บจากลูกความ'}</div></div><div className="flex items-center gap-1 font-semibold">{formatCurrency(e.amount)} · {expenseState(e)}<DocsRowMenu name={e.description} items={[
          ...(canApprove && e.status === ExpenseStatus.PENDING && token ? [{ label: 'อนุมัติ', hint: 'พร้อมเบิกจ่ายให้คนที่สำรองจ่าย', icon: Check, onClick: () => { setWriteOffError(''); void api.updateExpenseStatus(token!, e.id, 'APPROVED').then(load).catch((err: unknown) => setWriteOffError(err instanceof Error ? err.message : 'อนุมัติไม่สำเร็จ ลองใหม่อีกครั้ง')); } }] : []),
          ...(!e.invoiceId && !e.writtenOffAt ? [{ label: e.billable === false ? 'เรียกเก็บจากลูกความ' : 'ไม่เรียกเก็บจากลูกความ', hint: 'กำหนดว่าจะรวมในใบแจ้งหนี้หรือไม่', icon: Receipt, onClick: () => void handleSetBillable(e.id, e.billable === false) }] : []),
          ...(canWriteOff && canWriteOffExpense(e) && token ? [{ label: 'ตัดทิ้ง', hint: 'ระบุเหตุผล ย้อนคืนได้', icon: CircleSlash, onClick: () => setWriteOffTarget(e.id) }] : []),
          ...(canWriteOff && e.writtenOffAt && !e.invoiceId && token ? [{ label: 'ยกเลิกการตัดทิ้ง', hint: 'นำรายการกลับมา', icon: RotateCcw, onClick: () => void handleUndoWriteOff(() => api.undoExpenseWriteOff(e.id, token!)) }] : []),
        ]} /></div></div>{e.writtenOffAt && <WrittenOffNote by={e.writtenOffBy} reason={e.writeOffReason} />}{writeOffTarget === e.id && canWriteOffExpense(e) && token && <WriteOffAction label={e.description} onConfirm={async (reason) => { await api.writeOffExpense(e.id, reason, token!); setWriteOffTarget(null); load(); }} />}</li>)}</ul> : <p className={`${v2.hint} px-5 py-4`}>ยังไม่มีค่าใช้จ่ายของคดีนี้</p>}</section>
        <section className={`${v2.card} shadow-[0_4px_16px_rgba(20,46,67,.06)]`}><div className="flex items-center justify-between border-b border-[#e2e0d8] px-5 py-3"><h3 className="text-lg font-bold">เวลาทำงาน</h3><button type="button" onClick={() => { setShowTimeForm(true); setEditingTimeId(null); }} className={`${v2.btn} ${v2.outline} min-h-0 py-2`}><Timer aria-hidden="true" className="h-[1.1em] w-[1.1em]" />บันทึกเวลา</button></div>
        {showTimeForm && <div className="p-4"><TimeEntryForm caseId={id} onCancel={() => setShowTimeForm(false)} onDone={() => { setShowTimeForm(false); load(); }} /></div>}{timeError && <p role="alert" className="px-5 text-sm text-destructive">{timeError}</p>}
        <ul className="divide-y divide-[#e2e0d8] text-sm">{timeEntries.map((e) => editingTimeId === e.id ? <li key={e.id} className="p-4"><TimeEntryForm entry={{ id: e.id, caseId: id, date: e.date, hours: e.hours, rate: e.rate, description: e.description ?? null }} onCancel={() => setEditingTimeId(null)} onDone={() => { setEditingTimeId(null); load(); }} /></li> : <li key={e.id} className="px-5 py-3.5"><div className="flex items-center justify-between gap-3"><div><b>{e.description || d.caseBilling.timeEntry}</b><div className={v2.label}>{e.user.firstName} · {shortDate(e.date)}</div></div><div className="flex items-center font-semibold tabular-nums">{e.hours} ชม. · {formatCurrency(e.hours * e.rate)}<DocsRowMenu name={e.description || d.caseBilling.timeEntry} items={[
          ...(canEditTime(e, user?.id, canWriteOff) ? [{ label: 'แก้ไข', hint: 'แก้ไขบันทึกเวลา', icon: Pencil, onClick: () => { setEditingTimeId(e.id); setShowTimeForm(false); } }, { label: 'ลบ', hint: 'ลบบันทึกเวลานี้', icon: Trash2, onClick: () => void handleDeleteTime(e.id) }] : []),
          ...(canWriteOff && canWriteOffTime(e) && token ? [{ label: 'ตัดทิ้ง', hint: 'ระบุเหตุผล ย้อนคืนได้', icon: CircleSlash, onClick: () => setWriteOffTarget(e.id) }] : []),
          ...(canWriteOff && e.writtenOffAt && !e.invoiceId && token ? [{ label: 'ยกเลิกการตัดทิ้ง', hint: 'นำรายการกลับมา', icon: RotateCcw, onClick: () => void handleUndoWriteOff(() => api.undoTimeEntryWriteOff(id, e.id, token!)) }] : []),
        ]} /></div></div>{e.writtenOffAt && <WrittenOffNote by={e.writtenOffBy} reason={e.writeOffReason} />}{writeOffTarget === e.id && canWriteOffTime(e) && token && <WriteOffAction label={e.description || d.caseBilling.timeEntry} onConfirm={async (reason) => { await api.writeOffTimeEntry(id, e.id, reason, token!); setWriteOffTarget(null); load(); }} />}</li>)}</ul><p className={`${v2.hint} px-5 pb-4`}>รวม {totalHours.toFixed(1)} ชม. · ยังไม่ได้เรียกเก็บ {formatCurrency(timeEntries.filter((e) => !e.invoiceId && !e.writtenOffAt && e.billable !== false).reduce((sum, e) => sum + e.hours * e.rate, 0))} — ใส่ในใบแจ้งหนี้ถัดไปได้</p></section>
      </div>
      <section className={`${v2.card} shadow-[0_4px_16px_rgba(20,46,67,.06)]`}><div className="flex items-center justify-between border-b border-[#e2e0d8] px-5 py-3"><h3 className="text-lg font-bold">ใบแจ้งหนี้</h3><button type="button" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)} className={`${v2.btn} ${v2.primary} min-h-0 py-2`}><Plus aria-hidden="true" className="h-[1.1em] w-[1.1em]" />ออกใบแจ้งหนี้</button></div>
          {invoices.length ? <ul className="divide-y divide-[#e2e0d8] text-sm">{invoices.map((inv) => <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3.5"><div><b>{inv.invoiceNumber}</b><div className={label}>{[inv.billToCustomer?.name, inv.status === 'DRAFT' ? 'ยังไม่ส่ง' : null].filter(Boolean).join(' · ') || 'ใบแจ้งหนี้ของคดี'}</div></div>{invoicePill(inv)}</li>)}</ul> : <p className={`${hint} px-5 py-4`}>ยังไม่มีใบแจ้งหนี้ของคดีนี้</p>}
      {toolsOpen && <div className="p-5"><InvoicePanel target={{ caseId: id }} customers={customers} onChanged={load} /></div>}</section>
      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3 xl:grid-cols-6 [&>div]:bg-card [&>div]:p-4">
        <div>
          <dt className="text-xs text-muted-foreground sm:text-sm">รายได้</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(caseRevenue)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground sm:text-sm">ค่าใช้จ่ายที่อนุมัติ</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(totalSpent)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground sm:text-sm">กำไร</dt>
          <dd className={`mt-1 text-xl font-semibold tabular-nums ${caseProfit < 0 ? 'text-destructive' : ''}`}>
            {formatCurrency(caseProfit)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground sm:text-sm">{d.caseBilling.billableHours}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{totalHours.toFixed(1)}h</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground sm:text-sm">{d.caseBilling.timeBilled}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(totalBilled)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground sm:text-sm">{d.caseBilling.allExpenses}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(totalExpenses)}</dd>
        </div>
      </dl>
    </div>
  );
}
