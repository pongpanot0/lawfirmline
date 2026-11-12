'use client';

import { ThaiDateField } from '@/components/ui/ThaiDateField';
import dynamic from 'next/dynamic';
const CaseMessagesPanel = dynamic(() => import('@/components/cases/CaseMessagesPanel').then((m) => m.CaseMessagesPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
import { CaseTabBar } from '@/components/case-page/CaseTabBar';
import { CaseMoreMenu } from '@/components/case-page/CaseMoreMenu';
import { CaseSectionContent } from '@/components/case-page/CaseSectionContent';
import { CaseJourneyPanel } from '@/components/journey/CaseJourneyPanel';
import { daysUntil } from '@/components/process/helpers';
import { StepTracker } from '@/components/process/StepTracker';
import v2 from '@/components/case-page/v2.module.css';
import { OwnerPicker } from '@/components/cases/OwnerPicker';
import { canChangeOwner } from '@/components/journey/case-journey-helpers';
import { allowedStageChange } from '@/components/journey/allowed-stage-change';

import { SavedCaseCostCalculator } from '@/components/cases/CaseCostCalculator';
import { CasePrintForms } from '@/components/cases/CasePrintForms';
import { CaseOverviewForm, caseOverviewCustomFields, type CaseOverviewCustomerValue } from '@/components/cases/CaseOverviewForm';
import { CaseProceedingsCard } from '@/components/cases/CaseProceedingsCard';
import { PaperFileCard } from '@/components/cases/PaperFileCard';
import { CaseBriefCard } from '@/components/cases/CaseBriefCard';
import { LitigationCalculatorsCard } from '@/components/cases/LitigationCalculatorsCard';
import { CaseSummaryPanel } from '@/components/cases/CaseSummaryPanel';
import { RelatedStatutes } from '@/components/intake/RelatedStatutes';
import { AnalysisFactsTimeline } from '@/components/intake/AnalysisFactsTimeline';
import { CASE_COSTS_KEY } from '@/lib/case-costs';
import { BatchAnalysisPanel } from '@/components/documents/BatchAnalysisPanel';
import { RecordHearingOutcomeDialog } from '@/components/cases/RecordHearingOutcomeDialog';
import { CaseNoticeDialog, PreLitigationUpdateDialog } from '@/components/cases/CaseNoticeDialog';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { AssigneeOptions } from '@/components/ui/AssigneeOptions';
import { useLeaveFlags } from '@/lib/use-leave-flags';
import { leaveWarning } from '@/lib/leave-flags';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { PRE_LITIGATION_STATUS_LABELS } from '@/lib/pre-litigation';
import { useEffect, useState, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
  Trash2,
  Mail,
  ArrowLeft,
  BookOpen,
  ScrollText,
  AlertTriangle,
  ChevronRight,
  Upload, CircleHelp, GitBranch, Users, Printer, Archive, FolderOpen,
  ArrowRight, User, Scale, Briefcase, Wallet, Ship,
} from 'lucide-react';
import {
  ActivityType,
  CaseStatus,
  CourtLevel,
  COURT_LEVEL_LABELS,
  CASE_NUMBER_HINT,
  courtFee,
  hasFirmCapability,
  isBackwardStage,
  PARTY_ROLE_LABELS,
  type PartyRole,
} from '@lawfirm/shared';
import { additionalClientsPatch, limitationPatch } from '@/lib/case-overview';
import {
  CASE_TAB_LABELS,
  caseTabHref,
  parseCaseTab,
  type CaseTabId,
} from '@/lib/case-tabs';
import { emailTimelineItems, type EmailTimelineItem } from '@/lib/case-email';
import { buildCasePrioritySummary } from '@/lib/case-workbench';
import './tokens.css';
import styles from './case-detail.module.css';

import { useAuth } from '@/lib/auth';
import { latestPlaybookReleases, PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import {
  api,
  CaseDetail,
  TaskItem,
  CaseActivityItem,
  UserItem,
  type AssigneeLoad,
  CaseTypeItem,
  CourtItem,
  ClientItem,
  ApiError,
  IntakePrecedentAnalysisItem,
  type CaseOutstandingResult,
  type RequiredDocumentsResult,
  type StageTaskProposal,
  type StageTaskDraft,
  type CaseJourney,
} from '@/lib/api';
import { StageTasksDialog } from '@/components/cases/StageTasksDialog';
import { caseStageLabel, caseStageOptions, documentCategoryLabel } from '@/lib/stage-labels';
import { formatCustomers, customersSameAsClient } from '@/lib/customers';
import { CaseStatusBadge } from '@/components/samnuan/CaseStatusBadge';
import { CaseParticipantsSection } from '@/components/cases/CaseParticipantsSection';
import { AiTrayCards } from '@/components/ai/AiTrayCards';
import { CaseNumberInline } from '@/components/cases/CaseNumberInline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ThaiDateTimeInput } from '@/components/ui/ThaiDateTimeInput';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { confirmDialog } from '@/lib/confirm-dialog';
import { Select } from '@/components/ui/select';

const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: 'ยังไม่เริ่ม',
  IN_PROGRESS: 'กำลังทำ',
  PENDING_REVIEW: 'รอตรวจ',
  NEEDS_REVISION: 'ต้องแก้ไข',
  DONE: 'เสร็จแล้ว',
};

const ACTIVITY_LABELS: Record<string, string> = {
  COURT_DATE: 'นัดศาล',
  CLIENT_MEETING: 'นัดลูกความ',
  FILING: 'ยื่นคำร้อง',
  DEADLINE: 'กำหนดส่ง',
  NOTE: 'บันทึก',
  OTHER: 'อื่นๆ',
  EMAIL: 'อีเมล',
};

const ACTIVITY_ICONS: Record<string, typeof Gavel> = {
  COURT_DATE: CalendarDays,
  CLIENT_MEETING: CalendarDays,
  FILING: FileText,
  DEADLINE: CalendarDays,
  NOTE: StickyNote,
  OTHER: FileText,
  EMAIL: Mail,
};

type CloseReason = 'NOT_RETAINED' | 'DONE' | 'OTHER';
const CLOSE_REASONS: { value: CloseReason; label: string; hint: string; summary: string }[] = [
  { value: 'NOT_RETAINED', label: 'ไม่จ้างทำต่อ', hint: 'ลูกความเลิกจ้างกลางทาง', summary: 'ลูกความแจ้งว่าไม่จ้างทำต่อ' },
  { value: 'DONE', label: 'ให้ปิดคดี — งานจบแล้ว', hint: 'เช่น ได้รับชำระครบ หรือยอมความกันได้', summary: 'ลูกความแจ้งให้ปิดคดี งานจบแล้ว' },
  { value: 'OTHER', label: 'อื่น ๆ', hint: 'ระบุในหมายเหตุ', summary: 'ปิดคดี' },
];

const thaiShortDate = (value: string) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });

export default function CaseDetailPage() {
  const d = useDashboardT();
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.has('task') ? 'tasks' : parseCaseTab(searchParams.get('tab'));
  const selectTab = (tab: CaseTabId) => {
    router.replace(`/cases/${id}?tab=${tab}`, { scroll: false });
  };
  const [legalCase, setCase] = useState<CaseDetail | null>(null);
  const [activities, setActivities] = useState<CaseActivityItem[]>([]);
  const [emailTimeline, setEmailTimeline] = useState<EmailTimelineItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [checklistStatusFilter, setChecklistStatusFilter] = useState('ALL');
  const [checklistOwnerFilter, setChecklistOwnerFilter] = useState('ALL');
  const [requiredDocs, setRequiredDocs] = useState<RequiredDocumentsResult>({ required: [], missing: [] });
  const [playbooks, setPlaybooks] = useState<PlaybookRelease[]>([]);
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
  const [focusMissing, setFocusMissing] = useState<string | null>(null);
  useEffect(() => {
    if (!editingOverview || activeTab !== 'overview' || !focusMissing) return;
    const form = document.querySelector('[data-testid=case-information-edit]');
    const schema = Array.isArray(legalCase?.caseType?.fieldSchema) ? legalCase.caseType.fieldSchema as Array<{key: string; label: string}> : [];
    const key = schema.find((field) => field.label === focusMissing)?.key;
    const label = key === 'chargeSection' ? 'ข้อหาหรือฐานความผิด' : key === 'incidentDate' ? 'วันเกิดเหตุ' : key === 'estimatedDamage' ? 'มูลค่าความเสียหาย' : focusMissing;
    const field = (key && document.getElementById(`custom-${key}`)) || [...(form?.querySelectorAll('label') ?? [])].find((item) => item.textContent?.trim().startsWith(label))?.querySelector<HTMLElement>('input, select, textarea');
    field?.focus();
    setFocusMissing(null);
  }, [editingOverview, activeTab, focusMissing, legalCase]);
  const [editingOwner, setEditingOwner] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState('');
  const [handedOver, setHandedOver] = useState(false);
  const [limitationIncomplete, setLimitationIncomplete] = useState(false);
  const [savingOverview, setSavingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
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
    chargeSection: '',
    estimatedFee: '',
    description: '',
    incidentDate: '',
    estimatedDamage: '',
    limitationDeadline: '',
    additionalClientIds: [] as string[],
    clientId: '',
    clientName: '',
    customFields: {} as Record<string, string>,
    customers: [] as CaseOverviewCustomerValue[],
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
  const [closingOutcome, setClosingOutcome] = useState('WITHDRAWN');
  const [closeReason, setCloseReason] = useState<CloseReason>('NOT_RETAINED');
  /** ของค้างตอนกดปิดคดี — โหลดตอนเปิดฟอร์ม ไม่ใช่ทุกครั้งที่หน้า render */
  const [outstanding, setOutstanding] = useState<CaseOutstandingResult | null>(null);
  const [ackOutstanding, setAckOutstanding] = useState(false);
  const [outstandingFailed, setOutstandingFailed] = useState(false);
  const [removeFutureEvents, setRemoveFutureEvents] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [journeyAdvance, setJourneyAdvance] = useState<{ stage: string; explicit?: 'APPEAL' | 'SUPREME' } | null>(null);
  const [movedStage, setMovedStage] = useState<string | null>(null);
  const [journeyState, setJourneyState] = useState<CaseJourney | null>(null);
  const [menuPanel, setMenuPanel] = useState<'stage' | 'print' | 'paper' | null>(null);
  const [stageTaskProposals, setStageTaskProposals] = useState<StageTaskProposal[]>([]);
  const [bannerProposals, setBannerProposals] = useState<StageTaskProposal[]>([]);
  const [stageTaskError, setStageTaskError] = useState('');
  const [editingTeam, setEditingTeam] = useState(false);
  const [managingTeam, setManagingTeam] = useState(false);
  const [teamPeople, setTeamPeople] = useState<AssigneeLoad[]>([]);
  const [savingTeam, setSavingTeam] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskAssignee, setQuickTaskAssignee] = useState('');
  const [quickTaskDue, setQuickTaskDue] = useState('');
  const [quickTaskBusy, setQuickTaskBusy] = useState(false);
  const quickTaskDate = quickTaskDue || bangkokDateInputValue(new Date());
  const quickTaskLeaveFlags = useLeaveFlags(token, quickTaskDate);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [teamForm, setTeamForm] = useState({ leadLawyerId: '', buddyIds: [] as string[] });
  const [activityForm, setActivityForm] = useState({
    title: '',
    description: '',
    activityAt: '',
    type: ActivityType.OTHER as string,
  });

  // Drop the previous case's email rows immediately when navigating to another case.
  useEffect(() => {
    setEmailTimeline([]);
  }, [id]);

  const loadCase = () => {
    if (!token || !id) return;
    // Non-blocking: a failure here must not break the rest of the case page.
    api
      .listCasePrecedentAnalyses(token, id)
      .then(setPrecedentAnalyses)
      .catch(() => setPrecedentAnalyses([]));
    api.getCaseComments(token, id).then((comments) => setCommentCount(comments.length)).catch(() => setCommentCount(null));
    api.getRequiredDocuments(token, id).then(setRequiredDocs).catch(() => setRequiredDocs({ required: [], missing: [] }));
    api.getCaseEmailThreads(token, id).then((t) => setEmailTimeline(emailTimelineItems(t))).catch(() => setEmailTimeline([]));
    setupRequest<PlaybookRelease[]>(token, '/playbooks').then(items => setPlaybooks(latestPlaybookReleases(items))).catch(() => setPlaybooks([]));
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

  // ขั้นเปลี่ยนจากทางไหนก็ได้ (ปิดคดี, แปลงเรื่องรับเข้า, ...) — ถ้ายังไม่ได้จัดการงานแนะนำของขั้นนี้ให้เสนอ
  useEffect(() => {
    const stage = legalCase?.stage;
    if (!token || !id || !stage || stage === legalCase?.stageTasksHandledFor) {
      setBannerProposals([]);
      return;
    }
    let active = true;
    api
      .getStageTaskProposals(token, id, stage)
      .then((p) => {
        if (active) setBannerProposals(p);
      })
      .catch((err) => {
        console.error(err);
        if (active) setBannerProposals([]);
      });
    return () => {
      active = false;
    };
  }, [token, id, legalCase?.stage, legalCase?.stageTasksHandledFor]);

  const openBannerProposals = () => {
    if (!legalCase?.stage) return;
    if (lawyers.length === 0) api.getLawyers(token!).then(setLawyers).catch(() => {});
    setStageTaskError('');
    setStageTaskProposals(bannerProposals);
    setPendingStage(legalCase.stage);
  };

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
    if (token && teamPeople.length === 0) {
      setLoadingTeam(true);
      api.getAssignees(token)
        .then(setTeamPeople)
        .catch((err) => setTeamError(err instanceof Error ? err.message : 'โหลดรายชื่อทีมไม่สำเร็จ ลองใหม่อีกครั้ง'))
        .finally(() => setLoadingTeam(false));
    }
    setEditingTeam(true);
  };

  const handleSaveTeam = async () => {
    if (!token || !id || !teamForm.leadLawyerId) return;
    setSavingTeam(true);
    setTeamError('');
    try {
      const buddyIds = teamForm.buddyIds.filter((uid) => uid !== teamForm.leadLawyerId);
      const updated = await api.updateCaseAssignments(token, id, buddyIds);
      // Merge, don't replace: the assignments response omits tasks/calendarEvents/activities.
      setCase((prev) =>
        prev ? { ...prev, leadLawyer: updated.leadLawyer, assignments: updated.assignments } : prev,
      );
      setEditingTeam(false);
    } catch (err) {
      setTeamError(err instanceof ApiError ? err.message : 'บันทึกทีมไม่สำเร็จ ลองใหม่อีกครั้ง');
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
      createdBy?: CaseActivityItem['createdBy'];
      from?: string;
      isOpened?: boolean;
    }> = [
      ...(activities.some((activity) => activity.title === 'เปิดคดี') ? [] : [{
        id: 'opened',
        label: 'เปิดคดี',
        date: legalCase?.openedAt ?? '',
        type: 'case',
        isOpened: true,
      }]),
      ...activities.map((a) => ({
        id: a.id,
        label: a.title,
        date: a.activityAt,
        type: a.type,
        createdBy: a.createdBy,
      })),
      ...emailTimeline,
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
  }, [legalCase?.openedAt, legalCase?.status, legalCase?.closedAt, activities, emailTimeline]);

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

  /** A failed check must not trap the case open: the API checks outstanding items again on close. */
  const loadOutstanding = async () => {
    setOutstanding(null);
    setOutstandingFailed(false);
    if (!token || !id) return;
    try {
      setOutstanding(await api.getCaseOutstanding(token, id));
    } catch {
      setOutstandingFailed(true);
    }
  };

  const openCloseCase = () => { setCloseError(''); setCloseReason('NOT_RETAINED'); setClosingOutcome('WITHDRAWN'); setClosingSummary(''); setShowCloseForm(true); setAckOutstanding(false); setRemoveFutureEvents(false); void loadOutstanding(); };

  const handleCloseCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) return;
    if (closingCase) return;
    if (!outstanding && !outstandingFailed) { setCloseError('กำลังตรวจของค้างในคดี รอสักครู่แล้วกดอีกครั้ง'); return; }
    const reason = CLOSE_REASONS.find((r) => r.value === closeReason);
    if (!reason) { setCloseError('เลือกว่าลูกความแจ้งว่าอะไรก่อนปิดคดี'); return; }
    if (!closingOutcome) { setCloseError('เลือกผลของคดีก่อนปิด'); return; }
    if (closeReason === 'OTHER' && !closingSummary.trim()) { setCloseError('เลือก “อื่น ๆ” แล้ว ใส่หมายเหตุว่าลูกความแจ้งว่าอะไร'); return; }
    if (outstanding && outstanding.total > 0 && !ackOutstanding) { setCloseError('ติ๊ก “ตรวจแล้ว ปิดคดีได้” ก่อน — ยังมีของค้างในคดีนี้'); return; }
    setClosingCase(true);
    setCloseError('');
    try {
      await api.closeCase(token, id, `${reason.summary}${closingSummary.trim() ? ` — ${closingSummary.trim()}` : ''}`, {
        outcome: closingOutcome,
        acknowledgeOutstanding: ackOutstanding || undefined,
        removeFutureEvents,
      });
      setShowCloseForm(false);
      setClosingSummary('');
      setAckOutstanding(false);
      setRemoveFutureEvents(false);
      loadCase();
    } catch (err) {
      // The API refuses to close over outstanding items and returns them — show them so the lawyer can acknowledge.
      const found = err instanceof ApiError ? (err.body as { outstanding?: CaseOutstandingResult } | undefined)?.outstanding : undefined;
      if (found) { setOutstanding(found); setOutstandingFailed(false); }
      setCloseError(err instanceof ApiError ? err.message : 'ปิดคดีไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setClosingCase(false);
    }
  };

  /** false = the user cancelled the backward-move reason prompt; nothing was saved, so callers must stop. */
  const applyStageChange = async (stage: string): Promise<boolean> => {
    if (!token || !id) return false;
    let stageNote: string | undefined;
    if (isBackwardStage(legalCase?.stage, stage)) {
      stageNote = window.prompt('ย้ายขั้นตอนย้อนกลับ — ระบุเหตุผล (จะบันทึกในประวัติคดี)')?.trim();
      if (!stageNote) return false;
    }
    await api.updateCase(token, id, { stage, ...(stageNote ? { stageNote } : {}) });
    loadCase();
    return true;
  };

  const handleStageChange = async (stage: string) => {
    if (!token || !id || stage === legalCase?.stage) return;
    setSavingStage(true);
    setStageTaskError('');
    try {
      let proposals: StageTaskProposal[] = [];
      try {
        proposals = await api.getStageTaskProposals(token, id, stage);
      } catch (err) {
        console.error(err);
      }
      if (!proposals.length) {
        await applyStageChange(stage);
        return;
      }
      if (lawyers.length === 0) {
        api.getLawyers(token).then(setLawyers).catch(() => {});
      }
      setStageTaskError('');
      setStageTaskProposals(proposals);
      setPendingStage(stage);
    } catch (err) {
      setStageTaskError(err instanceof ApiError ? err.message : 'ย้ายขั้นไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSavingStage(false);
    }
  };

  const confirmJourneyAdvance = async (stage: string, explicit?: 'APPEAL' | 'SUPREME') => {
    if (!token || savingStage) return;
    setSavingStage(true); setStageTaskError('');
    try {
      const proposals = await api.getStageTaskProposals(token, id, stage);
      if (lawyers.length === 0) api.getLawyers(token).then(setLawyers).catch(() => {});
      setStageTaskProposals(proposals); setJourneyAdvance({ stage, explicit }); setPendingStage(stage);
    } catch (err) { setStageTaskError(err instanceof ApiError ? err.message : 'โหลดงานแนะนำไม่สำเร็จ'); }
    finally { setSavingStage(false); }
  };

  const movePendingStage = async (stage: string) => {
    if (journeyAdvance?.stage === stage && token) {
      await api.advanceCaseJourney(token, id, journeyAdvance.explicit);
      setJourneyAdvance(null);
      setMovedStage(stage);
      loadCase();
      return true;
    }
    return applyStageChange(stage);
  };

  const closeStageTaskDialog = () => {
    setJourneyAdvance(null);
    setMovedStage(null);
    setPendingStage(null);
    setStageTaskProposals([]);
    setStageTaskError('');
  };

  const handleStageOnly = async () => {
    if (!token || !id || !pendingStage) return;
    setSavingStage(true);
    try {
      if (pendingStage !== legalCase?.stage && pendingStage !== movedStage && !(await movePendingStage(pendingStage))) return;
      await api.dismissStageTasks(token!, id!, pendingStage).catch(console.error);
      loadCase();
      closeStageTaskDialog();
    } catch (err) {
      console.error(err);
      setPendingStage(null);
      setStageTaskError(err instanceof ApiError ? err.message : 'ย้ายขั้นไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSavingStage(false);
    }
  };

  const handleStageAndCreateTasks = async (tasks: StageTaskDraft[]) => {
    if (!token || !id || !pendingStage) return;
    setSavingStage(true);
    setStageTaskError('');
    const moving = pendingStage !== legalCase?.stage && pendingStage !== movedStage;
    try {
      if (moving && !(await movePendingStage(pendingStage))) return;
      try {
        await api.createStageTasks(token, id, pendingStage, tasks);
        loadCase();
      } catch (err) {
        console.error(err);
        setStageTaskError(moving ? 'ย้ายขั้นแล้ว แต่สร้างงานไม่สำเร็จ' : 'สร้างงานไม่สำเร็จ ลองใหม่อีกครั้ง');
        return;
      }
      closeStageTaskDialog();
    } catch (err) {
      console.error(err);
      setPendingStage(null);
      setStageTaskError(err instanceof ApiError ? err.message : 'ย้ายขั้นไม่สำเร็จ ลองใหม่อีกครั้ง');
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
    if (!token || !id || reopeningCase) return;
    setReopeningCase(true);
    try {
      await api.reopenCase(token, id);
      loadCase();
    } catch (err) {
      window.alert(err instanceof ApiError && err.message ? err.message : 'เปิดคดีอีกครั้งไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setReopeningCase(false);
    }
  };

  const startEditOverview = async () => {
    if (!legalCase) return;
    const knownClients = new Map<string, ClientItem>();
    if (legalCase.client) {
      knownClients.set(legalCase.client.id, { ...legalCase.client, contacts: [] });
    }
    for (const customer of legalCase.customers ?? []) {
      knownClients.set(customer.customerId, { ...customer.customer, contacts: [] });
    }
    for (const ac of legalCase.additionalClients ?? []) knownClients.set(ac.clientId, { ...ac.client, contacts: [] });
    const linkedClients = [...knownClients.values()];
    setClients(linkedClients);
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
      chargeSection:
        typeof legalCase.customFields?.chargeSection === 'string'
          ? legalCase.customFields.chargeSection
          : '',
      estimatedFee:
        legalCase.estimatedFee != null ? String(legalCase.estimatedFee) : '',
      description: legalCase.description ?? '',
      incidentDate: String(legalCase.customFields?.incidentDate ?? ''),
      estimatedDamage: String(legalCase.customFields?.estimatedDamage ?? ''),
      limitationDeadline: legalCase.limitationDeadline ? bangkokDateInputValue(legalCase.limitationDeadline) : '',
      additionalClientIds: (legalCase.additionalClients ?? []).map((ac) => ac.clientId),
      clientId: legalCase.clientId ?? '',
      clientName: legalCase.client?.name ?? legalCase.clientName ?? '',
      customFields: Object.fromEntries(caseOverviewCustomFields(legalCase.caseType?.fieldSchema).map((field) => [field.key, String(legalCase.customFields?.[field.key] ?? '')])),
      customers: legalCase.customers?.length
        ? legalCase.customers.map((customer) => ({
            customerId: customer.customerId,
            contactId: customer.contactId ?? '',
            sharePercent: customer.sharePercent != null ? String(customer.sharePercent) : '',
            isPrimary: customer.isPrimary,
            note: customer.note ?? '',
          }))
        : [{ customerId: '', contactId: '', sharePercent: '', isPrimary: true, note: '' }],
    });
    setOverviewError('');
    setLimitationIncomplete(false);
    setEditingOverview(true);
    if (token) {
      Promise.all([
        api.getCaseTypes(token).catch(() => [] as CaseTypeItem[]),
        api.getCourts(token).catch(() => [] as CourtItem[]),
        api.getClients(token).catch(() => [] as ClientItem[]),
      ]).then(([types, courtList, clientList]) => {
        setCaseTypes(types);
        setCourts(courtList);
        const availableClients = new Map(clientList.map((client) => [client.id, client]));
        for (const client of linkedClients) {
          if (!availableClients.has(client.id)) availableClients.set(client.id, client);
        }
        setClients([...availableClients.values()]);
      });
    }
  };

  const handleSaveOverview = async () => {
    if (!token || !id || !legalCase) return;
    if (!overviewForm.title.trim()) {
      setOverviewError('กรุณากรอกชื่อคดี');
      return;
    }
    if (!overviewForm.ownRef.trim()) {
      setOverviewError('กรุณากรอกเลขอ้างอิงสำนักงาน');
      return;
    }
    // A half-typed date reads as '' — saving it would clear the stored deadline and its reminders.
    if (limitationIncomplete) {
      setOverviewError('กรอกวันครบอายุความให้ครบ (วัน/เดือน/ปี พ.ศ.) หรือเว้นว่างทั้งหมด');
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
        clientId: overviewForm.clientId || null,
        clientName: overviewForm.clientName.trim() || null,
        customers: overviewForm.customers
          .filter((customer) => customer.customerId)
          .map((customer) => ({
            customerId: customer.customerId,
            contactId: customer.contactId || undefined,
            sharePercent: customer.sharePercent ? Number(customer.sharePercent) : undefined,
            isPrimary: customer.isPrimary,
            note: customer.note || undefined,
          })),
        blackCaseNumber: overviewForm.blackCaseNumber.trim() || null,
        redCaseNumber: overviewForm.redCaseNumber.trim() || null,
        courtLevel: overviewForm.courtLevel || null,
        courtName: overviewForm.courtName.trim() || null,
        partyRole: overviewForm.partyRole || null,
        // Sent only when changed: the API acts on presence (reminder re-sync, rebuilding client rows).
        ...limitationPatch(
          overviewForm.limitationDeadline,
          legalCase.limitationDeadline ? bangkokDateInputValue(legalCase.limitationDeadline) : '',
        ),
        ...additionalClientsPatch(overviewForm.additionalClientIds, legalCase.additionalClients ?? [], overviewForm.clientId),
        estimatedFee,
        claimedAmount: overviewForm.claimedAmount.trim() ? Number(overviewForm.claimedAmount) : null,
        customFields: {
          ...Object.fromEntries(Object.entries(legalCase.customFields ?? {}).filter(([key]) => key !== 'opposingParty')),
          ...Object.fromEntries(Object.entries(overviewForm.customFields).map(([key, fieldValue]) => [key, fieldValue.trim()])),
          chargeSection: overviewForm.chargeSection.trim(),
          incidentDate: overviewForm.incidentDate,
          estimatedDamage: overviewForm.estimatedDamage,
        },
        description: overviewForm.description.trim() || null,
      }) as CaseDetail;
      // Merge, then reload: update() returns a thinner object than getCase (calendarEvents, contacts, ...).
      setCase((current) => (current ? { ...current, ...updated } : updated));
      setEditingOverview(false);
      loadCase();
    } catch (err) {
      setOverviewError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
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

  if (loading) return <PageLoading variant="detail" title={d.common.loading} lines={5} />;
  if (!legalCase) {
    return (
      <div className="space-y-3">
        <Link href="/cases" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />กลับไปหน้าคดี
        </Link>
        <LoadFailed message={d.admin.caseNotFound} onRetry={() => { setLoading(true); loadCase(); }} />
      </div>
    );
  }

  const customFields = legalCase.customFields as Record<string, string> | null;
  const chargeSection = typeof legalCase.customFields?.chargeSection === 'string' ? legalCase.customFields.chargeSection.trim() : '';
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
      setUploadError(err instanceof ApiError ? err.message : 'อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง');
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
  const previewPlaybook = (releaseId: string) => {
    if (releaseId) router.push(`${caseTabHref(id, 'tasks')}&sop=${encodeURIComponent(releaseId)}`);
  };
  const deleteCase = async () => {
    if (!token || !await confirmDialog(`ลบคดี "${legalCase.title}"? คดีพร้อมงาน นัด และเอกสารจะหายจากทุกหน้า และหยุดแจ้งเตือน`)) return;
    try {
      await api.deleteCase(token, id);
      router.push('/cases');
    } catch (err) {
      window.alert(err instanceof ApiError && err.message ? err.message : 'ลบคดีไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className={styles.workbench}>
      {Number(searchParams.get('emailLinkFailures')) > 0 && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">ผูกอีเมลไม่สำเร็จ {Number(searchParams.get('emailLinkFailures'))} ฉบับ — ผูกได้อีกครั้งจากแท็บอีเมลของคดี</p>}
      <header className="border-b border-border bg-card" data-testid="case-identity"><div className="px-6 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => router.push('/cases')} className={`${styles.backButton} gap-1.5`}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          เรื่องและคดี
        </button><button type="button" aria-label="หน้านี้ใช้ทำอะไร" className="flex min-h-11 min-w-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { const guide = document.querySelector<HTMLElement>('[aria-label="วิธีใช้หน้านี้"]'); guide?.querySelector<HTMLButtonElement>('button')?.textContent?.includes('แสดงคำแนะนำ') && guide.querySelector<HTMLButtonElement>('button')?.click(); guide?.scrollIntoView({ block: 'start' }); }}><CircleHelp aria-hidden="true" className="h-5 w-5" /></button></div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-[36rem]">
            <div className="flex flex-wrap items-center gap-2 text-sm">
            <p className="inline-flex items-center rounded bg-[#eeebe3] px-3 py-1 font-mono text-sm [&_button]:min-h-0 [&_button]:min-w-0">
              <CaseNumberInline
                caseId={legalCase.id}
                ownRef={legalCase.ownRef}
                onSaved={(ownRef) => setCase((prev) => (prev ? { ...prev, ownRef } : prev))}
              />
            </p>

            {journeyState && (() => { const overdueCount = journeyState.currentTasks.filter(task => task.status !== 'DONE' && !task.skippedReason && task.dueDate && (daysUntil(task.dueDate) ?? 0) < 0).length; const stageLabel = journeyState.steps.find(step => step.state === 'current')?.label; const [text, tone] = overdueCount ? [`มีงานเลยกำหนด ${overdueCount}`, 'bg-[#fbeaea] text-[#a83232]'] : journeyState.infoMissing.length ? ['ข้อมูลยังไม่ครบ', 'bg-[#fbeaea] text-[#a83232]'] : journeyState.next?.kind === 'ADVANCE' || journeyState.canAdvance ? ['งานครบแล้ว', 'bg-[#e6f3ec] text-[#227052]'] : ['กำลังดำเนินการ', 'bg-[#eeebe3] text-foreground']; return <span className={`rounded-full px-3 py-1 font-semibold ${tone}`}>{[stageLabel, text].filter(Boolean).join(' · ')}</span>; })()}
            </div>
            <h1 className="mt-2 font-[family-name:var(--case-font-display)] text-[32px] font-semibold leading-snug">{legalCase.title}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              {clientDisplay !== '—' && <span className={v2.chip}><User aria-hidden="true" size="1.1em" /> ลูกความ <b>{clientDisplay}</b></span>}
              <span className={v2.chip}><Scale aria-hidden="true" size="1.1em" /> {legalCase.courtName || legalCase.blackCaseNumber ? <>{legalCase.courtName ?? 'ศาล'}{legalCase.blackCaseNumber && <> · <b>{legalCase.blackCaseNumber}</b></>}</> : <>ศาล <b>ยังไม่ระบุ</b></>}</span>
              {legalCase.leadLawyer && <span className={v2.chip}><Briefcase aria-hidden="true" size="1.1em" /> เจ้าของคดี <b>{legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}</b>{legalCase.assignments.some(a => a.user.id !== legalCase.leadLawyer.id) && ` · ทีมอีก ${legalCase.assignments.filter(a => a.user.id !== legalCase.leadLawyer.id).length} คน`}</span>}
              <span className={v2.chip}><CalendarDays aria-hidden="true" size="1.1em" /> นัดถัดไป <b>{upcomingEvents[0] ? `${upcomingEvents[0].title} ${new Date(upcomingEvents[0].startAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })} ${new Date(upcomingEvents[0].startAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}` : 'ยังไม่มี'}</b></span>
              {legalCase.claimedAmount != null && <span className={v2.chip}><Wallet aria-hidden="true" size="1.1em" /> ทุนทรัพย์ <b>{Number(legalCase.claimedAmount).toLocaleString('th-TH')} บาท</b></span>}
            </div>
          </div>
          <div><div className="flex flex-wrap gap-2">
            <Link href={`/cases/${id}?tab=tasks&newTask=1`} className={`${v2.btn} ${v2.outline}`}><Plus aria-hidden="true" className="h-4 w-4" />เพิ่มงาน</Link>
            <Link href={`/cases/${id}?tab=calendar&new=event`} className={`${v2.btn} ${v2.outline}`}><Plus aria-hidden="true" className="h-4 w-4" />เพิ่มนัด</Link>
            <Link href={`/cases/${id}?tab=documents&new=upload`} className={`${v2.btn} ${v2.outline}`}><Upload aria-hidden="true" className="h-4 w-4" />แนบเอกสาร</Link>

            <CaseMoreMenu items={[
              { label: 'เปลี่ยนขั้นเอง', hint: 'ใช้เมื่อต้องข้ามหรือย้อนขั้น เช่น คดีเปลี่ยนแนวทาง', icon: GitBranch, onClick: () => setMenuPanel('stage') },
              { label: 'จัดการทีมคดี', hint: 'เปลี่ยนเจ้าของคดี เพิ่มหรือลดคนในทีม', icon: Users, onClick: () => { selectTab('overview'); setManagingTeam(true); setTimeout(() => document.getElementById('case-team')?.scrollIntoView({ block: 'start' }), 100); } },
              { label: 'พิมพ์ปกแฟ้ม', hint: 'ตรวจข้อมูลและจัดพิมพ์ปกสำนวน', icon: Printer, onClick: () => setMenuPanel('print') },
              { label: 'พิมพ์ฉลากแฟ้ม', hint: 'จัดการฉลากสำนวนกระดาษ', icon: FolderOpen, onClick: () => setMenuPanel('paper') },
              { label: 'บันทึกผลหลังขึ้นศาล', hint: 'บันทึกผลการพิจารณาของศาล', icon: Gavel, onClick: () => setRecordingOutcome(true) },
              ...(legalCase.intake && preFiling ? [{ label: 'ออกหนังสือทวงถาม', hint: 'จัดทำหนังสือทวงถาม', icon: FileText, onClick: () => setNoticeOpen(true) }] : []),
              ...(legalCase.cargoClaim ? [{ label: 'Cargo Claim', hint: 'ข้อมูลเคลมสินค้า', icon: Ship, href: `/cases/${id}?tab=cargo-claim` }] : []),
              ...((legalCase.stage === 'CLOSING' || legalCase.status === CaseStatus.CLOSED || legalCase.status === 'ARCHIVED') ? [{ label: 'รายงานปิดงาน', hint: 'ดูรายงานปิดงาน', icon: FileText, href: `/cases/${id}?tab=closing-report` }] : []),
              { label: 'ถาม AI เรื่องคดีนี้', hint: 'เปิดหน้าถามคำถามเกี่ยวกับคดี', icon: Sparkles, href: `/cases/${id}?tab=ask-ai` },
              ...(hasFirmCapability(user?.firmRole, 'deleteCase') ? [{ label: 'ลบคดี', hint: 'ลบคดีพร้อมงาน นัด และเอกสาร', icon: Trash2, onClick: () => void deleteCase() }] : []),
              ...(legalCase.status !== CaseStatus.CLOSED && legalCase.status !== 'ARCHIVED' ? [{ label: 'ปิดคดี', hint: 'บันทึกผลคดีแล้วย้ายไปแท็บ “ปิดแล้ว” เปิดคืนได้', icon: Archive, separator: true, onClick: openCloseCase }] : [
                { label: 'เปิดคดีอีกครั้ง', hint: 'กลับมาดำเนินคดีต่อ', icon: LockOpen, separator: true, disabled: reopeningCase, onClick: () => void handleReopenCase() },
                ...(legalCase.status === CaseStatus.CLOSED ? [{ label: 'เก็บเข้าคลัง', hint: 'เก็บคดีที่ปิดแล้วเข้าคลัง', icon: Archive, onClick: () => void handleArchiveCase() }] : []),
              ]),
            ]} />
          </div><p className={`${v2.hint} max-w-[44rem]`}>เพิ่มงาน = มอบงานให้ทีม · เพิ่มนัด = ระบบเตือนก่อนวันนัด · แนบเอกสาร = เก็บเข้าแฟ้มคดี · อื่น ๆ = เปลี่ยนขั้น ปิดคดี พิมพ์ปกแฟ้ม</p></div>
        </div>
        {journeyState && <><p className="mt-6 text-xs text-muted-foreground"><b className="text-foreground">ขั้นตอนของคดี</b> · สีเขียว = ผ่านแล้ว · สีน้ำเงินเข้ม = ขั้นปัจจุบัน</p><StepTracker steps={journeyState.steps.map(step => ({ ...step, state: step.state === 'locked' ? 'todo' : step.state }))} /></>}
      </div></header>

      {menuPanel && <section className="my-4 rounded-lg border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="font-bold">{menuPanel === 'stage' ? 'เปลี่ยนขั้นเอง' : menuPanel === 'print' ? 'พิมพ์ปกแฟ้ม' : 'พิมพ์ฉลากแฟ้ม'}</h2><Button variant="outline" onClick={() => setMenuPanel(null)}>ปิด</Button></div>{menuPanel === 'stage' ? (      <div className={styles.stagePanel} data-testid="case-stage-control">
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
                disabled={savingStage || !allowedStageChange(legalCase.stage, option.value)}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => handleStageChange(option.value)}
                className={stageClass}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {stageTaskError && <p role="alert" className="text-sm text-destructive">{stageTaskError}</p>}
      </div>) : menuPanel === 'print' ? <><p className="my-2 text-sm text-muted-foreground">ตรวจและแก้ข้อมูลก่อนพิมพ์</p><CasePrintForms key={legalCase.id} legalCase={legalCase} /></> : <PaperFileCard key={id} caseId={id} />}</section>}

      {stageTaskError && !menuPanel && <p role="alert" className="my-3 text-sm text-destructive">{stageTaskError}</p>}
      {token && <div className="mb-6 min-w-0 space-y-4">
        <CaseJourneyPanel compact={activeTab !== 'overview'} openTaskCount={pendingTasks.length} onCloseCase={openCloseCase} onReopenCase={() => void handleReopenCase()} reopening={reopeningCase} closed={legalCase.status === CaseStatus.CLOSED || legalCase.status === 'ARCHIVED' ? { at: legalCase.closedAt ?? null, summary: legalCase.closingSummary ?? null } : null} idleDays={timeline[0] ? Math.max(0, Math.floor((Date.now() - Date.parse(timeline[0].date)) / 86400000)) : null} token={token} caseId={id} intakeId={legalCase.intake?.id} partyNames={[clientDisplay, ...(legalCase.participants ?? []).map((p) => p.name)].filter((n) => n && n !== '—')} stage={legalCase.stage ?? null} taskCount={tasks.length} tasksVersion={tasks} onChanged={loadCase} onJourney={setJourneyState} onAdvance={(target, explicit) => void confirmJourneyAdvance(target, explicit)} onEdit={(missing) => { selectTab('overview'); void startEditOverview(); if (missing?.length) setFocusMissing(missing[0]); }} onOpenTask={(taskId) => router.push(`/cases/${id}?task=${encodeURIComponent(taskId)}`)} />


      </div>}

        {pendingStage && stageTaskError && <p role="alert" className="fixed left-4 top-4 z-[60] rounded-lg border border-destructive/30 bg-card p-3 text-sm text-destructive shadow-lg">{stageTaskError}</p>}
        <StageTasksDialog
          open={pendingStage !== null}
          stageLabel={pendingStage ? caseStageLabel(pendingStage, 'th') : ''}
          fromLabel={legalCase.stage ? caseStageLabel(legalCase.stage, 'th') : undefined}
          caseRef={legalCase.ownRef}
          proposals={stageTaskProposals}
          lawyers={lawyers}
          busy={savingStage}
          moving={pendingStage !== legalCase?.stage}
          onClose={closeStageTaskDialog}
          onSkip={handleStageOnly}
          onConfirm={handleStageAndCreateTasks}
        />


      {showCloseForm && <dialog ref={(el) => { if (el && !el.open) el.showModal(); }} aria-labelledby="close-case-title" onCancel={(e) => { e.preventDefault(); if (!closingCase) setShowCloseForm(false); }} onClose={() => setShowCloseForm(false)} className="m-auto w-[min(36rem,calc(100vw-2rem))] max-w-none rounded-2xl bg-[#fffdfa] p-0 text-foreground shadow-2xl backdrop:bg-[#101d2a]/45">
        <form onSubmit={handleCloseCase} className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-start justify-between border-b border-[#e2e0d8] px-6 py-4"><div><p className={v2.label}>{legalCase.ownRef}</p><h2 id="close-case-title" tabIndex={-1} autoFocus className="text-xl font-bold outline-none">ปิดคดีนี้</h2></div><button type="button" aria-label="ปิดหน้าต่างปิดคดี" disabled={closingCase} onClick={() => setShowCloseForm(false)} className={`${v2.btn} ${v2.ghost}`}><X aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button></div>
          <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
            <fieldset><legend className={v2.flabel}>ลูกความแจ้งว่าอะไร *</legend>
              <div className="mt-2 grid gap-2">{CLOSE_REASONS.map((reason) => <label key={reason.value} className={`flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${closeReason === reason.value ? 'border-2 border-[#142e43] bg-[#e9eef3]' : 'border border-[#7d847e] bg-white'}`}><input type="radio" name="close-reason" value={reason.value} checked={closeReason === reason.value} onChange={() => { setCloseReason(reason.value); setClosingOutcome(reason.value === 'NOT_RETAINED' ? 'WITHDRAWN' : ''); }} className="h-5 w-5" /><span><b>{reason.label}</b><span className={`${v2.hint} block`}>{reason.hint}</span></span></label>)}</div></fieldset>
            {closeReason && closeReason !== 'NOT_RETAINED' && <label className="block"><span className={v2.flabel}>ผลของคดี *</span><Select value={closingOutcome} onChange={(e) => setClosingOutcome(e.target.value)} required className={`${v2.field} text-base sm:text-[15px]`}><option value="" disabled>เลือกผลคดี</option><option value="WON">ชนะคดี</option><option value="SETTLED">ตกลงกันได้</option><option value="MEDIATED">ไกล่เกลี่ยสำเร็จ</option><option value="LOST">แพ้คดี</option><option value="WITHDRAWN">ถอนฟ้อง / ยุติ</option></Select><p className={v2.hint}>ใช้ในรายงานผลคดีของสำนักงาน</p></label>}
            <label className="block" htmlFor="closing-summary"><span className={v2.flabel}>หมายเหตุ</span><textarea id="closing-summary" value={closingSummary} onChange={(e) => setClosingSummary(e.target.value)} placeholder="เช่น ลูกความโทรมาแจ้ง 11 พ.ย." className={`${v2.field} min-h-[72px] text-base sm:text-[15px]`} /></label>
            {outstandingFailed && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#fbf3e0] p-3 text-sm"><p>ตรวจของค้างไม่สำเร็จ — ปิดคดีต่อได้ ระบบจะตรวจอีกครั้งตอนยืนยัน</p><button type="button" onClick={() => void loadOutstanding()} className={`${v2.btn} ${v2.outline} min-h-0 py-1.5`}>ตรวจอีกครั้ง</button></div>}
            {outstanding && <div className="border-l-4 border-[#b8913a] bg-[#fbf3e0] py-2 pl-3 pr-2 text-sm"><p className="flex items-center gap-1 font-semibold text-[#6b4f0b]"><AlertTriangle aria-hidden="true" className="h-[1.1em] w-[1.1em]" />ตรวจก่อนปิด</p>
              <ul className="mt-1 space-y-0.5">
                <li>งานค้าง <b>{outstanding.openTasks.length}</b>{outstanding.openTasks.length > 0 && ` — ${outstanding.openTasks.slice(0, 3).map((t) => t.title).join(', ')}`}</li>
                <li>ค่าใช้จ่ายยังไม่เรียกเก็บ <b>{formatCurrency(outstanding.unbilledExpenses.amount)}</b></li>
                {outstanding.unbilledTime.hours > 0 && <li>เวลาทำงานยังไม่เรียกเก็บ <b>{outstanding.unbilledTime.hours} ชม. · {formatCurrency(outstanding.unbilledTime.amount)}</b></li>}
                <li>ใบแจ้งหนี้ค้างชำระ <b className={outstanding.unpaidInvoices.outstandingAmount > 0 ? 'text-[#a83232]' : ''}>{formatCurrency(outstanding.unpaidInvoices.outstandingAmount)}</b>{outstanding.unpaidInvoices.count > 0 && <> — <Link className="underline" href={`/cases/${id}?tab=billing`}>ดูใบแจ้งหนี้</Link></>}</li>
                {outstanding.draftInvoices.count > 0 && <li>ใบแจ้งหนี้ร่าง <b>{outstanding.draftInvoices.count} ใบ</b></li>}
                {outstanding.unapprovedDocuments.length > 0 && <li>เอกสารยังไม่อนุมัติ <b>{outstanding.unapprovedDocuments.length}</b></li>}
                {outstanding.upcomingEvents.length > 0 && <li>นัดข้างหน้า <b>{outstanding.upcomingEvents.length}</b> — {outstanding.upcomingEvents.slice(0, 2).map((e) => `${e.title} ${formatDate(e.startAt)}`).join(', ')}</li>}
              </ul>
              {outstanding.upcomingEvents.length > 0 && <label className="mt-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={removeFutureEvents} onChange={(e) => setRemoveFutureEvents(e.target.checked)} disabled={closingCase} className="h-5 w-5" />ลบนัดข้างหน้า {outstanding.upcomingEvents.length} รายการ <span className={v2.label}>(ถ้าเปิดคดีคืน นัดที่ลบไปจะไม่กลับมา)</span></label>}
              {outstanding.total > 0 && <label className="mt-1 flex min-h-11 items-center gap-2 font-semibold"><input type="checkbox" checked={ackOutstanding} onChange={(e) => setAckOutstanding(e.target.checked)} className="h-5 w-5" />ตรวจแล้ว ปิดคดีได้</label>}
            </div>}
            <p className={v2.hint}>ปิดแล้วเปิดคืนได้ทุกเมื่อ ข้อมูล งาน เอกสาร และอีเมลยังอยู่ครบ</p>
            {closeError && <p role="alert" className={v2.error}>{closeError}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-[#e2e0d8] px-6 py-4"><button type="button" disabled={closingCase} onClick={() => setShowCloseForm(false)} className={`${v2.btn} ${v2.ghost}`}>ยกเลิก</button><button type="submit" disabled={closingCase || (!outstanding && !outstandingFailed)} className={`${v2.btn} ${v2.primary} disabled:opacity-60`}><Archive aria-hidden="true" className="h-[1.1em] w-[1.1em]" />{closingCase ? 'กำลังปิดคดี…' : 'ปิดคดี'}</button></div>
        </form>
      </dialog>}

      <div aria-label="พื้นที่ทำงานคดี" className="mb-4 space-y-4">
        <CaseTabBar caseId={id} active={activeTab} tasks={tasks.length} overdue={pendingTasks.filter(task => task.dueDate && (daysUntil(task.dueDate) ?? 0) < 0).length} documents={legalCase._count.documents} events={upcomingEvents.length} parties={(legalCase.participants ?? []).length} comments={commentCount} cargo={!!legalCase.cargoClaim} closing={legalCase.stage === 'CLOSING' || legalCase.status === CaseStatus.CLOSED || legalCase.status === 'ARCHIVED'} />
      {activeTab === 'overview' && (
      <div
        role="tabpanel"
        id="case-tabpanel-overview"
        aria-labelledby="case-tab-overview"
        className="min-w-0"
      >
      <div className="grid min-w-0 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <section data-testid="case-information" className={`${v2.card} p-5`}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold">{editingOverview ? 'แก้ไขข้อมูลคดี' : 'ข้อมูลคดี'}</h3>{!editingOverview && <button type="button" className={`${v2.btn} ${v2.ghost}`} onClick={startEditOverview}><Pencil aria-hidden="true" className="h-[1.1em] w-[1.1em]" />แก้ไข</button>}</div>
            {editingOverview ? <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-6 text-sm sm:grid-cols-2">
                <CaseOverviewForm
                  value={overviewForm}
                  onChange={setOverviewForm}
                  legalCase={legalCase}
                  caseTypes={caseTypes}
                  courts={courts}
                  clients={clients}
                  onClientCreated={(client) => setClients((current) => [...current, client].sort((a, b) => a.name.localeCompare(b.name, 'th')))}
                  saving={savingOverview}
                  error={overviewError}
                  onSave={handleSaveOverview}
                  onCancel={() => setEditingOverview(false)}
                  onLimitationIncompleteChange={setLimitationIncomplete}
                />
            </div> : (() => {
              const opponents = (legalCase.participants ?? []).filter((p) => p.side !== 'OURS');
              const openedItem = timeline.find((item) => item.isOpened);
              const limitationDays = legalCase.limitationDeadline ? daysUntil(legalCase.limitationDeadline) : null;
              const facts: [string, ReactNode | null][] = [
                ['ฝ่ายเรา', legalCase.partyRole ? PARTY_ROLE_LABELS[legalCase.partyRole as PartyRole] : null],
                ['คู่กรณี', opponents.length ? `${opponents[0].name}${opponents.length > 1 ? ` และอีก ${opponents.length - 1}` : ''}` : null],
                ['ศาล / เลขคดี', [legalCase.courtName, legalCase.blackCaseNumber].filter(Boolean).join(' · ') || null],
                ['ทุนทรัพย์', legalCase.claimedAmount ? `${Number(legalCase.claimedAmount).toLocaleString('th-TH')} บาท` : null],
                ['ข้อหา', chargeSection || null],
                ['วันครบอายุความ', legalCase.limitationDeadline ? <>{thaiShortDate(legalCase.limitationDeadline)}{limitationDays != null && <span className={v2.label}> · {limitationDays < 0 ? `เลยมา ${-limitationDays} วัน` : `อีก ${limitationDays} วัน`}</span>}</> : null],
                ['ทนายฝ่ายตรงข้าม', opponents.find((p) => p.opposingLawyer)?.opposingLawyer ?? null],
                ['เปิดคดี', (legalCase.openedAt || openedItem?.date) ? thaiShortDate((legalCase.openedAt || openedItem?.date)!) : null],
              ];
              const missing = facts.filter(([, value]) => !value).map(([label]) => label);
              return <>
                {/* Every field shows, filled or not, so the case facts read at a glance. */}
                <dl className="mt-3 grid gap-x-8 gap-y-4 text-[15px] sm:grid-cols-2">{facts.map(([label, value]) => <div key={label}><dt className={v2.label}>{label}</dt><dd className={value ? 'font-semibold' : 'text-muted-foreground'}>{value ?? 'ยังไม่ได้กรอก'}</dd></div>)}</dl>
                {missing.length > 0 && <button type="button" className={`${v2.btn} ${v2.outline} mt-4`} onClick={startEditOverview}><Pencil aria-hidden="true" className="h-[1.1em] w-[1.1em]" />กรอกอีก {missing.length} ช่องที่ยังว่าง</button>}
              </>;
            })()}
          </section>
          <section className={`${v2.card} p-5`}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold">ความเคลื่อนไหวล่าสุด</h3><button type="button" className={`${v2.btn} ${v2.ghost}`} onClick={openActivityForm}><Plus aria-hidden="true" className="h-[1.1em] w-[1.1em]" />เพิ่มกิจกรรม</button></div>
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
                      <Select
                        value={activityForm.type}
                        onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                      >
                        {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </Select>
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
            {timeline.length ? <ol className="mt-3 space-y-3 border-l-2 border-[#e2e0d8] pl-4 text-sm">{(showAllTimeline ? timeline : timeline.slice(0, 4)).map((item) => <li key={item.id}><b>{item.from ?? (item.createdBy ? `${item.createdBy.firstName} ${item.createdBy.lastName}`.trim() : 'ระบบ')}</b> {item.label} <span className={v2.label}>· {thaiShortDate(item.date)}</span></li>)}</ol> : <p className={v2.hint}>ยังไม่มีความเคลื่อนไหว</p>}
            {timeline.length > 4 && <button type="button" className="mt-3 inline-block min-h-11 text-sm underline" onClick={() => setShowAllTimeline((v) => !v)}>{showAllTimeline ? 'แสดงเฉพาะรายการล่าสุด' : `ดูทั้งหมด (${timeline.length})`}</button>}
          </section>
        </div>
        <div className="space-y-5">
          <section className={`${v2.card} p-5`}><h3 className="text-lg font-bold">นัดถัดไป</h3>
            {upcomingEvents.length ? upcomingEvents.slice(0, 2).map((event, index) => { const days = daysUntil(event.startAt); return <div key={event.id} className="mt-3 border-t border-[#e2e0d8] px-1 pt-3"><b>{event.title}</b><div className="text-sm">{thaiShortDate(event.startAt)} · {new Date(event.startAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}</div>{index === 0 && days != null && <div className={v2.label}>{days === 0 ? 'วันนี้' : `อีก ${days} วัน`}</div>}</div>; }) : <p className={v2.hint}>ยังไม่มีนัด · <Link href={`/cases/${id}?tab=calendar&new=event`} className="font-semibold text-foreground underline">เพิ่มนัด</Link></p>}
          </section>
          <section className={`${v2.card} p-5`}><h3 className="text-lg font-bold">การเงินของคดี</h3><dl className="mt-2 space-y-1 text-sm"><div className="flex justify-between"><dt>ค่าใช้จ่ายที่อนุมัติ</dt><dd className="font-semibold">{formatCurrency(totalSpent)}</dd></div>{legalCase.estimatedFee != null && <div className="flex justify-between"><dt>รายได้โดยประมาณ</dt><dd className="font-semibold">{formatCurrency(legalCase.estimatedFee)}</dd></div>}</dl></section>
          <section id="case-team" className={`${v2.card} scroll-mt-24 p-5`}><div className="flex items-center justify-between gap-2"><h3 className="text-lg font-bold">ทีมคดี ({new Set([legalCase.leadLawyer.id, ...legalCase.assignments.map(a => a.user.id)]).size})</h3>{!managingTeam && <button type="button" onClick={() => setManagingTeam(true)} className={`${v2.btn} ${v2.ghost}`}><Pencil aria-hidden="true" className="h-[1.1em] w-[1.1em]" />จัดการ</button>}</div>
            <ul className="mt-2 space-y-2 text-sm"><li><b>{legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}</b> <span className={v2.label}>· เจ้าของคดี</span></li>{legalCase.assignments.filter(({ user: member }) => member.id !== legalCase.leadLawyer.id).map(({ user: member }) => <li key={member.id}>{member.firstName} {member.lastName}</li>)}</ul>
            {managingTeam && token && <div className="mt-4 space-y-3 border-t border-[#e2e0d8] pt-3">
            {legalCase.assignments.map(({ user: member }) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><span className="min-w-0 break-words">{member.firstName} {member.lastName} {legalCase.intake?.receivedById === member.id && <span className="text-xs text-muted-foreground">· ผู้รับเรื่อง</span>}</span>{member.id === user?.id && member.id !== legalCase.leadLawyer.id && <Button variant="outline" size="sm" disabled={ownerBusy} onClick={() => { if (!confirm('ออกจากทีมคดีนี้?')) return; setOwnerBusy(true); setOwnerError(''); void api.leaveCaseTeam(token, id).then(() => loadCase()).catch((e) => setOwnerError(e instanceof Error ? e.message : 'ออกจากทีมไม่สำเร็จ ลองใหม่อีกครั้ง')).finally(() => setOwnerBusy(false)); }}>ออกจากทีม</Button>}</div>)}
            {handedOver && <p className="text-sm text-success">ส่งต่อแล้ว — คุณยังอยู่ในทีมคดี</p>}
            {ownerError && <p role="alert" className="text-sm text-destructive">{ownerError}</p>}
            {canChangeOwner(hasFirmCapability(user?.firmRole, 'reassignCaseLead'), user?.id, legalCase.leadLawyer.id, legalCase.intake?.receivedById) && (editingOwner ? <div className="space-y-2"><label htmlFor="case-owner" className="text-sm">เจ้าของคดีคนใหม่</label><OwnerPicker id="case-owner" token={token} value={ownerId} onChange={setOwnerId} currentUserId={user?.id} /><div className="flex flex-wrap gap-2"><Button disabled={ownerBusy || !ownerId || ownerId === legalCase.leadLawyer.id} onClick={() => { setOwnerBusy(true); setOwnerError(''); const receiver = user?.id === legalCase.intake?.receivedById && user?.id === legalCase.leadLawyer.id; void api.updateCase(token, id, { leadLawyerId: ownerId }).then(() => { setEditingOwner(false); if (receiver) setHandedOver(true); return loadCase(); }).catch((e) => setOwnerError(e instanceof Error ? e.message : 'เปลี่ยนเจ้าของคดีไม่สำเร็จ ลองใหม่อีกครั้ง')).finally(() => setOwnerBusy(false)); }}>{ownerBusy ? 'กำลังบันทึก…' : 'บันทึก'}</Button><Button variant="outline" onClick={() => setEditingOwner(false)}>ยกเลิก</Button></div></div> : <Button variant="outline" onClick={() => { setOwnerId(legalCase.leadLawyer.id); setEditingOwner(true); }}>เปลี่ยนเจ้าของคดี</Button>)}
            {(hasFirmCapability(user?.firmRole, 'reassignCaseLead') || user?.id === legalCase.leadLawyer.id) && (editingTeam ? <div className="space-y-2 border-t pt-3"><p className="text-sm font-medium">คนในทีม <span className="font-normal text-muted-foreground">· เลือกได้หลายคน</span></p>{loadingTeam && <p className="text-sm text-muted-foreground">กำลังโหลดรายชื่อ…</p>}<div className="max-h-80 space-y-0.5 overflow-y-auto">{teamPeople.filter((p) => p.userId !== legalCase.leadLawyer.id).map((p) => <label key={p.userId} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-1 py-2 text-sm hover:bg-muted/50"><input type="checkbox" className="mt-1" checked={teamForm.buddyIds.includes(p.userId)} onChange={() => setTeamForm((f) => ({ ...f, buddyIds: f.buddyIds.includes(p.userId) ? f.buddyIds.filter((x) => x !== p.userId) : [...f.buddyIds, p.userId] }))} /><span className="min-w-0"><span className="block break-words font-medium">{p.firstName} {p.lastName}{p.userId === user?.id ? ' (ฉัน)' : ''}</span><span className="block text-xs text-muted-foreground">เปิดอยู่ {p.openCaseCount} · <span className={p.overdueTaskCount ? 'text-destructive' : ''}>เลยกำหนด {p.overdueTaskCount}</span>{p.leave ? ` · ลา ${p.leave.startDate.slice(8)}/${p.leave.startDate.slice(5, 7)}–${p.leave.endDate.slice(8)}/${p.leave.endDate.slice(5, 7)}` : ''}</span></span></label>)}</div>{teamError && <p role="alert" className="text-sm text-destructive">{teamError}</p>}<div className="flex flex-wrap gap-2"><Button disabled={savingTeam || loadingTeam || teamPeople.length === 0} onClick={handleSaveTeam}>{savingTeam ? 'กำลังบันทึก…' : `บันทึกทีม (${teamForm.buddyIds.filter((x) => x !== legalCase.leadLawyer.id).length} คน)`}</Button><Button variant="outline" onClick={() => setEditingTeam(false)}>ยกเลิก</Button></div></div> : <Button variant="outline" onClick={startEditTeam}>{legalCase.assignments.length ? 'แก้ไขทีม' : <><Plus aria-hidden="true" className="h-4 w-4" />เพิ่มคนในทีม</>}</Button>)}
              <button type="button" className={`${v2.btn} ${v2.ghost}`} onClick={() => { setManagingTeam(false); setEditingTeam(false); setEditingOwner(false); }}>เสร็จ</button>
            </div>}
          </section>
          {legalCase.originThread && <section className={`${v2.card} space-y-2 p-5`}><h3 className="text-lg font-bold">ที่มาของเรื่อง</h3><p className="text-sm">รับจากอีเมล {formatDate(legalCase.originThread.receivedAt)}{legalCase.intake?.receivedBy && ` โดย ${legalCase.intake.receivedBy.firstName} ${legalCase.intake.receivedBy.lastName}`}</p><Link className="inline-block min-h-11 text-sm text-primary underline" href={`/email-intake/${legalCase.originThread.id}`}>เปิดอีเมลต้นทาง <ArrowRight aria-hidden="true" className="inline h-4 w-4" /></Link><p className="text-sm text-muted-foreground">ไฟล์แนบ {legalCase.originThread.attachmentCount} ไฟล์ อยู่ในแท็บเอกสาร</p></section>}
        </div>
      </div>
      <details className={`${v2.card} mt-5`}>
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-5 py-3 font-semibold">ข้อมูลและเครื่องมือเพิ่มเติม <span className={v2.label}>· ข้อมูลอื่นของคดี สรุปคดี เครื่องคำนวณ หนังสือทวงถาม</span></summary>
        <div className="space-y-5 border-t border-[#e2e0d8] p-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
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
                  {legalCase.insuranceClaim && <div>
                    <p className="text-xs text-muted-foreground">Policy Ref</p>
                    <p className="font-medium">{policyRef}</p>
                  </div>}
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
                  <div className="col-span-full rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground">ข้อหาหรือฐานความผิด</p>
                    <p className="mt-1 whitespace-pre-wrap font-medium">{chargeSection || 'ยังไม่ระบุ'}</p>
                    {!chargeSection && <Button variant="link" className="mt-1 h-auto p-0" onClick={startEditOverview}>เพิ่มข้อหาหรือฐานความผิด</Button>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ทุนทรัพย์</p>
                    <p className="font-medium">{legalCase.claimedAmount ? formatCurrency(legalCase.claimedAmount) : 'ยังไม่ระบุ'}</p>
                    {!!legalCase.claimedAmount && (
                      <p className="text-xs text-muted-foreground">ค่าขึ้นศาลโดยประมาณ {formatCurrency(courtFee(legalCase.claimedAmount))}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ฝ่ายเรา</p>
                    <p className="font-medium">
                      {legalCase.partyRole ? PARTY_ROLE_LABELS[legalCase.partyRole as PartyRole] : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">วันครบอายุความ</p>
                    <p className="font-medium">{legalCase.limitationDeadline ? formatDate(legalCase.limitationDeadline) : '—'}</p>
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
                    <p className="text-xs text-muted-foreground">ผู้ว่าจ้าง</p>
                    <p className="font-medium">{customerDisplay ?? '—'}</p>
                  </div>
              <div>
                <p className="text-xs text-muted-foreground">รายได้โดยประมาณ</p>
                <p className="font-medium tabular-nums">
                  {legalCase.estimatedFee != null
                    ? formatCurrency(legalCase.estimatedFee)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ค่าใช้จ่ายที่อนุมัติ</p>
                <p className="font-medium tabular-nums">{formatCurrency(totalSpent)}</p>
              </div>
              {customFields && Object.entries(customFields).filter(([key, value]) => key !== CASE_COSTS_KEY && key !== 'chargeSection' && key !== 'opposingParty' && value !== '').map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-muted-foreground">{{ incidentDate: 'วันเกิดเหตุ', estimatedDamage: 'ความเสียหายโดยประมาณ' }[k] ?? k}</p>
                  <p className="font-medium">{k === 'incidentDate' ? formatDate(v) : k === 'estimatedDamage' ? formatCurrency(Number(v)) : v}</p>
                </div>
              ))}
          </dl>
      {legalCase.status === CaseStatus.CLOSED && legalCase.closingSummary && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-sm">สรุปคดี</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{legalCase.closingSummary}</p>
          </CardContent>
        </Card>
      )}

      <AiTrayCards caseId={id} onChanged={loadCase} />
      <CaseStatusBadge status={legalCase.status} />
        {bannerProposals.length > 0 && pendingStage === null && legalCase.stage && <div className="min-w-0 text-sm text-muted-foreground xl:col-start-1">มีงานแนะนำจาก SOP {bannerProposals.length} งาน · <button type="button" className="min-h-11 text-primary underline" onClick={openBannerProposals}>ดูและสร้างงาน</button></div>}
      <div className="mb-5">
        {suggestedPlaybook && !hasAppliedPlaybook && (
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <p className="text-sm">
              แนะนำชุดงาน <span className="font-medium">{suggestedPlaybook.name}</span> · {suggestedPlaybook.steps.length} ขั้นตอน
            </p>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => previewPlaybook(suggestedPlaybook.id)}>
              ดูรายการงานจากชุดงาน
            </Button>
          </div>
        )}
      </div>

      <details className="mb-4"><summary className="min-h-11 cursor-pointer">สัญญาณสำคัญของคดี</summary>
      <section className={styles.signalStrip} aria-label="สัญญาณสำคัญของคดี" data-testid="case-priority-signals">
        <button type="button" onClick={() => selectTab('calendar')} className={styles.signalButton}>
          <span className={styles.signalLabel}>นัดหมายถัดไป</span>
          <strong className={styles.signalValue}>{priority.nextEvent?.title ?? 'ยังไม่มีนัดถัดไป'}</strong>
          <span className={styles.signalMeta}>{priority.nextEvent ? formatDateTime(priority.nextEvent.startAt) : 'เปิดไทม์ไลน์เพื่อเพิ่มนัด'}</span>
        </button>
        <div className={styles.signal}>
          <span className={styles.signalLabel}>อายุความ</span>
          <strong className={`${styles.signalValue} ${priority.limitationDays != null && priority.limitationDays <= 30 ? "text-destructive" : ""}`}>{priority.limitationDays == null ? 'ยังไม่ระบุ' : `อีก ${priority.limitationDays} วัน`}</strong>
          <span className={styles.signalMeta}>{legalCase.limitationDeadline ? `ครบ ${formatDate(legalCase.limitationDeadline)}` : 'ยังไม่ได้ใส่วันครบอายุความ'}</span>
        </div>
        <button type="button" onClick={() => selectTab('tasks')} className={styles.signalButton}>
          <span className={styles.signalLabel}>งานค้าง</span>
          <strong className={styles.signalValue}>{priority.pendingTaskCount} รายการ</strong>
          <span className={styles.signalMeta}>{priority.nextPendingTask?.dueDate ? `ใกล้สุด ${formatDate(priority.nextPendingTask.dueDate)}` : priority.nextPendingTask ? 'งานถัดไปยังไม่กำหนดวันส่ง' : 'ไม่มีงานค้าง'}</span>
        </button>
        <button type="button" onClick={() => selectTab('documents')} className={styles.signalButton}>
          <span className={styles.signalLabel}>เอกสารที่ต้องมี</span>
          <strong className={styles.signalValue}>{priority.presentRequiredDocumentCount}/{priority.requiredDocumentCount}</strong>
          <span className={styles.signalMeta}>{priority.missingRequiredDocumentCount > 0 ? `ขาด ${priority.missingRequiredDocumentCount} รายการ` : priority.requiredDocumentCount > 0 ? 'ครบตามรายการ' : 'ยังไม่ได้กำหนดเอกสารที่ต้องมี'}</span>
        </button>
      </section>

      </details>
      <CaseBriefCard caseId={id} />

      <div className={styles.workspace}>
        <section className={styles.mainPane} aria-label="ข้อมูลและประวัติคดี">
          <CaseSummaryPanel caseId={id} onChanged={loadCase} />


          <CaseProceedingsCard
            caseId={legalCase.id}
            proceedings={legalCase.proceedings ?? []}
            currentLevel={legalCase.courtLevel ?? null}
            onChanged={loadCase}
          />

          <LitigationCalculatorsCard key={legalCase.claimedAmount ?? 'none'} claimedAmount={legalCase.claimedAmount ?? null} />

          <div className="min-w-0 space-y-4">
          {legalCase.intake && preFiling && (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">หนังสือทวงถาม</CardTitle>
                <div className="flex flex-wrap gap-2">

                  <Button variant="outline" size="sm" onClick={() => setPreLitOpen(true)}>อัปเดตสถานะเจรจา</Button>
                  <Button size="sm" onClick={() => setNoticeOpen(true)}><Plus aria-hidden="true" className="h-4 w-4" />ออก Notice{legalCase.intake.noticeIssuedAt ? 'ฉบับใหม่' : ''}</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {legalCase.intake.noticeIssuedAt ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
                    <Badge variant="success">ฉบับล่าสุด</Badge>
                    <span>
                      ถึง {legalCase.intake.noticeRecipient ?? '—'} · ออก {new Date(legalCase.intake.noticeIssuedAt).toLocaleDateString('th-TH')}
                      {legalCase.intake.noticeDeadline ? ` · ครบกำหนด ${new Date(legalCase.intake.noticeDeadline).toLocaleDateString('th-TH')}` : ''}
                    </span>
                    <span className="ml-auto flex gap-3">

                      <button type="button" className="text-xs text-primary hover:underline" onClick={() => setPreLitOpen(true)}>บันทึกผล</button>
                    </span>
                  </div>
                ) : (
                  <p className="text-muted-foreground">ยังไม่ออกหนังสือ</p>
                )}
                <p className="text-xs text-muted-foreground">
                  สถานะเจรจา: {legalCase.intake.preLitigationStatus ? (PRE_LITIGATION_STATUS_LABELS[legalCase.intake.preLitigationStatus] ?? legalCase.intake.preLitigationStatus) : '—'}
                  {legalCase.intake.settlementOfferAmount != null && ` · ข้อเสนอจ่ายล่าสุด ${legalCase.intake.settlementOfferAmount.toLocaleString('th-TH')} บาท`}
                </p>
              </CardContent>
            </Card>
          )}
          {/* ใช้เป็นครั้งคราว — พับไว้ให้หน้าโล่ง */}
          <details className="rounded-xl border border-border bg-card">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              ประมาณการค่าใช้จ่ายคดี
            </summary>
            <div className="border-t border-border p-4">
              <SavedCaseCostCalculator key={legalCase.id} caseId={id} customFields={customFields} onSaved={loadCase} />
            </div>
          </details>


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
                      วิเคราะห์เมื่อ {formatDateTime(latestPrecedentAnalysis.createdAt)}
                    </span>
                  </span>
                </summary>
              <CardContent className="space-y-3">
                {latestPrecedentAnalysis.documentSummary && (
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium"><FileText aria-hidden="true" className="h-4 w-4 text-muted-foreground" />{d.admin.documentEventSummary}</p>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm leading-relaxed">
                      {latestPrecedentAnalysis.documentSummary}
                    </p>
                  </div>
                )}

                <AnalysisFactsTimeline analysis={latestPrecedentAnalysis} />

                <div className={latestPrecedentAnalysis.documentSummary ? 'border-t border-border pt-3' : undefined}>
                  <p className="flex items-center gap-1.5 text-sm font-medium"><BookOpen aria-hidden="true" className="h-4 w-4 text-muted-foreground" />ฎีกาที่เกี่ยวข้อง</p>
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
                  <p className="flex items-center gap-1.5 text-sm font-medium"><ScrollText aria-hidden="true" className="h-4 w-4 text-muted-foreground" />ข้อมูลพร้อมร่างหนังสือทวงถาม</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
                    {latestPrecedentAnalysis.noticeFacts}
                  </p>
                </div>

                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  ผลนี้เป็นการค้นเบื้องต้นด้วย AI กรุณาตรวจกับฉบับเต็มก่อนใช้อ้างอิงจริง
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
                      <Select
                        aria-label="กรองตามสถานะงาน"
                        value={checklistStatusFilter}
                        onChange={(event) => setChecklistStatusFilter(event.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground"
                      >
                        <option value="ALL">ทุกสถานะ</option>
                        {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </Select>
                    </label>
                    <label className="text-xs font-medium text-muted-foreground">
                      เจ้าของงาน
                      <Select
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
                      </Select>
                    </label>
                  </div>
                  {filteredChecklistTasks.map((t) => (
                    <label
                      key={t.id}
                      data-testid="case-checklist-task"
                      data-status={t.status}
                      data-assignee-id={t.assignee?.id ?? 'UNASSIGNED'}
                      className="flex min-h-11 items-center gap-2 text-sm sm:min-h-8"
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
                    <button type="button" className="inline-flex min-h-11 items-center gap-0.5 text-xs text-primary hover:underline sm:min-h-0" onClick={() => selectTab('documents')}>
                      เอกสารทั้งหมด<ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {requiredDocs.required.map((r) => (
                    <label key={r.category} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-8">
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
                  {uploadError && <p role="alert" className="text-xs text-destructive">{uploadError}</p>}
                </div>
              )}
              {!hasAppliedPlaybook && playbooks.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-2">
                  <p className="text-xs font-medium text-muted-foreground">SOP</p>
                  <div className="flex gap-2">
                    <Select
                      aria-label="เลือกชุดงานอัตโนมัติ"
                      className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm"
                      value={pendingPlaybookId}
                      onChange={(e) => setPendingPlaybookId(e.target.value)}
                    >
                      <option value="">— เลือกชุดงานอัตโนมัติ —</option>
                      {playbooks.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} · ฉบับที่ {p.version}</option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!pendingPlaybookId}
                      onClick={() => previewPlaybook(pendingPlaybookId)}
                    >
                      ดูรายการงาน
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className={styles.actionSection}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">ภาระงาน</CardTitle>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-0.5 text-xs text-primary hover:underline sm:min-h-0"
                onClick={() => selectTab('tasks')}
              >
                ดูทั้งหมด<ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
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
                  <CheckSquare aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{t.dueDate ? `กำหนดส่ง ${formatDate(t.dueDate)}` : 'ยังไม่กำหนดวันส่ง'}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{TASK_STATUS_LABELS[t.status] ?? t.status}</span>
                </button>
              ))}
              {nextActionTasks.length === 0 && (
                <InlineEmptyState title="ยังไม่มีภาระงาน" />
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
                  aria-label="ชื่องานใหม่"
                  placeholder="เพิ่มงานคดี"
                  className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={quickTaskAssignee}
                  onChange={(e) => setQuickTaskAssignee(e.target.value)}
                  className="min-h-11 rounded-lg border border-input bg-background px-2 text-sm"
                  aria-label="ผู้รับผิดชอบ"
                >
                  <option value="">ฉันเอง</option>
                  <AssigneeOptions users={lawyers} flags={quickTaskLeaveFlags} nameOf={(u) => u.firstName} />
                </Select>
                <ThaiDateField className="w-48" ariaLabel="วันครบกำหนด" value={quickTaskDue ?? ''} onChange={setQuickTaskDue} />
                <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={addQuickTask} disabled={!quickTaskTitle.trim() || quickTaskBusy}>
                  เพิ่มงาน
                </Button>
                </div>
                {quickTaskAssignee && quickTaskLeaveFlags.has(quickTaskAssignee) && (
                  <p className="flex items-start gap-1 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {leaveWarning(
                      lawyers.find((u) => u.id === quickTaskAssignee)?.firstName ?? '',
                      quickTaskDate,
                      quickTaskLeaveFlags.get(quickTaskAssignee)?.kind,
                    )}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={styles.actionSection}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">นัดหมาย</CardTitle>
              <Button size="sm" variant="outline" onClick={() => selectTab('calendar')}><Plus aria-hidden="true" className="h-4 w-4" />เพิ่มนัด</Button>
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
                <InlineEmptyState title="ไม่มีนัดที่จะถึง" />
              )}
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
                <StickyNote aria-hidden="true" className="h-4 w-4" />
                {savingNote ? 'กำลังบันทึก...' : 'บันทึกย่อ'}
              </Button>
            </CardContent>
          </Card>

        </aside>
      </div>
        </div>
      </details>
      </div>
      )}
        {activeTab === 'parties' && <div role="tabpanel" id="case-tabpanel-parties" aria-labelledby="case-tab-parties"><CaseParticipantsSection caseId={legalCase.id} client={clientDisplay !== '—' ? { name: clientDisplay, role: legalCase.partyRole ? PARTY_ROLE_LABELS[legalCase.partyRole as PartyRole] : null } : undefined} initialParticipants={legalCase.participants} onChanged={(participants) => setCase(current => current ? { ...current, participants } : current)} /></div>}
        {activeTab !== 'overview' && activeTab !== 'parties' && (activeTab !== 'cargo-claim' || !!legalCase.cargoClaim) && (activeTab !== 'closing-report' || legalCase.stage === 'CLOSING' || legalCase.status === CaseStatus.CLOSED || legalCase.status === 'ARCHIVED' || searchParams.has('draftId')) && <CaseSectionContent tab={activeTab} caseId={id} legalCase={legalCase} thread={searchParams.get('thread')} showAiAnalysis={showAiAnalysis} setShowAiAnalysis={setShowAiAnalysis} onChanged={loadCase} onTasksChanged={setTasks} onOpenSuggestions={() => selectTab('documents')} />}
        {activeTab === 'tasks' && token && <details className={`${v2.card} mt-5`}><summary className="flex min-h-12 cursor-pointer items-center gap-2 px-5 py-3 font-semibold">ข้ามงานที่ไม่จำเป็น <span className={v2.label}>· ระบุเหตุผลแล้วข้ามงานในขั้นนี้ · รายการตรวจก่อนฟ้อง</span></summary><div className="border-t border-[#e2e0d8] p-5"><CaseJourneyPanel tasksOnly token={token} caseId={id} intakeId={legalCase.intake?.id} stage={legalCase.stage ?? null} partyNames={[clientDisplay, ...(legalCase.participants ?? []).map((p) => p.name)].filter((n) => n && n !== '—')} tasksVersion={tasks} onChanged={loadCase} onAdvance={() => {}} onEdit={() => { selectTab('overview'); void startEditOverview(); }} onOpenTask={() => {}} /></div></details>}
      </div>

      {legalCase.intake && preFiling && <>
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
      </>}

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
                <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
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
