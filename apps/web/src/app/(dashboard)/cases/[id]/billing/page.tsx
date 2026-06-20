'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EXPENSE_CATEGORIES } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, InvoiceItem, TimeEntryItem, ExpenseItem } from '@/lib/api';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';

export default function CaseBillingPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [timeEntries, setTimeEntries] = useState<TimeEntryItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
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
      api.getExpenseSummary(token, id).catch(() => ({ totalSpent: 0 })),
    ])
      .then(([entries, invs, exps, summary]) => {
        setTimeEntries(entries);
        setInvoices(invs);
        setExpenses(exps);
        setTotalSpent(summary.totalSpent);
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
    await api.createExpense(token, id, {
      amount: parseFloat(expenseForm.amount),
      description: expenseForm.description,
      category: expenseForm.category,
      expensePurpose: expenseForm.expensePurpose || undefined,
    });
    setExpenseForm({ amount: '', description: '', category: EXPENSE_CATEGORIES[0], expensePurpose: '' });
    setShowExpenseForm(false);
    load();
  };

  if (loading) return <p className="text-slate-500">Loading billing...</p>;

  const totalHours = timeEntries.reduce((sum, e) => sum + e.hours, 0);
  const totalBilled = timeEntries.reduce((sum, e) => sum + e.hours * e.rate, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <Link href={`/cases/${id}`} className="text-sm text-brand-600 hover:underline">
        ← Back to case
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-slate-900">Billing & Expenses</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Billable Hours</p>
          <p className="text-2xl font-bold text-brand-600">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Time Billed</p>
          <p className="text-2xl font-bold text-green-600">฿{totalBilled.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">All Expenses</p>
          <p className="text-2xl font-bold text-orange-600">฿{totalExpenses.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Approved Spent</p>
          <p className="text-2xl font-bold text-violet-600">฿{totalSpent.toLocaleString()}</p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Expense Claims / รายการเบิก</h2>
          <button
            onClick={() => setShowExpenseForm(!showExpenseForm)}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
          >
            + Submit Expense
          </button>
        </div>

        {showExpenseForm && (
          <form onSubmit={handleCreateExpense} className="mb-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <input
                required type="number" step="0.01" placeholder="Amount (฿)"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
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
              required placeholder="Description"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              placeholder="Purpose / วัตถุประสงค์ (e.g. ไปศาล)"
              value={expenseForm.expensePurpose}
              onChange={(e) => setExpenseForm({ ...expenseForm, expensePurpose: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white">
              Submit for Approval
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
                  {new Date(e.date).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">฿{e.amount.toLocaleString()}</p>
                <ExpenseStatusBadge status={e.status} />
              </div>
            </div>
          ))}
          {expenses.length === 0 && (
            <p className="text-sm text-slate-400">No expense claims yet</p>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">Time Entries</h2>
        <div className="space-y-2">
          {timeEntries.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{e.description || 'Time entry'}</p>
                <p className="text-xs text-slate-400">
                  {e.user.firstName} {e.user.lastName} — {new Date(e.date).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p>{e.hours}h @ ฿{e.rate}</p>
                <p className="text-xs text-slate-400">฿{(e.hours * e.rate).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {timeEntries.length === 0 && <p className="text-sm text-slate-400">No time entries</p>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">Invoices</h2>
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <span className="font-medium">{inv.invoiceNumber}</span>
              <div className="text-right">
                <p>฿{inv.totalAmount.toLocaleString()}</p>
                <p className="text-xs text-slate-400">{inv.status}</p>
              </div>
            </div>
          ))}
          {invoices.length === 0 && <p className="text-sm text-slate-400">No invoices</p>}
        </div>
      </div>
    </div>
  );
}
