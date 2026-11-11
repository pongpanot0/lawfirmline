'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileText } from 'lucide-react';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ExpenseItem, FinanceSummary } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { KpiStrip } from '@/components/reports/KpiStrip';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { SelectField } from '@/components/ui/form-fields';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PageLoading } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { formatCurrency, formatDate } from '@/lib/utils';
import { WhoActsTabs } from '@/components/process/WhoActsTabs';
import { StepTracker } from '@/components/process/StepTracker';

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
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState('TODO');
  const [requesterFilter, setRequesterFilter] = useState('');
  const [busyClaim, setBusyClaim] = useState('');

  const canApprove = hasFirmCapability(user?.firmRole, 'approveExpenses');
  useEffect(() => { const requested = new URLSearchParams(window.location.search).get('tab'); if (requested && ['TODO', 'PENDING', 'APPROVED', 'PAID', ...(canApprove ? ['APPROVE'] : [])].includes(requested)) setTab(requested); else if (canApprove) setTab('APPROVE'); }, [canApprove]);
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
        setSelectedDraftIds(prev => prev.filter(id => (e as ExpenseItem[]).some(item => item.id === id && item.status === 'DRAFT')));
        setFinance(f as FinanceSummary | null);
        if (Array.isArray(m)) setMembers(m as TeamMember[]);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : d.expenses.loadFailed);
      })
      .finally(() => setLoading(false));
  }, [token, reloadKey, requesterFilter, canApprove, canSeeFinance, d.expenses.loadFailed]);

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

  const openClaimSheet = () => {
    if (!selectedDraftIds.length) return;
    router.push(`/expenses/claim?ids=${selectedDraftIds.join(',')}`);
  };

  if (loading) return <PageLoading title={d.common.loading} lines={4} />;

  if (error && !expenses.length && !finance) {
    return <LoadFailed message={error} onRetry={() => { setLoading(true); setReloadKey((n) => n + 1); }} />;
  }

  const own = expenses.filter(e => e.user.id === user?.id);
  const groups = { TODO: own.filter(e => e.status === 'DRAFT' || e.status === 'REJECTED'), PENDING: own.filter(e => e.status === 'PENDING'), APPROVED: own.filter(e => e.status === 'APPROVED'), PAID: own.filter(e => e.status === 'PAID'), APPROVE: expenses.filter(e => e.status === 'PENDING' && !!e.claimId) };
  const visible = (groups[tab as keyof typeof groups] ?? groups.TODO).filter((e, index, items) => (!statusFilter || e.status === statusFilter) && (tab !== 'APPROVE' || items.findIndex(item => item.claimId === e.claimId) === index));
  const selectedTotal = expenses.filter(e => e.status === 'DRAFT' && selectedDraftIds.includes(e.id)).reduce((sum, e) => sum + e.amount, 0);
  const decideClaim = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const authToken = token ?? getStoredToken();
    if (!authToken || !window.confirm(status === 'APPROVED' ? 'อนุมัติใบเบิกนี้?' : 'ไม่อนุมัติใบเบิกนี้?')) return;
    setBusyClaim(id);
    try { await api.updateExpenseClaimStatus(authToken, id, status); setReloadKey(n => n + 1); }
    catch (err) { setError(err instanceof Error ? err.message : d.expenses.loadFailed); }
    finally { setBusyClaim(''); }
  };

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
      {canSeeFinance && finance && <details className="mb-6"><summary className="cursor-pointer py-3 font-medium">ภาพรวมการเงิน</summary><KpiStrip items={[
        { label: d.expenses.draftKpi, value: formatCurrency(finance.draftTotal ?? 0), note: `${finance.draftCount ?? 0} รายการ` },
        { label: d.expenses.statusPending, value: formatCurrency(finance.outstanding), note: `${finance.pendingCount} รายการ` },
        { label: d.expenses.statusApproved, value: formatCurrency(finance.approvedExpenses), note: `${finance.expenseCount} รายการ` },
      ]} /></details>}

      <details className="mb-4"><summary className="cursor-pointer py-3">ตัวกรองเพิ่ม</summary><div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 sm:flex sm:flex-wrap">
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
      </div></details>

      <WhoActsTabs value={tab} onChange={setTab} tabs={[
        ...(canApprove ? [{ key: 'APPROVE', label: 'รอฉันอนุมัติ', count: new Set(groups.APPROVE.map(e => e.claimId)).size }] : []),
        { key: 'TODO', label: 'ต้องทำ', count: groups.TODO.length },
        { key: 'PENDING', label: 'รออนุมัติ', count: groups.PENDING.length },
        { key: 'APPROVED', label: 'รอจ่าย', count: groups.APPROVED.length },
        { key: 'PAID', label: 'จ่ายแล้ว', count: groups.PAID.length },
      ]} />
      <div className="mt-4 space-y-3 pb-24">
        {visible.length === 0 ? <p className="rounded-lg border bg-card p-6 text-center text-muted-foreground">ไม่มีรายการที่ต้องทำ</p> : visible.map(e => <article key={e.id} className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap justify-between gap-2"><div className="flex gap-3">{e.status === 'DRAFT' && tab === 'TODO' && <Checkbox checked={selectedDraftIds.includes(e.id)} onChange={() => toggleDraft(e.id)} aria-label={`เลือก ${e.description}`} />}<div><p className="font-medium">{tab === 'APPROVE' ? `ใบเบิก · ${e.user.firstName} ${e.user.lastName}` : e.description}</p><p className="text-sm text-muted-foreground">{e.case?.ownRef ?? d.expenses.general} · {formatDate(e.date)}{tab === 'APPROVE' ? ` · ${e.user.firstName} ${e.user.lastName}` : ''}</p></div></div><p className="font-semibold tabular-nums">{formatCurrency(tab === 'APPROVE' ? groups.APPROVE.filter(item => item.claimId === e.claimId).reduce((sum, item) => sum + item.amount, 0) : e.amount)}</p></div>
          <StepTracker variant="mini" steps={['ร่าง', 'ส่งเบิก', 'อนุมัติ', 'จ่ายแล้ว'].map((label, i) => { const current = e.status === 'DRAFT' ? 0 : e.status === 'PENDING' || e.status === 'REJECTED' ? 1 : e.status === 'APPROVED' ? 2 : 3; return { key: label, label, state: i < current ? 'done' : i === current ? 'current' : 'todo' }; })} />
          {e.status === 'REJECTED' && <p className="text-sm text-destructive">ไม่อนุมัติ · ติดต่อผู้อนุมัติเพื่อตรวจสอบ</p>}
          {e.receiptFilename && <button type="button" onClick={() => downloadReceipt(e.id, e.receiptFilename!)} className="text-sm text-primary underline">{d.expenses.viewReceipt}</button>}
          {tab === 'APPROVE' && <details><summary className="cursor-pointer text-sm">รายการในใบเบิก</summary><ul className="mt-2 space-y-1 text-sm">{groups.APPROVE.filter(item => item.claimId === e.claimId).map(item => <li key={item.id}>{item.description} · {formatCurrency(item.amount)}</li>)}</ul><a href="/admin/reimbursements" className="mt-2 inline-block text-sm text-primary underline">ตรวจใบเสร็จและรายละเอียด</a></details>}
          {tab === 'APPROVE' && e.claimId && <div className="flex gap-2"><Button disabled={!!busyClaim} onClick={() => decideClaim(e.claimId!, 'APPROVED')}>อนุมัติทั้งใบเบิก</Button><Button variant="outline" disabled={!!busyClaim} onClick={() => decideClaim(e.claimId!, 'REJECTED')}>ไม่อนุมัติ</Button></div>}
        </article>)}
      </div>
      {selectedDraftIds.length > 0 && <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-lg"><span>เลือกแล้ว {selectedDraftIds.length} รายการ · {formatCurrency(selectedTotal)}</span><Button onClick={openClaimSheet}>ส่งเบิก →</Button></div>}

    </div>
  );
}
