'use client';

import { CaseKnowledgePanel } from '@/components/documents/CaseKnowledgePanel';
import { CaseEvidenceSection } from '@/components/cases/CaseEvidenceSection';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, Download, Sparkles, CalendarSearch, ClipboardCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, DocumentItem, DocumentTemplateItem, DocumentPublicationEntry } from '@/lib/api';
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
import { DocumentCategory } from '@lawfirm/shared';

const DOCUMENT_CATEGORY_VALUES = Object.values(DocumentCategory);

export function CaseDocumentsPanel({ caseId }: { caseId: string }) {
  const d = useDashboardT();
  const id = caseId;
  const { token } = useAuth();
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
      .catch(console.error)
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
      <div className="mb-6 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategoryFilter('')}
          className={`min-h-9 rounded-lg px-3 py-1 text-xs ${
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
            className={`min-h-9 rounded-lg px-3 py-1 text-xs ${
              categoryFilter === value
                ? 'bg-primary text-primary-foreground'
                : 'border bg-card text-muted-foreground hover:border-primary/40'
            }`}
          >
            {documentCategoryLabel(value, 'th')}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {requiredDocs && requiredDocs.required.length > 0 && (
        <div
          className={`mb-6 rounded-xl border p-4 ${
            requiredDocs.missing.length
              ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
              : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
          }`}
        >
          <p className="mb-2 text-sm font-semibold">
            เอกสารที่ต้องมีตามประเภทคดี{' '}
            {requiredDocs.missing.length
              ? `— ขาดอีก ${requiredDocs.missing.length} รายการ`
              : '— ครบแล้ว ✓'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {requiredDocs.required.map((item) => (
              <span
                key={item.category}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  item.present
                    ? 'border-emerald-300 text-emerald-700 dark:text-emerald-300'
                    : 'border-amber-400 font-medium text-amber-700 dark:text-amber-300'
                }`}
              >
                {item.present ? '✓ ' : '✗ '}
                {documentCategoryLabel(item.category, 'th')}
              </span>
            ))}
          </div>
        </div>
      )}

      <DateSuggestionsPanel
        caseId={id}
        source="DOCUMENT"
        title={d.dateSuggestions.documentTitle}
        reloadKey={suggestionsKey}
      />

      <div className="mb-6 rounded-xl border bg-card p-6 shadow-soft">
        <h2 className="mb-4 font-semibold text-foreground">{d.caseDocuments.templates}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTemplateDrawerOpen(true)}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
          >
            สร้างเอกสารจากแม่แบบ
          </button>
          <button
            type="button"
            onClick={() => setPleadingDrawerOpen(true)}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
          >
            ✦ AI ร่างคำคู่ความ
          </button>
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

      <div className="rounded-xl border bg-card p-6 shadow-soft">
        <h2 className="mb-4 font-semibold text-foreground">{fmt(d.caseDocuments.filesCount, { count: documents.length })}</h2>
        <p className="mb-3 text-sm text-muted-foreground">อัปโหลดก่อน แล้วให้ Jev เสนอหมวดเอกสารพร้อมข้อความอ้างอิงเพื่อให้ทนายตรวจ</p>
        <div className="mb-4">
          <DocumentDropZone
            onFile={handleUpload}
            loading={uploading}
            loadingLabel={d.caseDocuments.uploading}
            label={d.documents.dropHint}
            hint={d.documents.fileTypesHint}
          />
        </div>
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
                <p className="break-all font-medium text-primary hover:underline">{doc.filename}</p>
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
                  className="rounded-lg border bg-background px-2 py-1 text-xs"
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
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  ส่งตรวจ/ผลตรวจ
                </Link>
                <button
                  type="button"
                  onClick={() => handleAnalyzeDocument(doc)}
                  disabled={analyzingId === doc.id}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {analyzingId === doc.id ? d.caseDocuments.analyzing : d.caseDocuments.aiAnalyzer}
                </button>
                <button
                  type="button"
                  onClick={() => handleExtractDatesFromDocument(doc)}
                  disabled={extractingId === doc.id}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  <CalendarSearch className="h-3.5 w-3.5" />
                  {extractingId === doc.id ? d.caseDocuments.extracting : d.caseDocuments.extractDates}
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(doc)}
                  title="แสดงให้ลูกความเห็น (เผยแพร่)"
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    doc.visibleToClient
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
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
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 disabled:opacity-50"
                    >
                      {publishingId === doc.id ? 'กำลังยกเลิก...' : 'เผยแพร่แล้ว — ยกเลิก'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPublishTarget(doc)}
                      disabled={publishingId === doc.id}
                      className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                    >
                      เผยแพร่ให้ลูกความ...
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => handleView(doc)}
                  disabled={viewingId === doc.id}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {viewingId === doc.id ? d.caseDocuments.opening : d.caseDocuments.view}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
                >
                  <Download className="h-3.5 w-3.5" />
                  {d.caseDocuments.download}
                </button>
              </div>
            </div>
          ))}
          {documents.length === 0 && (
            <InlineEmptyState
              title={d.caseDocuments.noDocuments}
              description="ลากไฟล์มาวางในช่องด้านบน หรือคลิกช่องอัปโหลดเพื่อเลือกไฟล์ แล้วจึงใช้ AI วิเคราะห์ได้"
            />
          )}
        </div>
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
