'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, KnowledgeItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';

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
            </details>
          ))}
          {items.length === 50 && <p className="text-xs text-muted-foreground">แสดง 50 รายการล่าสุด ค้นหาผลวิเคราะห์อื่นได้ใน <Link href="/knowledge" className="text-primary underline">คลังความรู้</Link></p>}
        </>
      )}
    </section>
  );
}
