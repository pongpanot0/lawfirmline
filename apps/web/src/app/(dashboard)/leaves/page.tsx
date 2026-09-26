'use client';

import { useCallback, useEffect, useState } from 'react';
import { FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, LeaveItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const rangeText = (leave: LeaveItem) =>
  leave.startDate === leave.endDate
    ? formatDate(leave.startDate)
    : `${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`;

function StatusBadge({ status, d }: { status: LeaveItem['status']; d: ReturnType<typeof useDashboardT> }) {
  if (status === 'APPROVED') return <Badge variant="success">{d.leaves.statusApproved}</Badge>;
  if (status === 'REJECTED') return <Badge variant="destructive">{d.leaves.statusRejected}</Badge>;
  return <Badge variant="warning">{d.leaves.statusPending}</Badge>;
}

export default function LeavesPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const isOwner = user?.firmRole === FirmRole.OWNER;
  const typeLabel: Record<LeaveItem['type'], string> = {
    SICK: d.leaves.typeSick,
    PERSONAL: d.leaves.typePersonal,
    VACATION: d.leaves.typeVacation,
  };

  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState<{ type: 'SICK' | 'PERSONAL' | 'VACATION'; startDate: string; endDate: string }>({
    type: 'SICK',
    startDate: '',
    endDate: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    try {
      const today = new Date();
      const from = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));
      const to = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 180));
      setLeaves(await api.getLeaves(token, from, to));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : d.leaves.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [token, d.leaves.loadFailed]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await api.createLeave(token, form);
      setForm({ type: 'SICK', startDate: '', endDate: '' });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : d.leaves.submitFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelLeave = async (id: string) => {
    if (!token) return;
    setBusyId(id);
    setActionError('');
    try {
      await api.cancelLeave(token, id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : d.leaves.cancelFailed);
    } finally {
      setBusyId('');
    }
  };

  const decide = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    if (!token) return;
    setBusyId(id);
    setActionError('');
    try {
      await api.decideLeave(token, id, decision);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : d.leaves.decisionFailed);
    } finally {
      setBusyId('');
    }
  };

  if (loading) return <PageLoading title={d.leaves.title} description={d.leaves.description} />;

  const today = dateKey(new Date());
  const myLeaves = user ? leaves.filter((leave) => leave.userId === user.id) : [];
  const pending = isOwner ? leaves.filter((leave) => leave.status === 'PENDING') : [];

  return (
    <div className="w-full space-y-6">
      <PageHeader title={d.leaves.title} description={d.leaves.description} />

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{d.leaves.formTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium">{d.leaves.type}</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="SICK">{d.leaves.typeSick}</option>
                <option value="PERSONAL">{d.leaves.typePersonal}</option>
                <option value="VACATION">{d.leaves.typeVacation}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{d.leaves.startDate}</label>
              <ThaiDateInput
                value={form.startDate}
                onChange={(value) => setForm({ ...form, startDate: value, endDate: form.endDate && form.endDate >= value ? form.endDate : value })}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{d.leaves.endDate}</label>
              <ThaiDateInput
                value={form.endDate}
                onChange={(value) => setForm({ ...form, endDate: value })}
                required
                className="mt-1"
              />
            </div>
            {submitError && <p className="text-sm text-destructive md:col-span-3">{submitError}</p>}
            <div className="md:col-span-3">
              <Button type="submit" disabled={submitting || !form.startDate || !form.endDate}>
                {submitting ? d.leaves.submitting : d.leaves.submit}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>{d.leaves.pendingQueue}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            {pending.length === 0 ? (
              <InlineEmptyState title={d.leaves.noPending} />
            ) : (
              pending.map((leave) => (
                <div key={leave.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{leave.user.firstName} {leave.user.lastName}</p>
                      <p className="text-sm text-muted-foreground">
                        {typeLabel[leave.type]} · {rangeText(leave)}
                      </p>
                    </div>
                    <StatusBadge status={leave.status} d={d} />
                  </div>
                  {!!leave.courtConflicts?.length && (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                      <p className="font-medium">{d.leaves.conflictWarning}</p>
                      <ul className="mt-1 space-y-1">
                        {leave.courtConflicts.map((c) => (
                          <li key={c.eventId}>
                            {c.caseRef ? `${c.caseRef} · ` : ''}{c.title} · {formatDateTime(c.startAt)}{c.courtName ? ` · ${c.courtName}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" disabled={busyId === leave.id} onClick={() => decide(leave.id, 'APPROVED')}>
                      {d.leaves.approve}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === leave.id} onClick={() => decide(leave.id, 'REJECTED')}>
                      {d.leaves.reject}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{d.leaves.myRequests}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {myLeaves.length === 0 ? (
            <InlineEmptyState title={d.leaves.noRequests} />
          ) : (
            myLeaves.map((leave) => (
              <div key={leave.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
                <div>
                  <p className="font-medium">{typeLabel[leave.type]}</p>
                  <p className="text-sm text-muted-foreground">{rangeText(leave)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={leave.status} d={d} />
                  {leave.status !== 'REJECTED' && (leave.status === 'PENDING' || leave.startDate >= today) && (
                    <Button size="sm" variant="outline" disabled={busyId === leave.id} onClick={() => cancelLeave(leave.id)}>
                      {d.leaves.cancel}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
