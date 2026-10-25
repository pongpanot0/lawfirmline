'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Paperclip, FileText } from 'lucide-react';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ExpenseItem, FinanceSummary } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { KpiStrip } from '@/components/reports/KpiStrip';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { SelectField } from '@/components/ui/form-fields';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { PageLoading, TableEmptyRow } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { formatCurrency } from '@/lib/utils';
import { fmt } from '@/lib/i18n/dashboard';

const STATUS_FILTERS = ['', 'DRAFT', 'PENDING', 'APPROVED', 'PAID', 'REJECTED'] as const;

type TeamMember = {
  id: string;
  firstName: string;
  lastName: string;
};

export default function ExpensesPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const router = useRouter();
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [requesterFilter, setRequesterFilter] = useState('');

  const canApprove = hasFirmCapability(user?.firmRole, 'approveExpenses');
  // /finance/summary needs manageInvoices; everyone else sees the list without the firm KPI row.
  const canSeeFinance = hasFirmCapability(user?.firmRole, 'manageInvoices');

  const statusLabels: Record<string, string> = {
    DRAFT: d.expenses.statusDraft,
    PENDING: d.expenses.statusPending,
    APPROVED: d.expenses.statusApproved,
    PAID: d.expenses.statusPaid,
    REJECTED: d.expenses.statusRejected,
  };

  useEffect(() => {
    const authToken = token ?? getStoredToken();
    if (!authToken) {
      setLoading(false);
      return;
    }
    setError('');
    const expenseParams = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(canApprove && requesterFilter ? { userId: requesterFilter } : {}),
    };
    const loads: Promise<unknown>[] = [
      api.getExpenses(authToken, Object.keys(expenseParams).length ? expenseParams : undefined),
      canSeeFinance ? api.getFinanceSummary(authToken) : Promise.resolve(null),
    ];
    if (canApprove) {
      loads.push(api.getTeamMembers(authToken).catch(() => []));
    }
    Promise.all(loads)
      .then(([e, f, m]) => {
        setExpenses(e as ExpenseItem[]);
        setSelectedDraftIds(prev => prev.filter(id => (e as ExpenseItem[]).some(item => item.id === id)));
        setFinance(f as FinanceSummary | null);
        if (Array.isArray(m)) setMembers(m as TeamMember[]);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : d.expenses.loadFailed);
      })
      .finally(() => setLoading(false));
  }, [token, reloadKey, statusFilter, requesterFilter, canApprove, canSeeFinance, d.expenses.loadFailed]);

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
    if (draftExpenses.every(e => selectedDraftIds.includes(e.id))) {
      setSelectedDraftIds(prev => prev.filter(id => !draftExpenses.some(e => e.id === id)));
      return;
    }
    setSelectedDraftIds(prev => [...new Set([...prev, ...draftExpenses.map(e => e.id)])]);
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
      setSelectedDraftIds(prev => prev.filter(id => !draftExpenses.some(e => e.id === id)));
      setReloadKey((n) => n + 1);
      router.replace('/expenses');
    }
  }, [d.expenses.sendToOwnerSuccess, router]);

  if (loading) return <PageLoading title={d.common.loading} lines={4} />;

  if (error && !expenses.length && !finance) {
    return <LoadFailed message={error} onRetry={() => { setLoading(true); setReloadKey((n) => n + 1); }} />;
  }

  const colSpan = (canApprove ? 1 : 0) + 4;

  return (
    <div>
      <PageHeader
        title={d.expenses.title}
        description={
          !finance
            ? 'ค่าใช้จ่ายของคุณ'
            : finance.scope === 'user'
              ? `ค่าใช้จ่ายของคุณ · ${finance.firmName}`
              : `บันทึก เบิก และติดตามค่าใช้จ่ายของ ${finance.firmName}`
        }
        actions={
          <>
            <Button size="sm" variant="outline" onClick={openClaimSheet} disabled={!selectedDraftIds.length}>
              <FileText className="h-4 w-4" aria-hidden />จัดทำใบเบิก{selectedDraftIds.length ? ` (${selectedDraftIds.length})` : ''}
            </Button>
            <Button size="sm" onClick={() => router.push('/expenses/new')}>
              <Plus className="h-4 w-4" aria-hidden />
              {d.expenses.newTitle}
            </Button>
          </>
        }
      />

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="mb-4 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          {success}
        </div>
      )}

      {finance && <KpiStrip className="mb-6" items={[
        { label: d.expenses.draftKpi, value: formatCurrency(finance.draftTotal ?? 0), note: `${finance.draftCount ?? 0} รายการ` },
        { label: d.expenses.statusPending, value: formatCurrency(finance.outstanding), note: `${finance.pendingCount} รายการ` },
        { label: d.expenses.statusApproved, value: formatCurrency(finance.approvedExpenses), note: `${finance.expenseCount} รายการ` },
      ]} />}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <SelectField
            label={d.expenses.filterStatus}
            containerClassName="min-w-0 sm:w-48"
            value={statusFilter}
            onChange={(e) => {
              setLoading(true);
              setStatusFilter(e.target.value);
            }}
          >
            <option value="">{d.expenses.allStatuses}</option>
            {STATUS_FILTERS.filter(Boolean).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </SelectField>
        {canApprove && (
            <SelectField
              label={d.expenses.filterRequester}
              containerClassName="min-w-0 sm:w-56"
              value={requesterFilter}
              onChange={(e) => {
                setLoading(true);
                setRequesterFilter(e.target.value);
              }}
            >
              <option value="">{d.expenses.allRequesters}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}
                </option>
              ))}
            </SelectField>
        )}
      </div>

      {/* Step 1 — drafts waiting to be claimed. Only rows here are selectable,
          so the checkbox never appears next to something already submitted. */}
      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>{d.expenses.savedDrafts}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">รายการที่ยังไม่ได้เบิก</p>
          </div>

        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={draftExpenses.length > 0 && draftExpenses.every(e => selectedDraftIds.includes(e.id))}
                    onChange={toggleAllDrafts}
                    aria-label={d.expenses.selectAll}
                  />
                </TableHead>
                <TableHead>{d.expenses.descriptionField}</TableHead>
                {canApprove && <TableHead>{d.expenses.requester}</TableHead>}
                <TableHead>{d.expenses.caseField}</TableHead>
                <TableHead className="text-right">{d.expenses.amount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draftExpenses.length === 0 ? (
                <TableEmptyRow
                  colSpan={colSpan}
                  title={d.expenses.empty}
                  description="ค่าใช้จ่ายที่บันทึกแล้วยังไม่เบิกจะแสดงที่นี่"
                />
              ) : (
                draftExpenses.map((e) => (
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
                          className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary hover:underline sm:min-h-0"
                          onClick={() => downloadReceipt(e.id, e.receiptFilename!)}
                        >
                          <Paperclip className="h-3.5 w-3.5" aria-hidden />
                          {d.expenses.viewReceipt}
                        </button>
                      )}
                    </TableCell>
                    {canApprove && (
                      <TableCell className="text-sm text-muted-foreground">
                        {e.user.firstName} {e.user.lastName}
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">
                      {e.case?.ownRef ?? d.expenses.general}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(e.amount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Previously submitted items can be exported without resubmitting them. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>{d.expenses.submittedList}</CardTitle>
          {canApprove && (
            <Link href="/admin/reimbursements" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {d.expenses.approveClaims}
            </Link>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox aria-label="เลือกประวัติทั้งหมด" checked={submittedExpenses.length > 0 && submittedExpenses.every(e => selectedDraftIds.includes(e.id))} onChange={() => setSelectedDraftIds(prev => submittedExpenses.every(e => prev.includes(e.id)) ? prev.filter(id => !submittedExpenses.some(e => e.id === id)) : [...new Set([...prev, ...submittedExpenses.map(e => e.id)])])} /></TableHead><TableHead>{d.expenses.descriptionField}</TableHead>
                {canApprove && <TableHead>{d.expenses.requester}</TableHead>}
                <TableHead>{d.expenses.caseField}</TableHead>
                <TableHead className="text-right">{d.expenses.amount}</TableHead>
                <TableHead>{d.expenses.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submittedExpenses.length === 0 ? (
                <TableEmptyRow colSpan={colSpan + 1} title={d.expenses.empty} />
              ) : (
                submittedExpenses.map((e) => (
                  <TableRow key={e.id}><TableCell><Checkbox aria-label={`เลือก ${e.description}`} checked={selectedDraftIds.includes(e.id)} onChange={() => toggleDraft(e.id)} /></TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{e.category}</p>
                      {e.receiptFilename && (
                        <button
                          type="button"
                          className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary hover:underline sm:min-h-0"
                          onClick={() => downloadReceipt(e.id, e.receiptFilename!)}
                        >
                          <Paperclip className="h-3.5 w-3.5" aria-hidden />
                          {d.expenses.viewReceipt}
                        </button>
                      )}
                    </TableCell>
                    {canApprove && (
                      <TableCell className="text-sm text-muted-foreground">
                        {e.user.firstName} {e.user.lastName}
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">
                      {e.case?.ownRef ?? d.expenses.general}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(e.amount)}</TableCell>
                    <TableCell>
                      <ExpenseStatusBadge status={e.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
