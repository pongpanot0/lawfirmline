'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { CaseListItem, CaseMatchReason } from '@/lib/api';
import { MATCH_REASON_LABELS, OTHER_CASE } from '@/lib/case-email';
import { Folder } from 'lucide-react';
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
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [otherRefs, setOtherRefs] = useState<Record<string, string>>({});
  const [onlySuggested, setOnlySuggested] = useState(true);
  const datalistId = useId();

  // A fresh `rows` array means the parent reloaded — restart from the defaults.
  useEffect(() => {
    setSelection(Object.fromEntries(rows.map((row) => [row.id, row.defaultCaseId ?? ''])));
    setChecked(Object.fromEntries(rows.map((row) => [row.id, !!row.defaultCaseId])));
    setOtherRefs({});
  }, [rows]);

  const caseIdByRef = useMemo(() => new Map(cases.map((c) => [c.ownRef, c.id])), [cases]);
  const resolvedCaseId = (id: string) =>
    selection[id] === OTHER_CASE ? (caseIdByRef.get((otherRefs[id] ?? '').trim()) ?? '') : (selection[id] ?? '');

  const pending = rows
    .filter((row) => !row.link && checked[row.id])
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
        แสดงเฉพาะโฟลเดอร์ที่มีคดีแนะนำหรือผูกแล้ว <span className="tabular-nums">({visible.length}/{rows.length})</span>
      </label>
      {visible.length === 0 && (
        <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? 'ไม่พบโฟลเดอร์' : 'ไม่มีโฟลเดอร์ที่ระบบแนะนำ เอาเครื่องหมายถูกด้านบนออกเพื่อดูทั้งหมด'}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2" hidden={visible.length === 0}>
        {visible.map((row) => (
          <div key={row.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3"><Folder className="size-5 shrink-0 text-muted-foreground" aria-hidden /><p className="min-w-0 flex-1 break-words font-semibold">{row.name}</p>{!row.link && <input type="checkbox" aria-label={`เลือก ${row.name}`} checked={!!checked[row.id]} onChange={(e) => setChecked((current) => ({ ...current, [row.id]: e.target.checked }))} />}</div>
            {row.link ? <div className="text-sm">ผูกกับ <strong>{row.link.ownRef}</strong> · {row.link.title}<div><Button size="sm" variant="outline" disabled={saving} onClick={() => onUnlink(row.link!.id)}>ยกเลิกการผูก</Button></div></div> : <label className="block text-sm">คดีที่แนะนำ
              <select aria-label={`คดีสำหรับ ${row.name}`} value={selection[row.id] ?? ''} onChange={(e) => { const value = e.target.value; setSelection((s) => ({ ...s, [row.id]: value })); setChecked((current) => ({ ...current, [row.id]: !!value })); }} className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">เลือกคดี</option>{row.suggestions.map((suggestion) => <option key={suggestion.caseId} value={suggestion.caseId}>{suggestion.ownRef} · {suggestion.title}</option>)}<option value={OTHER_CASE}>เลือกคดีอื่น…</option>
              </select>
              {selection[row.id] === OTHER_CASE && <input list={datalistId} value={otherRefs[row.id] ?? ''} onChange={(e) => setOtherRefs((r) => ({ ...r, [row.id]: e.target.value }))} placeholder="พิมพ์เลขอ้างอิงคดี" aria-label={`เลขอ้างอิงคดีสำหรับ ${row.name}`} className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm" />}
            </label>}
            <p className="border-t pt-2 text-xs text-muted-foreground">{confidence(row)}</p>
          </div>
        ))}
        <datalist id={datalistId}>
          {cases.map((c) => (
            <option key={c.id} value={c.ownRef}>
              {c.title}
            </option>
          ))}
        </datalist>
      </div>
      <div className="sticky bottom-0 z-[45] flex flex-wrap items-center justify-between gap-3 border-t bg-card p-4 shadow-lg"><span className="text-sm">เลือกแล้ว {pending.length} โฟลเดอร์</span><div><Button disabled={pending.length === 0 || saving} onClick={() => onConfirm(pending)}>{saving ? 'กำลังผูก…' : `ยืนยันผูก ${pending.length} โฟลเดอร์`}</Button><p className="text-xs text-muted-foreground">ระบบจะดึงอีเมลย้อนหลังเข้าคดี</p></div></div>
    </div>
  );
}
