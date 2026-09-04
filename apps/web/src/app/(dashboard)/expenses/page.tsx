'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, TrendingUp, TrendingDown, Wallet, Receipt } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  FirmRole,
  MONEY_HINT,
  MONEY_MAX,
  MONEY_MIN,
  MONEY_STEP,
} from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, CaseItem, ExpenseItem, FinanceSummary, FirmInvoiceItem } from '@/lib/api';
import { PageHeader, KpiCard } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';

const REVENUE_SOURCE_LABEL: Record<string, string> = {
  estimated: 'ประมาณการ',
  time: 'ชั่วโมงทำงาน',
  invoice: 'ใบแจ้งหนี้',
  none: '—',
};

export default function ExpensesPage() {
  const { token, user } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [invoices, setInvoices] = useState<FirmInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    amount: '', description: '', category: EXPENSE_CATEGORIES[0] as string,
    expensePurpose: '', caseId: '',
  });

  const load = () => {
    const authToken = token ?? getStoredToken();
    if (!authToken) {
      setLoading(false);
      return;
    }
    setError('');
    Promise.all([
      api.getCases(authToken),
      api.getExpenses(authToken),
      api.getFinanceSummary(authToken),
      api.getFirmInvoices(authToken),
    ])
      .then(([c, e, f, inv]) => {
        setCases(c);
        setExpenses(e);
        setFinance(f);
        setInvoices(inv);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : 'Failed to load expenses');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const authToken = token ?? getStoredToken();
    if (!authToken) return;
    await api.createStandaloneExpense(authToken, {
      amount: parseFloat(form.amount), description: form.description,
      category: form.category, expensePurpose: form.expensePurpose || undefined,
      caseId: form.caseId || undefined,
    });

    setShowForm(false);
    setForm({
      amount: '', description: '', category: EXPENSE_CATEGORIES[0] as string,
      expensePurpose: '', caseId: '',
    });
    setLoading(true);
    load();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!finance) return null;

  const caseProfits = finance.caseProfits ?? [];

  return (
    <div>
      <PageHeader
        title="Expenses & Finance"
        description={
          finance.scope === 'user'
            ? `Your expenses · ${finance.firmName}`
            : `Financial dashboard for ${finance.firmName}`
        }
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />New Expense
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="รายได้รวม" value={formatCurrency(finance.revenue)} icon={TrendingUp} change="จากทุกคดี" trend="up" />
        <KpiCard label="ค่าใช้จ่ายอนุมัติ" value={formatCurrency(finance.approvedExpenses)} icon={Receipt} change={`${finance.expenseCount} รายการ`} trend="down" />
        <KpiCard label="รออนุมัติ" value={formatCurrency(finance.outstanding)} icon={Wallet} change={`${finance.pendingCount} รายการ`} trend="neutral" />
        <KpiCard label="กำไรสุทธิ" value={formatCurrency(finance.netProfit)} icon={TrendingDown} change="รายได้ − ค่าใช้จ่ายอนุมัติ" trend={finance.netProfit >= 0 ? 'up' : 'down'} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>กำไรแต่ละคดี / Profit by Case</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เลขคดี</TableHead>
                <TableHead>ชื่อคดี</TableHead>
                <TableHead>ลูกความ</TableHead>
                <TableHead className="text-right">รายได้</TableHead>
                <TableHead>แหล่งรายได้</TableHead>
                <TableHead className="text-right">ค่าใช้จ่าย</TableHead>
                <TableHead className="text-right">กำไร</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {caseProfits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    ยังไม่มีข้อมูลคดี
                  </TableCell>
                </TableRow>
              ) : (
                caseProfits.map((row) => (
                  <TableRow key={row.caseId}>
                    <TableCell>
                      <Link href={`/cases/${row.caseId}`} className="font-medium text-primary hover:underline">
                        {row.ownRef}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">{row.title}</TableCell>
                    <TableCell className="text-muted-foreground">{row.clientName ?? '—'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {REVENUE_SOURCE_LABEL[row.revenueSource] ?? row.revenueSource}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.expenses)}</TableCell>
                    <TableCell className={`text-right font-semibold ${row.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {formatCurrency(row.profit)}
                    </TableCell>
                    <TableCell><CaseStatusBadge status={row.status as import('@lawfirm/shared').CaseStatus} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <div>
                <Input
                  required
                  type="number"
                  step={MONEY_STEP}
                  min={MONEY_MIN}
                  max={MONEY_MAX}
                  title={MONEY_HINT}
                  placeholder="Amount (฿)"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">{MONEY_HINT}</p>
              </div>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-9 rounded-lg border border-input bg-card px-3 text-sm">
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Input required placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input placeholder="Purpose / วัตถุประสงค์" value={form.expensePurpose} onChange={(e) => setForm({ ...form, expensePurpose: e.target.value })} />
              <select value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })} className="h-9 rounded-lg border border-input bg-card px-3 text-sm md:col-span-2">
                <option value="">No case — general expense</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.ownRef} — {c.title}</option>)}
              </select>
              <Button type="submit" className="md:col-span-2 w-fit">Submit for Approval</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Expense Claims</CardTitle>
            {user?.firmRole === FirmRole.OWNER && (
              <Link href="/admin/reimbursements"><Button variant="outline" size="sm">Approve</Button></Link>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No expense claims yet
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.slice(0, 8).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{e.description}</p>
                        <p className="text-xs text-muted-foreground">{e.category}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.case?.ownRef ?? 'General'}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(e.amount)}</TableCell>
                      <TableCell><ExpenseStatusBadge status={e.status} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No invoices yet
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell>{inv.clientName}</TableCell>
                      <TableCell>{formatCurrency(inv.totalAmount)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {inv.dueAt ? formatDate(inv.dueAt) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'SENT' ? 'warning' : 'muted'}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
