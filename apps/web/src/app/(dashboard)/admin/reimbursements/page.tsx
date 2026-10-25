'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Paperclip } from 'lucide-react';
import type { ExpenseClaimStatus } from '@lawfirm/shared';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { api, ApiError, ExpenseClaimSummary, CashAdvanceItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/form-fields';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { cn, formatCurrency, formatDate } from '@/lib/utils';

const FILTERS = ['', 'PENDING', 'APPROVED', 'PAID', 'REJECTED'] as const;

type TeamMember = {
  id: string;
  firstName: string;
  lastName: string;
};

export default function ReimbursementsPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [claims, setClaims] = useState<ExpenseClaimSummary[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [advances, setAdvances] = useState<CashAdvanceItem[]>([]);
  const [advanceForm, setAdvanceForm] = useState({ userId: '', amount: '', note: '' });
  const [issuingAdvance, setIssuingAdvance] = useState(false);
  const [advanceError, setAdvanceError] = useState('');
  const [filter, setFilter] = useState(() => {
    if (typeof window === 'undefined') return '';
    const status = new URLSearchParams(window.location.search).get('status') ?? '';
    return (FILTERS as readonly string[]).includes(status) ? status : '';
  });
  const [requesterFilter, setRequesterFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const statusLabels: Record<string, string> = {
    PENDING: d.expenses.statusPending,
    APPROVED: d.expenses.statusApproved,
    PAID: d.expenses.statusPaid,
    REJECTED: d.expenses.statusRejected,
  };

  const load = () => {
    const authToken = token ?? getStoredToken();
    if (!authToken) {
      setLoading(false);
      return;
    }
    setError('');
    Promise.all([
      api.getExpenseClaims(authToken, {
        ...(filter ? { status: filter } : {}),
        ...(requesterFilter ? { userId: requesterFilter } : {}),
      }),
      api.getTeamMembers(authToken).catch(() => [] as TeamMember[]),
      api.listCashAdvances(authToken).catch(() => [] as CashAdvanceItem[]),
    ])
      .then(([rows, team, advanceRows]) => {
        setClaims(rows);
        setMembers(team);
        setAdvances(advanceRows);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : d.reimbursements.loadFailed);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [token, filter, requesterFilter]);

  const updateClaim = async (id: string, status: ExpenseClaimStatus) => {
    const authToken = token ?? getStoredToken();
    if (!authToken) return;
    setActionError('');
    try {
      await api.updateExpenseClaimStatus(authToken, id, status);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : d.reimbursements.loadFailed);
      return;
    }
    setLoading(true);
    load();
  };

  const rejectClaim = (claim: ExpenseClaimSummary) => {
    const name = `${claim.submittedBy.firstName} ${claim.submittedBy.lastName}`.trim();
    if (!window.confirm(`${d.reimbursements.reject}: ${name} ${formatCurrency(claim.totalAmount)}?`)) return;
    void updateClaim(claim.id, 'REJECTED' as ExpenseClaimStatus);
  };

  const issueAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    const authToken = token ?? getStoredToken();
    if (!authToken || !advanceForm.userId || !advanceForm.amount) return;
    setIssuingAdvance(true);
    setAdvanceError('');
    try {
      await api.issueCashAdvance(
        authToken,
        advanceForm.userId,
        parseFloat(advanceForm.amount),
        advanceForm.note || undefined,
      );
      setAdvanceForm({ userId: '', amount: '', note: '' });
      load();
    } catch (err) {
      setAdvanceError(err instanceof ApiError ? err.message : d.reimbursements.loadFailed);
    } finally {
      setIssuingAdvance(false);
    }
  };

  const downloadReceipt = async (expenseId: string, filename: string) => {
    const authToken = token ?? getStoredToken();
    if (!authToken) return;
    const blob = await api.downloadExpenseReceipt(authToken, expenseId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hasFirmCapability(user?.firmRole, 'approveExpenses')) {
    return <p className="text-destructive">{d.admin.accessDenied}</p>;
  }

  const pendingTotal = claims
    .filter((c) => c.status === 'PENDING' || c.status === 'APPROVED')
    .reduce((sum, c) => sum + c.totalAmount, 0);

  const ActionButtons = ({ claim }: { claim: ExpenseClaimSummary }) => (
    <div className="flex flex-wrap gap-1.5">
      {claim.status === 'PENDING' && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateClaim(claim.id, 'APPROVED' as ExpenseClaimStatus)}
          >
            {d.reimbursements.approveRound}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => rejectClaim(claim)}
          >
            {d.reimbursements.reject}
          </Button>
        </>
      )}
      {claim.status === 'APPROVED' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => updateClaim(claim.id, 'PAID' as ExpenseClaimStatus)}
        >
          {d.reimbursements.markPaid}
        </Button>
      )}
      {claim.status === 'PAID' && claim.paidAt && (
        <span className="text-xs text-muted-foreground">
          {d.reimbursements.paidOn} {formatDate(claim.paidAt)}
        </span>
      )}
    </div>
  );

  const ClaimDetails = ({ claim }: { claim: ExpenseClaimSummary }) => (
    <div className="space-y-3 border-t border-border bg-muted/30 p-4">
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>
          {d.reimbursements.items}: {claim.itemCount}
        </span>
        <span>
          {d.reimbursements.receipts}: {claim.receiptCount}
        </span>
        <span>
          {d.reimbursements.cases}:{' '}
          {claim.cases.length
            ? claim.cases.map((c) => c.ownRef).join(', ')
            : d.reimbursements.general}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{d.reimbursements.caseField}</TableHead>
            <TableHead>รายการ</TableHead>
            <TableHead className="text-right">{d.reimbursements.amount}</TableHead>
            <TableHead>{d.reimbursements.receipt}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claim.expenses.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                {e.case ? (
                  <Link href={`/cases/${e.case.id}`} className="text-primary hover:underline">
                    {e.case.ownRef}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{d.reimbursements.general}</span>
                )}
              </TableCell>
              <TableCell>
                <p>{e.description}</p>
                {e.category && <p className="text-xs text-muted-foreground">{e.category}</p>}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatCurrency(e.amount)}</TableCell>
              <TableCell>
                {e.receiptFilename ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary hover:underline sm:min-h-0"
                    onClick={() => downloadReceipt(e.id, e.receiptFilename!)}
                  >
                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                    {e.receiptFilename}
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={d.reimbursements.title}
        description={
          user
            ? fmt(d.reimbursements.descriptionWithFirm, {
                firm: user.firmName ?? '',
                amount: pendingTotal.toLocaleString('th-TH', { maximumFractionDigits: 2 }),
              })
            : fmt(d.reimbursements.description, { amount: pendingTotal.toLocaleString('th-TH', { maximumFractionDigits: 2 }) })
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Tabs value={filter} onValueChange={setFilter} className="min-w-0 flex-1">
          <TabsList>
            {FILTERS.map((s) => (
              <TabsTrigger key={s || 'all'} value={s}>
                {s ? statusLabels[s] : d.reimbursements.all}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <SelectField
          label={d.reimbursements.filterRequester}
          containerClassName="w-full sm:w-56"
          value={requesterFilter}
          onChange={(e) => setRequesterFilter(e.target.value)}
        >
          <option value="">{d.reimbursements.allRequesters}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.firstName} {m.lastName}
            </option>
          ))}
        </SelectField>
      </div>
      {actionError && <p role="alert" className="mb-3 text-sm text-destructive">{actionError}</p>}

      {loading ? (
        <PageLoading title={d.common.loading} lines={4} />
      ) : error ? (
        <LoadFailed message={error} onRetry={() => { setLoading(true); load(); }} />
      ) : claims.length === 0 ? (
        <EmptyState
          title={d.reimbursements.empty}
          description={d.reimbursements.emptyHint}
        />
      ) : (
        <div className="space-y-3">
          {claims.map((claim) => {
            const open = expandedId === claim.id;
            const name = `${claim.submittedBy.firstName} ${claim.submittedBy.lastName}`.trim();
            return (
              <Card key={claim.id}>
                <CardContent className="p-0">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded={open}
                      onClick={() => setExpandedId(open ? null : claim.id)}
                    >
                      {open ? (
                        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{name}</p>
                          <ExpenseStatusBadge status={claim.status} />
                        </div>
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {formatDate(claim.submittedAt)} · {claim.itemCount}{' '}
                          {d.reimbursements.items} · {d.reimbursements.receipts}{' '}
                          {claim.receiptCount}
                          {claim.cases.length > 0
                            ? ` · ${claim.cases.map((c) => c.ownRef).join(', ')}`
                            : ` · ${d.reimbursements.general}`}
                        </p>
                      </div>
                    </button>
                    <div className="flex flex-col items-stretch gap-2 sm:items-end">
                      <p className="text-lg font-semibold tabular-nums">{formatCurrency(claim.totalAmount)}</p>
                      <ActionButtons claim={claim} />
                    </div>
                  </div>
                  {open && <ClaimDetails claim={claim} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{d.reimbursements.advancesTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={issueAdvance} className="grid gap-3 sm:grid-cols-[1fr_10rem_1fr_auto] sm:items-end">
            <SelectField
              label={d.reimbursements.advancesSelectMember}
              required
              value={advanceForm.userId}
              onChange={(e) => setAdvanceForm({ ...advanceForm, userId: e.target.value })}
            >
              <option value="">{d.reimbursements.advancesSelectMember}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}
                </option>
              ))}
            </SelectField>
            <div className="space-y-1.5">
              <label htmlFor="advance-amount" className="block text-sm font-medium">{d.reimbursements.amount}<span aria-hidden="true" className="ml-1 text-destructive">*</span></label>
              <MoneyInput
                id="advance-amount"
                required
                min={0}
                value={advanceForm.amount}
                onValueChange={(next) => setAdvanceForm({ ...advanceForm, amount: next })}
                className="h-10 text-right tabular-nums"
              />
            </div>
            <TextField
              label={d.reimbursements.advancesNote}
              value={advanceForm.note}
              onChange={(e) => setAdvanceForm({ ...advanceForm, note: e.target.value })}
            />
            <Button type="submit" size="sm" variant="outline" disabled={issuingAdvance}>
              {d.reimbursements.advancesIssue}
            </Button>
          </form>
          {advanceError && <p role="alert" className="text-sm text-destructive">{advanceError}</p>}

          {advances.length === 0 ? (
            <InlineEmptyState title={d.reimbursements.advancesEmpty} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.reimbursements.advancesSelectMember}</TableHead>
                  <TableHead className="text-right">{d.reimbursements.advancesIssued}</TableHead>
                  <TableHead className="text-right">{d.reimbursements.advancesRemaining}</TableHead>
                  <TableHead>{d.reimbursements.advancesNote}</TableHead>
                  <TableHead>{d.reimbursements.advancesIssuedOn}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.user ? `${a.user.firstName} ${a.user.lastName}` : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(a.amount)}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', a.remaining === 0 && 'text-muted-foreground')}>
                      {formatCurrency(a.remaining)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.note ?? '—'}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatDate(a.issuedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
