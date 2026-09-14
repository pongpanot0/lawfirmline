'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Paperclip } from 'lucide-react';
import type { ExpenseClaimStatus } from '@lawfirm/shared';
import { FirmRole } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { api, ApiError, ExpenseClaimSummary, CashAdvanceItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExpenseStatusBadge } from '@/components/ExpenseStatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, PageLoading } from '@/components/ui/misc';
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
    await api.updateExpenseClaimStatus(authToken, id, status);
    setLoading(true);
    load();
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

  if (user?.firmRole !== FirmRole.OWNER) {
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
            className="h-7 text-xs"
            onClick={() => updateClaim(claim.id, 'APPROVED' as ExpenseClaimStatus)}
          >
            {d.reimbursements.approveRound}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive"
            onClick={() => updateClaim(claim.id, 'REJECTED' as ExpenseClaimStatus)}
          >
            {d.reimbursements.reject}
          </Button>
        </>
      )}
      {claim.status === 'APPROVED' && (
        <Button
          size="sm"
          className="h-7 text-xs"
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
            <TableHead>{d.reimbursements.amount}</TableHead>
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
              <TableCell className="font-medium">{formatCurrency(e.amount)}</TableCell>
              <TableCell>
                {e.receiptFilename ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                    onClick={() => downloadReceipt(e.id, e.receiptFilename!)}
                  >
                    <Paperclip className="h-3 w-3" />
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
                amount: pendingTotal.toLocaleString(),
              })
            : fmt(d.reimbursements.description, { amount: pendingTotal.toLocaleString() })
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{d.reimbursements.advancesTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={issueAdvance} className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
            <select
              required
              value={advanceForm.userId}
              onChange={(e) => setAdvanceForm({ ...advanceForm, userId: e.target.value })}
              className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
            >
              <option value="">{d.reimbursements.advancesSelectMember}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}
                </option>
              ))}
            </select>
            <Input
              required
              type="number"
              min={0}
              step="0.01"
              placeholder={d.reimbursements.amount}
              value={advanceForm.amount}
              onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
              className="w-32"
            />
            <Input
              placeholder={d.reimbursements.advancesNote}
              value={advanceForm.note}
              onChange={(e) => setAdvanceForm({ ...advanceForm, note: e.target.value })}
            />
            <Button type="submit" size="sm" disabled={issuingAdvance}>
              {d.reimbursements.advancesIssue}
            </Button>
          </form>
          {advanceError && <p className="text-sm text-destructive">{advanceError}</p>}

          {advances.length === 0 ? (
            <p className="text-sm text-muted-foreground">{d.reimbursements.advancesEmpty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.reimbursements.advancesSelectMember}</TableHead>
                  <TableHead>{d.reimbursements.advancesIssued}</TableHead>
                  <TableHead>{d.reimbursements.advancesRemaining}</TableHead>
                  <TableHead>{d.reimbursements.advancesNote}</TableHead>
                  <TableHead>{d.reimbursements.advancesIssuedOn}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.user ? `${a.user.firstName} ${a.user.lastName}` : '—'}</TableCell>
                    <TableCell>{formatCurrency(a.amount)}</TableCell>
                    <TableCell className={cn(a.remaining === 0 && 'text-muted-foreground')}>
                      {formatCurrency(a.remaining)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.note ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(a.issuedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {FILTERS.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors',
              filter === s
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {s ? statusLabels[s] : d.reimbursements.all}
          </button>
        ))}
        <label className="ml-auto flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <span>{d.reimbursements.filterRequester}</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={requesterFilter}
            onChange={(e) => setRequesterFilter(e.target.value)}
          >
            <option value="">{d.reimbursements.allRequesters}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <PageLoading title={d.common.loading} lines={4} />
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-destructive">{error}</p>
        </div>
      ) : claims.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              title={d.reimbursements.empty}
              description={d.reimbursements.emptyHint}
            />
          </CardContent>
        </Card>
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
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                      onClick={() => setExpandedId(open ? null : claim.id)}
                    >
                      {open ? (
                        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{name}</p>
                          <ExpenseStatusBadge status={claim.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
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
                      <p className="text-lg font-semibold">{formatCurrency(claim.totalAmount)}</p>
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
    </div>
  );
}
