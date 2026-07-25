'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Gavel,
  FileText,
  Upload,
  CalendarDays,
  Plus,
  StickyNote,
  CheckSquare,
  X,
  Lock,
  LockOpen,
} from 'lucide-react';
import { ActivityType, CaseStatus, COURT_LEVEL_LABELS } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseDetail, TaskItem, CaseActivityItem, ApiError } from '@/lib/api';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { Skeleton } from '@/components/ui/misc';

const ACTIVITY_LABELS: Record<string, string> = {
  COURT_DATE: 'Court Date / นัดศาล',
  CLIENT_MEETING: 'Client Meeting / นัดลูกค้า',
  FILING: 'Filing / ยื่นคำร้อง',
  DEADLINE: 'Deadline / กำหนดส่ง',
  NOTE: 'Note / บันทึก',
  OTHER: 'Other / อื่นๆ',
};

const ACTIVITY_ICONS: Record<string, typeof Gavel> = {
  COURT_DATE: CalendarDays,
  CLIENT_MEETING: CalendarDays,
  FILING: FileText,
  DEADLINE: CalendarDays,
  NOTE: StickyNote,
  OTHER: FileText,
};

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [legalCase, setCase] = useState<CaseDetail | null>(null);
  const [activities, setActivities] = useState<CaseActivityItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [note, setNote] = useState('');
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingFee, setEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState('');
  const [savingFee, setSavingFee] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closingSummary, setClosingSummary] = useState('');
  const [closingCase, setClosingCase] = useState(false);
  const [reopeningCase, setReopeningCase] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [activityForm, setActivityForm] = useState({
    title: '',
    description: '',
    activityAt: '',
    type: ActivityType.OTHER as string,
  });

  const loadCase = () => {
    if (!token || !id) return;
    Promise.all([
      api.getCase(token, id),
      api.getCaseActivities(token, id).catch(() => []),
      api.getTasks(token, id).catch(() => []),
      api.getExpenseSummary(token, id).catch(() => ({ totalSpent: 0 })),
    ])
      .then(([c, acts, t, summary]) => {
        setCase(c);
        setActivities(acts);
        setTasks(t);
        setTotalSpent(summary.totalSpent);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCase();
  }, [token, id]);

  const timeline = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      date: string;
      type: string;
      isOpened?: boolean;
    }> = [
      {
        id: 'opened',
        label: 'Case Opened / เปิดคดี',
        date: legalCase?.openedAt ?? '',
        type: 'case',
        isOpened: true,
      },
      ...activities.map((a) => ({
        id: a.id,
        label: a.title,
        date: a.activityAt,
        type: a.type,
      })),
      ...(legalCase?.status === CaseStatus.CLOSED && legalCase.closedAt
        ? [{
            id: 'closed',
            label: 'ปิดคดี / Case Closed',
            date: legalCase.closedAt,
            type: 'closed',
            isOpened: false as const,
          }]
        : []),
    ];
    return items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [legalCase?.openedAt, activities]);

  const openActivityForm = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setActivityForm({
      title: '',
      description: '',
      activityAt: now.toISOString().slice(0, 16),
      type: ActivityType.OTHER,
    });
    setShowActivityForm(true);
  };

  const handleCloseCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) return;
    if (closingSummary.trim().length < 10) {
      setCloseError('กรุณาเขียนสรุปคดีอย่างน้อย 10 ตัวอักษร');
      return;
    }
    setClosingCase(true);
    setCloseError('');
    try {
      await api.closeCase(token, id, closingSummary.trim());
      setShowCloseForm(false);
      setClosingSummary('');
      loadCase();
    } catch (err) {
      setCloseError(err instanceof ApiError ? err.message : 'ปิดคดีไม่สำเร็จ');
    } finally {
      setClosingCase(false);
    }
  };

  const handleReopenCase = async () => {
    if (!token || !id) return;
    if (!confirm('เปิดคดีนี้อีกครั้ง?')) return;
    setReopeningCase(true);
    try {
      await api.reopenCase(token, id);
      loadCase();
    } catch (err) {
      console.error(err);
    } finally {
      setReopeningCase(false);
    }
  };

  const handleSaveEstimatedFee = async () => {
    if (!token || !id) return;
    setSavingFee(true);
    try {
      const value = feeInput.trim() === '' ? null : parseFloat(feeInput);
      const estimatedFee = value != null && !Number.isNaN(value) ? value : null;
      await api.updateCase(token, id, { estimatedFee });
      setCase((prev) => (prev ? { ...prev, estimatedFee } : prev));
      setEditingFee(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingFee(false);
    }
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) return;
    setSubmitting(true);
    try {
      const created = await api.createCaseActivity(token, id, {
        title: activityForm.title,
        description: activityForm.description || undefined,
        activityAt: new Date(activityForm.activityAt).toISOString(),
        type: activityForm.type,
      });
      setActivities((prev) => [created, ...prev]);
      setShowActivityForm(false);
      api.getCase(token, id).then(setCase).catch(console.error);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!legalCase) return <p className="text-destructive">Case not found</p>;

  const customFields = legalCase.customFields as Record<string, string> | null;
  const clientDisplay = legalCase.client?.name ?? legalCase.clientName ?? '—';
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks', href: `/cases/${id}/tasks` },
    { id: 'calendar', label: 'Calendar', href: `/cases/${id}/calendar` },
    { id: 'documents', label: 'Documents', href: `/cases/${id}/documents` },
    { id: 'billing', label: 'Billing', href: `/cases/${id}/billing` },
  ];

  return (
    <div>
      <div className="mb-6">
        <button type="button" onClick={() => router.push('/cases')} className="text-sm text-primary hover:underline">
          ← Back to Cases
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{legalCase.title}</h1>
          <CaseStatusBadge status={legalCase.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{legalCase.ownRef} · {legalCase.folderId}</p>
        {legalCase.status !== CaseStatus.CLOSED ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setCloseError('');
              setShowCloseForm(true);
            }}
          >
            <Lock className="h-4 w-4" />
            ปิดคดี
          </Button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              ปิดเมื่อ {legalCase.closedAt ? formatDate(legalCase.closedAt) : '—'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReopenCase}
              disabled={reopeningCase}
            >
              <LockOpen className="h-4 w-4" />
              {reopeningCase ? 'กำลังเปิด...' : 'เปิดคดีอีกครั้ง'}
            </Button>
          </div>
        )}
      </div>

      {showCloseForm && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">ปิดคดี / Close Case</CardTitle>
            <button type="button" onClick={() => setShowCloseForm(false)}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCloseCase} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                กรุณาสรุปผลคดี ข้อตกลง หรือบันทึกสำคัญก่อนปิดคดี
              </p>
              <textarea
                required
                rows={5}
                value={closingSummary}
                onChange={(e) => setClosingSummary(e.target.value)}
                placeholder="เช่น ศาลพิพากษาให้จำเลยชำระหนี้ 500,000 บาท พร้อมดอกเบี้ย ลูกค้าได้รับชำระครบแล้ว..."
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none"
              />
              {closeError && <p className="text-sm text-destructive">{closeError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={closingCase}>
                  {closingCase ? 'กำลังปิดคดี...' : 'ยืนยันปิดคดี'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCloseForm(false)}>
                  ยกเลิก
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {legalCase.status === CaseStatus.CLOSED && legalCase.closingSummary && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-sm">สรุปคดี / Case Summary</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{legalCase.closingSummary}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          t.href ? (
            <Link
              key={t.id}
              href={t.href}
              className="whitespace-nowrap px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t.label}
            </Link>
          ) : (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
            >
              {t.label}
            </button>
          )
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Case Overview</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Own Ref</p>
                <p className="font-medium">{legalCase.ownRef}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer Ref</p>
                <p className="font-medium">{legalCase.customerRef ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Case Type</p>
                <p className="font-medium">{legalCase.caseType?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">เลขดำ</p>
                <p className="font-medium">{legalCase.blackCaseNumber ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">เลขแดง</p>
                <p className="font-medium">{legalCase.redCaseNumber ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ระดับศาล</p>
                <p className="font-medium">
                  {legalCase.courtLevel ? COURT_LEVEL_LABELS[legalCase.courtLevel] : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Court / ศาล</p>
                <p className="font-medium">{legalCase.courtName ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Client / ลูกค้า</p>
                <p className="font-medium">{clientDisplay}</p>
                {legalCase.client?.contacts && legalCase.client.contacts.length > 0 && (
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {legalCase.client.contacts.slice(0, 2).map((c, i) => (
                      <p key={i}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</p>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Assigned Lawyer</p>
                <p className="font-medium">{legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">รายได้โดยประมาณ / Estimated Fee</p>
                {editingFee ? (
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="เช่น 50000"
                      value={feeInput}
                      onChange={(e) => setFeeInput(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Button size="sm" onClick={handleSaveEstimatedFee} disabled={savingFee}>
                      {savingFee ? '...' : 'บันทึก'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingFee(false)}
                    >
                      ยกเลิก
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-green-600">
                      {legalCase.estimatedFee != null
                        ? formatCurrency(legalCase.estimatedFee)
                        : '—'}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setFeeInput(
                          legalCase.estimatedFee != null
                            ? String(legalCase.estimatedFee)
                            : '',
                        );
                        setEditingFee(true);
                      }}
                    >
                      แก้ไข
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approved Expenses</p>
                <p className="font-medium text-primary">{formatCurrency(totalSpent)}</p>
              </div>
              {customFields && Object.entries(customFields).map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="font-medium">{v}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Case Timeline / ไทม์ไลน์คดี</CardTitle>
              <Button variant="outline" size="sm" onClick={openActivityForm}>
                <Plus className="h-3 w-3" />Add Activity
              </Button>
            </CardHeader>
            <CardContent>
              {showActivityForm && (
                <form onSubmit={handleAddActivity} className="mb-4 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">New Activity / เพิ่มกิจกรรม</p>
                    <p className="text-xs text-muted-foreground">จะเพิ่มใน Case Timeline และ Calendar อัตโนมัติ</p>
                    <button type="button" onClick={() => setShowActivityForm(false)}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                  <Input
                    required
                    placeholder="Title / หัวข้อ เช่น นัดสืบพยาน"
                    value={activityForm.title}
                    onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Type</label>
                      <select
                        value={activityForm.type}
                        onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                      >
                        {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Date & Time</label>
                      <Input
                        required
                        type="datetime-local"
                        value={activityForm.activityAt}
                        onChange={(e) => setActivityForm({ ...activityForm, activityAt: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <textarea
                    placeholder="Description (optional)"
                    value={activityForm.description}
                    onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none"
                  />
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? 'Saving...' : 'Save Activity'}
                  </Button>
                </form>
              )}

              <div className="space-y-4">
                {timeline.map((item) => {
                  const Icon = item.isOpened ? Gavel : (ACTIVITY_ICONS[item.type] ?? FileText);
                  const isCourt = item.type === 'COURT_DATE' || item.type === 'CLIENT_MEETING';
                  return (
                    <div key={item.id} className="flex gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        item.isOpened ? 'bg-primary/10' : isCourt ? 'bg-orange-100 dark:bg-orange-950' : 'bg-muted'
                      }`}>
                        <Icon className={`h-4 w-4 ${item.isOpened ? 'text-primary' : isCourt ? 'text-orange-600' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.isOpened ? formatDate(item.date) : formatDateTime(item.date)}
                          {!item.isOpened && ` — ${ACTIVITY_LABELS[item.type] ?? item.type}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {timeline.length <= 1 && (
                  <p className="text-sm text-muted-foreground">No activities yet. Add the first appointment or filing.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {legalCase.description && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Description</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{legalCase.description}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Upcoming Tasks</CardTitle>
              <Link href={`/cases/${id}/tasks`} className="text-xs text-primary hover:underline">View all</Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasks.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <CheckSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{t.status}</span>
                </div>
              ))}
              {tasks.length === 0 && (
                <p className="text-sm text-muted-foreground">No tasks assigned</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Calendar</CardTitle></CardHeader>
            <CardContent>
              {(legalCase.calendarEvents ?? []).length > 0 ? (
                (legalCase.calendarEvents ?? []).slice(0, 3).map((e) => (
                  <div key={e.id} className="mb-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(e.startAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming events</p>
              )}
              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => router.push(`/cases/${id}/calendar`)}>
                <CalendarDays className="h-4 w-4" />Open Calendar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Quick Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a quick note..."
                rows={3}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button size="sm" className="mt-2" variant="secondary">
                <StickyNote className="h-4 w-4" />Save Note
              </Button>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/cases/${id}/documents`)}>
              <Upload className="h-4 w-4" />Documents
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/cases/${id}/billing`)}>
              <FileText className="h-4 w-4" />Billing
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
