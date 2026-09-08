'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, TrendingUp, TrendingDown, Wallet, Receipt } from 'lucide-react';
import { FirmRole } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ExpenseItem, FinanceSummary, FirmInvoiceItem } from '@/lib/api';
import { PageHeader, KpiCard } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';

const REVENUE_SOURCE_LABEL: Record<string, string> = {
  estimated: 'ประมาณการ',
  time: 'ชั่วโมงทำงาน',
  invoice: 'ใบแจ้งหนี้',
  none: '—',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'ร่าง',
  SENT: 'ส่งแล้ว',
  PAID: 'ชำระแล้ว',
};

export default function ExpensesPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const router = useRouter();
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [invoices, setInvoices] = useState<FirmInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [submittingId, setSubmittingId] = useState('');

  useEffect(() => {
    const authToken = token ?? getStoredToken();
    if (!authToken) {
      setLoading(false);
      return;
    }
    setError('');
    Promise.all([
      api.getExpenses(authToken),
      api.getFinanceSummary(authToken),
      api.getFirmInvoices(authToken),
    ])
      .then(([e, f, inv]) => {
        setExpenses(e);
        setFinance(f);
        setInvoices(inv);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : d.expenses.loadFailed);
      })
      .finally(() => setLoading(false));
  }, [token, reloadKey]);

  /** A draft is only a record until its author claims it. */
  const submitForApproval = async (expenseId: string) => {
    const authToken = token ?? getStoredToken();
    if (!authToken || submittingId) return;
    setSubmittingId(expenseId);
    setError('');
    try {
      await api.updateExpenseStatus(authToken, expenseId, 'PENDING');
      setReloadKey((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : d.expenses.submitDraftFailed);
    } finally {
      setSubmittingId('');
    }
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
        title={d.expenses.title}
        description={
          finance.scope === 'user'
            ? `ค่าใช้จ่ายของคุณ · ${finance.firmName}`
            : `แดชบอร์ดการเงินของ ${finance.firmName}`
        }
        actions={
          <Button size="sm" onClick={() => router.push('/expenses/new')}>
            <Plus className="h-4 w-4" />{d.expenses.newTitle}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{d.expenses.claims}</CardTitle>
            {user?.firmRole === FirmRole.OWNER && (
              <Link href="/admin/reimbursements"><Button variant="outline" size="sm">{d.expenses.approve}</Button></Link>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.expenses.descriptionField}</TableHead>
                  <TableHead>{d.expenses.caseField}</TableHead>
                  <TableHead>{d.expenses.amount}</TableHead>
                  <TableHead>{d.expenses.status}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {d.expenses.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.slice(0, 8).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{e.description}</p>
                        <p className="text-xs text-muted-foreground">{e.category}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.case?.ownRef ?? d.expenses.general}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(e.amount)}</TableCell>
                      <TableCell><ExpenseStatusBadge status={e.status} /></TableCell>
                      <TableCell className="text-right">
                        {e.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={submittingId === e.id}
                            onClick={() => submitForApproval(e.id)}
                          >
                            {submittingId === e.id ? d.expenses.submitting : d.expenses.submitDraft}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{d.expenses.invoices}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.expenses.invoiceNumber}</TableHead>
                  <TableHead>{d.expenses.client}</TableHead>
                  <TableHead>{d.expenses.amount}</TableHead>
                  <TableHead>{d.expenses.due}</TableHead>
                  <TableHead>{d.expenses.status}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {d.expenses.noInvoices}
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
                          {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
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
