'use client';

import { CaseKnowledgePanel } from '@/components/documents/CaseKnowledgePanel';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Upload, Eye, Download, ArrowLeft, Sparkles, CalendarSearch, ClipboardCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, ApiError, DocumentItem, DocumentTemplateItem, DocumentPublicationEntry } from '@/lib/api';
import { PublishDocumentDialog } from '@/components/documents/PublishDocumentDialog';
import { DocumentDropZone, DocumentDropZoneHandle } from '@/components/DocumentDropZone';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { Button } from '@/components/ui/button';
import { DateSuggestionsPanel } from '@/components/cases/DateSuggestionsPanel';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

export default function CaseDocumentsPage() {
  const d = useDashboardT();
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [rendered, setRendered] = useState<{ name: string; content: string } | null>(null);
  const [error, setError] = useState('');
  const dropRef = useRef<DocumentDropZoneHandle>(null);
  const [suggestionsKey, setSuggestionsKey] = useState(0);
  const [preview, setPreview] = useState<{ filename: string; mimeType: string; url: string } | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [publications, setPublications] = useState<Record<string, DocumentPublicationEntry[]>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);
  // Publishing reaches the client portal, so the recipients are reviewed first
  // rather than inferred from whoever happens to hold access.
  const [publishTarget, setPublishTarget] = useState<DocumentItem | null>(null);

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
      api.getDocuments(token, id) as Promise<DocumentItem[]>,
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

  useEffect(() => { load(); }, [token, id]);


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

  const handleRender = async (templateId: string) => {
    if (!token || !id) return;
    const result = await api.renderTemplate(token, id, templateId);
    setRendered(result);
  };

  if (loading) return <p className="text-muted-foreground">{d.documents.loading}</p>;

  return (
    <div>
      <Link href={`/cases/${id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" />
        {d.messages.backToCase.replace('← ', '')}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold tracking-tight text-foreground">{d.caseDocuments.title}</h1>

      <div className="mb-6 rounded-xl border bg-card p-6 shadow-soft">
        <h2 className="mb-4 font-semibold text-foreground">{d.caseDocuments.uploadDocument}</h2>
        <DocumentDropZone
          ref={dropRef}
          onFile={handleUpload}
          loading={uploading}
          loadingLabel={d.caseDocuments.uploading}
          label={d.documents.dropHint}
          hint={d.documents.fileTypesHint}
        />
        <Button
          type="button"
          disabled={uploading}
          onClick={() => dropRef.current?.open()}
          className="mt-3 w-full"
        >
          <Upload className="h-4 w-4" />
          {uploading ? d.caseDocuments.uploading : d.caseDocuments.uploadDocument}
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <DateSuggestionsPanel
        caseId={id}
        source="DOCUMENT"
        title={d.dateSuggestions.documentTitle}
        reloadKey={suggestionsKey}
      />

      <div className="mb-6 rounded-xl border bg-card p-6 shadow-soft">
        <h2 className="mb-4 font-semibold text-foreground">{d.caseDocuments.templates}</h2>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => handleRender(t.id)}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
            >
              {t.name}
            </button>
          ))}
        </div>
        {rendered && (
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap">
            {rendered.content}
          </pre>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-soft">
        <h2 className="mb-4 font-semibold text-foreground">{fmt(d.caseDocuments.filesCount, { count: documents.length })}</h2>
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-accent/50"
            >
              <button
                type="button"
                onClick={() => handleView(doc)}
                disabled={viewingId === doc.id}
                className="min-w-0 flex-1 text-left"
              >
                <p className="font-medium text-primary hover:underline">{doc.filename}</p>
                <p className="text-xs text-muted-foreground">
                  v{doc.version} — {doc.uploadedBy.firstName} {doc.uploadedBy.lastName}
                </p>
              </button>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
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
          {documents.length === 0 && <p className="text-sm text-muted-foreground">{d.caseDocuments.noDocuments}</p>}
        </div>
      </div>

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
