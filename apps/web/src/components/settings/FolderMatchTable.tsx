'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { CaseListItem, CaseMatchReason } from '@/lib/api';
import { MATCH_REASON_LABELS, OTHER_CASE } from '@/lib/case-email';
import { Button } from '@/components/ui/button';

export interface FolderMatchSuggestion {
  caseId: string;
  ownRef: string;
  title: string;
  reason: CaseMatchReason;
}

/** One folder to match. Not Outlook-specific: Plan D reuses this for OneDrive/SharePoint folders. */
export interface FolderMatchRow {
  id: string;
  name: string;
  suggestions: FolderMatchSuggestion[];
  link: { id: string; ownRef: string; title: string } | null;
  /** Pre-filled case id (e.g. from `defaultFolderCaseId`); the person still has to press confirm. */
  defaultCaseId?: string;
}

/** Suggestions are a pre-fill only; nothing is linked until the person presses the confirm button. */
export function FolderMatchTable({
  rows,
  cases,
  saving,
  onConfirm,
  onUnlink,
}: {
  rows: FolderMatchRow[];
  cases: Pick<CaseListItem, 'id' | 'ownRef' | 'title'>[];
  saving: boolean;
  onConfirm: (items: { id: string; caseId: string }[]) => void;
  onUnlink: (linkId: string) => void;
}) {
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [otherRefs, setOtherRefs] = useState<Record<string, string>>({});
  const [onlySuggested, setOnlySuggested] = useState(true);
  const datalistId = useId();

  // A fresh `rows` array means the parent reloaded — restart from the defaults.
  useEffect(() => {
    setSelection(Object.fromEntries(rows.map((row) => [row.id, row.defaultCaseId ?? ''])));
    setOtherRefs({});
  }, [rows]);

  const caseIdByRef = useMemo(() => new Map(cases.map((c) => [c.ownRef, c.id])), [cases]);
  const resolvedCaseId = (id: string) =>
    selection[id] === OTHER_CASE ? (caseIdByRef.get((otherRefs[id] ?? '').trim()) ?? '') : (selection[id] ?? '');

  const pending = rows
    .filter((row) => !row.link)
    .map((row) => ({ id: row.id, caseId: resolvedCaseId(row.id) }))
    .filter((item) => item.caseId);

  const visible = rows.filter((row) => !onlySuggested || row.link || row.suggestions.length > 0 || selection[row.id]);

  const confidence = (row: FolderMatchRow) => {
    if (row.link) return 'ผูกแล้ว';
    if (selection[row.id] === OTHER_CASE) return 'เลือกเอง';
    const hit = row.suggestions.find((s) => s.caseId === selection[row.id]);
    return hit ? MATCH_REASON_LABELS[hit.reason] : '—';
  };

  return (
    <div className="space-y-3">
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={onlySuggested} onChange={(e) => setOnlySuggested(e.target.checked)} />
        แสดงเฉพาะ folder ที่มีคดีแนะนำหรือผูกแล้ว <span className="tabular-nums">({visible.length}/{rows.length})</span>
      </label>
      {visible.length === 0 && (
        <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? 'ไม่พบ folder' : 'ไม่มี folder ที่ระบบแนะนำ เอาเครื่องหมายด้านบนออกเพื่อแสดงทั้งหมด'}
        </p>
      )}
      <div className="overflow-x-auto" hidden={visible.length === 0}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Folder</th>
              <th className="py-2 pr-3 font-medium">คดี</th>
              <th className="py-2 font-medium">ความมั่นใจ</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-t align-top">
                <td className="break-all py-2 pr-3">{row.name}</td>
                <td className="py-2 pr-3">
                  {row.link ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        ผูกกับ <strong>{row.link.ownRef}</strong> · {row.link.title}
                      </span>
                      <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={saving} onClick={() => onUnlink(row.link!.id)}>
                        ยกเลิกการผูก
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <select
                        aria-label={`คดีสำหรับ ${row.name}`}
                        value={selection[row.id] ?? ''}
                        onChange={(e) => setSelection((s) => ({ ...s, [row.id]: e.target.value }))}
                        className="h-10 w-full rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">— ข้าม —</option>
                        {row.suggestions.map((s) => (
                          <option key={s.caseId} value={s.caseId}>
                            {s.ownRef} · {s.title}
                          </option>
                        ))}
                        <option value={OTHER_CASE}>เลือกคดีอื่น…</option>
                      </select>
                      {selection[row.id] === OTHER_CASE && (
                        <input
                          list={datalistId}
                          value={otherRefs[row.id] ?? ''}
                          onChange={(e) => setOtherRefs((r) => ({ ...r, [row.id]: e.target.value }))}
                          placeholder="พิมพ์เลขอ้างอิงคดี"
                          aria-label={`เลขอ้างอิงคดีสำหรับ ${row.name}`}
                          className="h-10 w-full rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      )}
                    </div>
                  )}
                </td>
                <td className="py-2 text-xs text-muted-foreground">{confidence(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id={datalistId}>
          {cases.map((c) => (
            <option key={c.id} value={c.ownRef}>
              {c.title}
            </option>
          ))}
        </datalist>
      </div>
      <Button disabled={pending.length === 0 || saving} onClick={() => onConfirm(pending)}>
        {saving ? 'กำลังผูก…' : `ยืนยันผูก ${pending.length} folder`}
      </Button>
    </div>
  );
}
