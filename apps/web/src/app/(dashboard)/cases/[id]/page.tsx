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
  Pencil,
} from 'lucide-react';
import {
  ActivityType,
  CaseStatus,
  CourtLevel,
  COURT_LEVEL_LABELS,
  CASE_NUMBER_HINT,
  FirmRole,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import {
  api,
  CaseDetail,
  TaskItem,
  CaseActivityItem,
  UserItem,
  WorkloadSummary,
  CaseTypeItem,
  CourtItem,
  ApiError,
  IntakePrecedentAnalysisItem,
} from '@/lib/api';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';
import { CaseParticipantsSection } from '@/components/cases/CaseParticipantsSection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { Skeleton } from '@/components/ui/misc';

const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: 'ยังไม่เริ่ม',
  IN_PROGRESS: 'กำลังทำ',
  DONE: 'เสร็จแล้ว',
};

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
  const { token, user } = useAuth();
  const router = useRouter();
  const [legalCase, setCase] = useState<CaseDetail | null>(null);
  const [activities, setActivities] = useState<CaseActivityItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [precedentAnalyses, setPrecedentAnalyses] = useState<IntakePrecedentAnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingOverview, setEditingOverview] = useState(false);
  const [savingOverview, setSavingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [overviewForm, setOverviewForm] = useState({
    title: '',
    customerRef: '',
    caseTypeId: '',
    blackCaseNumber: '',
    redCaseNumber: '',
    courtLevel: '' as string,
    courtName: '',
    estimatedFee: '',
  });
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closingSummary, setClosingSummary] = useState('');
  const [closingCase, setClosingCase] = useState(false);
  const [reopeningCase, setReopeningCase] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [editingTeam, setEditingTeam] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [workload, setWorkload] = useState<WorkloadSummary[]>([]);
  const [teamForm, setTeamForm] = useState({ leadLawyerId: '', buddyIds: [] as string[] });
  const [activityForm, setActivityForm] = useState({
    title: '',
    description: '',
    activityAt: '',
    type: ActivityType.OTHER as string,
  });

  const loadCase = () => {
    if (!token || !id) return;
    // Non-blocking: a failure here must not break the rest of the case page.
    api
      .listCasePrecedentAnalyses(token, id)
      .then(setPrecedentAnalyses)
      .catch(() => setPrecedentAnalyses([]));
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

  const startEditTeam = () => {
    if (!legalCase) return;
    setTeamForm({
      leadLawyerId: legalCase.leadLawyer.id,
      buddyIds: legalCase.assignments.map((a) => a.user.id),
    });
    setTeamError('');
    if (token && lawyers.length === 0) {
      Promise.all([
        api.getLawyers(token),
        api.getWorkloadSummary(token).catch(() => [] as WorkloadSummary[]),
      ]).then(([l, w]) => {
        setLawyers(l);
        setWorkload(w);
      });
    }
    setEditingTeam(true);
  };

  const workloadLabel = (userId: string) => {
    const w = workload.find((x) => x.userId === userId);
    if (!w) return '';
    return ` (Lead ${w.leadCount}, Buddy ${w.buddyCount}, ใกล้ deadline ${w.nearDeadlineCount})`;
  };

  const handleSaveTeam = async () => {
    if (!token || !id || !teamForm.leadLawyerId) return;
    setSavingTeam(true);
    setTeamError('');
    try {
      await api.updateCase(token, id, { leadLawyerId: teamForm.leadLawyerId });
      const buddyIds = teamForm.buddyIds.filter((uid) => uid !== teamForm.leadLawyerId);
      const updated = await api.updateCaseAssignments(token, id, buddyIds);
      // Merge, don't replace: the assignments response omits tasks/calendarEvents/activities.
      setCase((prev) =>
        prev ? { ...prev, leadLawyer: updated.leadLawyer, assignments: updated.assignments } : prev,
      );
      setEditingTeam(false);
    } catch (err) {
      setTeamError(err instanceof ApiError ? err.message : 'บันทึกทีมไม่สำเร็จ');
    } finally {
      setSavingTeam(false);
    }
  };

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

  const startEditOverview = async () => {
    if (!legalCase) return;
    setOverviewForm({
      title: legalCase.title,
      customerRef: legalCase.customerRef ?? '',
      caseTypeId: legalCase.caseType?.id ?? '',
      blackCaseNumber: legalCase.blackCaseNumber ?? '',
      redCaseNumber: legalCase.redCaseNumber ?? '',
      courtLevel: legalCase.courtLevel ?? '',
      courtName: legalCase.courtName ?? '',
      estimatedFee:
        legalCase.estimatedFee != null ? String(legalCase.estimatedFee) : '',
    });
    setOverviewError('');
    setEditingOverview(true);
    if (token) {
      Promise.all([
        api.getCaseTypes(token).catch(() => [] as CaseTypeItem[]),
        api.getCourts(token).catch(() => [] as CourtItem[]),
      ]).then(([types, courtList]) => {
        setCaseTypes(types);
        setCourts(courtList);
      });
    }
  };

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) return;
    if (!overviewForm.title.trim()) {
      setOverviewError('กรุณากรอกชื่อคดี');
      return;
    }
    setSavingOverview(true);
    setOverviewError('');
    try {
      const feeRaw = overviewForm.estimatedFee.trim();
      const feeValue = feeRaw === '' ? null : parseFloat(feeRaw);
      const estimatedFee =
        feeValue != null && !Number.isNaN(feeValue) ? feeValue : null;
      const updated = await api.updateCase(token, id, {
        title: overviewForm.title.trim(),
        customerRef: overviewForm.customerRef.trim() || null,
        caseTypeId: overviewForm.caseTypeId || undefined,
        blackCaseNumber: overviewForm.blackCaseNumber.trim() || null,
        redCaseNumber: overviewForm.redCaseNumber.trim() || null,
        courtLevel: overviewForm.courtLevel || null,
        courtName: overviewForm.courtName.trim() || null,
        estimatedFee,
      }) as CaseDetail;
      setCase(updated);
      setEditingOverview(false);
    } catch (err) {
      setOverviewError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingOverview(false);
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

  const handleSaveNote = async () => {
    if (!token || !id || !note.trim()) return;
    setSavingNote(true);
    try {
      const created = await api.createCaseActivity(token, id, {
        title: note.trim().slice(0, 60),
        description: note.trim(),
        activityAt: new Date().toISOString(),
        type: ActivityType.NOTE,
      });
      setActivities((prev) => [created, ...prev]);
      setNote('');
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!legalCase) return <p className="text-destructive">Case not found / ไม่พบคดี</p>;

  const customFields = legalCase.customFields as Record<string, string> | null;
  const clientDisplay = legalCase.client?.name ?? legalCase.clientName ?? '—';
  // The API returns analyses newest-first, so the first COMPLETE row is the most
  // recent successful run. FAILED/PENDING rows are intentionally not shown here —
  // this case view is read-only and has no re-run action to offer.
  const latestPrecedentAnalysis =
    precedentAnalyses.find((a) => a.status === 'COMPLETE') ?? null;
  const tabs = [
    { id: 'overview', label: 'ภาพรวม' },
    { id: 'tasks', label: 'งาน', href: `/cases/${id}/tasks` },
    { id: 'calendar', label: 'ปฏิทิน', href: `/cases/${id}/calendar` },
    { id: 'documents', label: 'เอกสาร', href: `/cases/${id}/documents` },
    { id: 'billing', label: 'ค่าใช้จ่าย', href: `/cases/${id}/billing` },
    { id: 'insurance', label: 'ประกัน', href: `/cases/${id}/insurance` },
    { id: 'messages', label: 'ข้อความ', href: `/cases/${id}/messages` },
    {
      id: 'closing-report',
      label: 'รายงานปิดงาน',
      href: `/cases/${id}/closing-report`,
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <button type="button" onClick={() => router.push('/cases')} className="text-sm text-primary hover:underline">
          ← Back to Cases / กลับไปหน้าคดี
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
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Case Overview / ภาพรวมคดี</CardTitle>
              {!editingOverview && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={startEditOverview}
                >
                  <Pencil className="h-3 w-3" />
                  แก้ไข
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {editingOverview ? (
                <form onSubmit={handleSaveOverview} className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">ชื่อคดี *</label>
                    <Input
                      required
                      value={overviewForm.title}
                      onChange={(e) => setOverviewForm({ ...overviewForm, title: e.target.value })}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Own Ref / เลขอ้างอิงสำนักงาน</label>
                    <p className="mt-1 font-medium">{legalCase.ownRef}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Customer Ref / เลขอ้างอิงลูกค้า</label>
                    <Input
                      value={overviewForm.customerRef}
                      onChange={(e) => setOverviewForm({ ...overviewForm, customerRef: e.target.value })}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Case Type / ประเภทคดี</label>
                    <select
                      value={overviewForm.caseTypeId}
                      onChange={(e) => setOverviewForm({ ...overviewForm, caseTypeId: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {caseTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">เลขดำ</label>
                    <Input
                      value={overviewForm.blackCaseNumber}
                      onChange={(e) => setOverviewForm({ ...overviewForm, blackCaseNumber: e.target.value })}
                      placeholder={CASE_NUMBER_HINT}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">เลขแดง</label>
                    <Input
                      value={overviewForm.redCaseNumber}
                      onChange={(e) => setOverviewForm({ ...overviewForm, redCaseNumber: e.target.value })}
                      placeholder={CASE_NUMBER_HINT}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">ระดับศาล</label>
                    <select
                      value={overviewForm.courtLevel}
                      onChange={(e) => setOverviewForm({ ...overviewForm, courtLevel: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {Object.values(CourtLevel).map((level) => (
                        <option key={level} value={level}>{COURT_LEVEL_LABELS[level]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Court / ศาล</label>
                    <select
                      value={overviewForm.courtName}
                      onChange={(e) => setOverviewForm({ ...overviewForm, courtName: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {courts.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                      {overviewForm.courtName &&
                        !courts.some((c) => c.name === overviewForm.courtName) && (
                          <option value={overviewForm.courtName}>{overviewForm.courtName}</option>
                        )}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">รายได้โดยประมาณ / Estimated Fee</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={overviewForm.estimatedFee}
                      onChange={(e) => setOverviewForm({ ...overviewForm, estimatedFee: e.target.value })}
                      placeholder="เช่น 50000"
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Client / ลูกค้า</p>
                    <p className="font-medium">{clientDisplay}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Case Owner / เจ้าของเคส</p>
                    <p className="font-medium">{legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}</p>
                  </div>
                  {overviewError && <p className="text-sm text-destructive">{overviewError}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" size="sm" disabled={savingOverview}>
                      {savingOverview ? 'กำลังบันทึก...' : 'บันทึก'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingOverview(false)}
                    >
                      ยกเลิก
                    </Button>
                  </div>
                </form>
              ) : (
                <>
              <div>
                <p className="text-xs text-muted-foreground">Own Ref / เลขอ้างอิงสำนักงาน</p>
                <p className="font-medium">{legalCase.ownRef}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer Ref / เลขอ้างอิงลูกค้า</p>
                <p className="font-medium">{legalCase.customerRef ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Case Type / ประเภทคดี</p>
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
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">ทีมของคดี</p>
                  {!editingTeam && user?.firmRole === FirmRole.OWNER && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={startEditTeam}>
                      <Pencil className="h-3 w-3" />
                      แก้ไขทีม
                    </Button>
                  )}
                </div>

                {!editingTeam ? (
                  <>
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">Case Owner / เจ้าของเคส</p>
                      <p className="font-medium">
                        {legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}
                      </p>
                    </div>
                    {legalCase.assignments.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">Buddies / ผู้ช่วย</p>
                        <p className="font-medium">
                          {legalCase.assignments
                            .map((a) => `${a.user.firstName} ${a.user.lastName}`)
                            .join(', ')}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-2 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Case Owner / เจ้าของเคส
                      </label>
                      <select
                        value={teamForm.leadLawyerId}
                        onChange={(e) =>
                          setTeamForm((f) => ({
                            ...f,
                            leadLawyerId: e.target.value,
                            buddyIds: f.buddyIds.filter((uid) => uid !== e.target.value),
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        {lawyers.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.firstName} {l.lastName}
                            {workloadLabel(l.id)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Buddies / ผู้ช่วย
                      </label>
                      <div className="mt-1 space-y-1">
                        {lawyers
                          .filter((l) => l.id !== teamForm.leadLawyerId)
                          .map((l) => (
                            <label key={l.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={teamForm.buddyIds.includes(l.id)}
                                onChange={() =>
                                  setTeamForm((f) => ({
                                    ...f,
                                    buddyIds: f.buddyIds.includes(l.id)
                                      ? f.buddyIds.filter((x) => x !== l.id)
                                      : [...f.buddyIds, l.id],
                                  }))
                                }
                              />
                              {l.firstName} {l.lastName}
                              {workloadLabel(l.id)}
                            </label>
                          ))}
                      </div>
                    </div>
                    {teamError && <p className="text-xs text-destructive">{teamError}</p>}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" disabled={savingTeam} onClick={handleSaveTeam}>
                        {savingTeam ? 'กำลังบันทึก...' : 'บันทึก'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTeam(false)}
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">รายได้โดยประมาณ / Estimated Fee</p>
                <p className="font-medium text-green-600">
                  {legalCase.estimatedFee != null
                    ? formatCurrency(legalCase.estimatedFee)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approved Expenses / ค่าใช้จ่ายที่อนุมัติ</p>
                <p className="font-medium text-primary">{formatCurrency(totalSpent)}</p>
              </div>
              {customFields && Object.entries(customFields).map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="font-medium">{v}</p>
                </div>
              ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Case Timeline / ไทม์ไลน์คดี</CardTitle>
              <Button variant="outline" size="sm" onClick={openActivityForm}>
                <Plus className="h-3 w-3" />Add Activity / เพิ่มกิจกรรม
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
                      <label className="text-xs text-muted-foreground">Type / ประเภท</label>
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
                      <label className="text-xs text-muted-foreground">Date & Time / วันที่และเวลา</label>
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
                    placeholder="Description (optional) / รายละเอียด (ไม่บังคับ)"
                    value={activityForm.description}
                    onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none"
                  />
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? 'Saving... / กำลังบันทึก...' : 'Save Activity / บันทึกกิจกรรม'}
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
                  <p className="text-sm text-muted-foreground">No activities yet. Add the first appointment or filing. / ยังไม่มีกิจกรรม เพิ่มนัดหมายหรือการยื่นเอกสารแรกได้เลย</p>
                )}
              </div>
            </CardContent>
          </Card>

          <CaseParticipantsSection
            caseId={legalCase.id}
            initialParticipants={legalCase.participants}
          />

          {legalCase.description && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Description / รายละเอียด</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{legalCase.description}</p>
              </CardContent>
            </Card>
          )}

          {latestPrecedentAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Precedent Analysis / ผลวิเคราะห์ฎีกา
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  วิเคราะห์เมื่อ {formatDateTime(latestPrecedentAnalysis.createdAt)}
                </p>

                <div>
                  <p className="text-sm font-medium">📚 ฎีกาที่เกี่ยวข้อง</p>
                  {latestPrecedentAnalysis.precedents.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {latestPrecedentAnalysis.precedents.map((p) => (
                        <li key={p.dekaId} className="text-sm">
                          <a
                            href={p.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline"
                          >
                            ฎ. {p.dekaId}
                          </a>{' '}
                          — {p.headnote}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      ไม่พบฎีกาที่เกี่ยวข้องโดยตรง
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {latestPrecedentAnalysis.summaryBullets}
                  </p>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-sm font-medium">📄 ข้อมูลพร้อมร่าง Notice</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
                    {latestPrecedentAnalysis.noticeFacts}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground">
                  ⚠️ ผลลัพธ์นี้เป็นการช่วยค้นเบื้องต้นด้วย AI โปรดตรวจสอบกับฉบับเต็มก่อนใช้อ้างอิงจริง
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Upcoming Tasks / งานที่จะถึง</CardTitle>
              <Link href={`/cases/${id}/tasks`} className="text-xs text-primary hover:underline">ดูทั้งหมด</Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasks.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <CheckSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{TASK_STATUS_LABELS[t.status] ?? t.status}</span>
                </div>
              ))}
              {tasks.length === 0 && (
                <p className="text-sm text-muted-foreground">ยังไม่มีงานที่มอบหมาย</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Calendar / ปฏิทิน</CardTitle></CardHeader>
            <CardContent>
              {(legalCase.calendarEvents ?? []).length > 0 ? (
                (legalCase.calendarEvents ?? []).slice(0, 3).map((e) => (
                  <div key={e.id} className="mb-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(e.startAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">ไม่มีนัดที่จะถึง</p>
              )}
              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => router.push(`/cases/${id}/calendar`)}>
                <CalendarDays className="h-4 w-4" />เปิดปฏิทิน
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Quick Notes / บันทึกย่อ</CardTitle></CardHeader>
            <CardContent>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เพิ่มบันทึกย่อ..."
                rows={3}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                size="sm"
                className="mt-2"
                variant="secondary"
                disabled={!note.trim() || savingNote}
                onClick={handleSaveNote}
              >
                <StickyNote className="h-4 w-4" />
                {savingNote ? 'กำลังบันทึก...' : 'Save Note / บันทึก'}
              </Button>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/cases/${id}/documents`)}>
              <Upload className="h-4 w-4" />Documents / เอกสาร
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/cases/${id}/billing`)}>
              <FileText className="h-4 w-4" />Billing / ค่าใช้จ่าย
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
