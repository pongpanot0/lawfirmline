'use client';

import { CaseKnowledgePanel } from '@/components/documents/CaseKnowledgePanel';
import { CaseDriveSection } from '@/components/cases/CaseDriveSection';
import { CaseEvidenceSection } from '@/components/cases/CaseEvidenceSection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, CalendarSearch, ClipboardCheck, RotateCcw, Check, X, FileText, Upload, ArrowRight, Eye, EyeOff, Tag, CloudDownload, CircleAlert, Image as ImageIcon } from 'lucide-react';
import { DocsRowMenu } from '@/components/case-page/DocsRowMenu';
import { CaseDocRequestsCard } from '@/components/case-page/CaseDocRequestsCard';
import v2 from '@/components/case-page/v2.module.css';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { useAuth } from '@/lib/auth';
import { api, ApiError, DocumentItem, DocumentTemplateItem, DocumentPublicationEntry, DocumentOfficeLinkView } from '@/lib/api';
import { isOfficeEditable, officeAppName, officeEditedHint, openInNewTab } from '@/lib/drive-view';
import { PublishDocumentDialog } from '@/components/documents/PublishDocumentDialog';
import { TemplateGenerateDrawer } from '@/components/cases/TemplateGenerateDrawer';
import { PleadingDraftDrawer } from '@/components/cases/PleadingDraftDrawer';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { PageLoading } from '@/components/ui/misc';
import { DateSuggestionsPanel } from '@/components/cases/DateSuggestionsPanel';
import { useDashboardT } from '@/components/landing/LocaleProvider';
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
  const [showDrive, setShowDrive] = useState(false);
  const [managingDocId, setManagingDocId] = useState<string | null>(null);
  type UploadRow = { name: string; status: 'uploading' | 'done' | 'error'; doc?: DocumentItem };
  const [uploadRows, setUploadRowsState] = useState<UploadRow[]>([]);
  const uploadRowsRef = useRef<UploadRow[]>([]);
  const setUploadRows = (rows: UploadRow[]) => { uploadRowsRef.current = rows; setUploadRowsState(rows); };
  const [uploadCategory, setUploadCategory] = useState<string>('OTHER');
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

  const uploadMany = async (files: File[]) => {
    if (!token || !id || !files.length) return;
    setUploading(true); setError('');
    for (const file of files) {
      const index = uploadRowsRef.current.length;
      uploadRowsRef.current = [...uploadRowsRef.current, { name: file.name, status: 'uploading' }];
      setUploadRows(uploadRowsRef.current);
      try {
        const doc = await api.uploadDocument(token, id, file, { category: uploadCategory });
        uploadRowsRef.current = uploadRowsRef.current.map((row, i) => (i === index ? { ...row, status: 'done', doc } : row));
      } catch (e) {
        uploadRowsRef.current = uploadRowsRef.current.map((row, i) => (i === index ? { ...row, status: 'error' } : row));
        setError(e instanceof ApiError ? e.message : d.caseDocuments.uploadFailed);
      }
      setUploadRows(uploadRowsRef.current);
    }
    setUploading(false); load();
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
      {uploadOpen && <dialog ref={(el) => { if (el && !el.open) el.showModal(); }} aria-labelledby="upload-title" onCancel={(e) => { e.preventDefault(); if (!uploading) { setUploadOpen(false); setUploadRows([]); } }} className="m-auto w-[min(36rem,calc(100vw-2rem))] max-w-none rounded-2xl bg-[#fffdfa] p-0 text-foreground shadow-2xl backdrop:bg-[#101d2a]/45">
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-start justify-between border-b border-[#e2e0d8] px-6 py-4"><h2 id="upload-title" tabIndex={-1} autoFocus className="text-xl font-bold outline-none">แนบเอกสารเข้าคดี</h2><button type="button" aria-label="ปิดหน้าต่างแนบเอกสาร" disabled={uploading} onClick={() => { setUploadOpen(false); setUploadRows([]); }} className={`${v2.btn} ${v2.ghost}`}><X aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button></div>
          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-5">
            <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void uploadMany(Array.from(e.dataTransfer.files ?? [])); }} className="block cursor-pointer rounded-xl border-2 border-dashed border-[#b9bfb8] p-5 text-center focus-within:ring-2 focus-within:ring-ring"><input type="file" multiple className="sr-only" disabled={uploading} onChange={(e) => { void uploadMany(Array.from(e.target.files ?? [])); e.target.value = ''; }} /><b>ลากไฟล์มาวาง หรือ <span className="underline">เลือกไฟล์</span></b><p className={v2.hint}>PDF, Word, รูปภาพ · ไฟล์ละไม่เกิน 25 MB</p></label>
            {uploadRows.map((row, index) => <div key={`${row.name}-${index}`} className="rounded-lg border border-[#e2e0d8] p-3"><div className="flex items-center justify-between gap-2 text-sm"><span className="flex min-w-0 items-center gap-2">{/\.(jpe?g|png|heic|gif|webp)$/i.test(row.name) ? <ImageIcon aria-hidden="true" className="h-[1.1em] w-[1.1em] shrink-0" /> : <FileText aria-hidden="true" className="h-[1.1em] w-[1.1em] shrink-0" />}<span className="truncate">{row.name}</span></span>{row.status === 'done' ? <span className="flex items-center gap-1 font-semibold text-[#227052]"><Check aria-hidden="true" className="h-[1.1em] w-[1.1em]" />อัปโหลดแล้ว</span> : row.status === 'error' ? <span className="font-semibold text-[#a83232]">อัปโหลดไม่สำเร็จ</span> : <span>กำลังอัปโหลด…</span>}</div>{row.status === 'uploading' && <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e7e4dc]"><div className="h-2 w-2/3 motion-safe:animate-pulse rounded-full bg-[#142e43]" /></div>}</div>)}
            <label className="block"><span className={v2.flabel}>หมวดเอกสาร</span><select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} className={`${v2.field} text-base sm:text-[15px]`}>{DOCUMENT_CATEGORY_VALUES.map((value) => <option key={value} value={value}>{documentCategoryLabel(value, 'th')}</option>)}</select><p className={v2.hint}>ช่วยให้หาไฟล์ในแท็บเอกสารเจอเร็วขึ้น</p></label>
            {uploadRows.some((row) => row.doc) && <div className="flex items-start gap-3 rounded-lg bg-[#eef3f8] p-3 text-sm"><Sparkles aria-hidden="true" className="mt-0.5 h-[1.1em] w-[1.1em] shrink-0" /><div><b>ให้ระบบช่วยอ่านไฟล์ไหม</b><p className={v2.hint}>ระบบจะอ่านไฟล์แล้วเสนอข้อมูล เช่น ชื่อพยาน ให้คุณตรวจก่อนบันทึก — ไม่บันทึกเองโดยไม่ถาม</p><button type="button" disabled={!!analyzingId} onClick={() => { const last = [...uploadRows].reverse().find((row) => row.doc)?.doc; if (last) void handleAnalyzeDocument(last); }} className={`${v2.btn} ${v2.outline} mt-2 min-h-0 py-2`}>{analyzingId ? d.caseDocuments.analyzing : 'อ่านไฟล์และเสนอข้อมูล'}</button></div></div>}
            {error && <p role="alert" className={v2.error}>{error}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-[#e2e0d8] px-6 py-4"><button type="button" disabled={uploading} onClick={() => { setUploadOpen(false); setUploadRows([]); }} className={`${v2.btn} ${v2.primary}`}>เสร็จ</button></div>
        </div>
      </dialog>}
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <div className="rounded-xl border-2 border-dashed border-[#b9bfb8] bg-white p-6 text-center"><label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) void handleUpload(file); }} className="block cursor-pointer focus-within:ring-2 focus-within:ring-ring">
            <input type="file" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleUpload(file); e.target.value = ''; }} disabled={uploading} />
            <p className="inline-flex flex-wrap items-center justify-center gap-2 text-lg font-bold"><Upload aria-hidden="true" className="h-[1.1em] w-[1.1em]" />{uploading ? d.caseDocuments.uploading : <>ลากไฟล์มาวางที่นี่ หรือ <span className="underline">เลือกไฟล์</span></>}</p>
            <p className={v2.hint}>ไฟล์จะเข้าแฟ้มคดีนี้</p>
          </label><div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-[#e2e0d8] pt-4"><button type="button" onClick={() => setTemplateDrawerOpen(true)} className={`${v2.btn} ${v2.outline} min-h-0 py-2`}><FileText aria-hidden="true" className="h-[1.1em] w-[1.1em]" />สร้างจากแม่แบบ</button><button type="button" onClick={() => setPleadingDrawerOpen(true)} className={`${v2.btn} ${v2.outline} min-h-0 py-2`}><Sparkles aria-hidden="true" className="h-[1.1em] w-[1.1em]" />ให้ AI ร่างคำคู่ความ</button><button type="button" aria-expanded={showDrive} onClick={() => setShowDrive(!showDrive)} className={`${v2.btn} ${v2.outline} min-h-0 py-2`}><CloudDownload aria-hidden="true" className="h-[1.1em] w-[1.1em]" />ดึงจาก OneDrive</button></div><p className={v2.hint}>แม่แบบใส่ชื่อคู่ความและเลขคดีให้อัตโนมัติ · AI ร่างให้ตรวจก่อน ไม่บันทึกเอง</p></div>
          <section className={`${v2.card} shadow-[0_4px_16px_rgba(20,46,67,.06)]`}>
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
                  <div className="min-w-0 flex-1"><b className="break-all">{doc.filename}</b><div className={v2.label}>{[documentCategoryLabel(doc.category ?? 'OTHER', 'th'), doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : doc.uploadedByContact ? `${doc.uploadedByContact.name} (ลูกความ)` : 'ลูกความ', new Date(doc.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })].join(' · ')} · {doc.visibleToClient ? <><Eye aria-hidden="true" className="inline h-[1em] w-[1em]" /> ลูกความเห็น</> : <><EyeOff aria-hidden="true" className="inline h-[1em] w-[1em]" /> ลูกความไม่เห็น</>}</div>
                    {officeEditedHint(doc.filename, officeLinks[doc.id]) && <p className="text-xs font-medium text-warning">{officeEditedHint(doc.filename, officeLinks[doc.id])}</p>}</div>
                  <button type="button" onClick={() => handleView(doc)} disabled={viewingId === doc.id} className={`${v2.btn} ${v2.ghost}`}>{viewingId === doc.id ? d.caseDocuments.opening : 'ดู'}</button>
                  <button type="button" onClick={() => handleDownload(doc)} className={`${v2.btn} ${v2.ghost}`}>ดาวน์โหลด</button>
                  {isOfficeEditable(doc.filename) && <button type="button" onClick={() => handleOpenInOffice(doc)} className={`${v2.btn} ${v2.ghost}`}>เปิดใน {officeAppName(doc.filename)}</button>}
                  <DocsRowMenu name={doc.filename} items={[
                    { label: 'ให้ AI อ่านไฟล์', hint: 'เสนอข้อมูลให้ตรวจก่อนบันทึก', icon: Sparkles, onClick: () => void handleAnalyzeDocument(doc), disabled: analyzingId === doc.id },
                    { label: 'หาวันนัดในไฟล์', hint: 'เจอแล้วถามก่อนเพิ่มเป็นนัด', icon: CalendarSearch, onClick: () => void handleExtractDatesFromDocument(doc), disabled: extractingId === doc.id },
                    { label: 'ส่งตรวจ', hint: 'ให้หัวหน้าตรวจเอกสารนี้', icon: ClipboardCheck, onClick: () => { window.location.href = `/cases/${id}/documents/${doc.id}/review`; } },
                    ...(canManageContent ? [{ label: doc.visibleToClient ? 'ซ่อนจากลูกความ' : 'ให้ลูกความเห็น', hint: 'แสดงในพอร์ทัลของลูกความ', icon: doc.visibleToClient ? EyeOff : Eye, onClick: () => void handleToggleVisibility(doc) }, { label: (publications[doc.id] ?? []).some((p) => !p.unpublishedAt) ? 'ยกเลิกการเผยแพร่' : 'เผยแพร่ให้ลูกความ', hint: 'จัดการผู้รับเอกสาร', icon: Eye, onClick: () => { const active = (publications[doc.id] ?? []).find((p) => !p.unpublishedAt); if (active) void handleUnpublish(doc, active.id); else setPublishTarget(doc); }, disabled: publishingId === doc.id }] : []),
                    ...(officeLinks[doc.id] ? [{ label: 'ดึงเวอร์ชันล่าสุดกลับ', hint: 'ดึงไฟล์ที่แก้ใน Office กลับเข้าคดี', icon: RotateCcw, onClick: () => void handlePullFromOffice(doc), disabled: officeBusyId === doc.id }] : []),
                    { label: 'เปลี่ยนหมวด', hint: `ตอนนี้: ${documentCategoryLabel(doc.category ?? 'OTHER', 'th')}`, icon: Tag, onClick: () => setManagingDocId(doc.id) },
                  ]} />
                </div>
                {managingDocId === doc.id && <select aria-label={`ประเภทเอกสาร ${doc.filename}`} value={doc.category ?? 'OTHER'} onChange={async (e) => { if (!token) return; try { await api.updateDocumentCategory(token, id, doc.id, e.target.value || null); setManagingDocId(null); load(); } catch (err) { setError(err instanceof Error ? err.message : 'เปลี่ยนหมวดไม่สำเร็จ'); } }} className={`${v2.field} mt-3`}>{DOCUMENT_CATEGORY_VALUES.map((value) => <option key={value} value={value}>{documentCategoryLabel(value, 'th')}</option>)}</select>}
              </li>)}
            </ul>}
            {documents.length > 10 && <button type="button" onClick={() => setShowAllDocs((v) => !v)} className="flex w-full items-center gap-1 border-t border-[#e2e0d8] px-5 py-3 text-sm font-semibold underline">{showAllDocs ? 'แสดงเฉพาะไฟล์ล่าสุด' : <>ดูไฟล์ทั้งหมด ({documents.length}) <ArrowRight aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></>}</button>}
          </section>
          {showDrive && <section className={`${v2.card} p-5`}><CaseDriveSection caseId={id} onImported={load} newFolderName={newFolderName} /></section>}
        </div>
        <div className="space-y-5">{requiredDocs && requiredDocs.required.length > 0 && <section className={`${v2.card} p-5 shadow-[0_4px_16px_rgba(20,46,67,.06)]`}><h3 className="text-lg font-bold">เอกสารที่ต้องมี</h3><p className={v2.hint}>ตามประเภทคดี</p><ul className="mt-3 space-y-2 text-sm">{requiredDocs.required.map((item) => <li key={item.category} className={`flex items-center gap-2 ${item.present ? 'text-[#227052]' : 'font-semibold text-[#6b4f0b]'}`}>{item.present ? <Check aria-hidden="true" className="h-[1.1em] w-[1.1em]" /> : <CircleAlert aria-hidden="true" className="h-[1.1em] w-[1.1em]" />}{documentCategoryLabel(item.category, 'th')}{!item.present && ' — ยังไม่มี'}</li>)}</ul></section>}{token && <CaseDocRequestsCard token={token} caseId={id} />}</div>
      </div>
      <div className="mt-5 space-y-5"><CaseEvidenceSection caseId={id} refreshKey={analysisRevision} /><CaseKnowledgePanel caseId={id} refreshKey={analysisRevision} /><DateSuggestionsPanel caseId={id} sources={['DOCUMENT', 'EMAIL']} title={d.dateSuggestions.documentTitle} reloadKey={suggestionsKey} onChanged={onChanged} /></div>
      {token && <TemplateGenerateDrawer open={templateDrawerOpen} onClose={() => setTemplateDrawerOpen(false)} token={token} caseId={id} templates={templates} onGenerated={load} />}
      {token && <PleadingDraftDrawer open={pleadingDrawerOpen} onClose={() => setPleadingDrawerOpen(false)} token={token} caseId={id} onGenerated={load} />}
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
