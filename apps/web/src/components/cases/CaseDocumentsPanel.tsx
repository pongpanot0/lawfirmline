'use client';

import { CaseKnowledgePanel } from '@/components/documents/CaseKnowledgePanel';
import { CaseDriveSection } from '@/components/cases/CaseDriveSection';
import { CaseEvidenceSection } from '@/components/cases/CaseEvidenceSection';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Download, Sparkles, CalendarSearch, ClipboardCheck, PenLine, RotateCcw, Check, X, FileText, Upload, Ellipsis, ArrowRight } from 'lucide-react';
import { CaseDocRequestsCard } from '@/components/case-page/CaseDocRequestsCard';
import v2 from '@/components/case-page/v2.module.css';
import { Button } from '@/components/ui/button';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { useAuth } from '@/lib/auth';
import { api, ApiError, DocumentItem, DocumentTemplateItem, DocumentPublicationEntry, DocumentOfficeLinkView } from '@/lib/api';
import { isOfficeEditable, officeAppName, officeEditedHint, openInNewTab } from '@/lib/drive-view';
import { PublishDocumentDialog } from '@/components/documents/PublishDocumentDialog';
import { TemplateGenerateDrawer } from '@/components/cases/TemplateGenerateDrawer';
import { PleadingDraftDrawer } from '@/components/cases/PleadingDraftDrawer';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { DateSuggestionsPanel } from '@/components/cases/DateSuggestionsPanel';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { documentCategoryLabel } from '@/lib/stage-labels';
import { DocumentCategory, hasFirmCapability } from '@lawfirm/shared';

const DOCUMENT_CATEGORY_VALUES = Object.values(DocumentCategory);

export function CaseDocumentsPanel({ caseId, onChanged, newFolderName }: { caseId: string; onChanged?: () => void; newFolderName?: string }) {
  const d = useDashboardT();
  const newUpload = useSearchParams().get('new') === 'upload';
  const [uploadOpen, setUploadOpen] = useState(false);
  useEffect(() => { if (newUpload) { setUploadOpen(true); const url = new URL(window.location.href); url.searchParams.delete('new'); window.history.replaceState(window.history.state, '', url); } }, [newUpload]);
  const id = caseId;
  const { token, user } = useAuth();
  const canManageContent = hasFirmCapability(user?.firmRole, 'manageFirmContent');
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [pleadingDrawerOpen, setPleadingDrawerOpen] = useState(false);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [allDocs, setAllDocs] = useState<DocumentItem[]>([]);
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [managingDocId, setManagingDocId] = useState<string | null>(null);
  const [suggestionsKey, setSuggestionsKey] = useState(0);
  const [preview, setPreview] = useState<{ filename: string; mimeType: string; url: string } | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [officeLinks, setOfficeLinks] = useState<Record<string, DocumentOfficeLinkView>>({});
  const [officeBusyId, setOfficeBusyId] = useState<string | null>(null);
  const [publications, setPublications] = useState<Record<string, DocumentPublicationEntry[]>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);
  // Publishing reaches the client portal, so the recipients are reviewed first
  // rather than inferred from whoever happens to hold access.
  const [publishTarget, setPublishTarget] = useState<DocumentItem | null>(null);
  const [requiredDocs, setRequiredDocs] = useState<{
    required: Array<{ category: string; present: boolean }>;
    missing: string[];
  } | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    api.getRequiredDocuments(token, id).then(setRequiredDocs).catch(() => {});
  }, [token, id, documents.length]);

  const loadPublications = (documentId: string) => {
    if (!token || !id) return;
    api
      .listDocumentPublications(token, id, documentId)
      .then((entries) => setPublications((s) => ({ ...s, [documentId]: entries })))
      .catch(() => {});
  };

  const [loadError, setLoadError] = useState(false);
  const load = () => {
    if (!token || !id) return;
    Promise.all([
      api.getDocuments(token, id, {
        category: categoryFilter || undefined,
      }) as Promise<DocumentItem[]>,
      api.getDocumentTemplates(token),
    ])
      .then(([docs, tmpls]) => {
        setDocuments(docs);
        if (!categoryFilter) setAllDocs(docs);
        setTemplates(tmpls);
        docs.forEach((d) => loadPublications(d.id));
      })
      .then(() => setLoadError(false))
      .catch((err) => { console.error(err); setLoadError(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token, id, categoryFilter]);


  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const handleView = async (doc: DocumentItem) => {
    if (!token || !id) return;
    setViewingId(doc.id);
    setError('');
    try {
      const blob = await api.downloadDocument(token, id, doc.id);
      const url = URL.createObjectURL(blob);
      setPreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { filename: doc.filename, mimeType: doc.mimeType, url };
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : d.caseDocuments.openFailed);
    } finally {
      setViewingId(null);
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    if (!token || !id) return;
    setError('');
    try {
      const blob = await api.downloadDocument(token, id, doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : d.caseDocuments.downloadFailed);
    }
  };

  const loadOfficeLinks = useCallback(() => {
    if (!token || !id) return;
    api
      .getOfficeLinks(token, id)
      .then((links) => setOfficeLinks(Object.fromEntries(links.map((link) => [link.documentId, link]))))
      .catch(() => setOfficeLinks({}));
  }, [token, id]);

  useEffect(() => { loadOfficeLinks(); }, [loadOfficeLinks]);

  const handleOpenInOffice = async (doc: DocumentItem) => {
    if (!token || !id) return;
    setError('');
    try {
      await openInNewTab(async () => (await api.openDocumentInOffice(token, id, doc.id)).webUrl);
      loadOfficeLinks();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'เปิดใน Office ออนไลน์ไม่สำเร็จ');
    }
  };

  const handlePullFromOffice = async (doc: DocumentItem) => {
    if (!token || !id) return;
    setOfficeBusyId(doc.id);
    setError('');
    try {
      const result = await api.pullDocumentFromOffice(token, id, doc.id);
      if (!result.updated) setError(`ยังไม่มีการแก้ใหม่ใน ${officeAppName(doc.filename)} ออนไลน์`);
      load();
      loadOfficeLinks();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ดึงเวอร์ชันล่าสุดไม่สำเร็จ');
    } finally {
      setOfficeBusyId(null);
    }
  };

  const handleToggleVisibility = async (doc: DocumentItem) => {
    if (!token || !id) return;
    try {
      await api.updateDocumentVisibility(token, id, doc.id, !doc.visibleToClient);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : d.caseDocuments.visibilityFailed);
    }
  };


  const handleUnpublish = async (doc: DocumentItem, publicationId: string) => {
    if (!token || !id) return;
    setPublishingId(doc.id);
    try {
      await api.unpublishDocument(token, id, doc.id, publicationId);
      loadPublications(doc.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : d.caseDocuments.unpublishFailed);
    } finally {
      setPublishingId(null);
    }
  };

  const closePreview = () => {
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const handleUpload = async (file: File) => {
    if (!token || !id) return;
    setUploading(true);
    setError('');
    try {
      await api.uploadDocument(token, id, file);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : d.caseDocuments.uploadFailed);
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyzeDocument = async (doc: DocumentItem) => {
    if (!token || !id) return;
    setAnalyzingId(doc.id);
    setError('');
    try {
      await api.analyzeExistingDocument(token, id, doc.id);
      setAnalysisRevision((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : d.caseDocuments.analyzeFailed);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleExtractDatesFromDocument = async (doc: DocumentItem) => {
    if (!token || !id) return;
    setExtractingId(doc.id);
    setError('');
    try {
      const created = await api.extractDatesFromDocument(token, id, doc.id);
      if (created.length === 0) {
        setError(d.caseDocuments.noDateSuggestions);
      } else {
        setSuggestionsKey((n) => n + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : d.caseDocuments.extractDatesFailed);
    } finally {
      setExtractingId(null);
    }
  };

  if (loading) return <PageLoading title={d.documents.loading} lines={3} />;

  const shownDocs = showAllDocs ? documents : documents.slice(0, 10);
  const typeBadge = (doc: DocumentItem) => { const ext = (doc.filename.split('.').pop() ?? '').toUpperCase().slice(0, 4); const tone = /PDF/.test(ext) ? 'bg-[#fbeaea] text-[#a83232]' : /DOC|RTF|ODT/.test(ext) ? 'bg-[#e6eef7] text-[#2b5a8a]' : /JPG|JPEG|PNG|HEIC|GIF|WEBP/.test(ext) ? 'bg-[#e6f3ec] text-[#227052]' : 'bg-[#eeebe3] text-foreground'; return <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xs font-bold ${tone}`}>{ext || 'FILE'}</span>; };
  const docCounts = allDocs.reduce<Record<string, number>>((acc, doc) => { const key = doc.category ?? 'OTHER'; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
  return (
    <div>
      <SideDrawer open={uploadOpen} title="แนบเอกสาร" onClose={() => setUploadOpen(false)}><div className="space-y-4"><p className="text-sm text-muted-foreground">เลือกไฟล์เพื่อเก็บเข้าแฟ้มคดี</p><DocumentDropZone onFile={(file) => { void handleUpload(file); setUploadOpen(false); }} loading={uploading} loadingLabel={d.caseDocuments.uploading} label={d.documents.dropHint} hint={d.documents.fileTypesHint} /></div></SideDrawer>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) void handleUpload(file); }} className="block cursor-pointer rounded-xl border-2 border-dashed border-[#b9bfb8] bg-white p-6 text-center focus-within:ring-2 focus-within:ring-ring">
            <input type="file" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleUpload(file); e.target.value = ''; }} disabled={uploading} />
            <p className="inline-flex flex-wrap items-center justify-center gap-2 text-lg font-bold"><Upload aria-hidden="true" className="h-[1.1em] w-[1.1em]" />{uploading ? d.caseDocuments.uploading : <>ลากไฟล์มาวางที่นี่ หรือ <span className="underline">เลือกไฟล์</span></>}</p>
            <p className={v2.hint}>ไฟล์จะเข้าแฟ้มคดีนี้ ระบบช่วยอ่านไฟล์ (เช่น คำให้การ) และเสนอข้อมูลให้กรอกได้</p>
          </label>
          <section className={`${v2.card} overflow-hidden shadow-[0_4px_16px_rgba(20,46,67,.06)]`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e0d8] px-5 py-3"><h3 className="text-lg font-bold">ไฟล์ล่าสุด</h3>
              <div className="flex flex-wrap gap-2 text-sm">
                <button type="button" aria-pressed={categoryFilter === ''} onClick={() => setCategoryFilter('')} className={`${v2.btn} ${categoryFilter === '' ? v2.primary : v2.outline} min-h-0 py-1.5`}>ทั้งหมด {allDocs.length}</button>
                {DOCUMENT_CATEGORY_VALUES.filter((value) => docCounts[value]).map((value) => <button key={value} type="button" aria-pressed={categoryFilter === value} onClick={() => setCategoryFilter(value)} className={`${v2.btn} ${categoryFilter === value ? v2.primary : v2.outline} min-h-0 py-1.5`}>{documentCategoryLabel(value, 'th')} {docCounts[value]}</button>)}
              </div>
            </div>
            {loadError ? <div className="p-5"><LoadFailed onRetry={load} /></div> : documents.length === 0 ? <p className={`${v2.hint} px-5 py-4`}>{d.caseDocuments.noDocuments} — ลากไฟล์มาวางในกรอบด้านบนเพื่อเริ่ม</p> : <ul className="divide-y divide-[#e2e0d8]">
              {shownDocs.map((doc) => <li key={doc.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-4">
                  {typeBadge(doc)}
                  <div className="min-w-0 flex-1"><b className="break-all">{doc.filename}</b><div className={v2.label}>{[documentCategoryLabel(doc.category ?? 'OTHER', 'th'), doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : doc.uploadedByContact ? `${doc.uploadedByContact.name} (ลูกความ)` : 'ลูกความ', new Date(doc.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })].join(' · ')}</div>
                    {officeEditedHint(doc.filename, officeLinks[doc.id]) && <p className="text-xs font-medium text-warning">{officeEditedHint(doc.filename, officeLinks[doc.id])}</p>}</div>
                  <button type="button" onClick={() => handleView(doc)} disabled={viewingId === doc.id} className={`${v2.btn} ${v2.ghost}`}>{viewingId === doc.id ? d.caseDocuments.opening : 'ดู'}</button>
                  <button type="button" onClick={() => handleDownload(doc)} className={`${v2.btn} ${v2.ghost}`}>ดาวน์โหลด</button>
                  <button type="button" aria-expanded={managingDocId === doc.id} onClick={() => setManagingDocId(managingDocId === doc.id ? null : doc.id)} className={`${v2.btn} ${v2.ghost}`} aria-label={`จัดการ ${doc.filename}`}><Ellipsis aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button>
                </div>
                {managingDocId === doc.id && <div className="mt-3 pl-14">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={doc.category ?? 'OTHER'}
                  onChange={async (e) => {
                    if (!token) return;
                    await api
                      .updateDocumentCategory(token, id, doc.id, e.target.value || null)
                      .catch(console.error);
                    load();
                  }}
                  className="min-h-11 rounded-lg border bg-background px-2 py-1 text-xs sm:min-h-8"
                  aria-label={`ประเภทเอกสาร ${doc.filename}`}
                  title="ประเภทเอกสาร"
                >
                  {DOCUMENT_CATEGORY_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {documentCategoryLabel(value, 'th')}
                    </option>
                  ))}
                </select>
                <span className="hidden text-xs text-muted-foreground sm:inline">{doc.mimeType}</span>
                <Link
                  href={`/cases/${id}/documents/${doc.id}/review`}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium sm:min-h-8 hover:bg-accent"
                >
                  <ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  ส่งตรวจ/ผลตรวจ
                </Link>
                {isOfficeEditable(doc.filename) && (
                  <button
                    type="button"
                    onClick={() => handleOpenInOffice(doc)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium sm:min-h-8 hover:bg-accent"
                  >
                    <PenLine aria-hidden="true" className="h-3.5 w-3.5" />
                    เปิดแก้ใน {officeAppName(doc.filename)} ออนไลน์
                  </button>
                )}
                {officeLinks[doc.id] && (
                  <button
                    type="button"
                    onClick={() => handlePullFromOffice(doc)}
                    disabled={officeBusyId === doc.id}
                    className={`inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium sm:min-h-8 disabled:opacity-50 ${
                      officeLinks[doc.id].hasNewerEdits ? 'border-warning/50 bg-warning/10 text-warning' : 'hover:bg-accent'
                    }`}
                  >
                    <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    {officeBusyId === doc.id ? 'กำลังดึง…' : 'ดึงเวอร์ชันล่าสุดกลับ'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleAnalyzeDocument(doc)}
                  disabled={analyzingId === doc.id}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium sm:min-h-8 hover:bg-accent disabled:opacity-50"
                >
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                  {analyzingId === doc.id ? d.caseDocuments.analyzing : d.caseDocuments.aiAnalyzer}
                </button>
                <button
                  type="button"
                  onClick={() => handleExtractDatesFromDocument(doc)}
                  disabled={extractingId === doc.id}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium sm:min-h-8 hover:bg-accent disabled:opacity-50"
                >
                  <CalendarSearch aria-hidden="true" className="h-3.5 w-3.5" />
                  {extractingId === doc.id ? d.caseDocuments.extracting : d.caseDocuments.extractDates}
                </button>
                {/* Everyone sees whether the client can see it; only content managers change it. */}
                {!canManageContent && doc.visibleToClient && (
                  <span className="inline-flex items-center rounded-lg border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                    {d.caseDocuments.visibleToClient}
                  </span>
                )}
                {canManageContent && <>
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(doc)}
                  title="แสดงให้ลูกความเห็น (เผยแพร่)"
                  className={`inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium sm:min-h-8 ${
                    doc.visibleToClient
                      ? 'border-success/30 bg-success/10 text-success'
                      : 'hover:bg-accent'
                  }`}
                >
                  {doc.visibleToClient ? d.caseDocuments.visibleToClient : d.caseDocuments.hiddenFromClient}
                </button>
                {(() => {
                  const activePub = (publications[doc.id] ?? []).find((p) => !p.unpublishedAt);
                  return activePub ? (
                    <button
                      type="button"
                      onClick={() => handleUnpublish(doc, activePub.id)}
                      disabled={publishingId === doc.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success disabled:opacity-50"
                    >
                      {publishingId === doc.id ? 'กำลังยกเลิก...' : 'เผยแพร่แล้ว — ยกเลิก'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPublishTarget(doc)}
                      disabled={publishingId === doc.id}
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium sm:min-h-8 hover:bg-accent disabled:opacity-50"
                    >
                      เผยแพร่ให้ลูกความ...
                    </button>
                  );
                })()}
                </>}
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium sm:min-h-8 hover:bg-accent"
                >
                  <Download aria-hidden="true" className="h-3.5 w-3.5" />
                  {d.caseDocuments.download}
                </button>
              </div>
                </div>}
              </li>)}
            </ul>}
            {documents.length > 10 && <button type="button" onClick={() => setShowAllDocs((v) => !v)} className="flex w-full items-center gap-1 border-t border-[#e2e0d8] px-5 py-3 text-sm font-semibold underline">{showAllDocs ? 'แสดงเฉพาะไฟล์ล่าสุด' : <>ดูไฟล์ทั้งหมด ({documents.length}) <ArrowRight aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></>}</button>}
          </section>
        </div>
        {token && <div><CaseDocRequestsCard token={token} caseId={id} /></div>}
      </div>
      <details className={`${v2.card} mt-5`}>
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-5 py-3 font-semibold">เครื่องมือเพิ่มเติม <span className={v2.label}>· เอกสารที่ต้องมีตามประเภทคดี · สร้างจากแม่แบบ · AI ร่างคำคู่ความ · OneDrive · พยานหลักฐาน</span></summary>
        <div className="space-y-5 border-t border-[#e2e0d8] p-5">
      {requiredDocs && requiredDocs.required.length > 0 && (
        <div
          className={`mb-6 rounded-xl border p-4 ${
            requiredDocs.missing.length
              ? 'border-warning/40 bg-warning/5'
              : 'border-success/40 bg-success/5'
          }`}
        >
          <p className="mb-2 text-sm font-semibold">
            เอกสารที่ต้องมีตามประเภทคดี{' '}
            {requiredDocs.missing.length
              ? `— ขาดอีก ${requiredDocs.missing.length} รายการ`
              : '— ครบแล้ว'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {requiredDocs.required.map((item) => (
              <span
                key={item.category}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${
                  item.present
                    ? 'border-success/40 text-success'
                    : 'border-warning/50 font-medium text-warning'
                }`}
              >
                {item.present
                  ? <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  : <X aria-hidden="true" className="h-3.5 w-3.5" />}
                <span className="sr-only">{item.present ? 'มีแล้ว: ' : 'ยังขาด: '}</span>
                {documentCategoryLabel(item.category, 'th')}
              </span>
            ))}
          </div>
        </div>
      )}
      <DateSuggestionsPanel
        caseId={id}
        sources={['DOCUMENT', 'EMAIL']}
        title={d.dateSuggestions.documentTitle}
        reloadKey={suggestionsKey}
        onChanged={onChanged}
      />
      <div className="mb-6 rounded-xl border bg-card p-6">
        <h2 className="mb-4 font-semibold text-foreground">{d.caseDocuments.templates}</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setTemplateDrawerOpen(true)}>
            <FileText aria-hidden="true" className="h-4 w-4" />
            สร้างเอกสารจากแม่แบบ
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPleadingDrawerOpen(true)}>
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            AI ร่างคำคู่ความ
          </Button>
        </div>
      </div>

      {token && (
        <TemplateGenerateDrawer
          open={templateDrawerOpen}
          onClose={() => setTemplateDrawerOpen(false)}
          token={token}
          caseId={id}
          templates={templates}
          onGenerated={load}
        />
      )}

      {token && (
        <PleadingDraftDrawer
          open={pleadingDrawerOpen}
          onClose={() => setPleadingDrawerOpen(false)}
          token={token}
          caseId={id}
          onGenerated={load}
        />
      )}
      <CaseDriveSection caseId={id} onImported={load} newFolderName={newFolderName} />
      <CaseEvidenceSection caseId={id} refreshKey={analysisRevision} />
      <CaseKnowledgePanel caseId={id} refreshKey={analysisRevision} />
        </div>
      </details>
      {preview && (
        <DocumentPreviewModal
          filename={preview.filename}
          mimeType={preview.mimeType}
          url={preview.url}
          onClose={closePreview}
        />
      )}

      {publishTarget && (
        <PublishDocumentDialog
          caseId={id}
          document={publishTarget}
          onClose={() => setPublishTarget(null)}
          onPublished={() => loadPublications(publishTarget.id)}
        />
      )}
    </div>
  );
}
