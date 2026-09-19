'use client';

import { useEffect, useState } from 'react';
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
import { api, InvoiceItem, TimeEntryItem, ExpenseItem, CustomerShareItem, InvoiceDraft } from '@/lib/api';
import { allocateShares } from '@/lib/invoice-split';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'ร่าง',
  SENT: 'ส่งแล้ว',
  PAID: 'ชำระแล้ว',
};

export function CaseBillingPanel({ caseId }: { caseId: string }) {
  const d = useDashboardT();
  const id = caseId;
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

  // ลูกค้า (ผู้ว่าจ้าง) ของคดี — คนที่ใบแจ้งหนี้จะไปถึง ไม่ใช่ลูกความ
  const [customers, setCustomers] = useState<CustomerShareItem[]>([]);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceDueAt, setInvoiceDueAt] = useState('');
  // งานในคดีที่ยังไม่ถูกเก็บเงิน — ยอดของใบแจ้งหนี้ตั้งต้นจากตรงนี้
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [pickedTimeIds, setPickedTimeIds] = useState<string[]>([]);
  const [pickedExpenseIds, setPickedExpenseIds] = useState<string[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<
    { description: string; quantity: string; unitPrice: string }[]
  >([]);
  // สัดส่วนที่แก้เฉพาะใบนี้ ไม่กระทบสัดส่วนที่บันทึกไว้กับคดี
  const [shareOverrides, setShareOverrides] = useState<Record<string, string>>({});

  const load = () => {
    if (!token || !id) return;
    Promise.all([
      api.getTimeEntries(token, id),
      api.getInvoices(token, id),
      api.getCaseExpenses(token, id),
      api.getExpenseSummary(token, id).catch(() => ({ totalSpent: 0, revenue: 0, profit: 0 })),
      api.getCase(token, id).catch(() => null),
      api.getInvoiceDraft(token, id).catch(() => null),
    ])
      .then(([entries, invs, exps, summary, detail, invoiceDraft]) => {
        setCustomers(detail?.customers ?? []);
        setDraft(invoiceDraft);
        // ติ๊กงานที่ยังไม่เก็บเงินไว้ให้ทั้งหมด ผู้ใช้ค่อยเอาออกทีหลัง
        setPickedTimeIds((invoiceDraft?.timeEntries ?? []).map((e) => e.id));
        setPickedExpenseIds((invoiceDraft?.expenses ?? []).map((e) => e.id));
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

  const pickedTime = (draft?.timeEntries ?? []).filter((e) => pickedTimeIds.includes(e.id));
  const pickedExpenses = (draft?.expenses ?? []).filter((e) => pickedExpenseIds.includes(e.id));
  const manualTotal = invoiceItems.reduce(
    (sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0),
    0,
  );
  const invoiceTotal =
    pickedTime.reduce((sum, e) => sum + e.amount, 0) +
    pickedExpenses.reduce((sum, e) => sum + e.amount, 0) +
    manualTotal;

  // สัดส่วนที่ยังไม่ตกลงกัน ถือว่าหารเท่ากับรายอื่นที่ยังไม่ตกลง — ตรงกับฝั่ง API
  const shareOf = (customer: CustomerShareItem) => {
    const override = shareOverrides[customer.customerId];
    if (override !== undefined && override !== '') return parseFloat(override) || 0;
    return customer.sharePercent ?? 100 / customers.length;
  };
  const splitPreview = allocateShares(invoiceTotal, customers.map(shareOf));

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) return;
    setInvoiceError('');
    const lineItems = invoiceItems
      .filter((item) => item.description.trim() && parseFloat(item.unitPrice) > 0)
      .map((item) => ({
        description: item.description.trim(),
        quantity: parseFloat(item.quantity) || 1,
        unitPrice: parseFloat(item.unitPrice),
      }));
    if (!lineItems.length && !pickedTimeIds.length && !pickedExpenseIds.length) {
      setInvoiceError('เลือกงานในคดีที่จะเก็บเงิน หรือเพิ่มรายการเอง');
      return;
    }
    setInvoiceSubmitting(true);
    try {
      await api.createInvoice(token, id, {
        lineItems: lineItems.length ? lineItems : undefined,
        timeEntryIds: pickedTimeIds.length ? pickedTimeIds : undefined,
        expenseIds: pickedExpenseIds.length ? pickedExpenseIds : undefined,
        dueAt: invoiceDueAt || undefined,
        // ส่งสัดส่วนไปเฉพาะตอนแบ่งจ่ายจริง ไม่งั้นปล่อยให้ API ใช้ของคดี
        splits:
          customers.length > 1
            ? customers.map((c) => ({ customerId: c.customerId, sharePercent: shareOf(c) }))
            : undefined,
      });
      setInvoiceItems([]);
      setInvoiceDueAt('');
      setShareOverrides({});
      setShowInvoiceForm(false);
      load();
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : 'ออกใบแจ้งหนี้ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  if (loading) return <PageLoading title={d.caseBilling.loading} lines={3} />;

  const totalHours = timeEntries.reduce((sum, e) => sum + e.hours, 0);
  const totalBilled = timeEntries.reduce((sum, e) => sum + e.hours * e.rate, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-slate-900">{d.caseBilling.title}</h2>

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
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{d.caseBilling.invoices}</h2>
          <button
            type="button"
            onClick={() => { setShowInvoiceForm((open) => !open); setInvoiceError(''); }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            {showInvoiceForm ? 'ยกเลิก' : '+ ออกใบแจ้งหนี้'}
          </button>
        </div>

        {showInvoiceForm && (
          <form onSubmit={handleCreateInvoice} className="mb-5 space-y-3 rounded-lg border border-slate-200 p-4">
            {(draft?.timeEntries.length || draft?.expenses.length) ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">งานในคดีที่ยังไม่ได้เก็บเงิน</p>
                {draft.timeEntries.map((entry) => (
                  <label key={entry.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pickedTimeIds.includes(entry.id)}
                      onChange={(e) =>
                        setPickedTimeIds((ids) =>
                          e.target.checked ? [...ids, entry.id] : ids.filter((i) => i !== entry.id),
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {entry.description || 'ค่าทนายความ'}
                      <span className="text-slate-400"> · {entry.hours} ชม. × {formatCurrency(entry.rate)}</span>
                    </span>
                    <span className="font-medium">{formatCurrency(entry.amount)}</span>
                  </label>
                ))}
                {draft.expenses.map((expense) => (
                  <label key={expense.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pickedExpenseIds.includes(expense.id)}
                      onChange={(e) =>
                        setPickedExpenseIds((ids) =>
                          e.target.checked ? [...ids, expense.id] : ids.filter((i) => i !== expense.id),
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {expense.description}
                      <span className="text-slate-400"> · ค่าใช้จ่าย</span>
                    </span>
                    <span className="font-medium">{formatCurrency(expense.amount)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                คดีนี้ยังไม่มีบันทึกเวลาหรือค่าใช้จ่ายที่รอเก็บเงิน
                {draft?.agreedFee
                  ? ` — ค่าจ้างที่ตกลงไว้คือ ${formatCurrency(draft.agreedFee)}`
                  : ''}
              </p>
            )}

            <div className="space-y-2">
              {invoiceItems.map((item, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`รายการที่ ${index + 1}`}
                    value={item.description}
                    onChange={(e) =>
                      setInvoiceItems((rows) =>
                        rows.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)),
                      )
                    }
                    placeholder="เช่น ค่าว่าความศาลชั้นต้น"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    aria-label={`จำนวนของรายการที่ ${index + 1}`}
                    value={item.quantity}
                    onChange={(e) =>
                      setInvoiceItems((rows) =>
                        rows.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)),
                      )
                    }
                    inputMode="decimal"
                    className="w-16 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  />
                  <input
                    aria-label={`ราคาต่อหน่วยของรายการที่ ${index + 1}`}
                    value={item.unitPrice}
                    onChange={(e) =>
                      setInvoiceItems((rows) =>
                        rows.map((r, i) => (i === index ? { ...r, unitPrice: e.target.value } : r)),
                      )
                    }
                    inputMode="decimal"
                    placeholder="ราคา"
                    className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  {invoiceItems.length > 1 && (
                    <button
                      type="button"
                      aria-label={`ลบรายการที่ ${index + 1}`}
                      onClick={() => setInvoiceItems((rows) => rows.filter((_, i) => i !== index))}
                      className="px-1 text-sm text-slate-400"
                    >
                      ลบ
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setInvoiceItems((rows) => [
                    ...rows,
                    {
                      description: '',
                      quantity: '1',
                      // ไม่มีงานให้เก็บเงินและยังไม่เคยเพิ่มบรรทัดเอง ตั้งต้นด้วยค่าจ้างที่ตกลงไว้
                      unitPrice:
                        !rows.length && !pickedTime.length && !pickedExpenses.length && draft?.agreedFee
                          ? String(draft.agreedFee)
                          : '',
                    },
                  ])
                }
                className="text-sm underline"
              >
                + เพิ่มรายการที่ไม่ได้อยู่ในคดี
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <label className="text-sm text-slate-500">
                ครบกำหนดชำระ{' '}
                <input
                  aria-label="ครบกำหนดชำระ"
                  type="date"
                  value={invoiceDueAt}
                  onChange={(e) => setInvoiceDueAt(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <p className="text-sm">รวม <span className="font-semibold">{formatCurrency(invoiceTotal)}</span></p>
            </div>

            {customers.length > 1 && (
              <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                <p className="text-sm font-medium">แบ่งบิล {customers.length} ใบ</p>
                {customers.map((customer, index) => (
                  <div key={customer.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{customer.customer.name}</span>
                    <input
                      aria-label={`สัดส่วนของ ${customer.customer.name}`}
                      value={shareOverrides[customer.customerId] ?? String(shareOf(customer))}
                      onChange={(e) =>
                        setShareOverrides((rows) => ({ ...rows, [customer.customerId]: e.target.value }))
                      }
                      inputMode="decimal"
                      className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm"
                    />
                    <span className="text-slate-400">%</span>
                    <span className="w-28 text-right font-medium">{formatCurrency(splitPreview[index] ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
            {customers.length === 1 && (
              <p className="text-sm text-slate-500">วางบิลที่ {customers[0].customer.name}</p>
            )}
            {customers.length === 0 && (
              <p className="text-sm text-amber-600">
                คดีนี้ยังไม่ได้ระบุลูกค้า (ผู้ว่าจ้าง) — ใบแจ้งหนี้จะออกโดยไม่ผูกกับใคร
              </p>
            )}

            {invoiceError && <p role="alert" className="text-sm text-red-600">{invoiceError}</p>}
            <button
              type="submit"
              disabled={invoiceSubmitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {invoiceSubmitting
                ? 'กำลังออก…'
                : customers.length > 1
                  ? `ออกใบแจ้งหนี้ ${customers.length} ใบ`
                  : 'ออกใบแจ้งหนี้'}
            </button>
          </form>
        )}

        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{inv.invoiceNumber}</span>
                {inv.billToCustomer && (
                  <p className="truncate text-xs text-slate-400">{inv.billToCustomer.name}</p>
                )}
              </div>
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
