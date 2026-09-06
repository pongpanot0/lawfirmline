'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, Upload, Search, FileText, Scale, Shield, Gavel, Eye } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseItem, DocumentItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DocumentDropZone, DocumentDropZoneHandle } from '@/components/DocumentDropZone';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { Badge } from '@/components/ui/badge';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

export default function DocumentsPage() {
  const d = useDashboardT();
  const CATEGORIES = [
    { id: 'complaint', label: d.documents.catComplaint, icon: Gavel },
    { id: 'evidence', label: d.documents.catEvidence, icon: FileText },
    { id: 'contracts', label: d.documents.catContracts, icon: Scale },
    { id: 'poa', label: d.documents.catPoa, icon: Shield },
    { id: 'orders', label: d.documents.catOrders, icon: Gavel },
  ];
  const { token } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCase, setSelectedCase] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ filename: string; mimeType: string; url: string } | null>(null);
  const dropZoneRef = useRef<DocumentDropZoneHandle>(null);

  useEffect(() => {
    if (!token) return;
    api.getCases(token).then((c) => {
      setCases(c);
      if (c[0]) setSelectedCase(c[0].id);
    });
  }, [token]);

  const loadDocuments = (caseId: string) => {
    if (!token || !caseId) return;
    setDocsLoading(true);
    api.getDocuments(token, caseId)
      .then((docs) => setDocuments(docs as DocumentItem[]))
      .catch(() => setDocuments([]))
      .finally(() => setDocsLoading(false));
  };

  useEffect(() => {
    if (!selectedCase) {
      setDocuments([]);
      return;
    }
    loadDocuments(selectedCase);
  }, [token, selectedCase]);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const filtered = cases.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [
      c.ownRef,
      c.customerRef,
      c.title,
      c.clientName,
      c.blackCaseNumber,
      c.redCaseNumber,
      c.courtName,
      c.folderId,
    ].some((v) => v?.toLowerCase().includes(q));
  });

  const handleUpload = async (file: File) => {
    if (!token || !selectedCase) {
      setError(d.documents.selectCaseFirst);
      return;
    }
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      await api.uploadDocument(token, selectedCase, file);
      const caseLabel = cases.find((c) => c.id === selectedCase)?.ownRef ?? '';
      setSuccess(fmt(d.documents.uploaded, { filename: file.name, caseLabel }));
      loadDocuments(selectedCase);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : d.documents.uploadFailed);
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (doc: DocumentItem) => {
    if (!token || !selectedCase) return;
    setViewingId(doc.id);
    setError('');
    try {
      const blob = await api.downloadDocument(token, selectedCase, doc.id);
      const url = URL.createObjectURL(blob);
      setPreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { filename: doc.filename, mimeType: doc.mimeType, url };
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : d.documents.openFailed);
    } finally {
      setViewingId(null);
    }
  };

  const closePreview = () => {
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  return (
    <div>
      <PageHeader title={d.documents.title} description={d.documents.description} />

      <div className="mb-6 grid gap-4 sm:grid-cols-5">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <Card key={cat.id} className="cursor-pointer hover:bg-accent/50 transition-colors">
              <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-xs font-medium">{cat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={d.documents.searchPlaceholder} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {filtered.map((c) => (
                <Link
                  key={c.id}
                  href={`/cases/${c.id}/documents`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.ownRef} · {c.folderId ?? d.documents.folderFallback}</p>
                  </div>
                  <Badge variant="muted">{d.documents.view}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">{d.documents.uploadToCase}</p>
              <select
                value={selectedCase}
                onChange={(e) => setSelectedCase(e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                {cases.map((c) => <option key={c.id} value={c.id}>{c.ownRef}</option>)}
              </select>
              <DocumentDropZone
                ref={dropZoneRef}
                label={selectedCase ? d.documents.dropHint : d.documents.selectCaseHint}
                loadingLabel={d.documents.uploading}
                hint={d.documents.fileTypesHint}
                onFile={handleUpload}
                loading={uploading}
                disabled={!selectedCase}
              />
              <Button
                className="w-full"
                size="sm"
                disabled={!selectedCase || uploading}
                onClick={() => dropZoneRef.current?.open()}
              >
                <Upload className="h-4 w-4" />
                {uploading ? d.documents.uploading : d.documents.uploadDocument}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-emerald-600">{success}</p>}
              {selectedCase && (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-sm font-medium">
                    {docsLoading ? d.documents.recentFilesPlain : fmt(d.documents.recentFiles, { count: documents.length })}
                  </p>
                  {docsLoading ? (
                    <p className="text-xs text-muted-foreground">{d.documents.loading}</p>
                  ) : documents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{d.documents.noFiles}</p>
                  ) : (
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {documents.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => handleView(doc)}
                          disabled={viewingId === doc.id}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                        >
                          <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="truncate text-primary hover:underline">{doc.filename}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selectedCase && (
                <Link
                  href={`/cases/${selectedCase}/documents`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
                >
                  <Upload className="h-4 w-4" />
                  {d.documents.viewCaseDocuments}
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-2">{d.documents.features}</p>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li>✓ {d.documents.featureFolders}</li>
                <li>✓ {d.documents.featureVersions}</li>
                <li>✓ {d.documents.featurePreview}</li>
                <li>✓ {d.documents.featureAnalysis}</li>
              </ul>
              <Link href="/knowledge" className="mt-3 block text-sm text-primary hover:underline">
                {d.documents.viewKnowledgeBase}
              </Link>
            </CardContent>
          </Card>
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
