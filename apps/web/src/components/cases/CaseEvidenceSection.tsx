'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, KnowledgeCitationItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * หลักฐาน = จุดในเอกสารที่รองรับข้อเท็จจริง (spec: EVIDENCE แยกจาก FACT).
 * Derived from KnowledgeCitations grouped per document — no extra table needed
 * because a citation already is "document + page + statement + quote".
 */
export function CaseEvidenceSection({ caseId, refreshKey }: { caseId: string; refreshKey: number }) {
  const { token } = useAuth();
  const [citations, setCitations] = useState<KnowledgeCitationItem[]>([]);
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .getCaseKnowledge(token, caseId)
      .then((items) => setCitations(items.flatMap((k) => k.citations ?? [])))
      .catch(console.error);
  }, [token, caseId, refreshKey]);

  const byDocument = useMemo(() => {
    const groups = new Map<string, { filename: string; items: KnowledgeCitationItem[] }>();
    for (const c of citations) {
      const group = groups.get(c.document.id) ?? { filename: c.document.filename, items: [] };
      group.items.push(c);
      groups.set(c.document.id, group);
    }
    return [...groups.entries()];
  }, [citations]);

  if (!byDocument.length) return null;

  return (
    <div className="mb-6 rounded-xl border bg-card p-6 shadow-soft">
      <h3 className="font-semibold text-foreground">หลักฐานอ้างอิง ({citations.length})</h3>
      <p className="mb-3 mt-1 text-sm text-muted-foreground">
        จุดในเอกสารที่ AI พบว่ารองรับข้อเท็จจริง — คลิกเพื่อดูรายการต่อเอกสาร
      </p>
      <ul className="space-y-2">
        {byDocument.map(([docId, group]) => (
          <li key={docId} className="rounded-md border border-border">
            <button
              type="button"
              aria-expanded={openDoc === docId}
              onClick={() => setOpenDoc(openDoc === docId ? null : docId)}
              className="flex w-full items-center justify-between p-3 text-left text-sm hover:bg-muted"
            >
              <span className="font-medium">{group.filename}</span>
              <span className="text-xs text-muted-foreground">{group.items.length} จุด</span>
            </button>
            {openDoc === docId && (
              <ul className="space-y-2 border-t border-border p-3">
                {group.items.map((c) => (
                  <li key={c.id} className="text-xs">
                    <p className="font-medium">{c.statement}</p>
                    <blockquote className="mt-0.5 border-l-2 border-border pl-2 italic text-muted-foreground">
                      “{c.quote}”
                    </blockquote>
                    <p className="mt-0.5 text-muted-foreground">
                      {c.page ? `หน้า ${c.page} · ` : ''}ฉบับที่ {c.documentVersion}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
