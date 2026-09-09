'use client';

import { AI_CREDIT_COST, AI_UPLOAD_MAX_FILES } from '@lawfirm/shared';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, IntakeItem, IntakePrecedentAnalysisItem, DocumentItem, UserItem, ApiError, ChecklistClassificationSuggestion } from '@/lib/api';
import { ConvertToCaseDialog } from '@/components/intake/ConvertToCaseDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageLoading } from '@/components/ui/misc';

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

const PRE_LITIGATION_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'ยังไม่เริ่ม',
  NOTICE_TO_SEND: 'เตรียมส่ง Notice',
  NOTICE_SENT: 'ส่ง Notice แล้ว',
  UNDER_REVIEW: 'รอพิจารณา/ตรวจเอกสาร',
  REPORT_PREPARED: 'ทำสรุปรายงานแล้ว',
  OFFER_RECEIVED: 'ได้รับข้อเสนอจ่าย',
  NEGOTIATING: 'เจรจาก่อนฟ้อง',
  APPEAL_REVIEW: 'อุทธรณ์/ขอทบทวนความเห็น',
  READY_TO_FILE: 'พร้อมพิจารณาฟ้อง',
  CLOSED_SETTLED: 'จบด้วยการตกลง',
  CLOSED_NO_FILE: 'ปิดเรื่องโดยไม่ฟ้อง',
};

const PRE_LITIGATION_GUIDE: Record<string, string[]> = {
  MEDICAL_CLAIM: ['Notice', 'พิจารณาเอกสาร/ความเห็นแพทย์', 'ทำสรุปรายงาน', 'เสนอจ่าย/ไม่จ่าย', 'เจรจาหรืออุทธรณ์ความเห็น', 'ไม่จบจึงฟ้อง'],
  TRANSPORT: ['Notice', 'ตอบรับ/ปฏิเสธ/ไม่ตอบ', 'เจรจา', 'ตัดสินใจฟ้องหรือไม่ฟ้อง'],
  GENERAL: ['Notice', 'ติดตามคำตอบ', 'เจรจา', 'ตัดสินใจฟ้องหรือไม่ฟ้อง'],
};

const PRE_LITIGATION_DOCUMENTS: Record<string, Array<{ label: string; hints: string[] }>> = {
  MEDICAL_CLAIM: [
    { label: 'กรมธรรม์ประกันภัย', hints: ['กรมธรรม์', 'policy', 'insurance'] },
    { label: 'แบบฟอร์มเรียกร้องค่าสินไหม', hints: ['สินไหม', 'claim form', 'claim'] },
    { label: 'เวชระเบียน', hints: ['เวชระเบียน', 'medical record', 'record'] },
    { label: 'Peer review / ความเห็นแพทย์ผู้ทบทวน', hints: ['peer review', 'review', 'ความเห็นแพทย์'] },
    { label: 'เอกสารสรุปโดยย่อเหตุการณ์', hints: ['สรุป', 'summary', 'เหตุการณ์', 'incident'] },
  ],
  TRANSPORT: [
    { label: 'เอกสารรับขน / ใบตราส่ง', hints: ['ใบตราส่ง', 'bill of lading', 'waybill'] },
    { label: 'หลักฐานความเสียหายหรือสูญหาย', hints: ['เสียหาย', 'damage', 'สูญหาย', 'loss'] },
    { label: 'สรุปเหตุการณ์และมูลค่าความเสียหาย', hints: ['สรุป', 'summary', 'เหตุการณ์', 'damage'] },
  ],
  GENERAL: [
    { label: 'เอกสารแสดงสิทธิหรือสัญญา', hints: ['สัญญา', 'contract', 'agreement'] },
    { label: 'หลักฐานความเสียหาย', hints: ['เสียหาย', 'damage'] },
    { label: 'สรุปโดยย่อเหตุการณ์', hints: ['สรุป', 'summary', 'เหตุการณ์'] },
  ],
};

function formatDate(date: string | null | undefined) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
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

function checklistConfirmStorageKey(intakeId: string) {
  return `intake-checklist-confirm:${intakeId}`;
}

function loadChecklistConfirmations(intakeId: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(checklistConfirmStorageKey(intakeId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

function saveChecklistConfirmations(intakeId: string, value: Record<string, string>) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(checklistConfirmStorageKey(intakeId), JSON.stringify(value));
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-2 py-1.5 border-b last:border-0">
      <span className="w-40 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? '—'}</span>
    </div>
  );
}

type ModalType = 'assess' | 'decide' | 'notice' | 'prelitigation' | 'details' | null;

export default function IntakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const router = useRouter();
  const [intake, setIntake] = useState<IntakeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [quoteExportNotice, setQuoteExportNotice] = useState('');

  // Assess form
  const [assessNotes, setAssessNotes] = useState('');
  const [caseStrength, setCaseStrength] = useState('กลาง');

  // Decide form
  const [decision, setDecision] = useState('PENDING');
  const [decisionNotes, setDecisionNotes] = useState('');

  // Pre-litigation form
  const [preLitigationType, setPreLitigationType] = useState('GENERAL');
  const [preLitigationStatus, setPreLitigationStatus] = useState('NOT_STARTED');
  const [preLitigationNotes, setPreLitigationNotes] = useState('');
  const [settlementOfferAmount, setSettlementOfferAmount] = useState('');

  // Matter / referral details (filled on detail after quick create)
  const [editTitle, setEditTitle] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editMatterType, setEditMatterType] = useState('');
  const [editOpposingParty, setEditOpposingParty] = useState('');
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
  const [drafting, setDrafting] = useState(false);

  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);

  // Files. One list: the AI reads from it and it follows the case.
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Precedent analysis
  const [analyses, setAnalyses] = useState<IntakePrecedentAnalysisItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [showAnalysisHistory, setShowAnalysisHistory] = useState(false);

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
    if (!id) return;
    setConfirmedChecklist(loadChecklistConfirmations(id));
    setChecklistSuggestions([]);
    setClassifyError(null);
  }, [id]);

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

  const handleDecide = async () => {
    if (!token || !id) return;
    setSubmitting(true);
    setError('');
    try {
      await api.decideIntake(token, id, { decision, decisionNotes: decisionNotes || undefined });
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
    setEditOpposingParty(intake.opposingParty || '');
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
        opposingParty: editOpposingParty || undefined,
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
    setQuoteExportNotice(
      'เตรียมใบเสนอราคา PDF แล้ว ขั้นนี้ยังไม่ดาวน์โหลดไฟล์ รอต่อ backend/export จริง',
    );
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

  const handleRunPrecedentAnalysis = async () => {
    if (!token || !intake) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await api.runPrecedentAnalysis(token, intake.id, selectedAttachmentIds);
      setAnalyses((prev) => [result, ...prev]);
      setSelectedAnalysisId(result.id);
      setShowAnalysisHistory(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setAnalysisError('เครดิต AI ไม่เพียงพอ — กรุณาติดต่อผู้ดูแลระบบเพื่อเติมเครดิต');
      } else {
        setAnalysisError('วิเคราะห์ไม่สำเร็จ — ลองใหม่อีกครั้ง หรือตรวจสอบว่ามีรายละเอียด/ไฟล์แนบเพียงพอ');
      }
    } finally {
      setAnalyzing(false);
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
    if (failures.length) setFileError(`ไฟล์ที่ไม่สำเร็จ: ${failures.join(', ')} · รองรับ PDF ไม่เกิน 10MB ต่อไฟล์`);
    setUploadingFiles(false);
  };

  const requestChecklistSuggestions = async (documentIds: string[]) => {
    if (!token || !intake || !documentIds.length) return;
    const labels = (
      PRE_LITIGATION_DOCUMENTS[intake.preLitigationType] ?? PRE_LITIGATION_DOCUMENTS.GENERAL
    ).map((item) => item.label);
    const confirmed = loadChecklistConfirmations(intake.id);
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
    setConfirmedChecklist((previous) => {
      const next = { ...previous, [suggestion.label]: suggestion.documentId };
      saveChecklistConfirmations(id, next);
      return next;
    });
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
        } else {
          delete next[item.label];
        }
      } else {
        next[item.label] = isChecklistDocId(current) ? current : CHECKLIST_MANUAL;
      }
      saveChecklistConfirmations(id, next);
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
          const next = Object.fromEntries(
            Object.entries(previous).filter(([, docId]) => docId !== documentId),
          );
          saveChecklistConfirmations(id, next);
          return next;
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
  const expectedDocuments =
    PRE_LITIGATION_DOCUMENTS[intake.preLitigationType] ?? PRE_LITIGATION_DOCUMENTS.GENERAL;
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
          <h1 className="text-2xl font-bold">
            {intake.title || intake.matterType || intake.clientName || intake.client?.name || '(ไม่ระบุชื่อ)'}
          </h1>
          <p className="text-sm text-muted-foreground">{intake.referralName || intake.clientName || intake.client?.name || '—'} · รับเมื่อ {formatDate(intake.receivedDate)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLOR[intake.status] ?? 'bg-gray-100 text-gray-700'}`}>
          {STATUS_LABELS[intake.status] ?? intake.status}
        </span>
      </div>

      {/* Status timeline */}
      {intake.status !== 'REJECTED' && intake.status !== 'CONVERTED' && intake.status !== 'CONSULTED' && (
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i <= currentStep ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {i + 1}
              </div>
              <span className={`text-xs ${i <= currentStep ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {STATUS_LABELS[s]}
              </span>
              {i < STEPS.length - 1 && <div className={`h-px w-8 ${i < currentStep ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
      {quoteExportNotice && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {quoteExportNotice}
        </p>
      )}

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">สถานะรับเรื่องก่อนฟ้อง</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {PRE_LITIGATION_TYPE_LABELS[intake.preLitigationType] ?? intake.preLitigationType} · {PRE_LITIGATION_STATUS_LABELS[intake.preLitigationStatus] ?? intake.preLitigationStatus}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {intake.status === 'RECEIVED' && (
              <Button onClick={() => setModal('assess')}>บันทึกผลประเมิน</Button>
            )}
            {intake.status === 'ASSESSING' && (
              <Button onClick={() => setModal('decide')}>ตัดสินใจแนวทาง</Button>
            )}
            {intake.status === 'ACCEPTED' && (
              <Button variant="outline" onClick={() => openNoticeModal()}>ออก Notice</Button>
            )}
            {intake.status !== 'CONVERTED' && (
              <Button variant="outline" onClick={handleQuotePdfExport}>
                Export ใบเสนอราคา PDF
              </Button>
            )}
            {intake.status !== 'CONVERTED' && (
              <Button variant="outline" onClick={openPreLitigationModal}>อัปเดต</Button>
            )}
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
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-muted/35 p-3">
              <p className="text-xs text-muted-foreground">ขั้นตอนตอนนี้</p>
              <p className="mt-1 font-medium">{PRE_LITIGATION_STATUS_LABELS[intake.preLitigationStatus] ?? intake.preLitigationStatus}</p>
            </div>
            <div className="rounded-lg bg-muted/35 p-3">
              <p className="text-xs text-muted-foreground">เอกสารพร้อม</p>
              <p className="mt-1 font-medium">
                {matchedExpectedDocuments.length}/{expectedDocuments.length}
                {missingExpectedDocuments > 0 ? ` · ขาด ${missingExpectedDocuments}` : ' · ครบตาม checklist'}
              </p>
            </div>
            <div className="rounded-lg bg-muted/35 p-3">
              <p className="text-xs text-muted-foreground">ข้อเสนอจ่าย</p>
              <p className="mt-1 font-medium">
                {intake.settlementOfferAmount != null ? `${intake.settlementOfferAmount.toLocaleString('th-TH')} บาท` : 'ยังไม่มี'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(PRE_LITIGATION_GUIDE[intake.preLitigationType] ?? PRE_LITIGATION_GUIDE.GENERAL).map((step) => (
              <span key={step} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {step}
              </span>
            ))}
          </div>

          <div className="rounded-lg bg-muted/35 p-3">
            <p className="text-sm font-medium">บันทึกล่าสุด</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {intake.preLitigationNotes || intake.noticeResult || 'ยังไม่มีบันทึกก่อนฟ้อง'}
            </p>
          </div>
        </CardContent>
      </Card>

      {currentAnalysis?.extractedFacts?.selectedAttachments && <p className="text-xs text-muted-foreground">ไฟล์ที่ใช้ในผลวิเคราะห์ที่แสดง: {currentAnalysis.extractedFacts.selectedAttachments.map((file) => file.filename).join(', ') || 'ใช้เฉพาะรายละเอียดเรื่อง'}</p>}
      {currentAnalysis?.extractedFacts?.attachmentWarnings?.map((warning) => <p key={warning} className="text-sm text-destructive">{warning}</p>)}
      {analysisError && <p className="text-sm text-destructive">{analysisError}</p>}

      <Card id="intake-files">
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">เอกสารของเรื่องนี้</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              checklist กับไฟล์ที่อัปโหลดอยู่ด้วยกัน — จับคู่จากชื่อไฟล์เบื้องต้น แล้ววิเคราะห์ต่อได้เลย
            </p>
          </div>
          {intake.status !== 'REJECTED' &&
            intake.status !== 'CONVERTED' &&
            intake.status !== 'CONSULTED' && (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) handleUploadFiles(files);
                    e.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFiles || analyzing}
                >
                  {uploadingFiles ? 'กำลังอัปโหลด...' : '+ เพิ่มไฟล์'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleRunPrecedentAnalysis}
                  disabled={analyzing || uploadingFiles}
                >
                  {analyzing ? 'กำลังวิเคราะห์...' : `วิเคราะห์เรื่อง + ไฟล์ที่เลือก (${selectedAttachmentIds.length})`}
                </Button>
              </div>
            )}
        </CardHeader>
        <CardContent className="space-y-4">
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
                    disabled={classifyingChecklist || uploadingFiles || analyzing}
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
            <p className="mt-2 text-xs text-muted-foreground">
              พร้อม {matchedExpectedDocuments.length}/{expectedDocuments.length}
              {missingExpectedDocuments > 0 ? ` · ขาด ${missingExpectedDocuments}` : ' · ครบตาม checklist'}
              {' · '}ติ๊กเองได้ · จับคู่ชื่อไฟล์อัตโนมัติ · หรือกด「ให้ AI แนะนำประเภท」แล้วยืนยัน
              {' · '}แนบได้เฉพาะ PDF ไม่เกิน 10MB · เลือกวิเคราะห์ได้สูงสุด {AI_UPLOAD_MAX_FILES} ไฟล์ · แนะนำประเภท {AI_CREDIT_COST.DOCUMENT_ANALYSIS} เครดิต
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
                  disabled={analyzing || uploadingFiles || documents.length === 0}
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
                          disabled={analyzing || uploadingFiles || (!selected && selectedAttachmentIds.length >= 10)}
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
                          disabled={analyzing || uploadingFiles}
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

      {analyses.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">
              ผลวิเคราะห์ ({new Date(currentAnalysis.createdAt).toLocaleString('th-TH')})
            </CardTitle>
            {analyses.length > 1 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setShowAnalysisHistory((v) => !v)}
              >
                {showAnalysisHistory ? 'ซ่อนประวัติ' : `ดูประวัติย้อนหลัง (${analyses.length})`}
              </button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {showAnalysisHistory && (
              <select
                value={selectedAnalysisId ?? ''}
                onChange={(e) => setSelectedAnalysisId(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
              >
                {analyses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {new Date(a.createdAt).toLocaleString('th-TH')}
                    {a.status !== 'COMPLETE' ? ' (ไม่สำเร็จ)' : ''}
                  </option>
                ))}
              </select>
            )}

            {(() => {
              const current = currentAnalysis;
              if (current.status !== 'COMPLETE') {
                // A failed run has empty summary/noticeFacts — showing the normal
                // layout would be indistinguishable from a genuine "nothing found".
                return (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive">
                      ⚠️ การวิเคราะห์นี้ไม่สำเร็จ
                    </p>
                    {current.errorMessage && (
                      <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
                        {current.errorMessage}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      กรุณากดวิเคราะห์ใหม่อีกครั้ง หรือตรวจสอบว่ามีรายละเอียด/ไฟล์แนบเพียงพอ
                    </p>
                  </div>
                );
              }
              return (
                <>
                  <div>
                    <p className="text-sm font-medium">📚 ฎีกาที่เกี่ยวข้อง</p>
                    {current.precedents.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {current.precedents.map((p) => (
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
                      <p className="mt-1 text-sm text-muted-foreground">ไม่พบฎีกาที่เกี่ยวข้องโดยตรง</p>
                    )}
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {current.summaryBullets}
                    </p>
                  </div>

                  <div className="border-t border-border pt-3">
                    <p className="text-sm font-medium">📄 ข้อมูลพร้อมร่าง Notice</p>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
                      {current.noticeFacts}
                    </p>
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => handleDraftFromAnalysis(current.id)}
                    >
                      เปิดฟอร์ม Notice
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    ⚠️ ผลลัพธ์นี้เป็นการช่วยค้นเบื้องต้นด้วย AI โปรดตรวจสอบกับฉบับเต็มก่อนใช้อ้างอิงจริง
                  </p>
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">ข้อมูลเรื่อง</h2>
          {intake.status !== 'CONVERTED' && (
            <Button variant="outline" size="sm" onClick={openDetailsModal}>
              แก้ไขรายละเอียด
            </Button>
          )}
        </div>
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
          <CardHeader><CardTitle className="text-base">ลูกค้า</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="ลูกค้า" value={intake.client?.name ?? intake.clientName} />
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader><CardTitle className="text-base">รายละเอียดเรื่อง</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="ประเภทเรื่อง" value={intake.matterType ? (MATTER_TYPE_LABELS[intake.matterType] ?? intake.matterType) : undefined} />
            <InfoRow label="คู่กรณี" value={intake.opposingParty} />
            <InfoRow label="วันเกิดเหตุ" value={formatDate(intake.incidentDate)} />
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
              <InfoRow label="ออกเมื่อ" value={formatDate(intake.noticeIssuedAt)} />
              <InfoRow label="ผู้รับ" value={intake.noticeRecipient} />
              <InfoRow label="กำหนดตอบ" value={formatDate(intake.noticeDeadline)} />
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

      {/* Modals */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`w-full rounded-xl bg-background p-6 shadow-xl ${modal === 'details' ? 'max-w-lg' : 'max-w-md'}`}>
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
                  <div>
                    <label className="block text-sm font-medium">ลักษณะ flow</label>
                    <select
                      value={preLitigationType}
                      onChange={(e) => setPreLitigationType(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      {Object.entries(PRE_LITIGATION_TYPE_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
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
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium">วันเกิดเหตุ</label>
                      <input
                        type="date"
                        value={editIncidentDate}
                        onChange={(e) => setEditIncidentDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
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
                    <input
                      type="date"
                      value={noticeDeadline}
                      onChange={(e) => setNoticeDeadline(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
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
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModal(null)}>ยกเลิก</Button>
                  <Button
                    onClick={handleNotice}
                    disabled={submitting || (!!noticeContent && !noticeReviewed)}
                  >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
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
