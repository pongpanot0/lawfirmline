'use client';

import { ResearchWorkspace } from '@/components/research/ResearchWorkspace';

import { AnalysisFactsTimeline } from '@/components/intake/AnalysisFactsTimeline';
import {
  AI_CREDIT_COST,
  AI_UPLOAD_MAX_FILES,
  canAssignFirmRole,
  documentHintsFor,
  FirmRole,
  preLitigationDocuments,
} from '@lawfirm/shared';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, IntakeItem, IntakePrecedentAnalysisItem, DocumentItem, IntakeDocumentRequestItem, UserItem, ApiError, ChecklistClassificationSuggestion, CaseTypeItem } from '@/lib/api';
import { PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { formatCustomers, customersSameAsClient } from '@/lib/customers';
import { InvoicePanel } from '@/components/billing/InvoicePanel';
import { PRE_LITIGATION_STATUS_LABELS } from '@/lib/pre-litigation';
import { IntakeTasksPanel } from '@/components/intake/IntakeTasksPanel';
import { ConvertToCaseDialog } from '@/components/intake/ConvertToCaseDialog';
import { IntakeStageBar } from '@/components/intake/IntakeStageBar';
import { ConflictCheckPanel } from '@/components/intake/ConflictCheckPanel';
import { IntakeFollowUpPanel } from '@/components/intake/IntakeFollowUpPanel';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { formatDate } from '@/lib/utils';
import { CaseCostLine, initialCaseCosts } from '@/lib/case-costs';
import { buildQuoteHtml } from '@/lib/quote-doc';
import { CaseCostCalculator } from '@/components/cases/CaseCostCalculator';

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'รับเรื่อง',
  ASSESSING: 'กำลังประเมิน',
  ACCEPTED: 'รับดำเนินการ',
  REJECTED: 'ปฏิเสธ',
  CONVERTED: 'แปลงเป็นคดีแล้ว',
  CONSULTED: 'ให้คำปรึกษาเรียบร้อยแล้ว',
};

const STATUS_COLOR: Record<string, string> = {
  RECEIVED: 'bg-gray-100 text-gray-700',
  ASSESSING: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CONVERTED: 'bg-purple-100 text-purple-700',
  CONSULTED: 'bg-slate-100 text-slate-700',
};

const DRAFT_NOTICE_COST = AI_CREDIT_COST.DRAFT_NOTICE;

const DECISION_LABELS: Record<string, string> = {
  FILE_SUIT: 'ฟ้อง',
  DO_NOT_FILE: 'ไม่ฟ้อง',
  NEGOTIATE_FIRST: 'เจรจาก่อน',
  SEND_NOTICE: 'ออก Notice',
  COMPLAIN_TO_AUTHORITY: 'ร้องเรียน',
  CONSULTATION_ONLY: 'ให้คำปรึกษาเท่านั้น (ไม่รับเป็นคดี)',
  PENDING: 'รอตัดสินใจ',
};

const REFERRAL_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: 'บุคคลทั่วไป',
  LAWYER: 'ทนายความ',
  HOSPITAL: 'โรงพยาบาล',
  COMPANY: 'บริษัท',
  GOVERNMENT: 'หน่วยงานรัฐ',
  OTHER: 'อื่นๆ',
};

const REFERRAL_CHANNEL_LABELS: Record<string, string> = {
  WALK_IN: 'มาติดต่อด้วยตนเอง',
  PHONE: 'โทรศัพท์',
  EMAIL: 'อีเมล',
  LINE: 'LINE',
  REFERRAL: 'แนะนำ',
  OTHER: 'อื่นๆ',
};

const MATTER_TYPE_LABELS: Record<string, string> = {
  CIVIL: 'แพ่ง',
  CRIMINAL: 'อาญา',
  ADMINISTRATIVE: 'ปกครอง',
  MEDICAL: 'ทางการแพทย์',
  LABOR: 'แรงงาน',
  OTHER: 'อื่นๆ',
};

const PRE_LITIGATION_TYPE_LABELS: Record<string, string> = {
  GENERAL: 'ทั่วไป',
  MEDICAL_CLAIM: 'แพทย์ / ค่าสินไหม',
  TRANSPORT: 'ขนส่ง',
};


const PRE_LITIGATION_GUIDE: Record<string, string[]> = {
  MEDICAL_CLAIM: ['Notice', 'พิจารณาเอกสาร/ความเห็นแพทย์', 'ทำสรุปรายงาน', 'เสนอจ่าย/ไม่จ่าย', 'เจรจาหรืออุทธรณ์ความเห็น', 'ไม่จบจึงฟ้อง'],
  TRANSPORT: ['Notice', 'ตอบรับ/ปฏิเสธ/ไม่ตอบ', 'เจรจา', 'ตัดสินใจฟ้องหรือไม่ฟ้อง'],
  GENERAL: ['Notice', 'ติดตามคำตอบ', 'เจรจา', 'ตัดสินใจฟ้องหรือไม่ฟ้อง'],
};


/** Same Bangkok-pinned format as the rest of the app, with an em dash for empty. */
function formatDateOrDash(date: string | null | undefined) {
  return date ? formatDate(date) : '—';
}

function matchesDocument(filename: string, hints: string[]) {
  const normalized = filename.toLowerCase();
  return hints.some((hint) => normalized.includes(hint.toLowerCase()));
}

/** Marked received by hand (no uploaded file linked). */
const CHECKLIST_MANUAL = '__manual__';
/** Explicitly unmarked — overrides filename auto-match. */
const CHECKLIST_SKIPPED = '__skipped__';

function isChecklistDocId(value: string | undefined): value is string {
  return !!value && value !== CHECKLIST_MANUAL && value !== CHECKLIST_SKIPPED;
}


function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-2 py-1.5 border-b last:border-0">
      <span className="w-40 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? '—'}</span>
    </div>
  );
}

const FIRM_ROLE_LABELS: Record<string, string> = {
  OWNER: 'เจ้าของ',
  SENIOR_LAWYER: 'ทนายอาวุโส',
  LAWYER: 'ทนายความ',
  ASSISTANT: 'ผู้ช่วย',
};

/**
 * Assign firm members to this intake. The dropdown offers only members whose
 * firm role is strictly below the current user's (owner > senior > lawyer >
 * assistant) — the API enforces the same rule.
 */
function IntakeAssignees({
  intake,
  lawyers,
  currentUser,
  onSave,
}: {
  intake: IntakeItem;
  lawyers: UserItem[];
  currentUser: { id: string; firmRole: FirmRole } | null;
  onSave: (ids: string[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assignedIds = intake.assignedUserIds ?? [];
  const byId = new Map(lawyers.map((u) => [u.id, u]));
  const assignable = currentUser
    ? lawyers.filter(
        (u) =>
          !assignedIds.includes(u.id) &&
          u.id !== currentUser.id &&
          u.firmRole != null &&
          canAssignFirmRole(currentUser.firmRole, u.firmRole),
      )
    : [];

  const save = async (ids: string[]) => {
    setBusy(true);
    setError('');
    try {
      await onSave(ids);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกผู้รับผิดชอบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {assignedIds.length === 0 && (
          <p className="text-sm text-muted-foreground">ยังไม่ได้มอบหมาย — เลือกทีมจากเมนูด้านล่าง</p>
        )}
        {assignedIds.map((uid) => {
          const u = byId.get(uid);
          const name = u ? `${u.firstName} ${u.lastName}` : uid;
          const removable = !busy;
          return (
            <span
              key={uid}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-1 pr-2 text-sm"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {u ? `${u.firstName[0]}${u.lastName[0]}` : '?'}
              </span>
              <span className="font-medium">{name}</span>
              {u?.firmRole && (
                <span className="text-xs text-muted-foreground">
                  {FIRM_ROLE_LABELS[u.firmRole] ?? u.firmRole}
                </span>
              )}
              {removable && (
                <button
                  type="button"
                  aria-label={`เอา ${name} ออก`}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => save(assignedIds.filter((x) => x !== uid))}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
      </div>
      {(
        <select
          aria-label="มอบหมายให้"
          className="h-9 w-full max-w-xs rounded-lg border border-dashed border-input bg-transparent px-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
          value=""
          disabled={busy || assignable.length === 0}
          onChange={(e) => {
            if (e.target.value) save([...assignedIds, e.target.value]);
          }}
        >
          <option value="">
            {assignable.length === 0 ? 'ไม่มีสมาชิกบทบาทต่ำกว่าให้มอบหมาย' : '+ มอบหมายให้...'}
          </option>
          {assignable.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
              {u.firmRole ? ` (${FIRM_ROLE_LABELS[u.firmRole] ?? u.firmRole})` : ''}
            </option>
          ))}
        </select>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

type ModalType = 'assess' | 'decide' | 'notice' | 'prelitigation' | 'details' | 'quote' | null;

export default function IntakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const router = useRouter();
  const [intake, setIntake] = useState<IntakeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [quoteLines, setQuoteLines] = useState<CaseCostLine[]>([]);

  // Assess form
  const [assessNotes, setAssessNotes] = useState('');
  const [caseStrength, setCaseStrength] = useState('กลาง');

  // Decide form
  const [decision, setDecision] = useState('PENDING');
  const [decisionNotes, setDecisionNotes] = useState('');
  // ตัดสินใจรับ = เปิดคดีทันที — field ชุดเดิมของ convert modal ย้ายมาที่นี่
  const [decideTitle, setDecideTitle] = useState('');
  const [decideLeadLawyerId, setDecideLeadLawyerId] = useState('');
  const [decideClaimedAmount, setDecideClaimedAmount] = useState('');
  const [decidePlaybookId, setDecidePlaybookId] = useState('');

  // Pre-litigation form
  const [preLitigationType, setPreLitigationType] = useState('GENERAL');
  const [preLitigationStatus, setPreLitigationStatus] = useState('NOT_STARTED');
  const [preLitigationNotes, setPreLitigationNotes] = useState('');
  const [settlementOfferAmount, setSettlementOfferAmount] = useState('');

  // Matter / referral details (filled on detail after quick create)
  const [editTitle, setEditTitle] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editMatterType, setEditMatterType] = useState('');
  const [editCaseTypeId, setEditCaseTypeId] = useState('');
  const [editPlaybookId, setEditPlaybookId] = useState('');
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [playbooks, setPlaybooks] = useState<PlaybookRelease[]>([]);
  const [editOpposingParty, setEditOpposingParty] = useState('');
  const [editPartyRole, setEditPartyRole] = useState('');
  const [editCustomerRef, setEditCustomerRef] = useState('');
  const [editPolicyNumber, setEditPolicyNumber] = useState('');
  const [editClaimNumber, setEditClaimNumber] = useState('');
  const [editIncidentDate, setEditIncidentDate] = useState('');
  const [editEstimatedDamage, setEditEstimatedDamage] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editReferralType, setEditReferralType] = useState('INDIVIDUAL');
  const [editReferralChannel, setEditReferralChannel] = useState('WALK_IN');
  const [editReferralName, setEditReferralName] = useState('');
  const [editIsOngoingElsewhere, setEditIsOngoingElsewhere] = useState(false);
  const [editExternalCaseNumber, setEditExternalCaseNumber] = useState('');
  const [editCurrentStageNote, setEditCurrentStageNote] = useState('');

  // Notice form
  const [noticeRecipient, setNoticeRecipient] = useState('');
  const [noticeDeadline, setNoticeDeadline] = useState('');
  const [noticeResult, setNoticeResult] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeReviewed, setNoticeReviewed] = useState(false);
  const [noticeAckMissingDocs, setNoticeAckMissingDocs] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);

  // Files. One list: the AI reads from it and it follows the case.
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Document facts analysis (summary + facts from selected files)
  const workspaceParams = useSearchParams();
  const [workspaceTab, setWorkspaceTab] = useState<'overview' | 'research' | 'documents'>(() => {
    const tab = workspaceParams.get('tab');
    return tab === 'research' || tab === 'documents' ? tab : 'overview';
  });

  // Precedent analysis
  const [analyses, setAnalyses] = useState<IntakePrecedentAnalysisItem[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);

  /**
   * The intake's files. The page used to keep two stores side by side — one the
   * AI could read, one that followed the case — so the same PDF had to be
   * uploaded twice. The API now adopts the older store into this one, so this
   * single list is everything.
   */
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [checklistSuggestions, setChecklistSuggestions] = useState<ChecklistClassificationSuggestion[]>([]);
  const [confirmedChecklist, setConfirmedChecklist] = useState<Record<string, string>>({});
  const [classifyingChecklist, setClassifyingChecklist] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  // Opening a case: reviewed once, in context, rather than a bare confirm box.
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState('');
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  /** รายการเอกสารที่ขอไว้ (แถวจริง) + จำนวนที่ยังขาด สำหรับด่านก่อนออกหนังสือ */
  const [documentRequests, setDocumentRequests] = useState<IntakeDocumentRequestItem[]>([]);
  const [taskCounts, setTaskCounts] = useState({ done: 0, total: 0 });
  // ทนายหลักอยู่บนคดีที่เปิดคู่กับเรื่องนี้ — เปลี่ยนจากหน้านี้ได้เลย
  const [caseLeadId, setCaseLeadId] = useState('');
  const [savingLead, setSavingLead] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState(false);
  const [savingPlaybook, setSavingPlaybook] = useState(false);
  const [missingDocCount, setMissingDocCount] = useState(0);
  const [newDocRequest, setNewDocRequest] = useState('');

  const loadDocuments = useCallback(async () => {
    if (!token || !id) return;
    try {
      const docs = await api.getIntakeDocuments(token, id as string);
      setDocuments(docs);
      setDocumentsError(null);
      // Keep only picks that still exist; a lawyer's own selection is never
      // widened by a reload.
      setSelectedAttachmentIds((previous) => {
        const available = new Set(docs.map((doc) => doc.id));
        const kept = previous.filter((docId) => available.has(docId));
        return kept.length === previous.length ? previous : kept;
      });
    } catch (err) {
      setDocuments([]);
      setDocumentsError(err instanceof ApiError ? err.message : 'โหลดรายการเอกสารไม่สำเร็จ');
    }
  }, [token, id]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    if (!token) return;
    api.getCaseTypes(token, true).then(setCaseTypes).catch(() => setCaseTypes([]));
    setupRequest<PlaybookRelease[]>(token, '/playbooks').then(setPlaybooks).catch(() => setPlaybooks([]));
  }, [token]);

  const loadDocumentRequests = useCallback(async () => {
    if (!id || !token) return;
    try {
      const result = await api.getIntakeDocumentRequests(token, id);
      setDocumentRequests(result.requests);
      setMissingDocCount(result.missingCount);
    } catch (err) {
      console.error(err);
    }
  }, [id, token]);

  useEffect(() => {
    void loadDocumentRequests();
  }, [loadDocumentRequests]);

  useEffect(() => {
    if (!id || !token) return;
    api
      .getIntakeChecklist(token, id)
      .then((items) =>
        setConfirmedChecklist(
          Object.fromEntries(
            items.filter((item) => item.documentId).map((item) => [item.label, item.documentId as string]),
          ),
        ),
      )
      .catch(console.error);
    setChecklistSuggestions([]);
    setClassifyError(null);
  }, [id, token]);

  /** Persist one checklist mark server-side; fire-and-forget. */
  const persistChecklistItem = useCallback(
    (label: string, documentId: string | null) => {
      if (!token || !id) return;
      api
        .setIntakeChecklistItem(token, id, label, documentId)
        // ด่านก่อนออกหนังสืออ่านจากตารางเดียวกัน จำนวนที่ขาดต้องตามทันที
        .then(() => loadDocumentRequests())
        .catch(console.error);
    },
    [token, id, loadDocumentRequests],
  );

  useEffect(() => {
    if (!token) return;
    api.getLawyers(token).then(setLawyers).catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    api.getIntake(token, id)
      .then((data) => {
        setIntake(data);
        api
          .listPrecedentAnalyses(token, id as string)
          .then((items) => {
            setAnalyses(items);
            // Prefer the newest COMPLETE run for the default view — a FAILED one
            // renders blank and would read as a successful "nothing found".
            const preferred = items.find((a) => a.status === 'COMPLETE') ?? items[0];
            if (preferred) setSelectedAnalysisId(preferred.id);
          })
          .catch(() => setAnalyses([]));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, id]);

  const reload = async () => {
    if (!token || !id) return;
    const updated = await api.getIntake(token, id);
    setIntake(updated);
  };

  const caseId = intake?.case?.id;
  useEffect(() => {
    if (!token || !caseId) return;
    api.getCase(token, caseId)
      .then((c) => setCaseLeadId((c as { leadLawyerId?: string }).leadLawyerId ?? ''))
      .catch(() => setCaseLeadId(''));
  }, [token, caseId]);

  const changeLeadLawyer = async (userId: string) => {
    if (!token || !caseId || !userId || userId === caseLeadId) return;
    setSavingLead(true);
    const previous = caseLeadId;
    setCaseLeadId(userId);
    try {
      await api.updateCase(token, caseId, { leadLawyerId: userId });
    } catch {
      setCaseLeadId(previous);
      setError('เปลี่ยนทนายหลักไม่สำเร็จ');
    } finally {
      setSavingLead(false);
    }
  };

  // เปลี่ยน playbook จากการ์ดได้เลย — API seed งานของ playbook ใหม่ให้ทันที
  const changePlaybook = async (releaseId: string) => {
    if (!token || !id || !releaseId) return;
    setSavingPlaybook(true);
    try {
      await api.updateIntake(token, id, { preferredPlaybookId: releaseId });
      setEditingPlaybook(false);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เปลี่ยน Playbook ไม่สำเร็จ');
    } finally {
      setSavingPlaybook(false);
    }
  };

  const handleAssess = async () => {
    if (!token || !id) return;
    setSubmitting(true);
    setError('');
    try {
      await api.assessIntake(token, id, { assessmentNotes: assessNotes, caseStrength });
      await reload();
      setModal(null);
      setAssessNotes('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const ACCEPT_DECISIONS = ['FILE_SUIT', 'NEGOTIATE_FIRST', 'SEND_NOTICE', 'COMPLAIN_TO_AUTHORITY'];

  const handleDecide = async () => {
    if (!token || !id) return;
    setSubmitting(true);
    setError('');
    const accepted = ACCEPT_DECISIONS.includes(decision);
    try {
      const result = (await api.decideIntake(token, id, {
        decision,
        decisionNotes: decisionNotes || undefined,
        ...(accepted
          ? {
              title: decideTitle.trim() || undefined,
              leadLawyerId: decideLeadLawyerId || undefined,
              claimedAmount: decideClaimedAmount.trim() ? Number(decideClaimedAmount) : undefined,
            }
          : {}),
      })) as IntakeItem;
      // รับดำเนินการ = คดีเปิดแล้ว — พาไปที่งานเลย
      const caseId = result.case?.id ?? result.relatedCase?.id;
      if (accepted && caseId) {
        if (decidePlaybookId) {
          await setupRequest(token, `/cases/${caseId}/apply`, { releaseId: decidePlaybookId }).catch(console.error);
        }
        router.push(`/cases/${caseId}`);
        return;
      }
      await reload();
      setModal(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNotice = async () => {
    if (!token || !id) return;
    if (noticeContent && !noticeReviewed) {
      setError('กรุณายืนยันว่าตรวจสอบเนื้อหาหนังสือแล้วก่อนบันทึก');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.noticeIntake(token, id, {
        noticeRecipient: noticeRecipient || undefined,
        noticeDeadline: noticeDeadline || undefined,
        noticeResult: noticeResult || undefined,
        noticeContent: noticeContent || undefined,
        noticeContentReviewed: noticeContent ? noticeReviewed : undefined,
        // เอกสารยังไม่ครบ: ฝั่ง API จะปฏิเสธถ้าไม่ได้รับทราบ — หน้าจอแสดง
        // จำนวนที่ขาดไว้แล้วข้าง ๆ ปุ่ม ติ๊กแล้วจึงส่งค่านี้ไป
        acknowledgeMissingDocuments: noticeAckMissingDocs || undefined,
      });
      await reload();
      setModal(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const openPreLitigationModal = () => {
    if (!intake) return;
    setPreLitigationType(intake.preLitigationType || 'GENERAL');
    setPreLitigationStatus(intake.preLitigationStatus || 'NOT_STARTED');
    setPreLitigationNotes(intake.preLitigationNotes || '');
    setSettlementOfferAmount(
      intake.settlementOfferAmount != null ? String(intake.settlementOfferAmount) : '',
    );
    setModal('prelitigation');
  };

  const openDetailsModal = () => {
    if (!intake) return;
    setEditTitle(intake.title || '');
    setEditClientName(intake.clientName || '');
    setEditMatterType(intake.matterType || '');
    setEditCaseTypeId(intake.caseTypeId || '');
    setEditPlaybookId(intake.preferredPlaybookId || '');
    setEditOpposingParty(intake.opposingParty || '');
    setEditPartyRole(intake.partyRole || '');
    setEditCustomerRef(intake.customerRef || '');
    setEditPolicyNumber(intake.policyNumber || '');
    setEditClaimNumber(intake.claimNumber || '');
    setEditIncidentDate(intake.incidentDate ? intake.incidentDate.slice(0, 10) : '');
    setEditEstimatedDamage(intake.estimatedDamage != null ? String(intake.estimatedDamage) : '');
    setEditDescription(intake.description || '');
    setEditReferralType(intake.referralType || 'INDIVIDUAL');
    setEditReferralChannel(intake.referralChannel || 'WALK_IN');
    setEditReferralName(intake.referralName || '');
    setEditIsOngoingElsewhere(!!intake.isOngoingElsewhere);
    setEditExternalCaseNumber(intake.externalCaseNumber || '');
    setEditCurrentStageNote(intake.currentStageNote || '');
    setModal('details');
  };

  const handlePreLitigationUpdate = async () => {
    if (!token || !id) return;
    setSubmitting(true);
    setError('');
    try {
      await api.updateIntake(token, id, {
        preLitigationType,
        preLitigationStatus,
        preLitigationNotes: preLitigationNotes || undefined,
        settlementOfferAmount: settlementOfferAmount ? Number(settlementOfferAmount) : null,
      });
      await reload();
      setModal(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDetailsUpdate = async () => {
    if (!token || !id) return;
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        title: editTitle.trim() || undefined,
        matterType: editMatterType || undefined,
        caseTypeId: editCaseTypeId || undefined,
        preferredPlaybookId: editPlaybookId || undefined,
        opposingParty: editOpposingParty || undefined,
        partyRole: editPartyRole || undefined,
        customerRef: editCustomerRef || undefined,
        policyNumber: editPolicyNumber || undefined,
        claimNumber: editClaimNumber || undefined,
        incidentDate: editIncidentDate || undefined,
        description: editDescription || undefined,
        estimatedDamage: editEstimatedDamage ? Number(editEstimatedDamage) : undefined,
        referralType: editReferralType,
        referralChannel: editReferralChannel,
        referralName: editReferralName || undefined,
        isOngoingElsewhere: editIsOngoingElsewhere,
        externalCaseNumber: editIsOngoingElsewhere ? (editExternalCaseNumber || undefined) : undefined,
        currentStageNote: editIsOngoingElsewhere ? (editCurrentStageNote || undefined) : undefined,
      };
      if (!intake?.clientId && editClientName.trim()) {
        payload.clientName = editClientName.trim();
      }
      await api.updateIntake(token, id, payload);
      await reload();
      setModal(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuotePdfExport = () => {
    if (quoteLines.length === 0) setQuoteLines(initialCaseCosts());
    setModal('quote');
  };

  const handleQuotePrint = async () => {
    if (!intake) return;
    // เปิดหน้าต่างก่อน await — popup ที่เปิดหลัง async gap โดนเบราว์เซอร์บล็อก
    const win = window.open('', '_blank');
    if (!win) {
      setError('เปิดหน้าต่างพิมพ์ไม่ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้');
      return;
    }
    // ข้อมูลออกเอกสารของลูกความ (เลขภาษี/ที่อยู่) — พลาดได้โดยไม่บล็อกการพิมพ์
    const client = intake.clientId && token
      ? await api.getClient(token, intake.clientId).catch(() => null)
      : null;
    const html = buildQuoteHtml({
      firmName: user?.firmName ?? '',
      issuedByName: user ? `${user.firstName} ${user.lastName}` : '',
      clientName: intake.client?.name ?? intake.clientName ?? '',
      clientTaxId: client?.taxId,
      clientBranch: client?.branch,
      clientAddress: client?.address,
      matterTitle: intake.title ?? '',
      matterTypeLabel: intake.matterType
        ? (MATTER_TYPE_LABELS[intake.matterType] ?? intake.matterType)
        : '',
      opposingParty: intake.opposingParty ?? '',
      estimatedDamage: intake.estimatedDamage ?? null,
      lines: quoteLines,
    });
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const openNoticeModal = (analysisId?: string) => {
    if (analysisId) setSelectedAnalysisId(analysisId);
    setNoticeRecipient('');
    setNoticeDeadline('');
    setNoticeResult('');
    setNoticeContent('');
    setNoticeReviewed(false);
    setError('');
    setModal('notice');
  };

  const handleDraftNotice = async () => {
    if (!token || !id) return;
    setDrafting(true);
    setError('');
    try {
      const { content } = await api.draftNoticeIntake(
        token,
        id,
        selectedAnalysisId ?? undefined,
      );
      setNoticeContent(content);
      setNoticeReviewed(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setDrafting(false);
    }
  };

  const handleDraftFromAnalysis = (analysisId: string) => {
    // Open the form only — AI draft waits for the explicit button in the modal.
    openNoticeModal(analysisId);
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!token || !intake || uploadingFiles) return;
    if (files.length > 10) { setFileError('อัปโหลดได้ครั้งละไม่เกิน 10 ไฟล์'); return; }
    setUploadingFiles(true); setFileError(null);
    const failures: string[] = [];
    const uploadedIds: string[] = [];
    // One at a time so a rejected file leaves the rest uploaded: the retry then
    // only has to cover what actually failed.
    for (const file of files) {
      try {
        const uploaded = await api.uploadIntakeDocument(token, intake.id, file);
        uploadedIds.push(uploaded.id);
      } catch { failures.push(file.name); }
    }
    try {
      await loadDocuments();
      setSelectedAttachmentIds((previous) => [...new Set([...previous, ...uploadedIds])].slice(0, 10));
    } catch { failures.push('โหลดรายการล่าสุดไม่สำเร็จ กรุณาโหลดหน้าใหม่ก่อนอัปโหลดซ้ำ'); }
    if (failures.length) setFileError(`ไฟล์ที่ไม่สำเร็จ: ${failures.join(', ')} · รองรับ PDF ไม่เกิน 30MB ต่อไฟล์`);
    setUploadingFiles(false);
  };

  const requestChecklistSuggestions = async (documentIds: string[]) => {
    if (!token || !intake || !documentIds.length) return;
    const labels = (
      documentRequests.length
        ? documentRequests.map((r) => ({ label: r.name }))
        : preLitigationDocuments(intake.preLitigationType)
    ).map((item) => item.label);
    const confirmed = confirmedChecklist;
    setClassifyingChecklist(true);
    setClassifyError(null);
    try {
      const suggestions = await api.classifyIntakeChecklist(token, intake.id, documentIds, labels);
      setChecklistSuggestions((previous) => {
        const confirmedDocs = new Set(Object.values(confirmed).filter(isChecklistDocId));
        const byDoc = new Map(previous.map((item) => [item.documentId, item]));
        for (const suggestion of suggestions) {
          if (confirmedDocs.has(suggestion.documentId)) continue;
          const existingMark = confirmed[suggestion.label];
          if (isChecklistDocId(existingMark) || existingMark === CHECKLIST_MANUAL) continue;
          byDoc.set(suggestion.documentId, suggestion);
        }
        return [...byDoc.values()];
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setClassifyError('เครดิต AI ไม่เพียงพอสำหรับแนะนำประเภทเอกสาร');
      } else {
        setClassifyError(err instanceof ApiError ? err.message : 'AI แนะนำประเภทเอกสารไม่สำเร็จ');
      }
    } finally {
      setClassifyingChecklist(false);
    }
  };

  const confirmChecklistSuggestion = (suggestion: ChecklistClassificationSuggestion) => {
    if (!id) return;
    setConfirmedChecklist((previous) => ({ ...previous, [suggestion.label]: suggestion.documentId }));
    persistChecklistItem(suggestion.label, suggestion.documentId);
    setChecklistSuggestions((previous) => previous.filter((item) => item.documentId !== suggestion.documentId));
  };

  const dismissChecklistSuggestion = (documentId: string) => {
    setChecklistSuggestions((previous) => previous.filter((item) => item.documentId !== documentId));
  };

  const toggleChecklistReceived = (item: { label: string; hints: string[] }) => {
    if (!id) return;
    if (intake?.status === 'REJECTED' || intake?.status === 'CONVERTED' || intake?.status === 'CONSULTED') {
      return;
    }
    setConfirmedChecklist((previous) => {
      const current = previous[item.label];
      const filenameMatched = documents.some((doc) => matchesDocument(doc.filename, item.hints));
      const isReceived =
        (current !== undefined && current !== CHECKLIST_SKIPPED) ||
        (current !== CHECKLIST_SKIPPED && filenameMatched);
      const next = { ...previous };
      if (isReceived) {
        if (filenameMatched) {
          next[item.label] = CHECKLIST_SKIPPED;
          persistChecklistItem(item.label, CHECKLIST_SKIPPED);
        } else {
          delete next[item.label];
          persistChecklistItem(item.label, null);
        }
      } else {
        const value = isChecklistDocId(current) ? current : CHECKLIST_MANUAL;
        next[item.label] = value;
        persistChecklistItem(item.label, value);
      }
      return next;
    });
  };

  const handleDeleteFile = async (documentId: string, filename: string) => {
    if (!token || !intake) return;
    if (!confirm(`ลบ ${filename}? ไฟล์จะหายจากเรื่องนี้ถาวร`)) return;
    setFileError(null);
    try {
      await api.deleteIntakeDocument(token, intake.id, documentId);
      setSelectedAttachmentIds((previous) => previous.filter((docId) => docId !== documentId));
      setChecklistSuggestions((previous) => previous.filter((item) => item.documentId !== documentId));
      if (id) {
        setConfirmedChecklist((previous) => {
          const removed = Object.entries(previous).filter(([, docId]) => docId === documentId);
          removed.forEach(([label]) => persistChecklistItem(label, null));
          return Object.fromEntries(
            Object.entries(previous).filter(([, docId]) => docId !== documentId),
          );
        });
      }
      await loadDocuments();
    } catch (err) {
      setFileError(err instanceof ApiError ? err.message : 'ลบไฟล์ไม่สำเร็จ');
    }
  };

  const handleDownloadDocument = async (doc: DocumentItem) => {
    if (!token || !id) return;
    setDocumentsError(null);
    try {
      const blob = await api.downloadIntakeDocument(token, id as string, doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDocumentsError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  const handleConvert = async (payload: {
    title: string;
    leadLawyerId?: string;
    claimedAmount?: number;
    playbookId?: string;
  }) => {
    if (!token || !id || submitting) return;
    setSubmitting(true);
    setConvertError('');
    try {
      const result = (await api.convertIntake(token, id, {
        title: payload.title || undefined,
        leadLawyerId: payload.leadLawyerId,
        claimedAmount: payload.claimedAmount,
      })) as { id?: string; ownRef?: string } & IntakeItem;
      // A new case comes back as the case itself; attaching to an existing one
      // returns that case. Either way the lawyer lands where the work now is.
      const caseId = result.case?.id ?? result.id ?? intake?.relatedCase?.id;
      if (caseId) {
        if (payload.playbookId) {
          await setupRequest(token, `/cases/${caseId}/apply`, { releaseId: payload.playbookId }).catch(console.error);
        }
        router.push(`/cases/${caseId}`);
        return;
      }
      setConverting(false);
      await reload();
    } catch (err) {
      setConvertError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoading title="กำลังโหลดเรื่องรับเข้า" lines={4} />;
  if (!intake) return <EmptyState title="ไม่พบข้อมูล" description="เรื่องรับเข้านี้อาจถูกลบหรือแปลงเป็นคดีไปแล้ว" />;

  const STEPS = ['RECEIVED', 'ASSESSING', 'ACCEPTED'];
  const currentStep = STEPS.indexOf(intake.status);
  const currentAnalysis =
    analyses.find((a) => a.id === selectedAnalysisId) ?? analyses[0];
  // แถวจริงจาก IntakeDocumentRequest — template ถูก seed เป็นแถวไว้แล้วฝั่ง API
  // จึงครอบทั้งรายการมาตรฐานและรายการที่ทนายเพิ่มเองด้วยรายการเดียว
  // dedupe ตามชื่อ — document requests อาจมีชื่อซ้ำ (เช่นข้อมูลที่ merge มาจาก checklist เดิม)
  // ชื่อซ้ำทำให้ React key ชน และ toggle รายการหนึ่งไปเปลี่ยนอีกรายการ
  const expectedDocuments = [
    ...new Map(
      (documentRequests.length
        ? documentRequests.map((r) => ({ label: r.name, hints: documentHintsFor(r.name) }))
        : preLitigationDocuments(intake.preLitigationType)
      ).map((item) => [item.label, item] as const),
    ).values(),
  ];
  const isChecklistMatched = (item: { label: string; hints: string[] }) => {
    const mark = confirmedChecklist[item.label];
    if (mark === CHECKLIST_SKIPPED) return false;
    if (mark) return true;
    return documents.some((doc) => matchesDocument(doc.filename, item.hints));
  };
  const matchedExpectedDocuments = expectedDocuments.filter(isChecklistMatched);
  const missingExpectedDocuments = expectedDocuments.length - matchedExpectedDocuments.length;
  const pendingSuggestions = checklistSuggestions.filter(
    (suggestion) =>
      !isChecklistDocId(confirmedChecklist[suggestion.label]) &&
      confirmedChecklist[suggestion.label] !== CHECKLIST_MANUAL &&
      !Object.values(confirmedChecklist).filter(isChecklistDocId).includes(suggestion.documentId),
  );

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 text-2xl font-bold">
              {intake.title || intake.matterType || intake.clientName || intake.client?.name || '(ไม่ระบุชื่อ)'}
            </h1>
            {intake.partyRole && (
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-900">
                {intake.partyRole === 'PLAINTIFF' ? 'โจทก์' : 'จำเลย'}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{intake.referralName || intake.clientName || intake.client?.name || '—'} · รับเมื่อ {formatDateOrDash(intake.receivedDate)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => openNoticeModal()}>ออก Notice</Button>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLOR[intake.status] ?? 'bg-gray-100 text-gray-700'}`}>
            {STATUS_LABELS[intake.status] ?? intake.status}
          </span>
        </div>
      </div>

      {/* Summary strip — ตัวเลขที่ทนายเปิดหน้านี้มาดูก่อนอย่างอื่น */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button type="button" onClick={() => setWorkspaceTab('overview')} className="rounded-xl border border-border bg-card p-3 text-left shadow-sm hover:bg-muted/40">
          <p className="text-xs text-muted-foreground">งานที่ต้องทำ</p>
          <p className="mt-0.5 text-xl font-bold">{taskCounts.done}/{taskCounts.total}</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: taskCounts.total ? `${Math.round((taskCounts.done / taskCounts.total) * 100)}%` : '0%' }} />
          </div>
        </button>
        <button type="button" onClick={() => setWorkspaceTab('documents')} className="rounded-xl border border-border bg-card p-3 text-left shadow-sm hover:bg-muted/40">
          <p className="text-xs text-muted-foreground">เอกสารที่ต้องมี</p>
          <p className="mt-0.5 text-xl font-bold">
            {matchedExpectedDocuments.length}/{expectedDocuments.length}
            {missingExpectedDocuments > 0 && (
              <span className="ml-2 text-xs font-medium text-destructive">ขาด {missingExpectedDocuments} รายการ</span>
            )}
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-emerald-600" style={{ width: expectedDocuments.length ? `${Math.round((matchedExpectedDocuments.length / expectedDocuments.length) * 100)}%` : '0%' }} />
          </div>
        </button>
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Notice / เจรจา</p>
          {intake.noticeIssuedAt ? (
            <>
              <p className="mt-0.5 text-sm font-bold">
                {intake.noticeDeadline ? `ครบกำหนด ${formatDateOrDash(intake.noticeDeadline)}` : `ออกแล้ว ${formatDateOrDash(intake.noticeIssuedAt)}`}
              </p>
              <p className="text-xs text-muted-foreground">ถึง {intake.noticeRecipient ?? '—'}</p>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-sm font-bold">ยังไม่ออก Notice</p>
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => openNoticeModal()}>
                ออก Notice ตอนไหนก็ได้ →
              </button>
            </>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">กำหนด/อายุความ</p>
          {intake.deadlineDate ? (
            <>
              <p className="mt-0.5 text-sm font-bold text-amber-700">
                อีก {Math.max(0, Math.ceil((new Date(intake.deadlineDate).getTime() - Date.now()) / 86400000))} วัน
              </p>
              <p className="text-xs text-muted-foreground">ครบ {formatDateOrDash(intake.deadlineDate)}</p>
            </>
          ) : (
            <p className="mt-0.5 text-sm font-bold text-muted-foreground">ยังไม่ระบุ</p>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="พื้นที่ทำงานของเรื่อง" className="flex flex-wrap gap-2 border-b border-border pb-3">
        {([['overview', 'ข้อมูลและติดตาม'], ['research', 'ข้อเท็จจริงและฎีกา'], ['documents', `เอกสาร (${documents.length})`]] as const).map(([value, label]) => <button key={value} role="tab" tabIndex={workspaceTab === value ? 0 : -1} onKeyDown={(event) => {
          const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
          if (!keys.includes(event.key)) return;
          event.preventDefault();
          const tabs = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
          const index = tabs.indexOf(event.currentTarget);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next].click(); tabs[next].focus();
        }} aria-selected={workspaceTab === value} aria-controls={`intake-${value}`} type="button" onClick={() => setWorkspaceTab(value)} className={`rounded-lg px-3 py-2 text-sm ${workspaceTab === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{label}</button>)}
      </div>
      <div id="intake-research" role="tabpanel" aria-label="ข้อเท็จจริงและฎีกา" hidden={workspaceTab !== 'research'}>
        <ResearchWorkspace intakeId={id} initialText={intake.description ?? ''} documents={documents} onUploaded={() => void loadDocuments()} onResult={(row) => { setAnalyses((prev) => [row, ...prev.filter((a) => a.id !== row.id)]); setSelectedAnalysisId(row.id); }} />
      </div>
      <div id="intake-overview" role="tabpanel" aria-label="ข้อมูลและติดตาม" hidden={workspaceTab !== 'overview'} className="space-y-4">
      {/* ขั้นตอนมีที่เดียว: แถบ "ขั้นตอนงานรับเรื่อง" ในคอลัมน์ซ้ายด้านล่าง */}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">สถานะรับเรื่องก่อนฟ้อง</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {PRE_LITIGATION_STATUS_LABELS[intake.preLitigationStatus] ?? intake.preLitigationStatus}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {intake.status === 'RECEIVED' && (
              <Button onClick={() => setModal('assess')}>บันทึกผลประเมิน</Button>
            )}
            {intake.status === 'ASSESSING' && (
              <Button onClick={() => setModal('decide')}>ตัดสินใจแนวทาง</Button>
            )}
            {/* งานก่อนฟ้องยังทำต่อได้หลังเปิดคดี — โนติส/เจรจา/ใบเสนอราคาบันทึกที่นี่ */}
            {['ACCEPTED', 'CONVERTED'].includes(intake.status) && (
              <Button variant="outline" onClick={() => openNoticeModal()}>ออก Notice</Button>
            )}
            <Button variant="outline" onClick={handleQuotePdfExport}>
              Export ใบเสนอราคา PDF
            </Button>
            <Button variant="outline" onClick={openPreLitigationModal}>อัปเดต</Button>
            {intake.status === 'ACCEPTED' && (
              <Button onClick={() => setConverting(true)} disabled={submitting}>
                {intake.relatedCase ? 'เพิ่มลงคดีเดิม' : 'เปิดเป็นคดี'}
              </Button>
            )}
            {intake.status === 'CONVERTED' && intake.case && (
              <Link href={`/cases/${intake.case.id}`}>
                <Button variant="outline">ดูคดี {intake.case.ownRef}</Button>
              </Link>
            )}
            {!intake.case && intake.relatedCase && (
              <Link href={`/cases/${intake.relatedCase.id}`}>
                <Button variant="outline">ดูคดีที่เกี่ยวข้อง</Button>
              </Link>
            )}
          </div>
        </CardHeader>
      </Card>

      </div>
      <div id="intake-documents" role="tabpanel" aria-label="เอกสาร" hidden={workspaceTab !== 'documents'}>
      <Button variant="outline" onClick={() => setWorkspaceTab('research')}>ใช้เอกสารจัดข้อเท็จจริงหรือค้นฎีกา →</Button>
      {currentAnalysis?.extractedFacts?.selectedAttachments && <p className="text-xs text-muted-foreground">ไฟล์ที่ใช้ในผลวิเคราะห์ที่แสดง: {currentAnalysis.extractedFacts.selectedAttachments.map((file) => file.filename).join(', ') || 'ใช้เฉพาะรายละเอียดเรื่อง'}</p>}
      {currentAnalysis?.extractedFacts?.attachmentWarnings?.map((warning) => <p key={warning} className="text-sm text-destructive">{warning}</p>)}

      <Card id="intake-files">
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">เอกสารของเรื่องนี้</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              checklist กับไฟล์ที่อัปโหลดอยู่ด้วยกัน — จับคู่จากชื่อไฟล์เบื้องต้น แล้ววิเคราะห์ต่อได้เลย
            </p>
          </div>

        </CardHeader>
        <CardContent className="space-y-4">
          {intake.status !== 'REJECTED' &&
            intake.status !== 'CONVERTED' &&
            intake.status !== 'CONSULTED' && (
              <DocumentDropZone
                multiple
                accept=".pdf,application/pdf"
                loading={uploadingFiles}
                disabled={uploadingFiles}
                label="ลากไฟล์ PDF / TXT มาวาง หรือคลิกเลือก"
                loadingLabel="กำลังอัปโหลด..."
                hint={`แนบ PDF / TXT ไม่เกิน 30MB · เลือกวิเคราะห์ได้สูงสุด ${AI_UPLOAD_MAX_FILES} ไฟล์`}
                onFiles={(files) => void handleUploadFiles(files)}
              />
            )}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">เอกสารที่คาดว่าจะถูกส่งเข้ามา</p>
              {documents.length > 0 &&
                intake.status !== 'REJECTED' &&
                intake.status !== 'CONVERTED' &&
                intake.status !== 'CONSULTED' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={classifyingChecklist || uploadingFiles}
                    onClick={() => requestChecklistSuggestions(documents.map((doc) => doc.id).slice(0, 10))}
                  >
                    {classifyingChecklist ? 'AI กำลังแนะนำ...' : 'ให้ AI แนะนำประเภท'}
                  </Button>
                )}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {expectedDocuments.map((item) => {
                const matched = isChecklistMatched(item);
                const confirmedDocId = confirmedChecklist[item.label];
                const confirmedDoc = isChecklistDocId(confirmedDocId)
                  ? documents.find((doc) => doc.id === confirmedDocId)
                  : undefined;
                const pending = pendingSuggestions.find((suggestion) => suggestion.label === item.label);
                const canToggle =
                  intake.status !== 'REJECTED' &&
                  intake.status !== 'CONVERTED' &&
                  intake.status !== 'CONSULTED';
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!canToggle}
                    onClick={() => toggleChecklistReceived(item)}
                    aria-pressed={matched}
                    className="rounded-lg border border-transparent px-1 py-0.5 text-left text-sm enabled:hover:bg-muted/50 disabled:cursor-default"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                          matched
                            ? 'bg-green-100 text-green-700'
                            : pending
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {matched ? '✓' : pending ? '?' : '○'}
                      </span>
                      <div className="min-w-0">
                        <span className={matched ? 'text-foreground' : 'text-muted-foreground'}>
                          {item.label}
                        </span>
                        {confirmedDoc && (
                          <p className="mt-0.5 text-xs text-muted-foreground">ยืนยันแล้ว: {confirmedDoc.filename}</p>
                        )}
                        {matched && confirmedDocId === CHECKLIST_MANUAL && (
                          <p className="mt-0.5 text-xs text-muted-foreground">ติ๊กเองว่าได้รับแล้ว</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {/* เพิ่มเอกสารที่ต้องขอนอกเหนือรายการมาตรฐาน — รายการที่จำเป็นและยังไม่ได้รับ
                จะกั้นการออกหนังสือไว้ */}
            {intake.status !== 'REJECTED' &&
              intake.status !== 'CONVERTED' &&
              intake.status !== 'CONSULTED' && (
                <form
                  className="mt-3 flex flex-wrap items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = newDocRequest.trim();
                    if (!name || !token || !id) return;
                    setNewDocRequest('');
                    try {
                      await api.addIntakeDocumentRequests(token, id, [{ name }]);
                      await loadDocumentRequests();
                      await reload();
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                >
                  <input
                    value={newDocRequest}
                    onChange={(e) => setNewDocRequest(e.target.value)}
                    placeholder="เพิ่มเอกสารที่ต้องขอเพิ่มเติม"
                    className="h-9 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm"
                  />
                  <Button type="submit" size="sm" variant="outline" disabled={!newDocRequest.trim()}>
                    เพิ่มรายการ
                  </Button>
                  {missingDocCount > 0 && (
                    <span className="text-xs text-amber-700">
                      รายการเอกสารที่ขอเพิ่มเติม: ยังขาด {missingDocCount} รายการ — แยกจาก checklist ด้านบน
                    </span>
                  )}
                </form>
              )}
            <p className="mt-2 text-xs text-muted-foreground">
              พร้อม {matchedExpectedDocuments.length}/{expectedDocuments.length}
              {missingExpectedDocuments > 0 ? ` · ขาด ${missingExpectedDocuments}` : ' · ครบตาม checklist'}
              {' · '}ติ๊กเองได้ · จับคู่ชื่อไฟล์อัตโนมัติ · หรือกด「ให้ AI แนะนำประเภท」แล้วยืนยัน
              {' · '}แนบ PDF / TXT ไม่เกิน 30MB · เลือกวิเคราะห์ได้สูงสุด {AI_UPLOAD_MAX_FILES} ไฟล์ · แนะนำประเภท {AI_CREDIT_COST.DOCUMENT_ANALYSIS} เครดิต
            </p>
            {classifyError && (
              <p className="mt-2 text-sm text-destructive" role="alert">{classifyError}</p>
            )}
            {pendingSuggestions.length > 0 && (
              <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                <p className="text-sm font-medium text-amber-950">AI แนะนำประเภทเอกสาร — ยืนยันก่อนติ๊ก checklist</p>
                {pendingSuggestions.map((suggestion) => (
                  <div key={suggestion.documentId} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-amber-950">
                        {suggestion.filename}
                        <span className="font-normal text-amber-900"> → {suggestion.label}</span>
                      </p>
                      {suggestion.sourceExcerpt && (
                        <p className="mt-0.5 text-xs text-amber-900/80">“{suggestion.sourceExcerpt}”</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" size="sm" onClick={() => confirmChecklistSuggestion(suggestion)}>
                        ยืนยัน
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => dismissChecklistSuggestion(suggestion.documentId)}>
                        ไม่ใช่
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">ไฟล์ที่อัปโหลดแล้ว ({documents.length})</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={uploadingFiles || documents.length === 0}
                  onClick={() => setSelectedAttachmentIds(selectedAttachmentIds.length ? [] : documents.slice(0, 10).map((file) => file.id))}
                >
                  {selectedAttachmentIds.length ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด (สูงสุด 10)'}
                </Button>
              </div>
            </div>
            {fileError && <p className="mb-2 text-sm text-destructive" role="alert">{fileError}</p>}
            {documentsError && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-sm text-destructive" role="alert">{documentsError}</p>
                <Button type="button" size="sm" variant="outline" onClick={loadDocuments}>ลองใหม่</Button>
              </div>
            )}
              {documents.length > 0 ? (
              <ul className="space-y-1">
                {documents.map((doc) => {
                  const selected = selectedAttachmentIds.includes(doc.id);
                  const suggestion = pendingSuggestions.find((item) => item.documentId === doc.id);
                  const confirmedLabel = Object.entries(confirmedChecklist).find(([, docId]) => docId === doc.id)?.[0];
                  return (
                    <li key={doc.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                      <label className="flex min-w-0 flex-1 items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected}
                          disabled={uploadingFiles || (!selected && selectedAttachmentIds.length >= 10)}
                          onChange={() => setSelectedAttachmentIds((previous) => previous.includes(doc.id) ? previous.filter((id) => id !== doc.id) : [...previous, doc.id])}
                        />
                        <span className="min-w-0">
                          <span className="break-words">{doc.filename}</span>
                          {confirmedLabel && (
                            <span className="mt-1 block text-xs text-green-700">ยืนยันแล้ว: {confirmedLabel}</span>
                          )}
                          {!confirmedLabel && suggestion && (
                            <span className="mt-1 block text-xs text-amber-800">AI แนะนำ: {suggestion.label}</span>
                          )}
                        </span>
                      </label>
                      <div className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(doc)}
                          className="text-xs text-primary hover:underline"
                        >
                          ดาวน์โหลด
                        </button>
                        <button
                          type="button"
                          disabled={uploadingFiles}
                          onClick={() => handleDeleteFile(doc.id, doc.filename)}
                          className="text-xs text-destructive hover:underline disabled:opacity-50"
                        >
                          ลบ
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              !documentsError && (
                <p className="text-sm text-muted-foreground">
                  ยังไม่มีไฟล์ — กด “เพิ่มไฟล์” เพื่ออัปโหลดเอกสารตาม checklist ด้านบน
                </p>
              )
            )}
          </div>
        </CardContent>
      </Card>

      </div>
      <div hidden={workspaceTab !== 'overview'} className="space-y-4">
      {/* Info cards */}
      {/* Workspace 2 คอลัมน์ตามแบบ: ซ้าย = งาน/เอกสาร/Notice, ขวา = รายละเอียด/ทีม/Playbook/ติดตาม */}
      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {token && (
            <>
              <IntakeStageBar intake={intake} token={token} onChanged={reload} />
              {/* key: เปลี่ยน playbook แล้วให้โหลดงานชุดใหม่ทันที */}
              <IntakeTasksPanel key={intake.preferredPlaybookId ?? 'none'} intakeId={intake.id} lawyers={lawyers} onCountsChange={setTaskCounts} />
            </>
          )}

          {/* เอกสารที่ต้องมี — สรุป checklist, งานเต็มอยู่ tab เอกสาร */}
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">
                เอกสารที่ต้องมี{' '}
                {missingExpectedDocuments > 0 ? (
                  <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">ขาด {missingExpectedDocuments} รายการ</span>
                ) : (
                  <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">ครบ</span>
                )}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setWorkspaceTab('documents')}>อัปโหลด / จัดการไฟล์ →</Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {expectedDocuments.map((item) => {
                  const ok = isChecklistMatched(item);
                  return (
                    <div key={item.label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60'}`}>
                      <span className={ok ? 'text-emerald-600' : 'text-red-600'}>{ok ? '✓' : '!'}</span>
                      <span className="min-w-0 break-words">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* หนังสือทวงถาม (Notice) — ออกตอนไหนก็ได้ */}
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">หนังสือทวงถาม (Notice)</CardTitle>
              <div className="flex flex-wrap gap-2">
                {currentAnalysis?.status === 'COMPLETE' && (
                  <Button variant="outline" size="sm" onClick={() => handleDraftFromAnalysis(currentAnalysis.id)}>✦ AI ร่างหนังสือ</Button>
                )}
                <Button size="sm" onClick={() => openNoticeModal()}>+ ออก Notice ฉบับใหม่</Button>
              </div>
            </CardHeader>
            <CardContent>
              {intake.noticeIssuedAt ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">ฉบับล่าสุด</span>
                  <span>ถึง {intake.noticeRecipient ?? '—'} · ออก {formatDateOrDash(intake.noticeIssuedAt)}{intake.noticeDeadline ? ` · ครบกำหนด ${formatDateOrDash(intake.noticeDeadline)}` : ''}</span>
                  {intake.noticeResult && <span className="text-muted-foreground">· ผล: {intake.noticeResult}</span>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">ยังไม่ออก Notice — ออกได้ทุกขั้น ทุกฉบับเก็บประวัติไว้ที่นี่</p>
              )}
            </CardContent>
          </Card>

          <InvoicePanel target={{ intakeId: intake.id }} customers={intake.customers ?? []} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">รายละเอียด</CardTitle>
              {intake.status !== 'CONVERTED' && (
                <Button variant="outline" size="sm" onClick={openDetailsModal}>แก้ไข</Button>
              )}
            </CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="ประเภทเรื่อง" value={intake.matterType ? (MATTER_TYPE_LABELS[intake.matterType] ?? intake.matterType) : undefined} />
            <InfoRow label="เลขอ้างอิงลูกค้า" value={intake.customerRef} />
            <InfoRow label="เลขกรมธรรม์" value={intake.policyNumber} />
            <InfoRow label="เลขเคลม" value={intake.claimNumber} />
            <InfoRow
              label="ฝ่ายเรา"
              value={intake.partyRole === 'PLAINTIFF' ? 'โจทก์' : intake.partyRole === 'DEFENDANT' ? 'จำเลย' : undefined}
            />
            <InfoRow label="คู่กรณี" value={intake.opposingParty} />
            <InfoRow label="วันเกิดเหตุ" value={formatDateOrDash(intake.incidentDate)} />
            <InfoRow label="ความเสียหาย (บาท)" value={intake.estimatedDamage != null ? intake.estimatedDamage.toLocaleString('th-TH') : undefined} />
            <InfoRow label="รายละเอียด" value={intake.description} />
            {intake.isOngoingElsewhere && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-medium text-amber-900">คดีนี้ดำเนินอยู่แล้วที่อื่นก่อนเข้าสำนักงาน</p>
                {intake.externalCaseNumber && <p className="mt-1 text-amber-800">เลขคดี/หมายเลขดำ: {intake.externalCaseNumber}</p>}
                {intake.currentStageNote && <p className="mt-1 text-amber-800">สถานะปัจจุบัน: {intake.currentStageNote}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ผู้ส่งเรื่อง</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="ประเภท" value={REFERRAL_TYPE_LABELS[intake.referralType] ?? intake.referralType} />
            <InfoRow label="ช่องทาง" value={REFERRAL_CHANNEL_LABELS[intake.referralChannel] ?? intake.referralChannel} />
            <InfoRow label="ชื่อ" value={intake.referralName} />
            <InfoRow label="รับโดย" value={intake.receivedBy ? `${intake.receivedBy.firstName} ${intake.receivedBy.lastName}` : undefined} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ลูกความ / ลูกค้า</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="ลูกความ" value={intake.client?.name ?? intake.clientName} />
            {intake.additionalClients && intake.additionalClients.length > 0 && (
              <InfoRow
                label="ลูกความคนอื่น"
                value={intake.additionalClients.map((ac) => ac.client.name).join(', ')}
              />
            )}
            {/* ลูกค้า = ผู้ว่าจ้างที่เราวางบิล ซ่อนไว้เมื่อเป็นคนเดียวกับลูกความ */}
            {!customersSameAsClient(intake.customers, intake.clientId) && (
              <InfoRow label="ลูกค้า (ผู้ว่าจ้าง)" value={formatCustomers(intake.customers)} />
            )}
          </CardContent>
        </Card>

        {/* ทีมทำงาน — ทนายหลักเปลี่ยนได้ + ผู้ช่วย */}
        <Card>
          <CardHeader><CardTitle className="text-base">ทีมทำงาน</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {intake.case?.id && (
              <div>
                <label htmlFor="intake-lead-lawyer" className="block text-xs font-semibold">ทนายหลัก (Lead)</label>
                <select
                  id="intake-lead-lawyer"
                  value={caseLeadId}
                  disabled={!caseLeadId || savingLead}
                  onChange={(e) => void changeLeadLawyer(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                >
                  {lawyers.map((u) => (
                    <option key={u.id} value={u.id}>{`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email}</option>
                  ))}
                </select>
              </div>
            )}
            <IntakeAssignees
              intake={intake}
              lawyers={lawyers}
              currentUser={user}
              onSave={async (ids) => {
                if (!token || !id) return;
                await api.updateIntake(token, id, { assignedUserIds: ids });
                await reload();
              }}
            />
          </CardContent>
        </Card>

        {/* Playbook — เปลี่ยนได้จากตรงนี้เลย เลือกแล้วได้งานของ playbook ทันที */}
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Playbook</CardTitle>
            {!editingPlaybook && (
              <Button variant="outline" size="sm" onClick={() => setEditingPlaybook(true)}>
                {intake.preferredPlaybookId ? 'เปลี่ยน' : 'เลือก'}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {editingPlaybook ? (
              <div className="flex items-center gap-2">
                <select
                  aria-label="เลือก Playbook"
                  defaultValue={intake.preferredPlaybookId ?? ''}
                  disabled={savingPlaybook}
                  onChange={(e) => void changePlaybook(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-sm"
                >
                  <option value="">— เลือก Playbook —</option>
                  {playbooks.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · v{p.version}</option>
                  ))}
                </select>
                <Button variant="ghost" size="sm" disabled={savingPlaybook} onClick={() => setEditingPlaybook(false)}>ยกเลิก</Button>
              </div>
            ) : intake.preferredPlaybookId ? (
              <p className="text-sm">
                <span className="font-semibold">{playbooks.find((p) => p.id === intake.preferredPlaybookId)?.name ?? 'Playbook ที่เลือกไว้'}</span>
                <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">ใช้อยู่ · งาน {taskCounts.done}/{taskCounts.total}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">ยังไม่ใช้ Playbook — เลือกแล้วได้งานทุกขั้นทันที</p>
            )}
          </CardContent>
        </Card>

        {token && (
          <>
            <ConflictCheckPanel intake={intake} token={token} onRecorded={reload} />
            <IntakeFollowUpPanel intake={intake} token={token} lawyers={lawyers} onChanged={reload} />
          </>
        )}

        {(intake.assessmentNotes || intake.caseStrength || intake.assessor) && (
          <Card>
            <CardHeader><CardTitle className="text-base">ผลการประเมิน</CardTitle></CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="ความแข็งแกร่งของคดี" value={intake.caseStrength} />
              <InfoRow label="หมายเหตุ" value={intake.assessmentNotes} />
              <InfoRow label="ผู้ประเมิน" value={intake.assessor ? `${intake.assessor.firstName} ${intake.assessor.lastName}` : undefined} />
            </CardContent>
          </Card>
        )}

        {(intake.decision !== 'PENDING' || intake.decisionNotes) && (
          <Card>
            <CardHeader><CardTitle className="text-base">การตัดสินใจ</CardTitle></CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="การตัดสินใจ" value={DECISION_LABELS[intake.decision] ?? intake.decision} />
              <InfoRow label="หมายเหตุ" value={intake.decisionNotes} />
            </CardContent>
          </Card>
        )}

        {intake.noticeIssuedAt && (
          <Card>
            <CardHeader><CardTitle className="text-base">หนังสือแจ้ง</CardTitle></CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="ออกเมื่อ" value={formatDateOrDash(intake.noticeIssuedAt)} />
              <InfoRow label="ผู้รับ" value={intake.noticeRecipient} />
              <InfoRow label="กำหนดตอบ" value={formatDateOrDash(intake.noticeDeadline)} />
              <InfoRow label="ผล" value={intake.noticeResult} />
              {intake.noticeContent && (
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground">เนื้อหาหนังสือ</p>
                  <p className="whitespace-pre-wrap text-sm">{intake.noticeContent}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        </div>
      </div>
      </div>

      {/* Modals */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`w-full rounded-xl bg-background p-6 shadow-xl ${modal === 'details' || modal === 'quote' ? 'max-w-lg' : 'max-w-md'}`}>
            {modal === 'assess' && (
              <>
                <h2 className="mb-4 text-lg font-semibold">บันทึกผลการประเมิน</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium">ความแข็งแกร่งของคดี</label>
                    <select
                      value={caseStrength}
                      onChange={(e) => setCaseStrength(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="สูง">สูง</option>
                      <option value="กลาง">กลาง</option>
                      <option value="ต่ำ">ต่ำ</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium">หมายเหตุการประเมิน</label>
                    <textarea
                      value={assessNotes}
                      onChange={(e) => setAssessNotes(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModal(null)}>ยกเลิก</Button>
                  <Button onClick={handleAssess} disabled={submitting}>
                    {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                  </Button>
                </div>
              </>
            )}

            {modal === 'decide' && (
              <>
                <h2 className="mb-4 text-lg font-semibold">บันทึกการตัดสินใจ</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium">การตัดสินใจ</label>
                    <select
                      value={decision}
                      onChange={(e) => setDecision(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      {Object.entries(DECISION_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium">หมายเหตุ</label>
                    <textarea
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                    />
                  </div>
                  {ACCEPT_DECISIONS.includes(decision) && (
                    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-sm font-medium">รับดำเนินการ = เปิดคดีทันที (เฟสก่อนฟ้อง)</p>
                      <div>
                        <label className="block text-sm font-medium">ชื่อคดี</label>
                        <input
                          value={decideTitle}
                          onChange={(e) => setDecideTitle(e.target.value)}
                          placeholder={intake.title || 'ใช้ชื่อเรื่องรับเข้า'}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium">ทนายเจ้าของคดี</label>
                          <select
                            value={decideLeadLawyerId}
                            onChange={(e) => setDecideLeadLawyerId(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="">ฉันเอง (คนที่กดบันทึก)</option>
                            {lawyers.map((u) => (
                              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium">ทุนทรัพย์ที่เรียกร้อง (บาท)</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={decideClaimedAmount}
                            onChange={(e) => setDecideClaimedAmount(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium">Playbook</label>
                        <select
                          value={decidePlaybookId}
                          onChange={(e) => setDecidePlaybookId(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">ไม่ใช้</option>
                          {playbooks.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}{p.caseTypeId && p.caseTypeId === intake.caseTypeId ? ' (แนะนำตามประเภทคดี)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModal(null)}>ยกเลิก</Button>
                  <Button onClick={handleDecide} disabled={submitting}>
                    {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                  </Button>
                </div>
              </>
            )}

            {modal === 'prelitigation' && (
              <>
                <h2 className="mb-4 text-lg font-semibold">อัปเดตงานก่อนฟ้อง</h2>
                <div className="space-y-3">
                  {/* ลักษณะ flow ตัดออกจากฟอร์ม — playbook ทำหน้าที่นี้แทน (ค่าเดิมยังถูกส่งกลับตาม state) */}
                  <div>
                    <label className="block text-sm font-medium">สถานะก่อนฟ้อง</label>
                    <select
                      value={preLitigationStatus}
                      onChange={(e) => setPreLitigationStatus(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      {Object.entries(PRE_LITIGATION_STATUS_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium">ข้อเสนอจ่าย/ค่าสินไหม (บาท)</label>
                    <input
                      type="number"
                      value={settlementOfferAmount}
                      onChange={(e) => setSettlementOfferAmount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      min={0}
                      step="0.01"
                      placeholder="ถ้ามี"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">บันทึก</label>
                    <textarea
                      value={preLitigationNotes}
                      onChange={(e) => setPreLitigationNotes(e.target.value)}
                      rows={4}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                      placeholder="เช่น รอกรมธรรม์ แบบฟอร์มเรียกร้อง เวชระเบียน peer review และสรุปเหตุการณ์ / จ่ายน้อยไป ลูกความยังไม่รับ / ยื่นขอทบทวนความเห็นแล้ว"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModal(null)}>ยกเลิก</Button>
                  <Button onClick={handlePreLitigationUpdate} disabled={submitting}>
                    {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                  </Button>
                </div>
              </>
            )}

            {modal === 'details' && (
              <>
                <h2 className="mb-4 text-lg font-semibold">แก้ไขรายละเอียดเรื่อง</h2>
                <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                  <div>
                    <label className="block text-sm font-medium">ชื่อเรื่อง</label>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  {!intake?.clientId && (
                    <div>
                      <label className="block text-sm font-medium">ชื่อลูกค้า</label>
                      <input
                        value={editClientName}
                        onChange={(e) => setEditClientName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium">ประเภทเรื่อง</label>
                      <select
                        value={editMatterType}
                        onChange={(e) => setEditMatterType(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">ยังไม่ทราบ</option>
                        {Object.entries(MATTER_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium">คู่กรณี</label>
                      <input
                        value={editOpposingParty}
                        onChange={(e) => setEditOpposingParty(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">ฝ่ายเรา</label>
                      <select
                        value={editPartyRole}
                        onChange={(e) => setEditPartyRole(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">ไม่ระบุ</option>
                        <option value="PLAINTIFF">โจทก์ (ฝ่ายเราฟ้อง)</option>
                        <option value="DEFENDANT">จำเลย (ฝ่ายเราถูกฟ้อง)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium">ประเภทคดี (คาดว่าจะเป็น)</label>
                    <select
                      value={editCaseTypeId}
                      onChange={(e) => {
                        const caseTypeId = e.target.value;
                        setEditCaseTypeId(caseTypeId);
                        setEditPlaybookId((current) => current || playbooks.find((p) => p.caseTypeId === caseTypeId)?.id || current);
                      }}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">ยังไม่ทราบ</option>
                      {caseTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  {playbooks.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium">Playbook (ถ้ามี)</label>
                      <select
                        value={editPlaybookId}
                        onChange={(e) => setEditPlaybookId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">— ไม่ใช้ Playbook —</option>
                        {playbooks.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · v{p.version}{p.caseTypeId === editCaseTypeId ? ' (แนะนำ)' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">จะใช้สร้างงานให้อัตโนมัติตอนแปลงเป็นคดี — เปลี่ยนใจตอนนั้นได้อีกที</p>
                    </div>
                  )}
                  {!playbooks.length && editCaseTypeId && (
                    <p className="text-xs text-muted-foreground">
                      ยังไม่มี Playbook เลย{' '}
                      <Link href="/playbooks" className="text-primary underline">สร้างเลย →</Link>
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium">เลขอ้างอิงลูกค้า</label>
                      <input
                        value={editCustomerRef}
                        onChange={(e) => setEditCustomerRef(e.target.value)}
                        placeholder="เช่น CUST-005"
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">เลขกรมธรรม์</label>
                      <input
                        value={editPolicyNumber}
                        onChange={(e) => setEditPolicyNumber(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">เลขเคลม</label>
                      <input
                        value={editClaimNumber}
                        onChange={(e) => setEditClaimNumber(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium">วันเกิดเหตุ</label>
                      <ThaiDateInput
                        value={editIncidentDate}
                        onChange={setEditIncidentDate}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">ความเสียหายโดยประมาณ (บาท)</label>
                      <input
                        type="number"
                        value={editEstimatedDamage}
                        onChange={(e) => setEditEstimatedDamage(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        min={0}
                        step="0.01"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium">รายละเอียด</label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium">ประเภทผู้ส่ง</label>
                      <select
                        value={editReferralType}
                        onChange={(e) => setEditReferralType(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      >
                        {Object.entries(REFERRAL_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium">ช่องทาง</label>
                      <select
                        value={editReferralChannel}
                        onChange={(e) => setEditReferralChannel(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      >
                        {Object.entries(REFERRAL_CHANNEL_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium">ชื่อผู้ส่งเรื่อง</label>
                    <input
                      value={editReferralName}
                      onChange={(e) => setEditReferralName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editIsOngoingElsewhere}
                      onChange={(e) => setEditIsOngoingElsewhere(e.target.checked)}
                    />
                    มีคดีที่ดำเนินอยู่กับทนายหรือสำนักงานอื่น
                  </label>
                  {editIsOngoingElsewhere && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium">เลขคดี/หมายเลขดำ</label>
                        <input
                          value={editExternalCaseNumber}
                          onChange={(e) => setEditExternalCaseNumber(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium">สถานะปัจจุบัน</label>
                        <input
                          value={editCurrentStageNote}
                          onChange={(e) => setEditCurrentStageNote(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModal(null)}>ยกเลิก</Button>
                  <Button onClick={handleDetailsUpdate} disabled={submitting}>
                    {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                  </Button>
                </div>
              </>
            )}

            {modal === 'notice' && (
              <>
                <h2 className="mb-4 text-lg font-semibold">ออก Notice</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium">ผู้รับ Notice</label>
                    <input
                      value={noticeRecipient}
                      onChange={(e) => setNoticeRecipient(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="ชื่อผู้รับ"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">กำหนดตอบ</label>
                    <ThaiDateInput
                      value={noticeDeadline}
                      onChange={setNoticeDeadline}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">ผล</label>
                    <input
                      value={noticeResult}
                      onChange={(e) => setNoticeResult(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="ผลที่ได้รับ (ถ้ามี)"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium">เนื้อหาหนังสือ</label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDraftNotice}
                        disabled={drafting || (user?.aiCredits ?? 0) < DRAFT_NOTICE_COST}
                        title={
                          (user?.aiCredits ?? 0) < DRAFT_NOTICE_COST
                            ? `credit ไม่พอ (ต้องใช้ ${DRAFT_NOTICE_COST}, เหลือ ${user?.aiCredits ?? 0})`
                            : undefined
                        }
                      >
                        {drafting
                          ? 'กำลังร่าง...'
                          : `ให้ AI ช่วยร่าง (ใช้ ${DRAFT_NOTICE_COST} credit, เหลือ ${user?.aiCredits ?? 0})`}
                      </Button>
                    </div>
                    <textarea
                      value={noticeContent}
                      onChange={(e) => {
                        setNoticeContent(e.target.value);
                        setNoticeReviewed(false);
                      }}
                      rows={10}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="กด 'ให้ AI ช่วยร่าง' เพื่อให้ร่างจากข้อมูลของเรื่องนี้ แล้วตรวจสอบ/แก้ไขก่อนบันทึก"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      AI ร่างให้เท่านั้น ต้องตรวจสอบและแก้ไขให้ถูกต้องก่อนบันทึก/ส่งจริงทุกครั้ง
                    </p>
                    {noticeContent && (
                      <label className="mt-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={noticeReviewed}
                          onChange={(e) => setNoticeReviewed(e.target.checked)}
                        />
                        ฉันตรวจสอบเนื้อหาหนังสือนี้แล้วและยืนยันว่าถูกต้อง
                      </label>
                    )}
                  </div>

                  {/* เอกสารที่ขอไว้ยังไม่ครบ — ออกหนังสือได้ แต่ต้องรู้ว่าขาดอะไร */}
                  {!intake.noticeIssuedAt && missingDocCount > 0 && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                      <p className="text-sm font-medium text-amber-700">
                        ยังขาดเอกสารที่ขอไว้ {missingDocCount} รายการ
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        ออกหนังสือโดยเอกสารไม่ครบคือสาเหตุที่มักต้องออกฉบับที่สอง
                        ถ้าเรื่องเร่งจริงให้ยืนยันด้านล่าง
                      </p>
                      <label className="mt-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={noticeAckMissingDocs}
                          onChange={(e) => setNoticeAckMissingDocs(e.target.checked)}
                        />
                        ทราบว่ายังขาดเอกสาร และยืนยันจะออกหนังสือ
                      </label>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModal(null)}>ยกเลิก</Button>
                  <Button
                    onClick={handleNotice}
                    disabled={
                      submitting ||
                      (!!noticeContent && !noticeReviewed) ||
                      (!intake.noticeIssuedAt && missingDocCount > 0 && !noticeAckMissingDocs)
                    }
                  >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                  </Button>
                </div>
              </>
            )}

            {modal === 'quote' && (
              <>
                <h2 className="mb-1 text-lg font-semibold">Export ใบเสนอราคา PDF</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  ระบุรายการค่าบริการ แล้วกดพิมพ์เพื่อบันทึกเป็น PDF จากหน้าต่างพิมพ์ของเบราว์เซอร์
                </p>
                <div className="max-h-[60vh] overflow-y-auto">
                  <CaseCostCalculator value={quoteLines} onChange={setQuoteLines} />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModal(null)}>ปิด</Button>
                  <Button onClick={handleQuotePrint} disabled={quoteLines.length === 0}>
                    พิมพ์ / บันทึกเป็น PDF
                  </Button>
                </div>
              </>
            )}

            {error && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
          </div>
        </div>
      )}

      {converting && (
        <ConvertToCaseDialog
          intake={intake}
          documents={documents}
          lawyers={lawyers}
          playbooks={playbooks}
          analysisCount={analyses.length}
          submitting={submitting}
          error={convertError}
          onClose={() => { setConverting(false); setConvertError(''); }}
          onConfirm={handleConvert}
        />
      )}
    </div>
  );
}
