'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Wallet, Receipt, Paperclip, FileText, Clock } from 'lucide-react';
import { FirmRole } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ExpenseItem, FinanceSummary } from '@/lib/api';
import { PageHeader, KpiCard } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { PageLoading, TableEmptyRow } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { formatCurrency } from '@/lib/utils';
import { fmt } from '@/lib/i18n/dashboard';

export default function ExpensesPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const router = useRouter();
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);

  const isOwner = user?.firmRole === FirmRole.OWNER;

  useEffect(() => {
    const authToken = token ?? getStoredToken();
    if (!authToken) {
      setLoading(false);
      return;
    }
    setError('');
    Promise.all([api.getExpenses(authToken), api.getFinanceSummary(authToken)])
      .then(([e, f]) => {
        setExpenses(e);
        setFinance(f);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : d.expenses.loadFailed);
      })
      .finally(() => setLoading(false));
  }, [token, reloadKey, d.expenses.loadFailed]);

  const draftExpenses = useMemo(
    () => expenses.filter((e) => e.status === 'DRAFT'),
    [expenses],
  );
  const submittedExpenses = useMemo(
    () => expenses.filter((e) => e.status !== 'DRAFT'),
    [expenses],
  );

  const downloadReceipt = async (expenseId: string, filename: string) => {
    const authToken = token ?? getStoredToken();
    if (!authToken) return;
    try {
      const blob = await api.downloadExpenseReceipt(authToken, expenseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : d.expenses.loadFailed);
    }
  };

  const toggleDraft = (expenseId: string) => {
    setSelectedDraftIds((current) =>
      current.includes(expenseId)
        ? current.filter((id) => id !== expenseId)
        : [...current, expenseId],
    );
  };

  const toggleAllDrafts = () => {
    if (selectedDraftIds.length === draftExpenses.length) {
      setSelectedDraftIds([]);
      return;
    }
    setSelectedDraftIds(draftExpenses.map((e) => e.id));
  };

  const openClaimSheet = () => {
    if (!selectedDraftIds.length) return;
    router.push(`/expenses/claim?ids=${selectedDraftIds.join(',')}`);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sent = new URLSearchParams(window.location.search).get('sent');
    if (sent === '1') {
      setSuccess(d.expenses.sendToOwnerSuccess);
      setSelectedDraftIds([]);
      setReloadKey((n) => n + 1);
      router.replace('/expenses');
    }
  }, [d.expenses.sendToOwnerSuccess, router]);

  if (loading) return <PageLoading title={d.common.loading} lines={4} />;

  if (error && !finance) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!finance) return null;

  return (
    <div>
      <PageHeader
        title={d.expenses.title}
        description={
          finance.scope === 'user'
            ? `ค่าใช้จ่ายของคุณ · ${finance.firmName}`
            : `บันทึก เบิก และติดตามค่าใช้จ่ายของ ${finance.firmName}`
        }
        actions={
          <Button size="sm" onClick={() => router.push('/expenses/new')}>
            <Plus className="h-4 w-4" />
            {d.expenses.newTitle}
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {success}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={d.expenses.draftKpi}
          value={formatCurrency(finance.draftTotal ?? 0)}
          icon={Wallet}
          change={`${finance.draftCount ?? 0} รายการ`}
          trend="neutral"
        />
        <KpiCard
          label="รออนุมัติ"
          value={formatCurrency(finance.outstanding)}
          icon={Clock}
          change={`${finance.pendingCount} รายการ`}
          trend="neutral"
        />
        <KpiCard
          label="อนุมัติแล้ว"
          value={formatCurrency(finance.approvedExpenses)}
          icon={Receipt}
          change={`${finance.expenseCount} รายการ`}
          trend="down"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>{d.expenses.savedDrafts}</CardTitle>
            {draftExpenses.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">{d.expenses.savedDraftsHint}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedDraftIds.length > 0 && (
              <Button size="sm" onClick={openClaimSheet}>
                <FileText className="h-4 w-4" />
                {fmt(d.expenses.prepareClaimCount, { count: selectedDraftIds.length })}
              </Button>
            )}
            {isOwner && (
              <Link href="/admin/reimbursements">
                <Button variant="outline" size="sm">
                  {d.expenses.approve}
                </Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {draftExpenses.length > 0 && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={draftExpenses.length > 0 && selectedDraftIds.length === draftExpenses.length}
                      onChange={toggleAllDrafts}
                      aria-label={d.expenses.selectAll}
                    />
                  </TableHead>
                )}
                <TableHead>{d.expenses.descriptionField}</TableHead>
                <TableHead>{d.expenses.caseField}</TableHead>
                <TableHead>{d.expenses.amount}</TableHead>
                <TableHead>{d.expenses.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 ? (
                <TableEmptyRow
                  colSpan={draftExpenses.length > 0 ? 5 : 4}
                  title={d.expenses.empty}
                  description="เพิ่มค่าใช้จ่ายแล้วติ๊กเลือกรายการเพื่อจัดทำใบเบิก"
                />
              ) : (
                <>
                  {draftExpenses.map((e) => (
                    <TableRow key={e.id} className={selectedDraftIds.includes(e.id) ? 'bg-primary/5' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedDraftIds.includes(e.id)}
                          onChange={() => toggleDraft(e.id)}
                          aria-label={e.description}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{e.description}</p>
                        <p className="text-xs text-muted-foreground">{e.category}</p>
                        {e.receiptFilename && (
                          <button
                            type="button"
                            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary"
                            onClick={() => downloadReceipt(e.id, e.receiptFilename!)}
                          >
                            <Paperclip className="h-3 w-3" />
                            {d.expenses.viewReceipt}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.case?.ownRef ?? d.expenses.general}
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(e.amount)}</TableCell>
                      <TableCell>
                        <ExpenseStatusBadge status={e.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {submittedExpenses.map((e) => (
                    <TableRow key={e.id}>
                      {draftExpenses.length > 0 && <TableCell />}
                      <TableCell>
                        <p className="text-sm font-medium">{e.description}</p>
                        <p className="text-xs text-muted-foreground">{e.category}</p>
                        {e.receiptFilename && (
                          <button
                            type="button"
                            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary"
                            onClick={() => downloadReceipt(e.id, e.receiptFilename!)}
                          >
                            <Paperclip className="h-3 w-3" />
                            {d.expenses.viewReceipt}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.case?.ownRef ?? d.expenses.general}
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(e.amount)}</TableCell>
                      <TableCell>
                        <ExpenseStatusBadge status={e.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
