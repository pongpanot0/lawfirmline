'use client';

import { CaseKnowledgePanel } from '@/components/documents/CaseKnowledgePanel';
import { CaseDriveSection } from '@/components/cases/CaseDriveSection';
import { CaseEvidenceSection } from '@/components/cases/CaseEvidenceSection';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Sparkles, CalendarSearch, ClipboardCheck, PenLine, RotateCcw, Check, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { useAuth } from '@/lib/auth';
import { api, ApiError, DocumentItem, DocumentTemplateItem, DocumentPublicationEntry, DocumentOfficeLinkView } from '@/lib/api';
import { isOfficeEditable, officeAppName, officeEditedHint, openInNewTab } from '@/lib/drive-view';
import { PublishDocumentDialog } from '@/components/documents/PublishDocumentDialog';
import { TemplateGenerateDrawer } from '@/components/cases/TemplateGenerateDrawer';
import { PleadingDraftDrawer } from '@/components/cases/PleadingDraftDrawer';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { DateSuggestionsPanel } from '@/components/cases/DateSuggestionsPanel';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { documentCategoryLabel } from '@/lib/stage-labels';
import { DocumentCategory, hasFirmCapability } from '@lawfirm/shared';

const DOCUMENT_CATEGORY_VALUES = Object.values(DocumentCategory);

export function CaseDocumentsPanel({ caseId, onChanged }: { caseId: string; onChanged?: () => void }) {
  const d = useDashboardT();
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

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">{d.caseDocuments.title}</h2>

      {/* กรองตามหมวด — คดีใหญ่มีเอกสารหลายร้อยชิ้น ชื่อไฟล์ล้วนหาไม่เจอ */}
      <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        <button
          type="button"
          onClick={() => setCategoryFilter('')}
          className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 py-1 text-xs sm:min-h-9 ${
            categoryFilter === '' ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground'
          }`}
        >
          ทั้งหมด
        </button>
        {DOCUMENT_CATEGORY_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategoryFilter(value)}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 py-1 text-xs sm:min-h-9 ${
              categoryFilter === value
                ? 'bg-primary text-primary-foreground'
                : 'border bg-card text-muted-foreground hover:border-primary/40'
            }`}
          >
            {documentCategoryLabel(value, 'th')}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

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

      <CaseDriveSection caseId={id} onImported={load} />
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 font-semibold text-foreground">{fmt(d.caseDocuments.filesCount, { count: documents.length })}</h2>
        <div className="mb-4">
          <DocumentDropZone
            onFile={handleUpload}
            loading={uploading}
            loadingLabel={d.caseDocuments.uploading}
            label={d.documents.dropHint}
            hint={d.documents.fileTypesHint}
          />
        </div>
        {loadError ? (
          <LoadFailed onRetry={load} />
        ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent/50"
            >
              <button
                type="button"
                onClick={() => handleView(doc)}
                disabled={viewingId === doc.id}
                className="min-w-0 text-left"
              >
                <p className="break-all font-medium text-primary hover:underline">
                  {doc.filename}
                  {viewingId === doc.id && <span className="ml-2 text-xs font-normal text-muted-foreground">{d.caseDocuments.opening}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  v{doc.version} —{' '}
                  {doc.uploadedBy
                    ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`
                    : doc.uploadedByContact?.name ?? 'ลูกความ'}
                  {doc.uploadedByContact && (
                    <span className="ml-1.5 rounded-full border border-primary/30 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      จากลูกความ
                    </span>
                  )}
                </p>
                {officeEditedHint(doc.filename, officeLinks[doc.id]) && (
                  <p className="text-xs font-medium text-warning">
                    {officeEditedHint(doc.filename, officeLinks[doc.id])}
                  </p>
                )}
                {officeLinks[doc.id]?.error && <p className="text-xs text-muted-foreground">{officeLinks[doc.id].error}</p>}
              </button>
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
            </div>
          ))}
          {documents.length === 0 && (
            <InlineEmptyState
              title={d.caseDocuments.noDocuments}
            />
          )}
        </div>
        )}
      </div>

      <CaseEvidenceSection caseId={id} refreshKey={analysisRevision} />
      <CaseKnowledgePanel caseId={id} refreshKey={analysisRevision} />
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
