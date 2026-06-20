'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, TrendingUp, TrendingDown, Wallet, Receipt } from 'lucide-react';
import { EXPENSE_CATEGORIES, Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseItem, ExpenseItem } from '@/lib/api';
import { PageHeader, KpiCard } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ExpensesPage() {
  const { token, user } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    amount: '', description: '', category: EXPENSE_CATEGORIES[0] as string,
    expensePurpose: '', caseId: '',
  });

  const load = () => {
    if (!token) return;
    Promise.all([api.getCases(token), api.getExpenses(token)])
      .then(([c, e]) => { setCases(c); setExpenses(e); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const approved = expenses.filter((e) => e.status === 'APPROVED' || e.status === 'PAID');
  const pending = expenses.filter((e) => e.status === 'PENDING');
  const revenue = 450000;
  const netProfit = revenue - approved.reduce((s, e) => s + e.amount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    await api.createStandaloneExpense(token, {
      amount: parseFloat(form.amount), description: form.description,
      category: form.category, expensePurpose: form.expensePurpose || undefined,
      caseId: form.caseId || undefined,
    });
    setShowForm(false);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Expenses & Finance"
        description="Financial dashboard for revenue, expenses, and reimbursements"
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />New Expense
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Revenue" value={formatCurrency(revenue)} icon={TrendingUp} change="This month" trend="up" />
        <KpiCard label="Outstanding" value={formatCurrency(pending.reduce((s, e) => s + e.amount, 0))} icon={Wallet} change={`${pending.length} pending`} trend="neutral" />
        <KpiCard label="Expenses" value={formatCurrency(totalExpenses)} icon={Receipt} change={`${expenses.length} claims`} trend="down" />
        <KpiCard label="Net Profit" value={formatCurrency(netProfit)} icon={TrendingDown} change="After expenses" trend="up" />
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <Input required type="number" step="0.01" placeholder="Amount (฿)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-9 rounded-lg border border-input bg-card px-3 text-sm">
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Input required placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input placeholder="Purpose / วัตถุประสงค์" value={form.expensePurpose} onChange={(e) => setForm({ ...form, expensePurpose: e.target.value })} />
              <select value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })} className="h-9 rounded-lg border border-input bg-card px-3 text-sm md:col-span-2">
                <option value="">No case — general expense</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.caseNumber} — {c.title}</option>)}
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
            {user?.role === Role.ADMIN && (
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
                {expenses.slice(0, 8).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{e.category}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.case?.caseNumber ?? 'General'}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(e.amount)}</TableCell>
                    <TableCell><ExpenseStatusBadge status={e.status} /></TableCell>
                  </TableRow>
                ))}
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
                {[
                  { no: 'INV-00001', client: 'John Smith', amount: 85000, due: '2025-07-15', status: 'SENT' },
                  { no: 'INV-00002', client: 'ABC Corp', amount: 120000, due: '2025-07-20', status: 'DRAFT' },
                  { no: 'INV-00003', client: 'Thai Property', amount: 45000, due: '2025-06-30', status: 'PAID' },
                ].map((inv) => (
                  <TableRow key={inv.no}>
                    <TableCell className="font-medium">{inv.no}</TableCell>
                    <TableCell>{inv.client}</TableCell>
                    <TableCell>{formatCurrency(inv.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(inv.due)}</TableCell>
                    <TableCell><Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'SENT' ? 'warning' : 'muted'}>{inv.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
