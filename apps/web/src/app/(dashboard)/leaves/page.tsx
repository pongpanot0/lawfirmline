'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, LeaveItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThaiDateField } from '@/components/ui/ThaiDateField';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { SubmitSummary } from '@/components/guide/SubmitSummary';
import { AlertTriangle } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/utils';
import { leaveApprovalQueue, leaveDecisionText } from '@/lib/leave-flags';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { WhoActsTabs } from '@/components/process/WhoActsTabs';
import { StepTracker } from '@/components/process/StepTracker';
import { confirmDialog } from '@/lib/confirm-dialog';
import { TeamLeaveCalendar } from '@/components/leaves/TeamLeaveCalendar';

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
  const canApproveLeave = hasFirmCapability(user?.firmRole, 'approveLeave');
  const typeLabel: Record<LeaveItem['type'], string> = {
    SICK: d.leaves.typeSick,
    PERSONAL: d.leaves.typePersonal,
    VACATION: d.leaves.typeVacation,
  };

  const [leaves, setLeaves] = useState<(LeaveItem & { createdAt?: string })[]>([]);
  const [tab, setTab] = useState('MY');
  useEffect(() => { const requested = new URLSearchParams(window.location.search).get('tab'); if (requested && ['MY', 'DONE', ...(canApproveLeave ? ['APPROVE'] : [])].includes(requested)) setTab(requested); else if (canApproveLeave) setTab('APPROVE'); }, [canApproveLeave]);
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
      setLeaves(await api.getLeaves(token, from, to) as (LeaveItem & { createdAt?: string })[]);
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

  const cancelLeave = async (id: string, what: string) => {
    if (!token) return;
    if (!await confirmDialog(`ยกเลิกคำขอ${what}?`)) return;
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

  // Approvers start on "รอฉันอนุมัติ"; with nothing waiting, open the tab that has the person's own leave.
  const autoTab = useRef(false);
  useEffect(() => {
    if (loading || autoTab.current || !user) return;
    autoTab.current = true;
    if (new URLSearchParams(window.location.search).get('tab') || tab !== 'APPROVE') return;
    if (leaveApprovalQueue(leaves, user).length) return;
    const mine = leaves.filter((leave) => leave.userId === user.id);
    if (mine.some((leave) => leave.status === 'PENDING')) setTab('MY'); else if (mine.length) setTab('DONE');
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PageLoading title={d.leaves.title} description={d.leaves.description} />;

  const today = dateKey(new Date());
  const myLeaves = user ? leaves.filter((leave) => leave.userId === user.id) : [];
  const pending = canApproveLeave && user ? leaveApprovalQueue(leaves, user) : [];
  const activeLeaves = myLeaves.filter(leave => leave.status === 'PENDING');
  // Approvers also see everyone's decided leave here, so they can check who approved or rejected it.
  const completedLeaves = (canApproveLeave ? leaves : myLeaves).filter(leave => leave.status !== 'PENDING');

  return (
    <div className="w-full space-y-6">
      <PageHeader title={d.leaves.title} description={d.leaves.description} />

      <TeamLeaveCalendar token={token} reloadKey={reloadKey} />

      <details open><summary className="disclosure cursor-pointer py-3 font-medium">ยื่นคำขอลา</summary><form onSubmit={handleSubmit} className="space-y-4 [&>aside]:static [&>aside]:rounded-lg [&>aside]:border [&>aside]:shadow-none">
        <Card>
          <CardHeader><CardTitle>1. {d.leaves.formTitle}</CardTitle></CardHeader>
          <CardContent>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{d.leaves.type}</legend>
              <div className="flex flex-wrap gap-2">
                {(['SICK', 'PERSONAL', 'VACATION'] as const).map((type) => (
                  <label key={type} className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-4 text-sm focus-within:ring-2 focus-within:ring-ring ${form.type === type ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>
                    <input type="radio" name="leave-type" value={type} checked={form.type === type} onChange={() => setForm({ ...form, type })} className="sr-only" />
                    {typeLabel[type]}
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>2. วันที่ลา</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="leave-start" className="block text-sm font-medium">{d.leaves.startDate}<span aria-hidden="true" className="ml-1 text-destructive">*</span></label>
              <ThaiDateField id="leave-start" value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value, endDate: form.endDate && form.endDate >= value ? form.endDate : value })} required />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="leave-end" className="block text-sm font-medium">{d.leaves.endDate}<span aria-hidden="true" className="ml-1 text-destructive">*</span></label>
              <ThaiDateField id="leave-end" value={form.endDate} onChange={(value) => setForm({ ...form, endDate: value })} required />
            </div>
          </CardContent>
        </Card>
        {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
        <SubmitSummary items={[
          { label: d.leaves.startDate, done: !!form.startDate },
          { label: d.leaves.endDate, done: !!form.endDate },
        ]} loading={submitting} label={d.leaves.submit} loadingLabel={d.leaves.submitting} />
      </form></details>

      <WhoActsTabs value={tab} onChange={setTab} tabs={[
        ...(canApproveLeave ? [{ key: 'APPROVE', label: 'รอฉันอนุมัติ', count: pending.length }] : []),
        { key: 'MY', label: 'ใบลาของฉัน', count: activeLeaves.length },
        { key: 'DONE', label: 'เสร็จแล้ว', count: completedLeaves.length },
      ]} />
      {canApproveLeave && tab === 'APPROVE' && (
        <Card>
          <CardHeader>
            <CardTitle>{d.leaves.pendingQueue}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
            {loadError ? (
              <LoadFailed message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
            ) : pending.length === 0 ? (
              <InlineEmptyState title="ไม่มีรายการที่ต้องทำ" />
            ) : (
              pending.map((leave) => (
                <div key={leave.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{leave.user.firstName} {leave.user.lastName}</p>
                      <p className="text-sm text-muted-foreground">
                        {typeLabel[leave.type]} · {Math.floor((Date.parse(leave.endDate.slice(0, 10)) - Date.parse(leave.startDate.slice(0, 10))) / 86400000) + 1} วัน · {rangeText(leave)}{leave.createdAt ? ` · ยื่น ${formatDate(leave.createdAt)}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={leave.status} d={d} />
                  </div>
                  <div className="mt-3"><StepTracker variant="mini" steps={['ยื่นแล้ว', 'รออนุมัติ', 'อนุมัติแล้ว/ไม่อนุมัติ'].map((label, i) => ({ key: label, label, state: i < 1 ? 'done' : i === 1 ? 'current' : 'todo' }))} /></div>
                  {!!leave.courtConflicts?.length && (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                      <p className="flex items-start gap-1.5 font-medium"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{d.leaves.conflictWarning}</p>
                      <ul className="mt-1 space-y-1">
                        {leave.courtConflicts.map((c) => (
                          <li key={c.eventId}>
                            {c.caseRef ? `${c.caseRef} · ` : ''}{c.title} · {formatDateTime(c.startAt)}{c.courtName ? ` · ${c.courtName}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" disabled={busyId === leave.id} onClick={() => decide(leave.id, 'APPROVED')}>
                      {d.leaves.approve}
                    </Button>
                    <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busyId === leave.id} onClick={() => decide(leave.id, 'REJECTED')}>
                      {d.leaves.reject}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {tab !== 'APPROVE' && <Card>
        <CardHeader>
          <CardTitle>{tab === 'DONE' && canApproveLeave ? 'ใบลาที่พิจารณาแล้ว' : d.leaves.myRequests}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canApproveLeave && actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          {loadError ? (
            <LoadFailed message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
          ) : (tab === 'MY' ? activeLeaves : completedLeaves).length === 0 ? (
            <InlineEmptyState title="ไม่มีรายการที่ต้องทำ" />
          ) : (
            (tab === 'MY' ? activeLeaves : completedLeaves).map((leave) => (
              <div key={leave.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
                <div>
                  <p className="font-medium">{leave.user.firstName} {leave.user.lastName} · {typeLabel[leave.type]} · {Math.floor((Date.parse(leave.endDate.slice(0, 10)) - Date.parse(leave.startDate.slice(0, 10))) / 86400000) + 1} วัน</p>
                  <p className="text-sm text-muted-foreground">{rangeText(leave)}{leave.createdAt ? ` · ยื่น ${formatDate(leave.createdAt)}` : ''}</p>{leaveDecisionText(leave) && <p className="text-sm font-medium">{leaveDecisionText(leave)}</p>}<div className="mt-2 min-w-48"><StepTracker variant="mini" steps={['ยื่นแล้ว', 'รออนุมัติ', leave.status === 'REJECTED' ? 'ไม่อนุมัติ' : 'อนุมัติแล้ว'].map((label, i) => { const current = leave.status === 'PENDING' ? 1 : 2; return { key: label, label, state: i < current ? 'done' : i === current ? 'current' : 'todo' }; })} /></div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={leave.status} d={d} />
                  {leave.status !== 'REJECTED' && (leave.status === 'PENDING' || leave.startDate >= today) && (
                    <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busyId === leave.id} onClick={() => cancelLeave(leave.id, `${typeLabel[leave.type]} ${rangeText(leave)}`)}>
                      {d.leaves.cancel}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>}
    </div>
  );
}
