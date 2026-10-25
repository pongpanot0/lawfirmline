'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, ChevronRight, FolderOpen, Upload, Search, FileText, Eye } from 'lucide-react';
import { CaseStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseListItem, DocumentItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { InlineEmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { DocumentDropZone, DocumentDropZoneHandle } from '@/components/DocumentDropZone';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

export default function DocumentsPage() {
  const d = useDashboardT();
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get('caseId') ?? '';
  const { token } = useAuth();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [casesState, setCasesState] = useState<'loading' | 'failed' | 'ready'>('loading');
  const [casesAttempt, setCasesAttempt] = useState(0);
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

  // Closed cases sink to the bottom: they are rarely the destination, and a
  // file that lands in one by accident is hard to notice.
  const caseOptions = [...cases].sort(
    (a, b) => Number(a.status === CaseStatus.CLOSED) - Number(b.status === CaseStatus.CLOSED),
  );

  useEffect(() => {
    if (!token) return;
    // No case is picked for the user: a file lands where they said, not
    // where the list happened to start.
    setCasesState('loading');
    api.getCases(token)
      .then((rows) => { setCases(rows); setCasesState('ready'); })
      .catch(() => setCasesState('failed'));
  }, [token, casesAttempt]);

  useEffect(() => {
    if (!caseIdParam) return;
    setSelectedCase((current) => current || caseIdParam);
  }, [caseIdParam]);

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

  const [docResults, setDocResults] = useState<
    Array<DocumentItem & { case: { id: string; title: string; ownRef: string } | null }>
  >([]);

  const [contentResults, setContentResults] = useState<
    Awaited<ReturnType<typeof api.searchDocumentContent>>
  >([]);

  // ค้นเอกสารข้ามคดีจากช่องเดียวกับที่กรองคดี (debounce 300ms)
  // ชื่อไฟล์/tag ค้นทันที ส่วนเนื้อหาเอกสารค้นแบบ semantic ผ่าน RAG
  useEffect(() => {
    if (!token || search.trim().length < 2) {
      setDocResults([]);
      setContentResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.searchDocuments(token, search.trim()).then(setDocResults).catch(() => setDocResults([]));
      api.searchDocumentContent(token, search.trim()).then(setContentResults).catch(() => setContentResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [token, search]);

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
      <PageHeader
        title={d.documents.title}
        description={d.documents.description}
        actions={
          <Link href="/knowledge" className={buttonVariants({ variant: 'outline' })}>
            <BookOpen className="h-4 w-4" aria-hidden />
            {d.documents.viewKnowledgeBase}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input placeholder={d.documents.searchPlaceholder} aria-label={d.documents.searchPlaceholder} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {docResults.length > 0 && (
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                <p className="px-4 py-2 text-xs font-semibold text-muted-foreground">
                  เอกสารที่ตรงกับ &ldquo;{search}&rdquo; ({docResults.length})
                </p>
                {docResults.map((doc) => (
                  <Link
                    key={doc.id}
                    href={doc.case ? `/cases/${doc.case.id}/documents` : '#'}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.filename}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {doc.case ? `${doc.case.ownRef} · ${doc.case.title}` : '—'} · v{doc.version}
                      </p>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {contentResults.length > 0 && (
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                <p className="px-4 py-2 text-xs font-semibold text-muted-foreground">
                  พบในเนื้อหาเอกสาร (AI) ({contentResults.length})
                </p>
                {contentResults.map((r) => (
                  <Link
                    key={r.documentId}
                    href={`/cases/${r.caseId}/documents`}
                    className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {r.filename}
                        {r.pageStart ? (
                          <span className="text-muted-foreground"> · หน้า {r.pageStart}{r.pageEnd && r.pageEnd !== r.pageStart ? `-${r.pageEnd}` : ''}</span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.caseOwnRef} · {r.caseTitle}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.snippet}</p>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {casesState === 'loading' && (
                <div role="status" aria-label={d.documents.loading} className="divide-y divide-border">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3">
                      <Skeleton className="h-4 w-4" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48 max-w-full" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {casesState === 'failed' && (
                <div className="p-4">
                  <LoadFailed onRetry={() => setCasesAttempt((n) => n + 1)} />
                </div>
              )}
              {casesState === 'ready' && filtered.length === 0 && (
                <div className="p-4">
                  <InlineEmptyState
                    icon={FolderOpen}
                    title={search ? `ไม่พบคดีที่ตรงกับ "${search}"` : 'ยังไม่มีคดี'}
                    action={search ? undefined : (
                      <Link href="/cases/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>เปิดคดีใหม่</Link>
                    )}
                  />
                </div>
              )}
              {casesState === 'ready' && filtered.map((c) => (
                <Link
                  key={c.id}
                  href={`/cases/${c.id}/documents`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.ownRef} · {c.folderId ?? d.documents.folderFallback}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={d.documents.view} />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <label htmlFor="documents-upload-case" className="block text-sm font-medium">{d.documents.uploadToCase}</label>
              <select
                id="documents-upload-case"
                value={selectedCase}
                onChange={(e) => setSelectedCase(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">{d.documents.selectCase}</option>
                {caseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ownRef} — {c.title}
                    {c.status === CaseStatus.CLOSED ? ` (${d.documents.caseClosedTag})` : ''}
                  </option>
                ))}
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
                <Upload className="h-4 w-4" aria-hidden />
                {uploading ? d.documents.uploading : d.documents.uploadDocument}
              </Button>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              {success && <p role="status" className="text-sm text-success">{success}</p>}
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
                          <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
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
                  className={buttonVariants({ variant: 'outline', className: 'w-full' })}
                >
                  <FolderOpen className="h-4 w-4" aria-hidden />
                  {d.documents.viewCaseDocuments}
                </Link>
              )}
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
