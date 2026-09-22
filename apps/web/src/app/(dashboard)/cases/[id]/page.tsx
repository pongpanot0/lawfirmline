'use client';

import { SavedCaseCostCalculator } from '@/components/cases/CaseCostCalculator';
import { RelatedStatutes } from '@/components/intake/RelatedStatutes';
import { AnalysisFactsTimeline } from '@/components/intake/AnalysisFactsTimeline';
import { CASE_COSTS_KEY } from '@/lib/case-costs';
import { BatchAnalysisPanel } from '@/components/documents/BatchAnalysisPanel';
import { RecordHearingOutcomeDialog } from '@/components/cases/RecordHearingOutcomeDialog';
import { CaseNoticeDialog, PreLitigationUpdateDialog } from '@/components/cases/CaseNoticeDialog';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { PRE_LITIGATION_STATUS_LABELS } from '@/lib/pre-litigation';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Gavel,
  FileText,
  CalendarDays,
  Plus,
  StickyNote,
  CheckSquare,
  X,
  Lock,
  LockOpen,
  Pencil,
  Sparkles,
} from 'lucide-react';
import {
  ActivityType,
  CaseStatus,
  CourtLevel,
  COURT_LEVEL_LABELS,
  CASE_NUMBER_HINT,
  FirmRole,
} from '@lawfirm/shared';
import {
  CASE_TAB_IDS,
  CASE_TAB_LABELS,
  caseTabHref,
  parseCaseTab,
  type CaseTabId,
} from '@/lib/case-tabs';
import { buildCasePrioritySummary } from '@/lib/case-workbench';
import './tokens.css';
import styles from './case-detail.module.css';

const CaseTasksPanel = dynamic(
  () => import('@/components/cases/CaseTasksPanel').then((m) => m.CaseTasksPanel),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> },
);

const CaseCalendarPanel = dynamic(
  () => import('@/components/cases/CaseCalendarPanel').then((m) => m.CaseCalendarPanel),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> },
);

const CaseDocumentsPanel = dynamic(
  () => import('@/components/cases/CaseDocumentsPanel').then((m) => m.CaseDocumentsPanel),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> },
);

const CaseBillingPanel = dynamic(
  () => import('@/components/cases/CaseBillingPanel').then((m) => m.CaseBillingPanel),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> },
);

const CaseAskAiPanel = dynamic(
  () => import('@/components/cases/CaseAskAiPanel'),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> },
);

const CaseMessagesPanel = dynamic(
  () => import('@/components/cases/CaseMessagesPanel').then((m) => m.CaseMessagesPanel),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> },
);

const CaseClosingReportPanel = dynamic(
  () => import('@/components/cases/CaseClosingReportPanel').then((m) => m.CaseClosingReportPanel),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> },
);
import { useAuth } from '@/lib/auth';
import { PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { useDashboardT } from '@/components/landing/LocaleProvider';
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
  type CaseOutstandingResult,
  type RequiredDocumentsResult,
} from '@/lib/api';
import { caseStageOptions, documentCategoryLabel } from '@/lib/stage-labels';
import { formatCustomers, customersSameAsClient } from '@/lib/customers';
import { CaseStatusBadge } from '@/components/samnuan/CaseStatusBadge';
import { CaseParticipantsSection } from '@/components/cases/CaseParticipantsSection';
import { CargoClaimPanel } from '@/components/cargo/CargoClaimPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThaiDateTimeInput } from '@/components/ui/ThaiDateTimeInput';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';

const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: 'ยังไม่เริ่ม',
  IN_PROGRESS: 'กำลังทำ',
  PENDING_REVIEW: 'รอตรวจ',
  NEEDS_REVISION: 'ต้องแก้ไข',
  DONE: 'เสร็จแล้ว',
};

const ACTIVITY_LABELS: Record<string, string> = {
  COURT_DATE: 'นัดศาล',
  CLIENT_MEETING: 'นัดลูกค้า',
  FILING: 'ยื่นคำร้อง',
  DEADLINE: 'กำหนดส่ง',
  NOTE: 'บันทึก',
  OTHER: 'อื่นๆ',
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
  const d = useDashboardT();
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseCaseTab(searchParams.get('tab'));
  const selectTab = (tab: CaseTabId) => {
    router.replace(caseTabHref(id, tab), { scroll: false });
  };
  const [legalCase, setCase] = useState<CaseDetail | null>(null);
  const [activities, setActivities] = useState<CaseActivityItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [checklistStatusFilter, setChecklistStatusFilter] = useState('ALL');
  const [checklistOwnerFilter, setChecklistOwnerFilter] = useState('ALL');
  const [requiredDocs, setRequiredDocs] = useState<RequiredDocumentsResult>({ required: [], missing: [] });
  const [playbooks, setPlaybooks] = useState<PlaybookRelease[]>([]);
  const [applyingPlaybook, setApplyingPlaybook] = useState(false);
  const [pendingPlaybookId, setPendingPlaybookId] = useState('');
  const [totalSpent, setTotalSpent] = useState(0);
  const [precedentAnalyses, setPrecedentAnalyses] = useState<IntakePrecedentAnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingOverview, setEditingOverview] = useState(false);
  const [savingOverview, setSavingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [overviewForm, setOverviewForm] = useState({
    title: '',
    ownRef: '',
    customerRef: '',
    caseTypeId: '',
    blackCaseNumber: '',
    redCaseNumber: '',
    courtLevel: '' as string,
    courtName: '',
    partyRole: '',
    claimedAmount: '',
    estimatedFee: '',
    description: '',
  });
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [preLitOpen, setPreLitOpen] = useState(false);
  const [recordingOutcome, setRecordingOutcome] = useState(false);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [closingSummary, setClosingSummary] = useState('');
  const [closingCase, setClosingCase] = useState(false);
  const [reopeningCase, setReopeningCase] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closingOutcome, setClosingOutcome] = useState('');
  /** ของค้างตอนกดปิดคดี — โหลดตอนเปิดฟอร์ม ไม่ใช่ทุกครั้งที่หน้า render */
  const [outstanding, setOutstanding] = useState<CaseOutstandingResult | null>(null);
  const [ackOutstanding, setAckOutstanding] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [editingTeam, setEditingTeam] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskAssignee, setQuickTaskAssignee] = useState('');
  const [quickTaskDue, setQuickTaskDue] = useState('');
  const [quickTaskBusy, setQuickTaskBusy] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadError, setUploadError] = useState('');
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
    api.getRequiredDocuments(token, id).then(setRequiredDocs).catch(() => setRequiredDocs({ required: [], missing: [] }));
    setupRequest<PlaybookRelease[]>(token, '/playbooks').then(setPlaybooks).catch(() => setPlaybooks([]));
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

  useEffect(() => {
    if (!showAiAnalysis) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowAiAnalysis(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showAiAnalysis]);

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
        label: 'เปิดคดี',
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
            label: 'ปิดคดี',
            date: legalCase.closedAt,
            type: 'closed',
            isOpened: false as const,
          }]
        : []),
    ];
    return items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [legalCase?.openedAt, legalCase?.status, legalCase?.closedAt, activities]);

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
      await api.closeCase(token, id, closingSummary.trim(), {
        outcome: closingOutcome || undefined,
        acknowledgeOutstanding: ackOutstanding || undefined,
      });
      setShowCloseForm(false);
      setClosingSummary('');
      setAckOutstanding(false);
      loadCase();
    } catch (err) {
      setCloseError(err instanceof ApiError ? err.message : 'ปิดคดีไม่สำเร็จ');
    } finally {
      setClosingCase(false);
    }
  };

  const handleStageChange = async (stage: string) => {
    if (!token || !id || stage === legalCase?.stage) return;
    setSavingStage(true);
    try {
      await api.updateCase(token, id, { stage });
      loadCase();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingStage(false);
    }
  };

  const handleArchiveCase = async () => {
    if (!token || !id) return;
    if (!confirm('เก็บคดีนี้เข้าคลัง? ยังค้นเจอและเปิดกลับได้')) return;
    try {
      await api.archiveCase(token, id);
      loadCase();
    } catch (err) {
      console.error(err);
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
      ownRef: legalCase.ownRef,
      customerRef: legalCase.customerRef ?? '',
      caseTypeId: legalCase.caseType?.id ?? '',
      blackCaseNumber: legalCase.blackCaseNumber ?? '',
      redCaseNumber: legalCase.redCaseNumber ?? '',
      courtLevel: legalCase.courtLevel ?? '',
      courtName: legalCase.courtName ?? '',
      partyRole: legalCase.partyRole ?? '',
      claimedAmount: legalCase.claimedAmount != null ? String(legalCase.claimedAmount) : '',
      estimatedFee:
        legalCase.estimatedFee != null ? String(legalCase.estimatedFee) : '',
      description: legalCase.description ?? '',
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
        ownRef: overviewForm.ownRef.trim(),
        customerRef: overviewForm.customerRef.trim() || null,
        caseTypeId: overviewForm.caseTypeId || undefined,
        blackCaseNumber: overviewForm.blackCaseNumber.trim() || null,
        redCaseNumber: overviewForm.redCaseNumber.trim() || null,
        courtLevel: overviewForm.courtLevel || null,
        courtName: overviewForm.courtName.trim() || null,
        partyRole: overviewForm.partyRole || null,
        estimatedFee,
        claimedAmount: overviewForm.claimedAmount.trim() ? Number(overviewForm.claimedAmount) : null,
        description: overviewForm.description.trim() || null,
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

  if (loading) return <PageLoading title={d.common.loading} lines={5} />;
  if (!legalCase) return <p className="text-destructive">{d.admin.caseNotFound}</p>;

  const customFields = legalCase.customFields as Record<string, string> | null;
  const chargeSection = customFields?.chargeSection?.trim() || '—';
  const policyRef = legalCase.insuranceClaim?.policyNumber?.trim() || '—';
  const clientDisplay = legalCase.client?.name ?? legalCase.clientName ?? '—';
  // ลูกความ = คนที่เราว่าความให้ / ลูกค้า = ผู้ว่าจ้างที่เราวางบิล — คนละคนกันในงานประกัน
  const customerDisplay = formatCustomers(legalCase.customers);
  const customerIsClient = customersSameAsClient(legalCase.customers, legalCase.clientId);
  const showCustomer = Boolean(customerDisplay) && !customerIsClient;
  // The API returns analyses newest-first, so the first COMPLETE row is the most
  // recent successful run. FAILED/PENDING rows are intentionally not shown here —
  // this case view is read-only and has no re-run action to offer.
  const latestPrecedentAnalysis =
    precedentAnalyses.find((a) => a.status === 'COMPLETE') ?? null;

  const pendingTasks = tasks.filter((task) => task.status !== 'DONE').sort(
    (a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
      (b.dueDate ? new Date(b.dueDate).getTime() : Infinity),
  );
  const handleQuickUpload = async (files: File[]) => {
    if (!token || !id || uploadingDocs) return;
    setUploadingDocs(true);
    setUploadError('');
    try {
      for (const file of files) {
        await api.uploadDocument(token, id, file);
      }
      loadCase();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploadingDocs(false);
    }
  };

  const addQuickTask = async () => {
    if (!token || !id || !quickTaskTitle.trim() || quickTaskBusy) return;
    setQuickTaskBusy(true);
    try {
      await api.createTask(token, id, {
        title: quickTaskTitle.trim(),
        assigneeId: quickTaskAssignee || undefined,
        dueDate: quickTaskDue || undefined,
      });
      setQuickTaskTitle('');
      setQuickTaskDue('');
      api.getTasks(token, id).then(setTasks).catch(console.error);
    } catch (err) {
      console.error(err);
    } finally {
      setQuickTaskBusy(false);
    }
  };

  // ก่อนขั้นยื่นฟ้อง — เลขคดีดำ/แดงและศาลยังไม่มีจริง ซ่อนไว้ให้หน้าโล่ง
  const preFiling = ['INTAKE_REVIEW', 'FACT_GATHERING', 'PRE_LITIGATION'].includes(legalCase.stage ?? '');
  const upcomingEvents = (legalCase.calendarEvents ?? [])
    .filter((event) => new Date(event.startAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const hasAppliedPlaybook = tasks.some((t) => t.labels.some((l) => l.startsWith('playbook:')));
  const suggestedPlaybook = legalCase.caseType
    ? playbooks.find((p) => p.caseTypeId === legalCase.caseType!.id)
    : undefined;
  const checklistTasks = tasks.filter((t) => t.labels.some((l) => l.startsWith('playbook:')));
  const checklistOwners = Array.from(
    new Map(
      checklistTasks
        .filter((task) => task.assignee)
        .map((task) => [task.assignee!.id, task.assignee!] as const),
    ).values(),
  );
  const filteredChecklistTasks = checklistTasks.filter((task) => {
    if (checklistStatusFilter !== 'ALL' && task.status !== checklistStatusFilter) return false;
    if (checklistOwnerFilter === 'UNASSIGNED') return !task.assignee;
    return checklistOwnerFilter === 'ALL' || task.assignee?.id === checklistOwnerFilter;
  });
  const nextActionTasks = pendingTasks.filter((task) => !task.labels.some((label) => label.startsWith('playbook:')));
  const priority = buildCasePrioritySummary({
    tasks: pendingTasks.concat(tasks.filter((task) => task.status === 'DONE')),
    requiredDocuments: requiredDocs.required,
    upcomingEvents,
    limitationDeadline: legalCase.limitationDeadline,
  });

  const applySuggestedPlaybook = async () => {
    if (!token || !suggestedPlaybook) return;
    setApplyingPlaybook(true);
    try {
      await setupRequest(token, `/cases/${id}/apply`, { releaseId: suggestedPlaybook.id });
      loadCase();
    } catch (err) {
      console.error(err);
    } finally {
      setApplyingPlaybook(false);
    }
  };

  const toggleChecklistTask = (task: TaskItem) => {
    if (!token) return;
    api
      .updateTask(token, id, task.id, { status: task.status === 'DONE' ? 'TODO' : 'DONE' })
      .then(loadCase)
      .catch(console.error);
  };

  const toggleRequiredDoc = (category: string, present: boolean) => {
    if (!token) return;
    api.setDocumentConfirmed(token, id, category, !present).then(setRequiredDocs).catch(console.error);
  };
  const applyPlaybook = async (releaseId: string) => {
    if (!token || !releaseId) return;
    setApplyingPlaybook(true);
    try {
      await setupRequest(token, `/cases/${id}/apply`, { releaseId });
      setPendingPlaybookId('');
      loadCase();
    } catch (err) {
      console.error(err);
    } finally {
      setApplyingPlaybook(false);
    }
  };

  return (
    <div className={styles.workbench}>
      <header className={styles.identity} data-testid="case-identity">
        <button type="button" onClick={() => router.push('/cases')} className={styles.backButton}>
          ← กลับไปหน้าคดี
        </button>
        <div className={styles.identityGrid}>
          <div className={styles.identityMain}>
            <p className={styles.identityContext}>แฟ้มคดี · {legalCase.ownRef}</p>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>{legalCase.title}</h1>
              {legalCase.partyRole && (
                <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-900">
                  {legalCase.partyRole === 'PLAINTIFF' ? 'โจทก์' : 'จำเลย'}
                </span>
              )}
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {caseStageOptions('th').find((o) => o.value === legalCase.stage)?.label ?? legalCase.stage}
              </span>
              <CaseStatusBadge status={legalCase.status} />
            </div>
            <div className={styles.identityMeta}>
              <span>ลูกความ <strong>{clientDisplay}</strong></span>
              {showCustomer && <span>ผู้ว่าจ้าง <strong>{customerDisplay}</strong></span>}
              <span>ทนายผู้รับผิดชอบ <strong>{legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}</strong></span>
            </div>
          </div>
          <div className={styles.identityActions}>
            {legalCase.intake && preFiling && (
              <Button size="sm" className="min-h-11" onClick={() => setNoticeOpen(true)}>ออก Notice</Button>
            )}
            <Button variant="outline" className="min-h-11" onClick={() => setRecordingOutcome(true)}>
              <Gavel className="h-4 w-4" />บันทึกผลหลังขึ้นศาล
            </Button>
          </div>
        </div>
      </header>

      <section className={styles.signalStrip} aria-label="สัญญาณสำคัญของคดี" data-testid="case-priority-signals">
        <button type="button" onClick={() => selectTab('calendar')} className={styles.signalButton}>
          <span className={styles.signalLabel}>นัดหมายถัดไป</span>
          <strong className={styles.signalValue}>{priority.nextEvent?.title ?? 'ยังไม่มีนัดถัดไป'}</strong>
          <span className={styles.signalMeta}>{priority.nextEvent ? formatDateTime(priority.nextEvent.startAt) : 'เปิดไทม์ไลน์เพื่อเพิ่มนัด'}</span>
        </button>
        <div className={styles.signal}>
          <span className={styles.signalLabel}>อายุความ</span>
          <strong className={styles.signalValue}>{priority.limitationDays == null ? 'ยังไม่ระบุ' : `อีก ${priority.limitationDays} วัน`}</strong>
          <span className={styles.signalMeta}>{legalCase.limitationDeadline ? `ครบ ${formatDate(legalCase.limitationDeadline)}` : 'ยังไม่มีวันที่ให้ประเมิน'}</span>
        </div>
        <button type="button" onClick={() => selectTab('tasks')} className={styles.signalButton}>
          <span className={styles.signalLabel}>งานค้าง</span>
          <strong className={styles.signalValue}>{priority.pendingTaskCount} รายการ</strong>
          <span className={styles.signalMeta}>{priority.nextPendingTask?.dueDate ? `ใกล้สุด ${formatDate(priority.nextPendingTask.dueDate)}` : priority.nextPendingTask ? 'งานถัดไปยังไม่กำหนดวันส่ง' : 'ไม่มีงานค้าง'}</span>
        </button>
        <button type="button" onClick={() => selectTab('documents')} className={styles.signalButton}>
          <span className={styles.signalLabel}>เอกสารที่ต้องมี</span>
          <strong className={styles.signalValue}>{priority.presentRequiredDocumentCount}/{priority.requiredDocumentCount}</strong>
          <span className={styles.signalMeta}>{priority.missingRequiredDocumentCount > 0 ? `ขาด ${priority.missingRequiredDocumentCount} รายการ` : priority.requiredDocumentCount > 0 ? 'ครบตามรายการ' : 'ยังไม่มีรายการบังคับ'}</span>
        </button>
      </section>

      <div className={styles.stagePanel} data-testid="case-stage-control">
        <div className={styles.stageHeader}>
          <p>ขั้นตอนคดี</p>
          <p>{savingStage ? 'กำลังบันทึกขั้นตอน…' : 'เลือกเพื่อเปลี่ยนขั้นตอนคดี'}</p>
        </div>
        <div className={styles.stageScroller}>
          {caseStageOptions('th').map((option, index) => {
            const currentIndex = legalCase.stage
              ? caseStageOptions('th').findIndex((item) => item.value === legalCase.stage)
              : -1;
            const isCurrent = option.value === legalCase.stage;
            const stageClass = isCurrent
              ? `${styles.stageButton} ${styles.stageCurrent}`
              : index < currentIndex
                ? `${styles.stageButton} ${styles.stagePast}`
                : styles.stageButton;
            return (
              <button
                key={option.value}
                type="button"
                disabled={savingStage}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => handleStageChange(option.value)}
                className={stageClass}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className={styles.dangerZone}>
          {legalCase.status !== CaseStatus.CLOSED && legalCase.status !== 'ARCHIVED' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                setCloseError('');
                setShowCloseForm(true);
                setAckOutstanding(false);
                if (token && id) {
                  try {
                    setOutstanding(await api.getCaseOutstanding(token, id));
                  } catch {
                    setOutstanding(null);
                  }
                }
              }}
            >
              <Lock className="h-4 w-4" />ดำเนินการปิดคดี
            </Button>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">ปิดเมื่อ {legalCase.closedAt ? formatDate(legalCase.closedAt) : '—'}</p>
              <Button variant="outline" size="sm" onClick={handleReopenCase} disabled={reopeningCase}>
                <LockOpen className="h-4 w-4" />{reopeningCase ? 'กำลังเปิด...' : 'เปิดคดีอีกครั้ง'}
              </Button>
              {legalCase.status === CaseStatus.CLOSED && (
                <Button variant="ghost" size="sm" onClick={handleArchiveCase}>เก็บเข้าคลัง</Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mb-5">
        {suggestedPlaybook && !hasAppliedPlaybook && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm">
              แนะนำ Playbook <span className="font-medium">{suggestedPlaybook.name}</span> — {suggestedPlaybook.steps.length} ขั้นตอนที่คดีประเภทนี้ต้องทำ
            </p>
            <button
              type="button"
              onClick={applySuggestedPlaybook}
              disabled={applyingPlaybook}
              className="inline-flex h-9 shrink-0 items-center rounded-lg border border-primary bg-primary px-3 text-sm text-primary-foreground disabled:opacity-60"
            >
              {applyingPlaybook ? 'กำลังใช้…' : 'ใช้เลย'}
            </button>
          </div>
        )}
      </div>

      {showCloseForm && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
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

              {/* ของค้าง: ปิดคดีทับของค้างเงียบ ๆ คือการซ่อน ไม่ใช่ทำให้เสร็จ */}
              {outstanding && outstanding.total > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  <p className="font-medium text-amber-700">
                    ยังมีของค้าง {outstanding.total} รายการ
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {outstanding.openTasks.map((t) => (
                      <li key={t.id}>• งานค้าง: {t.title}</li>
                    ))}
                    {outstanding.upcomingEvents.map((e) => (
                      <li key={e.id}>• วันนัดข้างหน้า: {e.title} ({formatDate(e.startAt)})</li>
                    ))}
                    {outstanding.unapprovedDocuments.map((docItem) => (
                      <li key={docItem.id}>• เอกสารยังไม่อนุมัติ: {docItem.filename}</li>
                    ))}
                  </ul>
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ackOutstanding}
                      onChange={(e) => setAckOutstanding(e.target.checked)}
                    />
                    ตรวจแล้ว และยืนยันจะปิดคดี
                  </label>
                </div>
              )}

              <label className="block text-sm">
                <span className="mb-1 block font-medium">ผลของคดี</span>
                <select
                  value={closingOutcome}
                  onChange={(e) => setClosingOutcome(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                >
                  <option value="">ไม่ระบุ</option>
                  <option value="WON">ชนะคดี</option>
                  <option value="SETTLED">ตกลงกันได้</option>
                  <option value="MEDIATED">ไกล่เกลี่ยสำเร็จ</option>
                  <option value="LOST">แพ้คดี</option>
                  <option value="WITHDRAWN">ถอนฟ้อง / ยุติ</option>
                </select>
              </label>
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
                <Button
                  type="submit"
                  disabled={closingCase || (!!outstanding && outstanding.total > 0 && !ackOutstanding)}
                >
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

      <nav className={styles.tabDock} aria-label="พื้นที่ทำงานคดี">
        <div className={styles.tabScroller}>
          <div role="tablist" aria-label="เมนูคดี" className={styles.tabList}>
            {CASE_TAB_IDS.map((tabId) => {
              const selected = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  role="tab"
                  id={`case-tab-${tabId}`}
                  aria-selected={selected}
                  aria-controls={`case-tabpanel-${tabId}`}
                  tabIndex={selected ? 0 : -1}
                  className={selected ? `${styles.tabButton} ${styles.tabSelected}` : styles.tabButton}
                  onClick={() => selectTab(tabId)}
                >
                  {CASE_TAB_LABELS[tabId]}
                </button>
              );
            })}
          </div>
        </div>
        <div className={styles.tabUtility}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            hidden={activeTab !== 'documents'}
            aria-expanded={showAiAnalysis}
            aria-controls="case-ai-analysis-panel"
            onClick={() => setShowAiAnalysis(true)}
          >
            <Sparkles className="h-4 w-4" />สรุปเอกสารรวม
          </Button>
        </div>
      </nav>

      {activeTab === 'tasks' && (
        <div
          role="tabpanel"
          id="case-tabpanel-tasks"
          aria-labelledby="case-tab-tasks"
          className="min-w-0"
        >
          <CaseTasksPanel caseId={id} />
        </div>
      )}

      {activeTab === 'calendar' && (
        <div
          role="tabpanel"
          id="case-tabpanel-calendar"
          aria-labelledby="case-tab-calendar"
          className="min-w-0"
        >
          <CaseCalendarPanel caseId={id} />
        </div>
      )}

      {activeTab === 'documents' && (
        <div
          role="tabpanel"
          id="case-tabpanel-documents"
          aria-labelledby="case-tab-documents"
          className="min-w-0"
        >
          <CaseDocumentsPanel caseId={id} />
        </div>
      )}

      {activeTab === 'cargo-claim' && (
        <div
          role="tabpanel"
          id="case-tabpanel-cargo-claim"
          aria-labelledby="case-tab-cargo-claim"
          className="min-w-0"
        >
          <CargoClaimPanel caseId={id} />
        </div>
      )}

      {activeTab === 'billing' && (
        <div
          role="tabpanel"
          id="case-tabpanel-billing"
          aria-labelledby="case-tab-billing"
          className="min-w-0"
        >
          <CaseBillingPanel caseId={id} />
        </div>
      )}

      {activeTab === 'ask-ai' && (
        <div
          role="tabpanel"
          id="case-tabpanel-ask-ai"
          aria-labelledby="case-tab-ask-ai"
          className="min-w-0"
        >
          <CaseAskAiPanel caseId={id} />
        </div>
      )}

      {activeTab === 'closing-report' && (
        <div
          role="tabpanel"
          id="case-tabpanel-closing-report"
          aria-labelledby="case-tab-closing-report"
          className="min-w-0"
        >
          <CaseClosingReportPanel caseId={id} />
        </div>
      )}

      {activeTab === 'overview' && (
      <div
        role="tabpanel"
        id="case-tabpanel-overview"
        aria-labelledby="case-tab-overview"
        className="min-w-0"
      >
      <div className={styles.workspace}>
        <section className={styles.mainPane} aria-label="ข้อมูลและประวัติคดี">
          <Card data-testid="case-information">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm">ข้อมูลคดี</CardTitle>
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
            <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              {editingOverview ? (
                <form onSubmit={handleSaveOverview} className="col-span-full grid gap-3 sm:grid-cols-2">
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
                    <label className="text-xs text-muted-foreground">เลขอ้างอิงสำนักงาน</label>
                    <Input
                      required
                      value={overviewForm.ownRef}
                      onChange={(e) => setOverviewForm({ ...overviewForm, ownRef: e.target.value })}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">เลขอ้างอิงลูกค้า</label>
                    <Input
                      value={overviewForm.customerRef}
                      onChange={(e) => setOverviewForm({ ...overviewForm, customerRef: e.target.value })}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">ประเภทคดี</label>
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
                    <label className="text-xs text-muted-foreground">รายได้โดยประมาณ</label>
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
                  <div className="col-span-full">
                    <label className="text-xs text-muted-foreground">รายละเอียดคดี</label>
                    <textarea
                      value={overviewForm.description}
                      onChange={(e) => setOverviewForm({ ...overviewForm, description: e.target.value })}
                      rows={3}
                      className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ลูกความ</p>
                    <p className="font-medium">{clientDisplay}</p>
                  </div>
                  {showCustomer && (
                    <div>
                      <p className="text-xs text-muted-foreground">ลูกค้า (ผู้ว่าจ้าง)</p>
                      <p className="font-medium">{customerDisplay}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">ทนายผู้รับผิดชอบ</p>
                    <p className="font-medium">{legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}</p>
                  </div>

                  <fieldset className="col-span-full rounded-lg border border-border p-3">
                    <legend className="px-1 text-xs font-medium text-muted-foreground">
                      ข้อมูลศาล / เลขคดี
                    </legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs text-muted-foreground">หมายเลขคดีดำ</label>
                        <Input
                          value={overviewForm.blackCaseNumber}
                          onChange={(e) => setOverviewForm({ ...overviewForm, blackCaseNumber: e.target.value })}
                          placeholder={CASE_NUMBER_HINT}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">หมายเลขคดีแดง</label>
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
                        <label className="text-xs text-muted-foreground">ศาล</label>
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
                        <label className="text-xs text-muted-foreground">ฝ่ายเรา</label>
                        <select
                          value={overviewForm.partyRole}
                          onChange={(e) => setOverviewForm({ ...overviewForm, partyRole: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                        >
                          <option value="">ไม่ระบุ</option>
                          <option value="PLAINTIFF">โจทก์ (ฝ่ายเราฟ้อง)</option>
                          <option value="DEFENDANT">จำเลย (ฝ่ายเราถูกฟ้อง)</option>
                        </select>
                      </div>
                    </div>
                  </fieldset>

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
                    <p className="text-xs text-muted-foreground">หมายเลขคดีดำ</p>
                    <p className="font-medium">{legalCase.blackCaseNumber ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">หมายเลขคดีแดง</p>
                    <p className="font-medium">{legalCase.redCaseNumber ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">เลขอ้างอิงสำนักงาน</p>
                    <p className="font-medium">{legalCase.ownRef}</p>
                    <p className="mt-1 text-xs text-muted-foreground">แฟ้ม {legalCase.folderId ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ประเภทคดี</p>
                    <p className="font-medium">{legalCase.caseType?.name ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Policy Ref</p>
                    <p className="font-medium">{policyRef}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Customer Ref</p>
                    <p className="font-medium">{legalCase.customerRef ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ระดับศาล</p>
                    <p className="font-medium">
                      {legalCase.courtLevel ? COURT_LEVEL_LABELS[legalCase.courtLevel] : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ศาล</p>
                    <p className="font-medium">{legalCase.courtName ?? '—'}</p>
                  </div>
                  <CaseParticipantsSection
                    caseId={legalCase.id}
                    initialParticipants={legalCase.participants}
                  />
                  <div className="col-span-full">
                    <p className="text-xs text-muted-foreground">ข้อหาหรือฐานความผิด</p>
                    <p className="font-medium">{chargeSection}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ทุนทรัพย์</p>
                    <p className="font-medium">{legalCase.claimedAmount != null ? formatCurrency(legalCase.claimedAmount) : 'ยังไม่ระบุ'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ฝ่ายเรา</p>
                    <p className="font-medium">
                      {legalCase.partyRole === 'PLAINTIFF' ? 'โจทก์' : legalCase.partyRole === 'DEFENDANT' ? 'จำเลย' : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ชื่อลูกความ</p>
                    <p className="font-medium">{clientDisplay}</p>
                    {legalCase.client?.contacts && legalCase.client.contacts.length > 0 && (
                      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {legalCase.client.contacts.slice(0, 2).map((c, i) => (
                          <p key={i}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</p>
                        ))}
                      </div>
                    )}
                    {legalCase.additionalClients && legalCase.additionalClients.length > 0 && (
                      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {legalCase.additionalClients.map((ac) => (
                          <p key={ac.id}>และ {ac.client.name}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ลูกค้า (ผู้ว่าจ้าง)</p>
                    <p className="font-medium">{customerDisplay ?? '—'}</p>
                  </div>
              <div className="col-span-full rounded-lg border border-border bg-muted/30 p-3">
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
                      <p className="text-xs text-muted-foreground">ทนายผู้รับผิดชอบ</p>
                      <p className="font-medium">
                        {legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}
                      </p>
                    </div>
                    {legalCase.assignments.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground">ทนายผู้ช่วย</p>
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
                        ทนายผู้รับผิดชอบ
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
                        ทนายผู้ช่วย
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
                <p className="text-xs text-muted-foreground">รายได้โดยประมาณ</p>
                <p className="font-medium text-green-600">
                  {legalCase.estimatedFee != null
                    ? formatCurrency(legalCase.estimatedFee)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ค่าใช้จ่ายที่อนุมัติ</p>
                <p className="font-medium text-primary">{formatCurrency(totalSpent)}</p>
              </div>
              {customFields && Object.entries(customFields).filter(([key]) => key !== CASE_COSTS_KEY && key !== 'chargeSection').map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="font-medium">{v}</p>
                </div>
              ))}
                </>
              )}
              {editingOverview && (
                <CaseParticipantsSection
                  caseId={legalCase.id}
                  initialParticipants={legalCase.participants}
                />
              )}
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-4">
          {legalCase.intake && preFiling && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">หนังสือทวงถาม (Notice)</CardTitle>
                <div className="flex gap-2">
                  <Link href={`/intake/${legalCase.intake.id}`}>
                    <Button variant="outline" size="sm">✦ AI ร่างหนังสือ</Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => setPreLitOpen(true)}>อัปเดตสถานะเจรจา</Button>
                  <Button size="sm" onClick={() => setNoticeOpen(true)}>+ ออก Notice {legalCase.intake.noticeIssuedAt ? 'ฉบับใหม่' : ''}</Button>
                </div>
              </CardHeader>
              <CaseNoticeDialog
                intakeId={legalCase.intake.id}
                defaultRecipient={legalCase.intake.noticeRecipient}
                open={noticeOpen}
                onClose={() => setNoticeOpen(false)}
                onDone={loadCase}
              />
              <PreLitigationUpdateDialog
                intakeId={legalCase.intake.id}
                currentStatus={legalCase.intake.preLitigationStatus}
                currentOffer={legalCase.intake.settlementOfferAmount}
                open={preLitOpen}
                onClose={() => setPreLitOpen(false)}
                onDone={loadCase}
              />
              <CardContent className="space-y-2 text-sm">
                {legalCase.intake.noticeIssuedAt ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">ฉบับล่าสุด</span>
                    <span>
                      ถึง {legalCase.intake.noticeRecipient ?? '—'} · ออก {new Date(legalCase.intake.noticeIssuedAt).toLocaleDateString('th-TH')}
                      {legalCase.intake.noticeDeadline ? ` · ครบกำหนด ${new Date(legalCase.intake.noticeDeadline).toLocaleDateString('th-TH')}` : ''}
                    </span>
                    <span className="ml-auto flex gap-3">
                      <Link href={`/intake/${legalCase.intake.id}`} className="text-xs text-primary hover:underline">ดูหนังสือ</Link>
                      <button type="button" className="text-xs text-primary hover:underline" onClick={() => setPreLitOpen(true)}>บันทึกผล</button>
                    </span>
                  </div>
                ) : (
                  <p className="text-muted-foreground">ยังไม่ออกหนังสือ — ออกตอนไหนก็ได้ กดปุ่มด้านบน</p>
                )}
                <p className="text-xs text-muted-foreground">
                  สถานะเจรจา: {legalCase.intake.preLitigationStatus ? (PRE_LITIGATION_STATUS_LABELS[legalCase.intake.preLitigationStatus] ?? legalCase.intake.preLitigationStatus) : '—'}
                  {legalCase.intake.settlementOfferAmount != null && ` · ข้อเสนอจ่ายล่าสุด ${legalCase.intake.settlementOfferAmount.toLocaleString('th-TH')} บาท`}
                  {' · '}ออกได้หลายฉบับ ทุกฉบับเก็บประวัติที่นี่
                </p>
              </CardContent>
            </Card>
          )}
          {/* ใช้เป็นครั้งคราว — พับไว้ให้หน้าโล่ง */}
          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              ประมาณการค่าใช้จ่ายคดี <span className="font-normal text-muted-foreground">· กดเพื่อดู/แก้ไข</span>
            </summary>
            <div className="border-t border-border p-4">
              <SavedCaseCostCalculator key={legalCase.id} caseId={id} customFields={customFields} onSaved={loadCase} />
            </div>
          </details>
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">ความเคลื่อนไหวคดี</CardTitle>
              <Button variant="outline" size="sm" onClick={openActivityForm}>
                <Plus className="h-3 w-3" />เพิ่มกิจกรรม
              </Button>
            </CardHeader>
            <CardContent>
              {showActivityForm && (
                <form onSubmit={handleAddActivity} className="mb-4 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">เพิ่มกิจกรรม</p>
                    <p className="text-xs text-muted-foreground">บันทึกลงความเคลื่อนไหวและปฏิทิน</p>
                    <button type="button" aria-label="ยกเลิกเพิ่มกิจกรรม" onClick={() => setShowActivityForm(false)}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                  <Input
                    required
                    placeholder="หัวข้อ เช่น นัดสืบพยาน"
                    value={activityForm.title}
                    onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground">ประเภท</label>
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
                    <div className="sm:col-span-2">
                      <label className="text-xs text-muted-foreground">วันที่และเวลา</label>
                      <ThaiDateTimeInput
                        required
                        value={activityForm.activityAt}
                        onChange={(v) => setActivityForm({ ...activityForm, activityAt: v })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <textarea
                    placeholder="รายละเอียด (ไม่บังคับ)"
                    value={activityForm.description}
                    onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none"
                  />
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? 'กำลังบันทึก...' : 'บันทึกกิจกรรม'}
                  </Button>
                </form>
              )}

              <div className="space-y-4">
                {(showAllTimeline ? timeline : timeline.slice(0, 6)).map((item) => {
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
                {timeline.length > 6 && (
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => setShowAllTimeline((v) => !v)}
                  >
                    {showAllTimeline ? 'แสดงเฉพาะรายการล่าสุด' : `ดูทั้งหมด (${timeline.length} รายการ)`}
                  </button>
                )}
                {timeline.length <= 1 && (
                  <InlineEmptyState title="ยังไม่มีกิจกรรม" description="เพิ่มนัดหมายหรือบันทึกความคืบหน้าเพื่อเริ่มติดตามคดี" />
                )}
              </div>
            </CardContent>
          </Card>

          {legalCase.description && (
            <Card>
              <CardHeader><CardTitle className="text-sm">รายละเอียดคดี</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{legalCase.description}</p>
              </CardContent>
            </Card>
          )}

          {latestPrecedentAnalysis && (
            <Card id="case-analyses" className="scroll-mt-24">
              {/* ยาวหลายจอ — พับไว้ก่อน หัวการ์ดบอกวันที่พอให้รู้ว่ามีผลล่าสุด */}
              <details>
                <summary className="cursor-pointer list-none px-6 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{d.admin.precedentAnalysis}</span>
                    <span className="text-xs text-muted-foreground">
                      วิเคราะห์เมื่อ {formatDateTime(latestPrecedentAnalysis.createdAt)} · กดเพื่อดู
                    </span>
                  </span>
                </summary>
              <CardContent className="space-y-3">
                {latestPrecedentAnalysis.documentSummary && (
                  <div>
                    <p className="text-sm font-medium">📝 {d.admin.documentEventSummary}</p>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm leading-relaxed">
                      {latestPrecedentAnalysis.documentSummary}
                    </p>
                  </div>
                )}

                <AnalysisFactsTimeline analysis={latestPrecedentAnalysis} />

                <div className={latestPrecedentAnalysis.documentSummary ? 'border-t border-border pt-3' : undefined}>
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
                  <RelatedStatutes precedents={latestPrecedentAnalysis.precedents} />
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
              </details>
            </Card>
          )}
          </div>
        </section>

        <aside className={styles.actionRail} aria-label="สิ่งที่ต้องทำต่อ" data-testid="case-action-rail">
          <Card className={styles.actionSection}>
            <CardHeader>
              <CardTitle className="text-sm">
                เช็คลิสต์คดี
                {(() => {
                  const done = checklistTasks.filter((t) => t.status === 'DONE').length + requiredDocs.required.filter((r) => r.present).length;
                  const total = checklistTasks.length + requiredDocs.required.length;
                  return total > 0 ? ` (${done}/${total})` : '';
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {checklistTasks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      สถานะงาน
                      <select
                        aria-label="กรองตามสถานะงาน"
                        value={checklistStatusFilter}
                        onChange={(event) => setChecklistStatusFilter(event.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground"
                      >
                        <option value="ALL">ทุกสถานะ</option>
                        {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-muted-foreground">
                      เจ้าของงาน
                      <select
                        aria-label="กรองตามเจ้าของงาน"
                        value={checklistOwnerFilter}
                        onChange={(event) => setChecklistOwnerFilter(event.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground"
                      >
                        <option value="ALL">ทุกคน</option>
                        {checklistOwners.map((owner) => (
                          <option key={owner.id} value={owner.id}>{owner.firstName} {owner.lastName}</option>
                        ))}
                        {checklistTasks.some((task) => !task.assignee) && <option value="UNASSIGNED">ยังไม่มอบหมาย</option>}
                      </select>
                    </label>
                  </div>
                  {filteredChecklistTasks.map((t) => (
                    <label
                      key={t.id}
                      data-testid="case-checklist-task"
                      data-status={t.status}
                      data-assignee-id={t.assignee?.id ?? 'UNASSIGNED'}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={t.status === 'DONE'}
                        onChange={() => toggleChecklistTask(t)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className={t.status === 'DONE' ? 'text-muted-foreground line-through' : ''}>{t.title}</span>
                      {t.assignee && <span className="text-xs text-muted-foreground">· {t.assignee.firstName}</span>}
                    </label>
                  ))}
                  {filteredChecklistTasks.length === 0 && (
                    <p className="py-2 text-sm text-muted-foreground">ไม่พบงานตามตัวกรอง</p>
                  )}
                </div>
              )}
              {requiredDocs.required.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">เอกสารที่ต้องมี</p>
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => selectTab('documents')}>
                      เอกสารทั้งหมด →
                    </button>
                  </div>
                  {requiredDocs.required.map((r) => (
                    <label key={r.category} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={r.present}
                        onChange={() => toggleRequiredDoc(r.category, r.present)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className={r.present ? 'text-muted-foreground line-through' : ''}>{documentCategoryLabel(r.category)}</span>
                    </label>
                  ))}
                  <DocumentDropZone
                    multiple
                    loading={uploadingDocs}
                    onFiles={handleQuickUpload}
                  />
                  {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
                </div>
              )}
              {!hasAppliedPlaybook && playbooks.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-2">
                  <p className="text-xs font-medium text-muted-foreground">เลือก Playbook (ใช้ได้ครั้งเดียวต่อคดี)</p>
                  <div className="flex gap-2">
                    <select
                      className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm"
                      value={pendingPlaybookId}
                      disabled={applyingPlaybook}
                      onChange={(e) => setPendingPlaybookId(e.target.value)}
                    >
                      <option value="">— เลือก Playbook —</option>
                      {playbooks.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} · v{p.version}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      disabled={!pendingPlaybookId || applyingPlaybook}
                      onClick={() => applyPlaybook(pendingPlaybookId)}
                    >
                      {applyingPlaybook ? 'กำลังใช้…' : 'ยืนยันใช้'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className={styles.actionSection}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">รายการงานคดี</CardTitle>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => selectTab('tasks')}
              >
                ดูทั้งหมด
              </button>
            </CardHeader>
            <CardContent className="space-y-2">
              {nextActionTasks.slice(0, 3).map((t) => (
                <button
                  type="button"
                  onClick={() => selectTab('tasks')}
                  key={t.id}
                  className="flex w-full items-start gap-3 rounded-lg border border-border px-3 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{t.dueDate ? `กำหนดส่ง ${formatDate(t.dueDate)}` : 'ยังไม่กำหนดวันส่ง'}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{TASK_STATUS_LABELS[t.status] ?? t.status}</span>
                </button>
              ))}
              {nextActionTasks.length === 0 && (
                <InlineEmptyState title="ยังไม่มีรายการงานคดี" description="พิมพ์ด้านล่างเพื่อเพิ่มงานแรก" />
              )}
              <div className="space-y-2 border-t border-border pt-3">
                <input
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addQuickTask();
                    }
                  }}
                  placeholder="เพิ่มงานคดี — พิมพ์แล้วกด Enter"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                <select
                  value={quickTaskAssignee}
                  onChange={(e) => setQuickTaskAssignee(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                  aria-label="ผู้รับผิดชอบ"
                >
                  <option value="">ฉันเอง</option>
                  {lawyers.map((u) => (
                    <option key={u.id} value={u.id}>{u.firstName}</option>
                  ))}
                </select>
                <ThaiDateInput value={quickTaskDue} onChange={setQuickTaskDue} />
                <Button type="button" size="sm" className="ml-auto" onClick={addQuickTask} disabled={!quickTaskTitle.trim() || quickTaskBusy}>
                  เพิ่ม
                </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">แนบไฟล์ได้หลังสร้าง — กดที่งานเพื่อเปิดรายละเอียด</p>
            </CardContent>
          </Card>

          <Card className={styles.actionSection}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">นัดหมาย</CardTitle>
              <Button size="sm" variant="outline" onClick={() => selectTab('calendar')}>+ เพิ่มนัด</Button>
            </CardHeader>
            <CardContent>
              {upcomingEvents.length > 0 ? (
                upcomingEvents.slice(0, 3).map((e) => (
                  <div key={e.id} className="mb-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(e.startAt)}</p>
                  </div>
                ))
              ) : (
                <InlineEmptyState title="ไม่มีนัดที่จะถึง" description="เพิ่มนัดศาลหรือนัดลูกค้าจากปฏิทินคดีนี้" />
              )}
              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => selectTab('calendar')}>
                <CalendarDays className="h-4 w-4" />เปิดปฏิทิน
              </Button>
            </CardContent>
          </Card>

          <Card className={styles.actionSection}>
            <CardHeader><CardTitle className="text-sm">บันทึกย่อ</CardTitle></CardHeader>
            <CardContent>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เพิ่มบันทึกย่อ..."
                rows={3}
                aria-label="บันทึกย่อ"
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
                {savingNote ? 'กำลังบันทึก...' : 'บันทึก'}
              </Button>
            </CardContent>
          </Card>

        </aside>
      </div>

      <div className="mt-6 space-y-6">
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            สายติดต่อลูกความ <span className="font-normal text-muted-foreground">· กดเพื่อดูประวัติการติดต่อ</span>
          </summary>
          <div className="border-t border-border p-4">
            <CaseMessagesPanel caseId={id} />
          </div>
        </details>
      </div>
      </div>
      )}

      {/* AI file analysis opens as a right panel so the case page URL and
          overview stay put — helper work, not a navigation target. */}
      {showAiAnalysis && (
        <>
          <button
            type="button"
            aria-label="ปิดแผงวิเคราะห์ AI"
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setShowAiAnalysis(false)}
          />
          <aside
            id="case-ai-analysis-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-ai-analysis-title"
            className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-card sm:top-14"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p id="case-ai-analysis-title" className="text-sm font-semibold">
                    วิเคราะห์เนื้อหาไฟล์ด้วย AI
                  </p>
                  <p className="text-xs text-muted-foreground">สรุปเอกสารในคดีนี้</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="ปิด"
                onClick={() => setShowAiAnalysis(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
              <BatchAnalysisPanel caseId={id} />
            </div>
          </aside>
        </>
      )}

      {recordingOutcome && (
        <RecordHearingOutcomeDialog
          legalCase={legalCase}
          onClose={() => setRecordingOutcome(false)}
          onSaved={loadCase}
        />
      )}

    </div>
  );
}
