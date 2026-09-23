'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { DocumentCategory, FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, type ChecklistClassificationSuggestion } from '@/lib/api';
import { documentCategoryLabel } from '@/lib/stage-labels';
import { Button } from '@/components/ui/button';

type UploadEvent = {
  scope: 'case' | 'intake';
  scopeId: string;
  documentId: string;
  filename: string;
};

type ReviewItem = UploadEvent & {
  label: string;
  sourceExcerpt: string;
};

const CATEGORIES = Object.values(DocumentCategory);

export function JevDocumentReviewQueue() {
  const { token, user } = useAuth();
  const pending = useRef<UploadEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWorking = useRef(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const canConfirm = [FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.LAWYER].includes(user?.firmRole as FirmRole);

  useEffect(() => {
    const handleUpload = (event: Event) => {
      const detail = (event as CustomEvent<UploadEvent>).detail;
      if (!detail?.documentId || !detail.scopeId) return;
      pending.current.push(detail);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void classifyPending(), 1200);
    };
    window.addEventListener('jev:document-uploaded', handleUpload);
    return () => {
      window.removeEventListener('jev:document-uploaded', handleUpload);
      if (timer.current) clearTimeout(timer.current);
    };
    // Event listener lifetime follows auth so uploads always use a current token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const classifyPending = async () => {
    if (!token || isWorking.current || !pending.current.length) return;
    const uploads = pending.current.splice(0);
    isWorking.current = true;
    setWorking(true);
    setError('');
    const suggestions = new Map<string, ChecklistClassificationSuggestion>();
    try {
      const groups = new Map<string, UploadEvent[]>();
      for (const upload of uploads) {
        const key = `${upload.scope}:${upload.scopeId}`;
        groups.set(key, [...(groups.get(key) ?? []), upload]);
      }
      for (const group of groups.values()) {
        for (let start = 0; start < group.length; start += 10) {
          const batch = group.slice(start, start + 10);
          const ids = batch.map((item) => item.documentId);
          const labels = CATEGORIES;
          const result = batch[0].scope === 'case'
            ? await api.classifyCaseChecklist(token, batch[0].scopeId, ids, labels)
            : await api.classifyIntakeChecklist(token, batch[0].scopeId, ids, labels);
          result.forEach((item) => suggestions.set(item.documentId, item));
        }
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Jev แนะนำหมวดไม่สำเร็จ เลือกหมวดเองได้');
    } finally {
      setItems((current) => [
        ...current,
        ...uploads
          .filter((upload) => !current.some((item) => item.documentId === upload.documentId))
          .map((upload) => {
            const suggestion = suggestions.get(upload.documentId);
            return {
              ...upload,
              label: suggestion?.label ?? DocumentCategory.OTHER,
              sourceExcerpt: suggestion?.sourceExcerpt ?? 'Jev ยังไม่มั่นใจในหมวดเอกสารนี้ — กรุณาเลือกหมวด',
            };
          }),
      ]);
      setWorking(false);
      isWorking.current = false;
      if (pending.current.length) timer.current = setTimeout(() => void classifyPending(), 1200);
    }
  };

  const confirm = async (item: ReviewItem) => {
    if (!token || !canConfirm) return;
    try {
      if (item.scope === 'case') await api.updateDocumentCategory(token, item.scopeId, item.documentId, item.label);
      else await api.updateIntakeDocumentCategory(token, item.scopeId, item.documentId, item.label);
      setItems((current) => current.filter((candidate) => candidate.documentId !== item.documentId));
      setError('');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'บันทึกหมวดเอกสารไม่สำเร็จ');
    }
  };

  if (!items.length && !working && !pending.current.length) return null;

  return (
    <section className="fixed bottom-24 right-4 z-50 max-h-[70vh] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-card p-4 shadow-xl" aria-label="Jev ตรวจหมวดเอกสาร">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{working ? 'Jev กำลังแนะนำหมวดเอกสาร…' : `ตรวจหมวดเอกสาร (${items.length})`}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Jev เสนอจากชื่อและเนื้อหาไฟล์ · จะบันทึกเมื่อทนายยืนยันเท่านั้น</p>
        </div>
        {!working && <Button type="button" variant="ghost" size="icon" aria-label="ปิดข้อเสนอ" onClick={() => setItems([])}><X className="h-4 w-4" /></Button>}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{error}</p>}
      {items.length > 0 && <div className="mt-3 space-y-2">
        {items.map((item) => <article key={`${item.scope}:${item.documentId}`} className="rounded-lg border p-3">
          <p className="truncate text-sm font-medium" title={item.filename}>{item.filename}</p>
          <p className="mt-1 text-xs text-muted-foreground">หลักฐานจากเอกสาร: {item.sourceExcerpt}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select aria-label={`เลือกหมวดสำหรับ ${item.filename}`} value={item.label} onChange={(event) => setItems((current) => current.map((candidate) => candidate.documentId === item.documentId ? { ...candidate, label: event.target.value } : candidate))} className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm">
              {CATEGORIES.map((category) => <option key={category} value={category}>{documentCategoryLabel(category, 'th')}</option>)}
            </select>
            <Button type="button" size="sm" disabled={!canConfirm} onClick={() => void confirm(item)}>ยืนยันหมวด</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setItems((current) => current.filter((candidate) => candidate.documentId !== item.documentId))}>ข้าม</Button>
          </div>
          {!canConfirm && <p className="mt-2 text-xs text-muted-foreground">รอผู้มีสิทธิ์ทนายยืนยันหมวดนี้</p>}
        </article>)}
      </div>}
    </section>
  );
}
