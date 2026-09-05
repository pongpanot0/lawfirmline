'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Upload, Eye, Download } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, ApiError, DocumentItem, DocumentTemplateItem, DocumentPublicationEntry } from '@/lib/api';
import { DocumentDropZone, DocumentDropZoneHandle } from '@/components/DocumentDropZone';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';

export default function CaseDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [rendered, setRendered] = useState<{ name: string; content: string } | null>(null);
  const [error, setError] = useState('');
  const uploadRef = useRef<DocumentDropZoneHandle>(null);
  const analyzeRef = useRef<DocumentDropZoneHandle>(null);
  const [preview, setPreview] = useState<{ filename: string; mimeType: string; url: string } | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [publications, setPublications] = useState<Record<string, DocumentPublicationEntry[]>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);

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
      setError(e instanceof ApiError ? e.message : 'Could not open document');
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
      setError(e instanceof ApiError ? e.message : 'Download failed');
    }
  };

  const handleToggleVisibility = async (doc: DocumentItem) => {
    if (!token || !id) return;
    try {
      await api.updateDocumentVisibility(token, id, doc.id, !doc.visibleToClient);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update visibility');
    }
  };

  const handlePublish = async (doc: DocumentItem) => {
    if (!token || !id) return;
    setPublishingId(doc.id);
    try {
      await api.publishDocument(token, id, doc.id, { title: doc.filename });
      loadPublications(doc.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not publish document');
    } finally {
      setPublishingId(null);
    }
  };

  const handleUnpublish = async (doc: DocumentItem, publicationId: string) => {
    if (!token || !id) return;
    setPublishingId(doc.id);
    try {
      await api.unpublishDocument(token, id, doc.id, publicationId);
      loadPublications(doc.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not unpublish document');
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
      setError(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async (file: File) => {
    if (!token || !id) return;
    setAnalyzing(true);
    setError('');
    try {
      await api.analyzeDocument(token, id, file, file.name);
      alert('Document analyzed! View in Knowledge Base.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI analysis failed (check credits)');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRender = async (templateId: string) => {
    if (!token || !id) return;
    const result = await api.renderTemplate(token, id, templateId);
    setRendered(result);
  };

  if (loading) return <p className="text-slate-500">Loading documents...</p>;

  return (
    <div>
      <Link href={`/cases/${id}`} className="text-sm text-brand-600 hover:underline">← Back to case</Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-slate-900">Document Library</h1>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold">Upload Document</h2>
          <DocumentDropZone
            ref={uploadRef}
            onFile={handleUpload}
            loading={uploading}
            loadingLabel="Uploading..."
            label="Drag & drop or click here"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => uploadRef.current?.open()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold">AI Document Analyzer</h2>
          <DocumentDropZone
            ref={analyzeRef}
            onFile={handleAnalyze}
            loading={analyzing}
            loadingLabel="Analyzing document..."
            label="Drag & drop or click here"
          />
          <button
            type="button"
            disabled={analyzing}
            onClick={() => analyzeRef.current?.open()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {analyzing ? 'Analyzing...' : 'Choose file for AI'}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">Templates</h2>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => handleRender(t.id)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-brand-50"
            >
              {t.name}
            </button>
          ))}
        </div>
        {rendered && (
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-slate-50 p-4 text-xs whitespace-pre-wrap">
            {rendered.content}
          </pre>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold">Files ({documents.length})</h2>
        <div className="space-y-2">
          {documents.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <button
                type="button"
                onClick={() => handleView(d)}
                disabled={viewingId === d.id}
                className="min-w-0 flex-1 text-left"
              >
                <p className="font-medium text-brand-700 hover:underline">{d.filename}</p>
                <p className="text-xs text-slate-400">
                  v{d.version} — {d.uploadedBy.firstName} {d.uploadedBy.lastName}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-xs text-slate-400 sm:inline">{d.mimeType}</span>
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(d)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    d.visibleToClient
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 hover:bg-white'
                  }`}
                >
                  {d.visibleToClient ? 'Visible to client' : 'Hidden from client'}
                </button>
                {(() => {
                  const activePub = (publications[d.id] ?? []).find((p) => !p.unpublishedAt);
                  return activePub ? (
                    <button
                      type="button"
                      onClick={() => handleUnpublish(d, activePub.id)}
                      disabled={publishingId === d.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 disabled:opacity-50"
                    >
                      {publishingId === d.id ? 'กำลังยกเลิก...' : 'เผยแพร่แล้ว — ยกเลิก'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handlePublish(d)}
                      disabled={publishingId === d.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-white disabled:opacity-50"
                    >
                      {publishingId === d.id ? 'กำลังเผยแพร่...' : 'เผยแพร่ให้ลูกความ'}
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => handleView(d)}
                  disabled={viewingId === d.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-white disabled:opacity-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {viewingId === d.id ? 'Opening...' : 'View'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(d)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium hover:bg-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
            </div>
          ))}
          {documents.length === 0 && <p className="text-sm text-slate-400">No documents yet</p>}
        </div>
      </div>

      {preview && (
        <DocumentPreviewModal
          filename={preview.filename}
          mimeType={preview.mimeType}
          url={preview.url}
          onClose={closePreview}
        />
      )}
    </div>
  );
}
