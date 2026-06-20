'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, DocumentItem, DocumentTemplateItem } from '@/lib/api';
import { DocumentDropZone } from '@/components/DocumentDropZone';

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

  const load = () => {
    if (!token || !id) return;
    Promise.all([
      api.getDocuments(token, id) as Promise<DocumentItem[]>,
      api.getDocumentTemplates(token),
    ])
      .then(([docs, tmpls]) => {
        setDocuments(docs);
        setTemplates(tmpls);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token, id]);

  const handleUpload = async (file: File) => {
    if (!token || !id) return;
    setUploading(true);
    setError('');
    try {
      await api.uploadDocument(token, id, file);
      load();
    } catch {
      setError('Upload failed');
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
          <DocumentDropZone onFile={handleUpload} loading={uploading} label="Upload to case folder" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold">AI Document Analyzer</h2>
          <DocumentDropZone onFile={handleAnalyze} loading={analyzing} label="Upload for AI summary" />
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
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{d.filename}</p>
                <p className="text-xs text-slate-400">
                  v{d.version} — {d.uploadedBy.firstName} {d.uploadedBy.lastName}
                </p>
              </div>
              <span className="text-xs text-slate-400">{d.mimeType}</span>
            </div>
          ))}
          {documents.length === 0 && <p className="text-sm text-slate-400">No documents yet</p>}
        </div>
      </div>
    </div>
  );
}
