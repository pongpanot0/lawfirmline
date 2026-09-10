'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  EXPENSE_CATEGORIES,
  ExpenseStatus,
  FirmRole,
  MONEY_HINT,
  MONEY_MAX,
  MONEY_MIN,
  MONEY_STEP,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { api, InvoiceItem, TimeEntryItem, ExpenseItem } from '@/lib/api';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'ร่าง',
  SENT: 'ส่งแล้ว',
  PAID: 'ชำระแล้ว',
};

export default function CaseBillingPage() {
  const d = useDashboardT();
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const [timeEntries, setTimeEntries] = useState<TimeEntryItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [caseRevenue, setCaseRevenue] = useState(0);
  const [caseProfit, setCaseProfit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    description: '',
    category: EXPENSE_CATEGORIES[0] as string,
    expensePurpose: '',
  });

  const load = () => {
    if (!token || !id) return;
    Promise.all([
      api.getTimeEntries(token, id),
      api.getInvoices(token, id),
      api.getCaseExpenses(token, id),
      api.getExpenseSummary(token, id).catch(() => ({ totalSpent: 0, revenue: 0, profit: 0 })),
    ])
      .then(([entries, invs, exps, summary]) => {
        setTimeEntries(entries);
        setInvoices(invs);
        setExpenses(exps);
        setTotalSpent(summary.totalSpent);
        setCaseRevenue(summary.revenue ?? 0);
        setCaseProfit(summary.profit ?? 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token, id]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) return;
    setExpenseError('');
    try {
      await api.createExpense(token, id, {
        amount: parseFloat(expenseForm.amount),
        description: expenseForm.description,
        category: expenseForm.category,
        expensePurpose: expenseForm.expensePurpose || undefined,
        status: user?.firmRole === FirmRole.OWNER ? undefined : ExpenseStatus.DRAFT,
      });
      setExpenseForm({ amount: '', description: '', category: EXPENSE_CATEGORIES[0], expensePurpose: '' });
      setShowExpenseForm(false);
      load();
    } catch (err) {
      setExpenseError(err instanceof Error ? err.message : 'บันทึกค่าใช้จ่ายไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  if (loading) return <PageLoading title={d.caseBilling.loading} lines={3} />;

  const totalHours = timeEntries.reduce((sum, e) => sum + e.hours, 0);
  const totalBilled = timeEntries.reduce((sum, e) => sum + e.hours * e.rate, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <Link href={`/cases/${id}`} className="text-sm text-brand-600 hover:underline">
        {d.caseBilling.back}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-slate-900">{d.caseBilling.title}</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">รายได้</p>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(caseRevenue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">ค่าใช้จ่ายอนุมัติ</p>
          <p className="text-2xl font-bold text-violet-600">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">กำไร</p>
          <p className={`text-2xl font-bold ${caseProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(caseProfit)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">{d.caseBilling.billableHours}</p>
          <p className="text-2xl font-bold text-brand-600">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">{d.caseBilling.timeBilled}</p>
          <p className="text-2xl font-bold text-green-600">฿{totalBilled.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">{d.caseBilling.allExpenses}</p>
          <p className="text-2xl font-bold text-orange-600">฿{totalExpenses.toLocaleString()}</p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{d.caseBilling.expenseClaims}</h2>
          <button
            onClick={() => setShowExpenseForm(!showExpenseForm)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
          >
            {d.caseBilling.submitExpense}
          </button>
        </div>

        {showExpenseForm && (
          <form onSubmit={handleCreateExpense} className="mb-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <input
                  required
                  type="number"
                  step={MONEY_STEP}
                  min={MONEY_MIN}
                  max={MONEY_MAX}
                  title={MONEY_HINT}
                  placeholder={d.caseBilling.amount}
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-slate-500">{MONEY_HINT}</p>
              </div>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <input
              required placeholder={d.caseBilling.descriptionField}
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder={d.caseBilling.purpose}
              value={expenseForm.expensePurpose}
              onChange={(e) => setExpenseForm({ ...expenseForm, expensePurpose: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {expenseError && <p className="text-sm text-red-600">{expenseError}</p>}
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white">
              {d.caseBilling.submitForApproval}
            </button>
          </form>
        )}

        <div className="space-y-2">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{e.description}</p>
                <p className="text-xs text-slate-400">
                  {e.user.firstName} {e.user.lastName}
                  {e.category && ` — ${e.category}`}
                  {' — '}
                  {formatDate(e.date)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">฿{e.amount.toLocaleString()}</p>
                <ExpenseStatusBadge status={e.status} />
              </div>
            </div>
          ))}
          {expenses.length === 0 && (
            <InlineEmptyState
              title={d.caseBilling.noExpenses}
              description="บันทึกค่าใช้จ่ายแรกของคดีนี้ ระบบจะผูกกับคดีให้อัตโนมัติ"
              action={
                <button
                  type="button"
                  onClick={() => setShowExpenseForm(true)}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
                >
                  {d.caseBilling.submitExpense}
                </button>
              }
            />
          )}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">{d.caseBilling.timeEntries}</h2>
        <div className="space-y-2">
          {timeEntries.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{e.description || d.caseBilling.timeEntry}</p>
                <p className="text-xs text-slate-400">
                  {e.user.firstName} {e.user.lastName} — {formatDate(e.date)}
                </p>
              </div>
              <div className="text-right">
                <p>{e.hours}h @ ฿{e.rate}</p>
                <p className="text-xs text-slate-400">฿{(e.hours * e.rate).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {timeEntries.length === 0 && (
            <InlineEmptyState
              title={d.caseBilling.noTimeEntries}
              description="เมื่อมีการบันทึกเวลาทำงาน รายการจะสรุปยอดให้ตรงนี้"
            />
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">{d.caseBilling.invoices}</h2>
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <span className="font-medium">{inv.invoiceNumber}</span>
              <div className="text-right">
                <p>฿{inv.totalAmount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">{INVOICE_STATUS_LABELS[inv.status] ?? inv.status}</p>
              </div>
            </div>
          ))}
          {invoices.length === 0 && (
            <InlineEmptyState
              title={d.caseBilling.noInvoices}
              description="ใบแจ้งหนี้ที่สร้างจากคดีนี้จะแสดงพร้อมสถานะการชำระเงิน"
            />
          )}
        </div>
      </div>
    </div>
  );
}
