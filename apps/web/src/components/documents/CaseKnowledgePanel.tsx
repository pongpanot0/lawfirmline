'use client';

import { isUnusableAnalysis } from '@lawfirm/shared';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, KnowledgeItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

function KnowledgeCitations({ item }: { item: KnowledgeItem }) {
  if (!item.citations || item.citations.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">หลักฐานอ้างอิง ({item.citations.length})</p>
      <ul className="space-y-2">
        {item.citations.map((citation) => {
          const stale = citation.documentVersion !== citation.document.version;
          return (
            <li key={citation.id} className="rounded-md border border-border bg-muted/30 p-2 text-xs">
              <p className="font-medium">{citation.statement}</p>
              <blockquote className="mt-1 border-l-2 border-border pl-2 italic text-muted-foreground">
                “{citation.quote}”
              </blockquote>
              <p className="mt-1 text-muted-foreground">
                {citation.document.filename}
                {citation.page ? ` · หน้า ${citation.page}` : ''} · ฉบับที่ {citation.documentVersion}
                {stale && (
                  <span className="ml-1 text-amber-700 dark:text-amber-400">
                    · มีฉบับใหม่กว่านี้แล้ว (ฉบับที่ {citation.document.version}) กรุณาตรวจซ้ำ
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function KnowledgeFlags({ item }: { item: KnowledgeItem }) {
  if (!item.flags || item.flags.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1">
      {item.flags.map((flag, index) => (
        <li key={index} role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {flag.type === 'CONFLICT' ? 'ข้อมูลขัดแย้งกัน: ' : 'ข้อมูลที่ขาดไป: '}
          {flag.description}
        </li>
      ))}
    </ul>
  );
}

function ReviewAction({ item, caseId, onReviewed }: { item: KnowledgeItem; caseId: string; onReviewed: (updated: KnowledgeItem) => void }) {
  const { token } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.summary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (isUnusableAnalysis(item.summary)) return <p role="alert" className="mt-3 text-sm text-destructive">ผลเดิมอ่านเอกสารไม่สำเร็จ — เปิดเอกสารแล้ววิเคราะห์ใหม่ ไม่สามารถยืนยันผลนี้ได้</p>;

  if (item.reviewedBy) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        ทนายตรวจแล้วโดย {item.reviewedBy.firstName} {item.reviewedBy.lastName}
        {item.reviewedAt && ` · ${new Date(item.reviewedAt).toLocaleString('th-TH')}`}
      </p>
    );
  }

  const confirm = async (summary?: string) => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api.reviewCaseKnowledge(token, caseId, item.id, summary);
      onReviewed(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ยืนยันไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-xs text-amber-700 dark:text-amber-400">ยังไม่มีทนายตรวจผลนี้ — เป็นข้อมูลเบื้องต้นจาก AI เท่านั้น</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-input bg-card p-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => confirm(draft)}>บันทึกที่แก้ไขและยืนยันว่าตรวจแล้ว</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setDraft(item.summary); }}>ยกเลิก</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => confirm()}>ยืนยันว่าตรวจแล้ว</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>แก้ไขก่อนยืนยัน</Button>
        </div>
      )}
    </div>
  );
}

export function CaseKnowledgePanel({ caseId, refreshKey = 0 }: { caseId: string; refreshKey?: number }) {
  const { token } = useAuth();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError(false);
    api.getCaseKnowledge(token, caseId)
      .then((results) => { if (active) setItems(results); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, caseId, refreshKey, retry]);

  return (
    <section id="case-analyses" className="min-w-0 scroll-mt-24 space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold">ผลวิเคราะห์เอกสารของคดี</h2>
      <p className="text-sm text-muted-foreground">ผลวิเคราะห์รายไฟล์และหลายไฟล์ของคดีนี้ เก็บไว้ที่เดียวกับคลังความรู้</p>
      {loading ? <p role="status" className="text-sm">กำลังโหลดผลวิเคราะห์…</p> : error ? (
        <div role="alert" className="text-sm">
          โหลดผลวิเคราะห์ไม่สำเร็จ{' '}
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="text-primary underline">ลองใหม่</button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีผลวิเคราะห์ เมื่อวิเคราะห์เอกสารในคดีนี้ ผลจะปรากฏที่นี่</p>
      ) : (
        <>
          {items.map((item) => (
            <details key={item.id} className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer break-words text-sm font-medium">{item.title}</summary>
              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString('th-TH')} · {item.createdBy.firstName} {item.createdBy.lastName}
              </p>
              {item.document && (
                <Link href={`/cases/${caseId}/documents`} className="mt-2 block break-words text-sm text-primary underline">
                  ดูเอกสารต้นฉบับ: {item.document.filename}
                </Link>
              )}
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{item.summary}</p>
              <KnowledgeFlags item={item} />
              <KnowledgeCitations item={item} />
              <ReviewAction
                item={item}
                caseId={caseId}
                onReviewed={(updated) => setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))}
              />
            </details>
          ))}
          {items.length === 50 && <p className="text-xs text-muted-foreground">แสดง 50 รายการล่าสุด ค้นหาผลวิเคราะห์อื่นได้ใน <Link href="/knowledge" className="text-primary underline">คลังความรู้</Link></p>}
        </>
      )}
    </section>
  );
}
