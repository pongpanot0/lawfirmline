'use client';

import { useEffect, useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  ExpenseStatus,
  FirmRole,
  hasFirmCapability,
  MONEY_HINT,
  MONEY_MAX,
  MONEY_MIN,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { api, TimeEntryItem, ExpenseItem, CustomerShareItem } from '@/lib/api';
import { InvoicePanel } from '@/components/billing/InvoicePanel';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/form-fields';
import { Plus } from 'lucide-react';

const WRITE_OFF_MIN_REASON = 5;

// ตรงกับ unbilledTimeWhere / unbilledExpenseWhere ฝั่ง API — ตัดทิ้งได้เฉพาะงานที่ยังเรียกเก็บได้จริง
const canWriteOffTime = (e: TimeEntryItem) => e.billable !== false && !e.invoiceId && !e.writtenOffAt;
const canWriteOffExpense = (e: ExpenseItem) =>
  e.billable !== false &&
  !e.invoiceId &&
  !e.writtenOffAt &&
  (e.status === ExpenseStatus.APPROVED || e.status === ExpenseStatus.PAID);

/** ปุ่มตัดทิ้ง → กรอกเหตุผล (อย่างน้อย 5 ตัวอักษร) → ยืนยัน */
function WriteOffAction({ label, onConfirm }: { label: string; onConfirm: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
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

  // ลูกค้า (ผู้ว่าจ้าง) ของคดี — คนที่ใบแจ้งหนี้จะไปถึง ไม่ใช่ลูกความ
  const [customers, setCustomers] = useState<CustomerShareItem[]>([]);

  const load = () => {
    if (!token || !id) return;
    Promise.all([
      api.getTimeEntries(token, id),
      api.getCaseExpenses(token, id),
      api.getExpenseSummary(token, id).catch(() => ({ totalSpent: 0, revenue: 0, profit: 0 })),
      api.getCase(token, id).catch(() => null),
    ])
      .then(([entries, exps, summary, detail]) => {
        setCustomers(detail?.customers ?? []);
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

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-foreground">{d.caseBilling.title}</h2>

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3 xl:grid-cols-6 [&>div]:bg-card [&>div]:p-4">
        <div>
          <dt className="text-xs text-muted-foreground sm:text-sm">รายได้</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(caseRevenue)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground sm:text-sm">ค่าใช้จ่ายอนุมัติ</dt>
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

      {writeOffError && <p role="alert" className="mb-4 text-sm text-destructive">{writeOffError}</p>}

      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{d.caseBilling.expenseClaims}</h2>
          <Button type="button" size="sm" aria-expanded={showExpenseForm} onClick={() => setShowExpenseForm(!showExpenseForm)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            {d.caseBilling.submitExpense}
          </Button>
        </div>

        {showExpenseForm && (
          <form onSubmit={handleCreateExpense} className="mb-4 space-y-3 rounded-lg border border-border bg-muted/40 p-4">
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
          </form>
        )}

        <div className="space-y-2">
          {expenses.map((e) => (
            <div key={e.id} className="rounded-lg border border-border px-3 py-2 text-sm">
             <div className="flex items-center justify-between">
              <div className={e.writtenOffAt ? 'line-through opacity-60' : undefined}>
                <p className="font-medium">{e.description}</p>
                <p className="text-xs text-muted-foreground">
                  {e.user.firstName} {e.user.lastName}
                  {e.category && ` — ${e.category}`}
                  {' — '}
                  {formatDate(e.date)}
                </p>
              </div>
              <div className="flex items-center gap-3 text-right">
                {/* ออกบิลไปแล้วเปลี่ยนไม่ได้ ต้องไปแก้ที่ใบแจ้งหนี้ */}
                {!e.invoiceId && !e.writtenOffAt && (
                  <label className="flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground sm:min-h-0">
                    <input
                      type="checkbox"
                      aria-label={`สำนักงานออกเอง: ${e.description}`}
                      checked={e.billable === false}
                      onChange={(ev) => handleSetBillable(e.id, !ev.target.checked)}
                      className="h-3.5 w-3.5 rounded border-input"
                    />
                    สำนักงานออกเอง
                  </label>
                )}
                <div className={e.writtenOffAt ? 'line-through opacity-60' : undefined}>
                  <p className="font-medium tabular-nums">{formatCurrency(e.amount)}</p>
                  <ExpenseStatusBadge status={e.status} />
                </div>
              </div>
             </div>
             {e.writtenOffAt ? (
               <WrittenOffNote
                 by={e.writtenOffBy}
                 reason={e.writeOffReason}
                 onUndo={canWriteOff && !e.invoiceId && token ? () => void handleUndoWriteOff(() => api.undoExpenseWriteOff(e.id, token)) : undefined}
               />
             ) : (
               canWriteOff && canWriteOffExpense(e) && token && (
                 <WriteOffAction
                   label={e.description}
                   onConfirm={async (reason) => { await api.writeOffExpense(e.id, reason, token); load(); }}
                 />
               )
             )}
            </div>
          ))}
          {expenses.length === 0 && (
            <InlineEmptyState
              title={d.caseBilling.noExpenses}
              action={
                !showExpenseForm && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowExpenseForm(true)}>
                    {d.caseBilling.submitExpense}
                  </Button>
                )
              }
            />
          )}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">{d.caseBilling.timeEntries}</h2>
        <div className="space-y-2">
          {timeEntries.map((e) => (
            <div key={e.id} className="rounded-lg border border-border px-3 py-2 text-sm">
             <div className="flex items-center justify-between">
              <div className={e.writtenOffAt ? 'line-through opacity-60' : undefined}>
                <p className="font-medium">{e.description || d.caseBilling.timeEntry}</p>
                <p className="text-xs text-muted-foreground">
                  {e.user.firstName} {e.user.lastName} — {formatDate(e.date)}
                </p>
              </div>
              <div className={`text-right tabular-nums ${e.writtenOffAt ? 'line-through opacity-60' : ''}`}>
                <p>{e.hours}h @ ฿{e.rate}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(e.hours * e.rate)}</p>
              </div>
             </div>
             {e.writtenOffAt ? (
               <WrittenOffNote
                 by={e.writtenOffBy}
                 reason={e.writeOffReason}
                 onUndo={canWriteOff && !e.invoiceId && token ? () => void handleUndoWriteOff(() => api.undoTimeEntryWriteOff(id, e.id, token)) : undefined}
               />
             ) : (
               canWriteOff && canWriteOffTime(e) && token && (
                 <WriteOffAction
                   label={e.description || d.caseBilling.timeEntry}
                   onConfirm={async (reason) => { await api.writeOffTimeEntry(id, e.id, reason, token); load(); }}
                 />
               )
             )}
            </div>
          ))}
          {timeEntries.length === 0 && (
            <InlineEmptyState
              title={d.caseBilling.noTimeEntries}
            />
          )}
        </div>
      </div>

      <InvoicePanel target={{ caseId: id }} customers={customers} onChanged={load} />
    </div>
  );
}
